using AutoMapper;
using AutoMapper.QueryableExtensions;
using LifeOS.Core.Calendar.ServiceContracts;
using LifeOS.Core.Journal.DTOs;
using LifeOS.Core.Journal.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using LifeOS.Core.Shared.Services;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Journal.Services;

public class JournalService(AppDbContext db, IMapper mapper, IEntityLinksService entityLinksService,
    IRemindersService remindersService) : IJournalService
{
    private const string NotFound = JournalErrors.NotFound;
    private const string Empty = "Write something or pick a mood.";

    /// <summary>A year and a bit: enough for a long trend, small enough to stay one cheap query.</summary>
    private const int MaxRangeDays = 400;

    private const int ExcerptLength = 140;

    public async Task<OperationResult<List<JournalEntryDto>>> ListAsync(DateOnly from, DateOnly to)
    {
        var rangeError = ValidateRange(from, to);
        if (rangeError is not null)
        {
            return OperationResult<List<JournalEntryDto>>.Fail(rangeError);
        }

        var entries = await db.JournalEntries
            .Where(e => e.EntryDate >= from && e.EntryDate <= to)
            .OrderByDescending(e => e.EntryDate)
            .ProjectTo<JournalEntryDto>(mapper.ConfigurationProvider)
            .ToListAsync();
        return OperationResult<List<JournalEntryDto>>.Ok(entries);
    }

    public async Task<OperationResult<JournalEntryDto>> GetAsync(int id)
    {
        var entry = await db.JournalEntries
            .Where(e => e.Id == id)
            .ProjectTo<JournalEntryDto>(mapper.ConfigurationProvider)
            .FirstOrDefaultAsync();
        return entry is null ? OperationResult<JournalEntryDto>.Fail(NotFound) : OperationResult<JournalEntryDto>.Ok(entry);
    }

    public async Task<JournalEntryDto?> GetForDayAsync(DateOnly day) =>
        await db.JournalEntries
            .Where(e => e.EntryDate == day)
            .ProjectTo<JournalEntryDto>(mapper.ConfigurationProvider)
            .FirstOrDefaultAsync();

    public async Task<OperationResult<JournalEntryDto>> SaveForDayAsync(DateOnly day, JournalEntryRequest request)
    {
        var content = NormalizeText(request.Content);
        if (content is null && request.Mood is null)
        {
            return OperationResult<JournalEntryDto>.Fail(Empty);
        }

        if (request.LifeAreaId is { } lifeAreaId && !await db.LifeAreas.AnyAsync(a => a.Id == lifeAreaId))
        {
            return OperationResult<JournalEntryDto>.Fail("Life area not found.");
        }

        var entry = await db.JournalEntries.FirstOrDefaultAsync(e => e.EntryDate == day);
        if (entry is null)
        {
            entry = new JournalEntry { UserId = db.CurrentUserId!.Value, EntryDate = day };
            db.JournalEntries.Add(entry);
        }
        else
        {
            entry.UpdatedAt = DateTime.UtcNow;
        }

        entry.Title = NormalizeText(request.Title);
        entry.Content = content;
        entry.Mood = request.Mood;
        entry.LifeAreaId = request.LifeAreaId;

        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            // The same day was created by a concurrent save (two tabs): keep the other one rather than guess a merge.
            return OperationResult<JournalEntryDto>.Fail("This day's entry was just saved somewhere else. Reload to see it.");
        }

        return OperationResult<JournalEntryDto>.Ok((await GetForDayAsync(day))!);
    }

    public async Task<OperationResult<bool>> DeleteForDayAsync(DateOnly day)
    {
        var entry = await db.JournalEntries.FirstOrDefaultAsync(e => e.EntryDate == day);
        if (entry is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        await using var transaction = await db.Database.BeginTransactionAsync();

        entry.IsDeleted = true;
        entry.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        await entityLinksService.RemoveAllForEntityAsync(JournalEntryLinkableProvider.Type, entry.Id);
        await remindersService.RemoveAllForEntityAsync(JournalEntryLinkableProvider.Type, entry.Id);

        await transaction.CommitAsync();
        return OperationResult<bool>.Ok(true);
    }

    public async Task<OperationResult<JournalEntryDto>> CreateFromInboxAsync(int inboxItemId, DateOnly day)
    {
        var inboxItem = await db.InboxItems.FindAsync(inboxItemId);
        if (inboxItem is null)
        {
            return OperationResult<JournalEntryDto>.Fail("Inbox item not found.");
        }

        if (inboxItem.ProcessedAt is not null)
        {
            return OperationResult<JournalEntryDto>.Fail("This inbox item has already been processed.");
        }

        // The captured title and notes become a paragraph; a day that already has an entry gets it appended, since
        // there's only ever one entry per day.
        var captured = string.Join("\n\n", new[] { inboxItem.Title.Trim(), NormalizeText(inboxItem.Notes) }
            .Where(part => !string.IsNullOrEmpty(part)));

        await using var transaction = await db.Database.BeginTransactionAsync();

        var entry = await db.JournalEntries.FirstOrDefaultAsync(e => e.EntryDate == day);
        if (entry is null)
        {
            entry = new JournalEntry { UserId = db.CurrentUserId!.Value, EntryDate = day, Content = captured };
            db.JournalEntries.Add(entry);
        }
        else
        {
            entry.Content = entry.Content is null ? captured : $"{entry.Content}\n\n{captured}";
            entry.UpdatedAt = DateTime.UtcNow;
        }

        inboxItem.ProcessedAt = DateTime.UtcNow;
        inboxItem.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        // Same as Tasks: whatever the captured thought was linked to moves to the entry.
        await entityLinksService.CopyLinksAsync(InboxLinkableProvider.Type, inboxItemId, JournalEntryLinkableProvider.Type, entry.Id);
        await entityLinksService.RemoveAllForEntityAsync(InboxLinkableProvider.Type, inboxItemId);

        await transaction.CommitAsync();
        return OperationResult<JournalEntryDto>.Ok((await GetForDayAsync(day))!);
    }

    public async Task<OperationResult<List<MoodPointDto>>> GetMoodsAsync(DateOnly from, DateOnly to)
    {
        var rangeError = ValidateRange(from, to);
        if (rangeError is not null)
        {
            return OperationResult<List<MoodPointDto>>.Fail(rangeError);
        }

        var points = await db.JournalEntries
            .Where(e => e.EntryDate >= from && e.EntryDate <= to && e.Mood != null)
            .OrderBy(e => e.EntryDate)
            .Select(e => new MoodPointDto { EntryDate = e.EntryDate, Mood = e.Mood!.Value })
            .ToListAsync();
        return OperationResult<List<MoodPointDto>>.Ok(points);
    }

    public async Task<OperationResult<WeeklyReviewDto>> GetWeekAsync(DateOnly weekStart)
    {
        if (!JournalWeeks.IsWeekStart(weekStart))
        {
            return OperationResult<WeeklyReviewDto>.Fail("A week starts on a Monday.");
        }

        var (first, last) = JournalWeeks.Range(weekStart);
        var reflection = await db.WeeklyReflections
            .Where(r => r.WeekStartDate == weekStart)
            .ProjectTo<WeeklyReflectionDto>(mapper.ConfigurationProvider)
            .FirstOrDefaultAsync();

        var entries = await db.JournalEntries
            .Where(e => e.EntryDate >= first && e.EntryDate <= last)
            .OrderBy(e => e.EntryDate)
            .Select(e => new { e.EntryDate, e.Title, e.Mood, e.Content })
            .ToListAsync();

        return OperationResult<WeeklyReviewDto>.Ok(new WeeklyReviewDto
        {
            WeekStartDate = first,
            WeekEndDate = last,
            Reflection = reflection,
            Days = entries
                .Select(e => new JournalDaySummaryDto
                {
                    EntryDate = e.EntryDate,
                    Title = e.Title,
                    Mood = e.Mood,
                    Excerpt = Excerpt(e.Content),
                })
                .ToList(),
        });
    }

    public async Task<OperationResult<WeeklyReviewDto>> SaveWeekAsync(DateOnly weekStart, WeeklyReflectionRequest request)
    {
        if (!JournalWeeks.IsWeekStart(weekStart))
        {
            return OperationResult<WeeklyReviewDto>.Fail("A week starts on a Monday.");
        }

        var wentWell = NormalizeText(request.WentWell);
        var wasHard = NormalizeText(request.WasHard);
        var nextFocus = NormalizeText(request.NextFocus);
        var reflection = await db.WeeklyReflections.FirstOrDefaultAsync(r => r.WeekStartDate == weekStart);

        if (wentWell is null && wasHard is null && nextFocus is null)
        {
            // Clearing every answer removes the reflection rather than storing an empty row (CK_WeeklyReflections_NotEmpty).
            if (reflection is not null)
            {
                reflection.IsDeleted = true;
                reflection.DeletedAt = DateTime.UtcNow;
                await db.SaveChangesAsync();
            }

            return await GetWeekAsync(weekStart);
        }

        if (reflection is null)
        {
            reflection = new WeeklyReflection { UserId = db.CurrentUserId!.Value, WeekStartDate = weekStart };
            db.WeeklyReflections.Add(reflection);
        }
        else
        {
            reflection.UpdatedAt = DateTime.UtcNow;
        }

        reflection.WentWell = wentWell;
        reflection.WasHard = wasHard;
        reflection.NextFocus = nextFocus;

        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            return OperationResult<WeeklyReviewDto>.Fail("This week's reflection was just saved somewhere else. Reload to see it.");
        }

        return await GetWeekAsync(weekStart);
    }

    private static string? ValidateRange(DateOnly from, DateOnly to)
    {
        if (from > to)
        {
            return "'from' can't be after 'to'.";
        }

        return to.DayNumber - from.DayNumber >= MaxRangeDays ? $"Ask for at most {MaxRangeDays} days at a time." : null;
    }

    private static string? Excerpt(string? content)
    {
        if (content is null)
        {
            return null;
        }

        var firstLine = content.Split('\n', 2)[0].Trim();
        return firstLine.Length <= ExcerptLength ? firstLine : firstLine[..ExcerptLength].TrimEnd() + "…";
    }

    private static string? NormalizeText(string? text) => string.IsNullOrWhiteSpace(text) ? null : text.Trim();
}
