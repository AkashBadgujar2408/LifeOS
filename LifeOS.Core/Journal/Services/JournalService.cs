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
    IRemindersService remindersService, IAttachmentsService attachmentsService) : IJournalService
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

        // Tags go through the per-user filter, so another user's tag id counts as missing.
        var wantedTags = request.TagIds.Distinct().ToList();
        if (wantedTags.Count > 0 && await db.Tags.CountAsync(t => wantedTags.Contains(t.Id)) != wantedTags.Count)
        {
            return OperationResult<JournalEntryDto>.Fail("Tag not found.");
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

        var current = entry.Id == 0 ? [] : await db.JournalEntryTags.Where(t => t.JournalEntryId == entry.Id).ToListAsync();
        foreach (var tag in current.Where(t => !wantedTags.Contains(t.TagId)))
        {
            tag.IsDeleted = true;
            tag.DeletedAt = DateTime.UtcNow;
        }

        foreach (var tagId in wantedTags.Except(current.Select(t => t.TagId)))
        {
            entry.JournalEntryTags.Add(new JournalEntryTag { UserId = entry.UserId, TagId = tagId });
        }

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

        var now = DateTime.UtcNow;
        entry.IsDeleted = true;
        entry.DeletedAt = now;
        foreach (var tag in await db.JournalEntryTags.Where(t => t.JournalEntryId == entry.Id).ToListAsync())
        {
            tag.IsDeleted = true;
            tag.DeletedAt = now;
        }

        await db.SaveChangesAsync();
        await entityLinksService.RemoveAllForEntityAsync(JournalEntryLinkableProvider.Type, entry.Id);
        await remindersService.RemoveAllForEntityAsync(JournalEntryLinkableProvider.Type, entry.Id);
        // The day's photos (memories) go with it; the gratitude list and lessons belong to the day and stay.
        await attachmentsService.RemoveAllForEntityAsync(JournalEntryLinkableProvider.Type, entry.Id);

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

    public async Task<DayNotesDto> GetNotesAsync(DateOnly day)
    {
        var notes = await db.JournalNotes.AsNoTracking()
            .Where(n => n.EntryDate == day)
            .OrderBy(n => n.SortOrder).ThenBy(n => n.Id)
            .Select(n => new { n.Kind, n.Text })
            .ToListAsync();

        return new DayNotesDto
        {
            EntryDate = day,
            Gratitude = notes.Where(n => n.Kind == JournalNoteKinds.Gratitude).Select(n => n.Text).ToList(),
            Lessons = notes.Where(n => n.Kind == JournalNoteKinds.Lesson).Select(n => n.Text).ToList(),
        };
    }

    public async Task<OperationResult<DayNotesDto>> SaveNotesAsync(DateOnly day, DayNotesRequest request)
    {
        var gratitude = CleanList(request.Gratitude);
        var lessons = CleanList(request.Lessons);
        if (gratitude.Concat(lessons).Any(text => text.Length > 500))
        {
            return OperationResult<DayNotesDto>.Fail("Keep each one under 500 characters.");
        }

        var now = DateTime.UtcNow;
        var userId = db.CurrentUserId!.Value;
        foreach (var old in await db.JournalNotes.Where(n => n.EntryDate == day).ToListAsync())
        {
            old.IsDeleted = true;
            old.DeletedAt = now;
        }

        db.JournalNotes.AddRange(gratitude.Select((text, i) => new JournalNote
        {
            UserId = userId, EntryDate = day, Kind = JournalNoteKinds.Gratitude, Text = text, SortOrder = i,
        }));
        db.JournalNotes.AddRange(lessons.Select((text, i) => new JournalNote
        {
            UserId = userId, EntryDate = day, Kind = JournalNoteKinds.Lesson, Text = text, SortOrder = i,
        }));
        await db.SaveChangesAsync();
        return OperationResult<DayNotesDto>.Ok(await GetNotesAsync(day));
    }

    public async Task<OperationResult<MonthlyReviewDto>> GetMonthAsync(DateOnly monthStart)
    {
        if (monthStart.Day != 1)
        {
            return OperationResult<MonthlyReviewDto>.Fail("A month is addressed by its first day.");
        }

        var monthEnd = monthStart.AddMonths(1).AddDays(-1);
        var reflection = await db.MonthlyReflections
            .Where(r => r.MonthStart == monthStart)
            .ProjectTo<MonthlyReflectionDto>(mapper.ConfigurationProvider)
            .FirstOrDefaultAsync();

        var entries = await db.JournalEntries.AsNoTracking()
            .Where(e => e.EntryDate >= monthStart && e.EntryDate <= monthEnd)
            .OrderBy(e => e.EntryDate)
            .Select(e => new { e.EntryDate, e.Title, e.Mood, e.Content })
            .ToListAsync();

        var notes = await db.JournalNotes.AsNoTracking()
            .Where(n => n.EntryDate >= monthStart && n.EntryDate <= monthEnd)
            .OrderBy(n => n.EntryDate).ThenBy(n => n.SortOrder).ThenBy(n => n.Id)
            .Select(n => new { n.Kind, n.EntryDate, n.Text })
            .ToListAsync();

        var decisions = await db.Decisions.AsNoTracking()
            .Where(d => d.DecidedOn >= monthStart && d.DecidedOn <= monthEnd)
            .OrderBy(d => d.DecidedOn).ThenBy(d => d.Id)
            .Select(d => new MonthDecisionDto
            {
                Id = d.Id, DecidedOn = d.DecidedOn, Title = d.Title, ReviewedOn = d.ReviewedOn, Verdict = d.Verdict,
            })
            .ToListAsync();

        var moods = entries.Where(e => e.Mood is not null).Select(e => (int)e.Mood!.Value).ToList();
        return OperationResult<MonthlyReviewDto>.Ok(new MonthlyReviewDto
        {
            MonthStart = monthStart,
            MonthEnd = monthEnd,
            Reflection = reflection,
            DaysWritten = entries.Count,
            MoodDays = moods.Count,
            MoodAverage = moods.Count == 0 ? null : Math.Round(moods.Average(), 1),
            Gratitude = notes.Where(n => n.Kind == JournalNoteKinds.Gratitude)
                .Select(n => new DatedNoteDto { EntryDate = n.EntryDate, Text = n.Text }).ToList(),
            Lessons = notes.Where(n => n.Kind == JournalNoteKinds.Lesson)
                .Select(n => new DatedNoteDto { EntryDate = n.EntryDate, Text = n.Text }).ToList(),
            Decisions = decisions,
            StandoutDays = entries.Where(e => e.Mood is 1 or 5)
                .Select(e => new JournalDaySummaryDto { EntryDate = e.EntryDate, Title = e.Title, Mood = e.Mood, Excerpt = Excerpt(e.Content) })
                .ToList(),
        });
    }

    public async Task<OperationResult<MonthlyReviewDto>> SaveMonthAsync(DateOnly monthStart, MonthlyReflectionRequest request)
    {
        if (monthStart.Day != 1)
        {
            return OperationResult<MonthlyReviewDto>.Fail("A month is addressed by its first day.");
        }

        var highlights = NormalizeText(request.Highlights);
        var learned = NormalizeText(request.Learned);
        var wouldChange = NormalizeText(request.WouldChange);
        var nextFocus = NormalizeText(request.NextFocus);
        var reflection = await db.MonthlyReflections.FirstOrDefaultAsync(r => r.MonthStart == monthStart);

        if (highlights is null && learned is null && wouldChange is null && nextFocus is null)
        {
            // All blank removes the reflection rather than storing an empty row (CK_MonthlyReflections_NotEmpty).
            if (reflection is not null)
            {
                reflection.IsDeleted = true;
                reflection.DeletedAt = DateTime.UtcNow;
                await db.SaveChangesAsync();
            }

            return await GetMonthAsync(monthStart);
        }

        if (reflection is null)
        {
            reflection = new MonthlyReflection { UserId = db.CurrentUserId!.Value, MonthStart = monthStart };
            db.MonthlyReflections.Add(reflection);
        }
        else
        {
            reflection.UpdatedAt = DateTime.UtcNow;
        }

        reflection.Highlights = highlights;
        reflection.Learned = learned;
        reflection.WouldChange = wouldChange;
        reflection.NextFocus = nextFocus;

        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            return OperationResult<MonthlyReviewDto>.Fail("This month's reflection was just saved somewhere else. Reload to see it.");
        }

        return await GetMonthAsync(monthStart);
    }

    private static List<string> CleanList(IEnumerable<string?> lines) =>
        lines.Where(line => !string.IsNullOrWhiteSpace(line)).Select(line => line!.Trim()).ToList();

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
