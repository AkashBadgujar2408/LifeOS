using LifeOS.Core.Goals.DTOs;
using LifeOS.Core.Goals.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.Services;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Goals.Services;

/// <summary>
/// A measured goal's manual log and the items it's counted from. While a goal is Linked its number is read-only —
/// it comes from its sources, and its entries (including what was carried over) can't be changed. A source that stops
/// counting — removed, its item deleted, or the goal switched back to Manual — leaves what it had counted behind as a
/// Carried over entry, so the figure never drops because something was tidied away.
/// </summary>
public class GoalMeasureService(AppDbContext db, GoalSourceReader sourceReader, IGoalProgressService progressService)
    : IGoalMeasureService
{
    private const string NotFound = "Goal not found.";
    private const string NotMeasured = "This goal isn't measured by a number.";
    private const string ReadOnly = "This goal's number is counted from other items, so it can't be changed by hand.";

    public async Task<OperationResult<List<GoalMeasureEntryDto>>> GetEntriesAsync(int goalId)
    {
        if (!await db.Goals.AnyAsync(g => g.Id == goalId))
        {
            return OperationResult<List<GoalMeasureEntryDto>>.Fail(NotFound);
        }

        var entries = await db.GoalMeasureEntries
            .Where(e => e.GoalId == goalId)
            .OrderByDescending(e => e.EntryDate).ThenByDescending(e => e.Id)
            .Select(e => ToDto(e))
            .ToListAsync();
        return OperationResult<List<GoalMeasureEntryDto>>.Ok(entries);
    }

    public async Task<OperationResult<GoalMeasureEntryDto>> AddEntryAsync(int goalId, GoalMeasureEntryRequest request)
    {
        var goal = await db.Goals.FindAsync(goalId);
        if (EntryRefusal(goal, request) is { } error)
        {
            return OperationResult<GoalMeasureEntryDto>.Fail(error);
        }

        var entry = new GoalMeasureEntry
        {
            UserId = goal!.UserId,
            GoalId = goalId,
            EntryDate = request.EntryDate,
            Value = Round(request.Value),
            Kind = GoalMeasureEntryKinds.Logged,
            Note = Note(request.Note),
        };
        db.GoalMeasureEntries.Add(entry);
        goal.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return OperationResult<GoalMeasureEntryDto>.Ok(ToDto(entry));
    }

    public async Task<OperationResult<GoalMeasureEntryDto>> UpdateEntryAsync(int goalId, int entryId, GoalMeasureEntryRequest request)
    {
        var goal = await db.Goals.FindAsync(goalId);
        var entry = await db.GoalMeasureEntries.FirstOrDefaultAsync(e => e.Id == entryId && e.GoalId == goalId);
        if (goal is not null && entry is null)
        {
            return OperationResult<GoalMeasureEntryDto>.Fail("That entry is gone — reload the goal.");
        }

        if (EntryRefusal(goal, request) is { } error)
        {
            return OperationResult<GoalMeasureEntryDto>.Fail(error);
        }

        entry!.EntryDate = request.EntryDate;
        entry.Value = Round(request.Value);
        entry.Note = Note(request.Note);
        entry.UpdatedAt = DateTime.UtcNow;
        goal!.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return OperationResult<GoalMeasureEntryDto>.Ok(ToDto(entry));
    }

    public async Task<OperationResult<bool>> DeleteEntryAsync(int goalId, int entryId)
    {
        var goal = await db.Goals.FindAsync(goalId);
        if (goal is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        if (goal.MeasureSource == GoalMeasureSources.Linked)
        {
            return OperationResult<bool>.Fail(ReadOnly);
        }

        var entry = await db.GoalMeasureEntries.FirstOrDefaultAsync(e => e.Id == entryId && e.GoalId == goalId);
        if (entry is null)
        {
            return OperationResult<bool>.Fail("That entry is gone — reload the goal.");
        }

        entry.IsDeleted = true;
        entry.DeletedAt = DateTime.UtcNow;
        goal.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return OperationResult<bool>.Ok(true);
    }

    public async Task<OperationResult<List<GoalSourceDto>>> GetSourcesAsync(int goalId, DateOnly today)
    {
        if (!await db.Goals.AnyAsync(g => g.Id == goalId))
        {
            return OperationResult<List<GoalSourceDto>>.Fail(NotFound);
        }

        var sources = (await db.GoalSources.Where(s => s.GoalId == goalId).OrderBy(s => s.Id).ToListAsync())
            .Select(GoalSourceReader.ToRef).ToList();
        return OperationResult<List<GoalSourceDto>>.Ok(await ToDtosAsync(sources, today));
    }

    public async Task<List<GoalSourceOptionDto>> OptionsAsync()
    {
        var options = new List<GoalSourceOptionDto>();
        foreach (var provider in sourceReader.Providers)
        {
            options.AddRange(await provider.OptionsAsync());
        }

        return options;
    }

    public async Task<OperationResult<GoalSourceDto>> AddSourceAsync(int goalId, GoalSourceRequest request)
    {
        var goal = await db.Goals.FindAsync(goalId);
        if (goal is null)
        {
            return OperationResult<GoalSourceDto>.Fail(NotFound);
        }

        if (goal.MeasureTarget is null)
        {
            return OperationResult<GoalSourceDto>.Fail(NotMeasured);
        }

        if (goal.MeasureSource != GoalMeasureSources.Linked)
        {
            return OperationResult<GoalSourceDto>.Fail(
                "You log this goal's number yourself — edit the goal and choose \"counted from other items\" first.");
        }

        var entityType = Blank(request.EntityType);
        var filter = Blank(request.Filter);
        var metric = Blank(request.Metric);
        if (GoalSourceRules.CheckShape(request.Kind, entityType, request.EntityId, filter, metric) is { } shapeError)
        {
            return OperationResult<GoalSourceDto>.Fail(shapeError);
        }

        var countsFrom = request.CountsFrom ?? request.Today;
        if (countsFrom > request.Today)
        {
            return OperationResult<GoalSourceDto>.Fail("Counting can't start on a day that hasn't come yet.");
        }

        var existing = await db.GoalSources.Where(s => s.GoalId == goalId).ToListAsync();
        if (GoalSourceRules.CheckAlongside(request.Kind, existing.Select(s => s.Kind)) is { } alongsideError)
        {
            return OperationResult<GoalSourceDto>.Fail(alongsideError);
        }

        if (existing.Any(s => s.Kind == request.Kind && s.EntityType == entityType && s.EntityId == request.EntityId
                && s.Filter == filter && s.Metric == metric))
        {
            return OperationResult<GoalSourceDto>.Fail("The goal is already counted from that.");
        }

        var candidate = new GoalSourceRef(0, goalId, request.Kind, entityType, request.EntityId, filter, metric, countsFrom);
        var provider = sourceReader.ProviderFor(request.Kind);
        if (provider is null)
        {
            return OperationResult<GoalSourceDto>.Fail("That can't be counted toward a goal yet.");
        }

        if (!(await provider.DescribeAsync([candidate])).TryGetValue(0, out var description))
        {
            return OperationResult<GoalSourceDto>.Fail("Item not found.");
        }

        if (await provider.CheckAsync(candidate) is { } providerError)
        {
            return OperationResult<GoalSourceDto>.Fail(providerError);
        }

        if (!GoalMeasureRules.SameUnit(goal.MeasureUnit, description.Unit))
        {
            return OperationResult<GoalSourceDto>.Fail(
                $"{description.Title} counts {description.Unit}, but this goal is measured in {goal.MeasureUnit}.");
        }

        var source = new GoalSource
        {
            UserId = goal.UserId,
            GoalId = goalId,
            Kind = request.Kind,
            EntityType = entityType,
            EntityId = request.EntityId,
            Filter = filter,
            Metric = metric,
            CountsFrom = countsFrom,
        };
        db.GoalSources.Add(source);
        goal.UpdatedAt = DateTime.UtcNow;
        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            return OperationResult<GoalSourceDto>.Fail("The goal is already counted from that.");
        }

        return OperationResult<GoalSourceDto>.Ok((await ToDtosAsync([GoalSourceReader.ToRef(source)], request.Today))[0]);
    }

    public async Task<OperationResult<GoalSourceDto>> UpdateSourceAsync(int goalId, int sourceId, GoalSourceUpdateRequest request)
    {
        var source = await db.GoalSources.FirstOrDefaultAsync(s => s.Id == sourceId && s.GoalId == goalId);
        if (source is null)
        {
            return OperationResult<GoalSourceDto>.Fail("That source is gone — reload the goal.");
        }

        if (request.CountsFrom > request.Today)
        {
            return OperationResult<GoalSourceDto>.Fail("Counting can't start on a day that hasn't come yet.");
        }

        source.CountsFrom = request.CountsFrom;
        source.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return OperationResult<GoalSourceDto>.Ok((await ToDtosAsync([GoalSourceReader.ToRef(source)], request.Today))[0]);
    }

    public async Task<OperationResult<bool>> RemoveSourceAsync(int goalId, int sourceId, DateOnly today)
    {
        var source = await db.GoalSources.FirstOrDefaultAsync(s => s.Id == sourceId && s.GoalId == goalId);
        if (source is null)
        {
            return OperationResult<bool>.Fail("That source is gone — reload the goal.");
        }

        var result = await CarryOverAsync([source], today);
        if (!result.Success)
        {
            return result;
        }

        await db.SaveChangesAsync();
        return OperationResult<bool>.Ok(true);
    }

    public async Task<List<GoalCountedByDto>> CountsTowardAsync(string entityType, int entityId, DateOnly today)
    {
        var sources = (await db.GoalSources.Where(s => s.EntityType == entityType && s.EntityId == entityId).ToListAsync())
            .Select(GoalSourceReader.ToRef).ToList();
        if (sources.Count == 0)
        {
            return [];
        }

        var goalIds = sources.Select(s => s.GoalId).Distinct().ToList();
        var goals = await db.Goals.Where(g => goalIds.Contains(g.Id))
            .Select(g => new
            {
                g.Id, g.Title, g.Status, g.MeasureTarget, g.MeasureUnit,
                Milestones = g.GoalMilestones.Count,
                Done = g.GoalMilestones.Count(m => m.CompletedAt != null),
            })
            .ToListAsync();
        var progress = await progressService.ForGoalsAsync(
            goals.Select(g => new GoalProgressInput(g.Id, g.Status, g.Milestones, g.Done)).ToList(), today);
        var amounts = await sourceReader.AmountsAsync(sources, today);

        return goals
            .OrderBy(g => g.Status != GoalStatuses.Active).ThenBy(g => g.Title)
            .Select(g =>
            {
                var mine = sources.Where(s => s.GoalId == g.Id).ToList();
                var p = progress[g.Id];
                return new GoalCountedByDto
                {
                    GoalId = g.Id,
                    GoalTitle = g.Title,
                    Status = g.Status,
                    Percent = p.Percent,
                    Locked = p.Locked,
                    MeasureCurrent = p.MeasureCurrent,
                    MeasureTarget = g.MeasureTarget,
                    MeasureUnit = g.MeasureUnit,
                    Counted = mine.Any(s => amounts.Locked.Contains(s.Id)) ? null : mine.Sum(s => amounts.Total(s.Id)),
                };
            })
            .ToList();
    }

    public async Task ReleaseEntityAsync(string entityType, int entityId)
    {
        var sources = await db.GoalSources.Where(s => s.EntityType == entityType && s.EntityId == entityId).ToListAsync();
        if (sources.Count == 0)
        {
            return;
        }

        // Called from the item's own delete, before the item itself goes, so the providers can still read it. No
        // entity-bound source is Health data, so nothing here is ever locked.
        await CarryOverAsync(sources, DateOnly.FromDateTime(DateTime.UtcNow));
        await db.SaveChangesAsync();
    }

    public async Task<OperationResult<bool>> FreezeSourcesAsync(int goalId, DateOnly today)
    {
        var sources = await db.GoalSources.Where(s => s.GoalId == goalId).ToListAsync();
        return sources.Count == 0 ? OperationResult<bool>.Ok(true) : await CarryOverAsync(sources, today);
    }

    /// <summary>Each source's total so far becomes a Carried over entry on <paramref name="day"/>; the sources go.</summary>
    private async Task<OperationResult<bool>> CarryOverAsync(List<GoalSource> sources, DateOnly day)
    {
        var refs = sources.Select(GoalSourceReader.ToRef).ToList();
        var amounts = await sourceReader.AmountsAsync(refs, day);
        if (amounts.Locked.Count > 0)
        {
            return OperationResult<bool>.Fail("Unlock the vault first — what the workouts counted has to be read to keep it.");
        }

        var descriptions = await sourceReader.DescribeAsync(refs);
        var now = DateTime.UtcNow;
        foreach (var source in sources)
        {
            var total = Round(amounts.Total(source.Id));
            if (total > 0)
            {
                var title = descriptions.TryGetValue(source.Id, out var d) ? d.Title : "a removed item";
                db.GoalMeasureEntries.Add(new GoalMeasureEntry
                {
                    UserId = source.UserId,
                    GoalId = source.GoalId,
                    EntryDate = day,
                    Value = total,
                    Kind = GoalMeasureEntryKinds.CarriedOver,
                    Note = Truncate($"Carried over from {title}", 200),
                });
            }

            source.IsDeleted = true;
            source.DeletedAt = now;
        }

        return OperationResult<bool>.Ok(true);
    }

    private async Task<List<GoalSourceDto>> ToDtosAsync(List<GoalSourceRef> sources, DateOnly today)
    {
        var descriptions = await sourceReader.DescribeAsync(sources);
        var amounts = await sourceReader.AmountsAsync(sources, today);
        return sources.Select(s =>
        {
            var described = descriptions.TryGetValue(s.Id, out var d) ? d : new SourceDescription("A removed item", string.Empty);
            var locked = amounts.Locked.Contains(s.Id);
            return new GoalSourceDto
            {
                Id = s.Id,
                GoalId = s.GoalId,
                Kind = s.Kind,
                EntityType = s.EntityType,
                EntityId = s.EntityId,
                Filter = s.Filter,
                Metric = s.Metric,
                CountsFrom = s.CountsFrom,
                Title = described.Title,
                Unit = described.Unit,
                Counted = locked ? null : amounts.Total(s.Id),
                Locked = locked,
            };
        }).ToList();
    }

    private static string? EntryRefusal(Goal? goal, GoalMeasureEntryRequest request)
    {
        if (goal is null)
        {
            return NotFound;
        }

        if (goal.MeasureTarget is null)
        {
            return NotMeasured;
        }

        if (goal.MeasureSource == GoalMeasureSources.Linked)
        {
            return ReadOnly;
        }

        return GoalMeasureRules.CheckEntry(request.EntryDate, request.Value, request.Today);
    }

    private static GoalMeasureEntryDto ToDto(GoalMeasureEntry e) => new()
    {
        Id = e.Id,
        GoalId = e.GoalId,
        EntryDate = e.EntryDate,
        Value = e.Value,
        Kind = e.Kind,
        Note = e.Note,
        CreatedAt = e.CreatedAt,
    };

    private static decimal Round(decimal value) => Math.Round(value, 4, MidpointRounding.AwayFromZero);

    private static string? Note(string? note) => string.IsNullOrWhiteSpace(note) ? null : note.Trim();

    private static string? Blank(string? text) => string.IsNullOrWhiteSpace(text) ? null : text.Trim();

    private static string Truncate(string text, int length) => text.Length <= length ? text : text[..(length - 1)] + "…";
}
