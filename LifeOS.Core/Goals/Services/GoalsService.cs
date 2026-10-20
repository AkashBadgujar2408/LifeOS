using AutoMapper;
using AutoMapper.QueryableExtensions;
using LifeOS.Core.Career.Services;
using LifeOS.Core.Goals.DTOs;
using LifeOS.Core.Goals.ServiceContracts;
using LifeOS.Core.Calendar.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using LifeOS.Core.Shared.Services;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Goals.Services;

public class GoalsService(AppDbContext db, IMapper mapper, IEntityLinksService entityLinksService,
    IRemindersService remindersService, IAttachmentsService attachmentsService, IGoalProgressService progressService,
    IGoalMeasureService measureService) : IGoalsService
{
    private const string NotFound = "Goal not found.";

    public async Task<List<GoalSummaryDto>> GetAllAsync(string? status, DateOnly? today = null)
    {
        var query = db.Goals.AsQueryable();
        if (!string.IsNullOrWhiteSpace(status))
        {
            query = query.Where(g => g.Status == status);
        }

        // Tags are the only collection here (milestones come back as counts), so no join fan-out.
        var goals = await query
            .OrderBy(g => g.TargetDate == null)
            .ThenBy(g => g.TargetDate)
            .ThenByDescending(g => g.CreatedAt)
            .ProjectTo<GoalSummaryDto>(mapper.ConfigurationProvider)
            .ToListAsync();

        await FillProgressAsync(goals, today);
        return goals;
    }

    public async Task<OperationResult<GoalDetailDto>> GetAsync(int id, DateOnly? today = null)
    {
        // Milestones + tags are two collections: split so SQL doesn't return milestones x tags rows.
        var goal = await db.Goals
            .Where(g => g.Id == id)
            .ProjectTo<GoalDetailDto>(mapper.ConfigurationProvider)
            .AsSplitQuery()
            .FirstOrDefaultAsync();
        if (goal is null)
        {
            return OperationResult<GoalDetailDto>.Fail(NotFound);
        }

        await FillProgressAsync([goal], today);
        return OperationResult<GoalDetailDto>.Ok(goal);
    }

    public async Task<OperationResult<List<GoalTrendPointDto>>> GetTrendAsync(int id, DateOnly? today = null)
    {
        var goal = await db.Goals.Where(g => g.Id == id)
            .Select(g => new { g.CreatedAt, g.Status, g.UserId, g.MeasureTarget, HasAmount = g.TargetAmount != null })
            .FirstOrDefaultAsync();
        if (goal is null)
        {
            return OperationResult<List<GoalTrendPointDto>>.Fail(NotFound);
        }

        // A savings or body target has no history of its own here (net worth has its own chart; body readings live
        // behind the vault), so its trend is empty and the page leaves the chart out.
        if (goal.HasAmount || await db.GoalTargets.AnyAsync(t => t.GoalId == id))
        {
            return OperationResult<List<GoalTrendPointDto>>.Ok([]);
        }

        if (goal.MeasureTarget is { } measureTarget)
        {
            var history = await progressService.MeasureHistoryAsync(id, today ?? Today());
            if (history is null)
            {
                return OperationResult<List<GoalTrendPointDto>>.Ok([]);
            }

            var measureChanges = await db.GoalHistories
                .Where(h => h.GoalId == id && h.EventType == GoalHistoryEvents.StatusChanged)
                .Select(h => new TrendStatusChange(h.CreatedAt, h.FromStatus!, h.ToStatus!))
                .ToListAsync();
            return OperationResult<List<GoalTrendPointDto>>.Ok(
                GoalProgressTrend.BuildMeasure(goal.CreatedAt, goal.Status, measureTarget, history, measureChanges, DateTime.UtcNow));
        }

        // Removed milestones still shaped the past, so read them too — IgnoreQueryFilters drops the user filter as
        // well, hence the explicit UserId.
        var milestones = await db.GoalMilestones.IgnoreQueryFilters()
            .Where(m => m.GoalId == id && m.UserId == goal.UserId)
            .Select(m => new TrendMilestone(m.CreatedAt, m.CompletedAt, m.IsDeleted ? m.DeletedAt ?? m.CreatedAt : null))
            .ToListAsync();
        var statusChanges = await db.GoalHistories
            .Where(h => h.GoalId == id && h.EventType == GoalHistoryEvents.StatusChanged)
            .Select(h => new TrendStatusChange(h.CreatedAt, h.FromStatus!, h.ToStatus!))
            .ToListAsync();

        return OperationResult<List<GoalTrendPointDto>>.Ok(
            GoalProgressTrend.Build(goal.CreatedAt, goal.Status, milestones, statusChanges, DateTime.UtcNow));
    }

    public async Task<OperationResult<GoalDetailDto>> CreateAsync(GoalRequest request)
    {
        var error = await ValidateAsync(request, null);
        if (error is not null)
        {
            return OperationResult<GoalDetailDto>.Fail(error);
        }

        var userId = db.CurrentUserId!.Value;
        var goal = new Goal { UserId = userId, Status = GoalStatuses.Active };
        Apply(goal, request);
        foreach (var tagId in request.TagIds.Distinct())
        {
            goal.GoalTags.Add(new GoalTag { UserId = userId, TagId = tagId });
        }

        db.Goals.Add(goal);
        await db.SaveChangesAsync();

        return await GetAsync(goal.Id);
    }

    public async Task<OperationResult<GoalDetailDto>> UpdateAsync(int id, GoalRequest request)
    {
        var goal = await db.Goals.FindAsync(id);
        if (goal is null)
        {
            return OperationResult<GoalDetailDto>.Fail(NotFound);
        }

        var error = await ValidateAsync(request, id);
        if (error is not null)
        {
            return OperationResult<GoalDetailDto>.Fail(error);
        }

        // Leaving "counted from other items" (back to logging it, or no number at all): what the sources counted so
        // far stays as Carried over entries. While still counted, the unit can't move away from what they count.
        var wasLinked = goal.MeasureSource == GoalMeasureSources.Linked;
        var staysLinked = request.MeasureTarget is not null && request.MeasureSource == GoalMeasureSources.Linked;
        var hasSources = wasLinked && await db.GoalSources.AnyAsync(s => s.GoalId == id);
        if (hasSources && staysLinked && !GoalMeasureRules.SameUnit(goal.MeasureUnit, request.MeasureUnit))
        {
            return OperationResult<GoalDetailDto>.Fail(
                $"Its sources count {goal.MeasureUnit} — remove them on the goal page before changing the unit.");
        }

        if (hasSources && !staysLinked)
        {
            var frozen = await measureService.FreezeSourcesAsync(id, request.Today ?? Today());
            if (!frozen.Success)
            {
                return OperationResult<GoalDetailDto>.Fail(frozen.Error!);
            }
        }

        var wanted = request.TagIds.Distinct().ToHashSet();
        var current = await db.GoalTags.Where(gt => gt.GoalId == id).ToListAsync();
        var tagsChanged = !wanted.SetEquals(current.Select(gt => gt.TagId));

        // Any real change is a revision: log what changed (and the target date move) before overwriting it.
        var changedFields = ChangedFields(goal, request, tagsChanged);
        if (changedFields.Count > 0)
        {
            var targetDateMoved = goal.TargetDate != request.TargetDate;
            db.GoalHistories.Add(new GoalHistory
            {
                UserId = goal.UserId,
                GoalId = id,
                EventType = GoalHistoryEvents.Revised,
                ChangedFields = string.Join(',', changedFields),
                PreviousTargetDate = targetDateMoved ? goal.TargetDate : null,
                NewTargetDate = targetDateMoved ? request.TargetDate : null,
                Note = NormalizeNote(request.RevisionNote),
            });
            goal.UpdatedAt = DateTime.UtcNow;
        }

        Apply(goal, request);

        // Sync tags: soft-delete the removed ones, add a fresh row for each added one (the filtered unique
        // index lets a previously removed tag come back as a new row).
        foreach (var goalTag in current.Where(gt => !wanted.Contains(gt.TagId)))
        {
            goalTag.IsDeleted = true;
            goalTag.DeletedAt = DateTime.UtcNow;
        }

        foreach (var tagId in wanted.Except(current.Select(gt => gt.TagId)))
        {
            db.GoalTags.Add(new GoalTag { UserId = goal.UserId, GoalId = id, TagId = tagId });
        }

        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            // Two concurrent saves of the same goal both added the same tag; the other one won.
            return OperationResult<GoalDetailDto>.Fail("This goal was changed somewhere else at the same time. Reload and try again.");
        }

        return await GetAsync(id);
    }

    public async Task<OperationResult<GoalDetailDto>> SetStatusAsync(int id, SetGoalStatusRequest request)
    {
        var goal = await db.Goals.FindAsync(id);
        if (goal is null)
        {
            return OperationResult<GoalDetailDto>.Fail(NotFound);
        }

        if (goal.Status == request.Status)
        {
            return OperationResult<GoalDetailDto>.Fail($"This goal is already {request.Status.ToLowerInvariant()}.");
        }

        db.GoalHistories.Add(new GoalHistory
        {
            UserId = goal.UserId,
            GoalId = id,
            EventType = GoalHistoryEvents.StatusChanged,
            FromStatus = goal.Status,
            ToStatus = request.Status,
            Note = NormalizeNote(request.Note),
        });

        // CK_Goals_CompletedAt: only a Completed goal may carry CompletedAt, so leaving Completed clears it.
        goal.Status = request.Status;
        goal.CompletedAt = request.Status == GoalStatuses.Completed ? DateTime.UtcNow : null;
        goal.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        return await GetAsync(id);
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var goal = await db.Goals.FindAsync(id);
        if (goal is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        var now = DateTime.UtcNow;
        await using var transaction = await db.Database.BeginTransactionAsync();

        await db.GoalMilestones
            .Where(m => m.GoalId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(m => m.IsDeleted, true).SetProperty(m => m.DeletedAt, now));
        await db.GoalTags
            .Where(gt => gt.GoalId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(gt => gt.IsDeleted, true).SetProperty(gt => gt.DeletedAt, now));
        await db.GoalHistories
            .Where(h => h.GoalId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(h => h.IsDeleted, true).SetProperty(h => h.DeletedAt, now));
        // Its measure: the log and what it was counted from.
        await db.GoalMeasureEntries
            .Where(e => e.GoalId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(e => e.IsDeleted, true).SetProperty(e => e.DeletedAt, now));
        await db.GoalSources
            .Where(gs => gs.GoalId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(gs => gs.IsDeleted, true).SetProperty(gs => gs.DeletedAt, now));
        // Story Mode: the goal stops unlocking (and needing) other missions, and its debrief goes with it.
        await db.MissionPrerequisites
            .Where(p => p.GoalId == id || p.RequiresGoalId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(p => p.IsDeleted, true).SetProperty(p => p.DeletedAt, now));
        await db.MissionDebriefs
            .Where(d => d.GoalId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(d => d.IsDeleted, true).SetProperty(d => d.DeletedAt, now));
        // Learning roadmaps (and their steps) that served the goal carry on without it.
        await db.Roadmaps
            .Where(r => r.GoalId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(r => r.GoalId, (int?)null).SetProperty(r => r.UpdatedAt, now));
        await db.RoadmapSteps
            .Where(r => r.GoalId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(r => r.GoalId, (int?)null).SetProperty(r => r.UpdatedAt, now));
        // A health target (Session 65) belongs to the goal.
        await db.GoalTargets
            .Where(t => t.GoalId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.IsDeleted, true).SetProperty(t => t.DeletedAt, now));

        goal.IsDeleted = true;
        goal.DeletedAt = now;
        await db.SaveChangesAsync();
        await entityLinksService.RemoveAllForEntityAsync(GoalLinkableProvider.Type, id);
        await remindersService.RemoveAllForEntityAsync(GoalLinkableProvider.Type, id);
        await attachmentsService.RemoveAllForEntityAsync(GoalLinkableProvider.Type, id);

        await transaction.CommitAsync();
        return OperationResult<bool>.Ok(true);
    }

    private async Task<string?> ValidateAsync(GoalRequest request, int? goalId)
    {
        if (request.Title.Trim().Length == 0)
        {
            return "Title is required.";
        }

        if (!await db.LifeAreas.AnyAsync(a => a.Id == request.LifeAreaId))
        {
            return "Life area not found.";
        }

        // Tags go through the per-user filter, so another user's tag id counts as missing.
        var tagIds = request.TagIds.Distinct().ToList();
        if (tagIds.Count > 0 && await db.Tags.CountAsync(t => tagIds.Contains(t.Id)) != tagIds.Count)
        {
            return "Tag not found.";
        }

        if ((request.TargetAmount is null) != string.IsNullOrWhiteSpace(request.TargetCurrency))
        {
            return "A savings target needs both an amount and its currency.";
        }

        if (request.TargetAmount is <= 0 or > 999_999_999_999_999m)
        {
            return "The amount to save has to be more than zero.";
        }

        if (request.TargetCurrency is not null && CareerRules.Currency(request.TargetCurrency) is null)
        {
            return "Use a 3-letter currency code such as INR.";
        }

        if (GoalMeasureRules.CheckMeasure(request.MeasureTarget, request.MeasureStart, request.MeasureUnit, request.MeasureSource)
            is { } measureError)
        {
            return measureError;
        }

        // CK_Goals_OneTarget, and a Health body target lives beside the goal: one kind of target per goal.
        if (request.MeasureTarget is not null && request.TargetAmount is not null)
        {
            return "A goal is measured by one thing — a number or an amount to save, not both.";
        }

        if (goalId is { } id && (request.MeasureTarget is not null || request.TargetAmount is not null)
            && await db.GoalTargets.AnyAsync(t => t.GoalId == id))
        {
            return "This goal has a body measurement target — remove it on the goal page before measuring it another way.";
        }

        return null;
    }

    /// <summary>Names match GoalRequest/Goal properties ("Tags" for the tag set); the UI turns them into labels.</summary>
    private static List<string> ChangedFields(Goal goal, GoalRequest request, bool tagsChanged)
    {
        var changed = new List<string>();
        if (goal.Title != request.Title.Trim())
        {
            changed.Add(nameof(Goal.Title));
        }

        if (goal.Description != (string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim()))
        {
            changed.Add(nameof(Goal.Description));
        }

        if (goal.LifeAreaId != request.LifeAreaId)
        {
            changed.Add(nameof(Goal.LifeArea));
        }

        if (goal.GoalType != request.GoalType)
        {
            changed.Add(nameof(Goal.GoalType));
        }

        if (goal.TargetDate != request.TargetDate)
        {
            changed.Add(nameof(Goal.TargetDate));
        }

        if (goal.TargetAmount != request.TargetAmount || goal.TargetCurrency != TargetCurrency(request))
        {
            changed.Add(nameof(Goal.TargetAmount));
        }

        if (goal.MeasureTarget != request.MeasureTarget
            || goal.MeasureStart != MeasureStart(request)
            || goal.MeasureUnit != MeasureUnit(request)
            || goal.MeasureSource != MeasureSource(request))
        {
            changed.Add("Measure");
        }

        if (tagsChanged)
        {
            changed.Add("Tags");
        }

        return changed;
    }

    private static string? NormalizeNote(string? note) => string.IsNullOrWhiteSpace(note) ? null : note.Trim();

    private static void Apply(Goal goal, GoalRequest request)
    {
        goal.Title = request.Title.Trim();
        goal.Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();
        goal.LifeAreaId = request.LifeAreaId;
        goal.GoalType = request.GoalType;
        goal.TargetDate = request.TargetDate;
        goal.TargetAmount = request.TargetAmount;
        goal.TargetCurrency = TargetCurrency(request);
        goal.MeasureTarget = request.MeasureTarget;
        goal.MeasureStart = MeasureStart(request);
        goal.MeasureUnit = MeasureUnit(request);
        goal.MeasureSource = MeasureSource(request);
    }

    private static string? TargetCurrency(GoalRequest request) =>
        request.TargetAmount is null ? null : CareerRules.Currency(request.TargetCurrency);

    private static decimal? MeasureStart(GoalRequest request) =>
        request.MeasureTarget is null ? null : request.MeasureStart ?? 0;

    private static string? MeasureUnit(GoalRequest request) =>
        request.MeasureTarget is null ? null : GoalMeasureRules.Unit(request.MeasureUnit);

    private static string? MeasureSource(GoalRequest request) =>
        request.MeasureTarget is null ? null : request.MeasureSource;

    private static DateOnly Today() => DateOnly.FromDateTime(DateTime.UtcNow);

    /// <summary>Every goal's % through the one rule (measure, savings, body target or milestones).</summary>
    private async Task FillProgressAsync(IReadOnlyCollection<GoalSummaryDto> goals, DateOnly? today)
    {
        var progress = await progressService.ForGoalsAsync(
            goals.Select(g => new GoalProgressInput(g.Id, g.Status, g.MilestoneCount, g.CompletedMilestoneCount)).ToList(),
            today ?? Today());
        foreach (var goal in goals)
        {
            var p = progress[goal.Id];
            goal.ProgressPercent = p.Percent;
            goal.ProgressKind = p.Kind;
            goal.ProgressLocked = p.Locked;
            goal.MeasureCurrent = p.MeasureCurrent;
        }
    }
}
