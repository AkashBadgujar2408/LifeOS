using AutoMapper;
using AutoMapper.QueryableExtensions;
using LifeOS.Core.Calendar.DTOs;
using LifeOS.Core.Calendar.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using LifeOS.Core.Shared.Services;
using LifeOS.Core.Story.Services;
using LifeOS.Core.Tasks.DTOs;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Calendar.Services;

public class RemindersService(AppDbContext db, IMapper mapper, IEnumerable<ILinkableEntityProvider> providers)
    : IRemindersService
{
    private const string NotFound = "Reminder not found.";
    private const int DismissedLimit = 50;

    private static readonly HashSet<string> Frequencies =
        [RecurrenceFrequencies.Daily, RecurrenceFrequencies.Weekly, RecurrenceFrequencies.Monthly, RecurrenceFrequencies.Yearly];

    // Anything linkable can be a reminder's target, except an inbox item: it's a capture waiting to become something
    // real, and processing it would otherwise have to carry its reminders across too.
    private readonly Dictionary<string, ILinkableEntityProvider> targetProviders = providers
        .Where(p => p.EntityType != InboxLinkableProvider.Type)
        .ToDictionary(p => p.EntityType, StringComparer.OrdinalIgnoreCase);

    public async Task<OperationResult<List<ReminderDto>>> ListAsync(string status, string? entityType, int? entityId)
    {
        if ((entityType is null) != (entityId is null))
        {
            return OperationResult<List<ReminderDto>>.Fail("Filter by entity with both entityType and entityId.");
        }

        if (status != ReminderStatuses.Dismissed)
        {
            await WriteDueOccurrenceRemindersAsync();
        }

        var query = db.Reminders.AsQueryable();
        if (entityType is not null)
        {
            query = query.Where(r => r.EntityType == entityType && r.EntityId == entityId);
        }

        query = status == ReminderStatuses.Dismissed
            ? query.Where(r => r.DismissedAt != null).OrderByDescending(r => r.DismissedAt).Take(DismissedLimit)
            : query.Where(r => r.DismissedAt == null).OrderBy(r => r.RemindAt).ThenBy(r => r.Id);

        return OperationResult<List<ReminderDto>>.Ok(await ToDtosAsync(query));
    }

    public async Task<List<ReminderDto>> GetDueAsync()
    {
        await WriteDueOccurrenceRemindersAsync();
        var now = DateTime.UtcNow;
        return await ToDtosAsync(db.Reminders
            .Where(r => r.DismissedAt == null && r.RemindAt <= now)
            .OrderBy(r => r.RemindAt)
            .ThenBy(r => r.Id));
    }

    public async Task<OperationResult<ReminderDto>> GetAsync(int id)
    {
        var reminders = await ToDtosAsync(db.Reminders.Where(r => r.Id == id));
        return reminders.Count == 0
            ? OperationResult<ReminderDto>.Fail(NotFound)
            : OperationResult<ReminderDto>.Ok(reminders[0]);
    }

    public async Task<OperationResult<ReminderDto>> CreateAsync(ReminderRequest request)
    {
        var reminder = new Reminder { UserId = db.CurrentUserId!.Value };
        var error = Apply(reminder, request);
        if (error is not null)
        {
            return OperationResult<ReminderDto>.Fail(error);
        }

        if ((request.EntityType is null) != (request.EntityId is null))
        {
            return OperationResult<ReminderDto>.Fail("A reminder target needs both entityType and entityId.");
        }

        if (request.EntityType is not null)
        {
            if (!targetProviders.TryGetValue(request.EntityType, out var provider))
            {
                return OperationResult<ReminderDto>.Fail($"Reminders can't be set on '{request.EntityType}' items.");
            }

            // The provider queries through the per-user filter, so another user's item is "not found" too.
            var titles = await provider.GetTitlesAsync([request.EntityId!.Value]);
            if (titles.Count == 0)
            {
                return OperationResult<ReminderDto>.Fail("The item this reminder is about was not found.");
            }

            reminder.EntityType = provider.EntityType;
            reminder.EntityId = request.EntityId;
        }

        db.Reminders.Add(reminder);
        await db.SaveChangesAsync();
        return await GetAsync(reminder.Id);
    }

    public async Task<OperationResult<ReminderDto>> UpdateAsync(int id, ReminderRequest request)
    {
        var reminder = await db.Reminders.FindAsync(id);
        if (reminder is null)
        {
            return OperationResult<ReminderDto>.Fail(NotFound);
        }

        if (reminder.OccurrenceDate is not null && request.Recurrence is not null)
        {
            return OperationResult<ReminderDto>.Fail(
                "This reminder belongs to one occurrence of a repeating event, so it can't repeat itself.");
        }

        var error = Apply(reminder, request);
        if (error is not null)
        {
            return OperationResult<ReminderDto>.Fail(error);
        }

        reminder.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return await GetAsync(id);
    }

    public async Task<OperationResult<ReminderDto>> SetDismissedAsync(int id, bool dismissed)
    {
        var reminder = await db.Reminders.FindAsync(id);
        if (reminder is null)
        {
            return OperationResult<ReminderDto>.Fail(NotFound);
        }

        // Dismissing twice keeps the first time, so "dismissed at" stays truthful.
        if (dismissed != (reminder.DismissedAt is not null))
        {
            var now = DateTime.UtcNow;
            // A repeating reminder that's done moves on to its next time and stays pending; only once the series
            // has run out is it dismissed for good.
            var next = dismissed && reminder.RecurrenceFrequency is not null
                ? ReminderRecurrence.NextAfter(reminder.RecurrenceAnchorAt!.Value, reminder.RecurrenceFrequency,
                    reminder.RecurrenceInterval!.Value, reminder.RecurrenceUntil, reminder.TimeZone!, reminder.RemindAt, now)
                : null;
            if (next is not null)
            {
                reminder.RemindAt = next.Value;
            }
            else
            {
                reminder.DismissedAt = dismissed ? now : null;
            }

            reminder.UpdatedAt = now;
            await db.SaveChangesAsync();
        }

        return await GetAsync(id);
    }

    public async Task<OperationResult<ReminderDto>> SnoozeAsync(int id, DateTime until)
    {
        var reminder = await db.Reminders.FindAsync(id);
        if (reminder is null)
        {
            return OperationResult<ReminderDto>.Fail(NotFound);
        }

        if (until.Kind == DateTimeKind.Unspecified)
        {
            return OperationResult<ReminderDto>.Fail("The snooze time must include a timezone (send it as UTC).");
        }

        var now = DateTime.UtcNow;
        var untilUtc = until.ToUniversalTime();
        if (untilUtc <= now)
        {
            return OperationResult<ReminderDto>.Fail("Snooze until a time that's still to come.");
        }

        reminder.RemindAt = untilUtc;
        reminder.DismissedAt = null;
        reminder.UpdatedAt = now;
        await db.SaveChangesAsync();
        return await GetAsync(id);
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var reminder = await db.Reminders.FindAsync(id);
        if (reminder is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        var now = DateTime.UtcNow;
        reminder.IsDeleted = true;
        reminder.DeletedAt = now;
        // A deleted occurrence reminder counts as dealt with, or the next refresh would write it again.
        if (reminder.OccurrenceDate is not null)
        {
            reminder.DismissedAt ??= now;
        }

        await db.SaveChangesAsync();
        return OperationResult<bool>.Ok(true);
    }

    public async Task RemoveAllForEntityAsync(string entityType, int entityId)
    {
        var now = DateTime.UtcNow;
        await db.Reminders
            .Where(r => r.EntityType == entityType && r.EntityId == entityId)
            .ExecuteUpdateAsync(s => s.SetProperty(r => r.IsDeleted, true).SetProperty(r => r.DeletedAt, now));
    }

    /// <summary>Validates title/notes/time and copies them onto the entity; returns an error or null.</summary>
    private static string? Apply(Reminder reminder, ReminderRequest request)
    {
        var title = request.Title.Trim();
        if (title.Length == 0)
        {
            return "Title is required.";
        }

        if (request.RemindAt is null)
        {
            return "Pick when to be reminded.";
        }

        // Same rule as event times: without a "Z"/offset there's no telling which moment was meant.
        if (request.RemindAt.Value.Kind == DateTimeKind.Unspecified)
        {
            return "The reminder time must include a timezone (send it as UTC).";
        }

        var remindAt = request.RemindAt.Value.ToUniversalTime();
        var recurrence = request.Recurrence;
        if (recurrence is not null)
        {
            if (!Frequencies.Contains(recurrence.Frequency))
            {
                return "Repeat must be Daily, Weekly, Monthly or Yearly.";
            }

            if (recurrence.Interval is < 1 or > 999)
            {
                return "Repeat every 1 to 999.";
            }

            // Repeats follow a wall clock ("every Monday 09:00"), so the server has to know whose.
            if (string.IsNullOrWhiteSpace(request.TimeZone) || !LifeStoryService.TryFindZone(request.TimeZone, out var zone))
            {
                return "A repeating reminder needs your timezone (an IANA name such as Europe/London).";
            }

            if (recurrence.Until is { } until
                && until < DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(remindAt, zone)))
            {
                return "The repeats can't end before the reminder first fires.";
            }

            reminder.RecurrenceFrequency = recurrence.Frequency;
            reminder.RecurrenceInterval = recurrence.Interval;
            reminder.RecurrenceUntil = recurrence.Until;
            reminder.RecurrenceAnchorAt = remindAt;
            reminder.TimeZone = request.TimeZone.Trim();
        }
        else
        {
            reminder.RecurrenceFrequency = null;
            reminder.RecurrenceInterval = null;
            reminder.RecurrenceUntil = null;
            reminder.RecurrenceAnchorAt = null;
            reminder.TimeZone = null;
        }

        reminder.Title = title;
        reminder.Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
        reminder.RemindAt = remindAt;
        return null;
    }

    public async Task RemovePendingOccurrenceRemindersAsync(int eventId, DateOnly? fromDate = null, DateOnly? toDate = null)
    {
        var now = DateTime.UtcNow;
        await db.Reminders
            .Where(r => r.EntityType == EventLinkableProvider.Type && r.EntityId == eventId
                && r.OccurrenceDate != null && r.DismissedAt == null
                && (fromDate == null || r.OccurrenceDate >= fromDate)
                && (toDate == null || r.OccurrenceDate <= toDate))
            .ExecuteUpdateAsync(s => s.SetProperty(r => r.IsDeleted, true).SetProperty(r => r.DeletedAt, now));
    }

    /// <summary>
    /// "N minutes before each occurrence": for every recurring event that asks for it, writes the reminder of the
    /// occurrence that's due now (ReminderRecurrence.DueOccurrence) as an ordinary reminder about the event, unless
    /// that occurrence already has one — pending, done, or deleted after being dealt with. Future occurrences are
    /// never written ahead. Runs whenever due or pending reminders are read.
    /// </summary>
    private async Task WriteDueOccurrenceRemindersAsync()
    {
        var series = await db.Events
            .AsNoTracking()
            .Where(e => e.ReminderMinutesBefore != null && e.RecurrenceFrequency != null)
            .ToListAsync();
        if (series.Count == 0)
        {
            return;
        }

        var ids = series.Select(e => e.Id).ToList();
        var skippedByEvent = (await db.EventExceptions
                .Where(x => ids.Contains(x.EventId))
                .Select(x => new { x.EventId, x.OccurrenceDate })
                .ToListAsync())
            .GroupBy(x => x.EventId)
            .ToDictionary(g => g.Key, g => (IReadOnlySet<DateOnly>)g.Select(x => x.OccurrenceDate).ToHashSet());

        var now = DateTime.UtcNow;
        var userId = db.CurrentUserId!.Value;
        var added = false;
        foreach (var calendarEvent in series)
        {
            var minutesBefore = calendarEvent.ReminderMinutesBefore!.Value;
            var occurrence = ReminderRecurrence.DueOccurrence(
                EventsService.SeriesOf(calendarEvent)!,
                minutesBefore,
                skippedByEvent.GetValueOrDefault(calendarEvent.Id, new HashSet<DateOnly>()),
                now);
            if (occurrence is null)
            {
                continue;
            }

            // Deleted rows count too when they'd been dealt with (DeleteAsync marks them dismissed); rows removed
            // because the event changed (still undismissed) don't, so the new time gets written.
            var exists = await db.Reminders
                .IgnoreQueryFilters()
                .AnyAsync(r => r.UserId == userId && r.EntityType == EventLinkableProvider.Type
                    && r.EntityId == calendarEvent.Id && r.OccurrenceDate == occurrence.OccurrenceDate
                    && (!r.IsDeleted || r.DismissedAt != null));
            if (exists)
            {
                continue;
            }

            var zone = TimeZoneInfo.FindSystemTimeZoneById(calendarEvent.TimeZone!);
            var startsAt = occurrence.StartsAt!.Value;
            var localStart = TimeZoneInfo.ConvertTimeFromUtc(startsAt, zone);
            db.Reminders.Add(new Reminder
            {
                UserId = userId,
                Title = $"{calendarEvent.Title} — starts {localStart:HH:mm}",
                RemindAt = startsAt.AddMinutes(-minutesBefore),
                EntityType = EventLinkableProvider.Type,
                EntityId = calendarEvent.Id,
                OccurrenceDate = occurrence.OccurrenceDate,
            });
            added = true;
        }

        if (!added)
        {
            return;
        }

        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            // Two refreshes at once (two tabs): the other one wrote it.
            db.ChangeTracker.Clear();
        }
    }

    /// <summary>Runs the query and fills in each target's current title (one lookup per target type).</summary>
    private async Task<List<ReminderDto>> ToDtosAsync(IQueryable<Reminder> query)
    {
        var reminders = await query.ProjectTo<ReminderDto>(mapper.ConfigurationProvider).ToListAsync();

        foreach (var group in reminders.Where(r => r.EntityType is not null).GroupBy(r => r.EntityType!))
        {
            if (!targetProviders.TryGetValue(group.Key, out var provider))
            {
                continue;
            }

            var titles = await provider.GetTitlesAsync(group.Select(r => r.EntityId!.Value).Distinct().ToList());
            foreach (var reminder in group)
            {
                reminder.EntityTitle = titles.GetValueOrDefault(reminder.EntityId!.Value);
            }
        }

        return reminders;
    }
}
