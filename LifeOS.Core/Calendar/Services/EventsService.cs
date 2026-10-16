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

public class EventsService(AppDbContext db, IEntityLinksService entityLinksService,
    IRemindersService remindersService) : IEventsService
{
    private const string NotFound = EventErrors.NotFound;
    private const string NotRecurring = "This event doesn't repeat.";
    private const string NoOccurrence = "The event doesn't happen on that day.";

    private static readonly HashSet<string> Frequencies =
        [RecurrenceFrequencies.Daily, RecurrenceFrequencies.Weekly, RecurrenceFrequencies.Monthly, RecurrenceFrequencies.Yearly];

    public async Task<OperationResult<EventDto>> GetAsync(int id)
    {
        var calendarEvent = await db.Events.AsNoTracking().FirstOrDefaultAsync(e => e.Id == id);
        if (calendarEvent is null)
        {
            return OperationResult<EventDto>.Fail(NotFound);
        }

        var skipped = await db.EventExceptions
            .Where(x => x.EventId == id)
            .OrderBy(x => x.OccurrenceDate)
            .Select(x => x.OccurrenceDate)
            .ToListAsync();

        return OperationResult<EventDto>.Ok(ToDto(calendarEvent, skipped));
    }

    public async Task<OperationResult<EventDto>> CreateAsync(EventRequest request)
    {
        var calendarEvent = new Event { UserId = db.CurrentUserId!.Value };
        var error = Apply(calendarEvent, request);
        if (error is not null)
        {
            return OperationResult<EventDto>.Fail(error);
        }

        db.Events.Add(calendarEvent);
        await db.SaveChangesAsync();
        return await GetAsync(calendarEvent.Id);
    }

    public async Task<OperationResult<EventDto>> UpdateAsync(int id, EventRequest request)
    {
        var calendarEvent = await db.Events.FindAsync(id);
        if (calendarEvent is null)
        {
            return OperationResult<EventDto>.Fail(NotFound);
        }

        var scheduleBefore = ScheduleKey(calendarEvent);
        var error = Apply(calendarEvent, request);
        if (error is not null)
        {
            return OperationResult<EventDto>.Fail(error);
        }

        var now = DateTime.UtcNow;
        calendarEvent.UpdatedAt = now;

        // Skipped dates name occurrences. If the series now lands on different days (new first day, frequency or
        // interval) or stops repeating, the old names mean nothing — or worse, would skip the wrong day by chance.
        // A new time of day, title or end date keeps them.
        if (scheduleBefore is not null && scheduleBefore != ScheduleKey(calendarEvent))
        {
            await SoftDeleteSkipsAsync(id, now);
        }

        await db.SaveChangesAsync();
        return await GetAsync(id);
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var calendarEvent = await db.Events.FindAsync(id);
        if (calendarEvent is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        var now = DateTime.UtcNow;
        await using var transaction = await db.Database.BeginTransactionAsync();

        calendarEvent.IsDeleted = true;
        calendarEvent.DeletedAt = now;
        await SoftDeleteSkipsAsync(id, now);
        await db.SaveChangesAsync();
        await entityLinksService.RemoveAllForEntityAsync(EventLinkableProvider.Type, id);
        // A reminder about a deleted event would surface something that no longer exists.
        await remindersService.RemoveAllForEntityAsync(EventLinkableProvider.Type, id);

        await transaction.CommitAsync();
        return OperationResult<bool>.Ok(true);
    }

    public async Task<OperationResult<EventDto>> SetSkippedAsync(int id, DateOnly occurrenceDate, bool skipped)
    {
        var calendarEvent = await db.Events.FindAsync(id);
        if (calendarEvent is null)
        {
            return OperationResult<EventDto>.Fail(NotFound);
        }

        var series = SeriesOf(calendarEvent);
        if (series is null)
        {
            return OperationResult<EventDto>.Fail(NotRecurring);
        }

        var existing = await db.EventExceptions.FirstOrDefaultAsync(x => x.EventId == id && x.OccurrenceDate == occurrenceDate);
        if (skipped && existing is null)
        {
            if (EventRecurrence.OccurrenceOn(series, occurrenceDate) is null)
            {
                return OperationResult<EventDto>.Fail(NoOccurrence);
            }

            db.EventExceptions.Add(new EventException { UserId = calendarEvent.UserId, EventId = id, OccurrenceDate = occurrenceDate });
            try
            {
                await db.SaveChangesAsync();
            }
            catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
            {
                // Skipped by a concurrent request (a double click): skipped either way.
                db.ChangeTracker.Clear();
            }
        }
        else if (!skipped && existing is not null)
        {
            // Restoring soft-deletes the row; the filtered unique index lets the day be skipped again later.
            existing.IsDeleted = true;
            existing.DeletedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
        }

        return await GetAsync(id);
    }

    public async Task<OperationResult<EventDto>> DetachOccurrenceAsync(int id, DateOnly occurrenceDate, EventRequest request)
    {
        var calendarEvent = await db.Events.FindAsync(id);
        if (calendarEvent is null)
        {
            return OperationResult<EventDto>.Fail(NotFound);
        }

        var series = SeriesOf(calendarEvent);
        if (series is null)
        {
            return OperationResult<EventDto>.Fail(NotRecurring);
        }

        if (EventRecurrence.OccurrenceOn(series, occurrenceDate) is null
            || await db.EventExceptions.AnyAsync(x => x.EventId == id && x.OccurrenceDate == occurrenceDate))
        {
            return OperationResult<EventDto>.Fail(NoOccurrence);
        }

        if (request.Recurrence is not null)
        {
            return OperationResult<EventDto>.Fail("A changed occurrence is a one-off; it can't repeat.");
        }

        // The changed occurrence becomes its own one-off event and the series skips that day — one transaction, so
        // the day never shows twice or not at all.
        var oneOff = new Event { UserId = calendarEvent.UserId };
        var error = Apply(oneOff, request);
        if (error is not null)
        {
            return OperationResult<EventDto>.Fail(error);
        }

        await using var transaction = await db.Database.BeginTransactionAsync();
        db.Events.Add(oneOff);
        db.EventExceptions.Add(new EventException { UserId = calendarEvent.UserId, EventId = id, OccurrenceDate = occurrenceDate });
        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            return OperationResult<EventDto>.Fail("That occurrence was just changed or skipped elsewhere. Reload and try again.");
        }

        await transaction.CommitAsync();
        return await GetAsync(oneOff.Id);
    }

    public async Task<OperationResult<bool>> EndSeriesAsync(int id, DateOnly occurrenceDate)
    {
        var calendarEvent = await db.Events.FindAsync(id);
        if (calendarEvent is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        var series = SeriesOf(calendarEvent);
        if (series is null)
        {
            return OperationResult<bool>.Fail(NotRecurring);
        }

        if (EventRecurrence.OccurrenceOn(series, occurrenceDate) is null)
        {
            return OperationResult<bool>.Fail(NoOccurrence);
        }

        // From the first occurrence on is the whole series.
        if (occurrenceDate == EventRecurrence.FirstDate(series))
        {
            await DeleteAsync(id);
            return OperationResult<bool>.Ok(true);
        }

        var now = DateTime.UtcNow;
        calendarEvent.RecurrenceUntil = occurrenceDate.AddDays(-1);
        calendarEvent.UpdatedAt = now;
        // Skips past the new end can never apply again.
        foreach (var skip in await db.EventExceptions.Where(x => x.EventId == id && x.OccurrenceDate >= occurrenceDate).ToListAsync())
        {
            skip.IsDeleted = true;
            skip.DeletedAt = now;
        }

        await db.SaveChangesAsync();
        return OperationResult<bool>.Ok(false);
    }

    /// <summary>The stored row as a series for EventRecurrence, or null for a one-off event.</summary>
    internal static EventSeries? SeriesOf(Event e) => e.RecurrenceFrequency is null
        ? null
        : new EventSeries(e.IsAllDay, e.StartDate, e.EndDate, e.StartsAt, e.EndsAt,
            e.RecurrenceFrequency, e.RecurrenceInterval!.Value, e.RecurrenceUntil, e.TimeZone);

    /// <summary>What decides which days a series falls on; null for a one-off event.</summary>
    private static (DateOnly FirstDate, string Frequency, int Interval)? ScheduleKey(Event e) =>
        SeriesOf(e) is { } series ? (EventRecurrence.FirstDate(series), series.Frequency, series.Interval) : null;

    private async Task SoftDeleteSkipsAsync(int eventId, DateTime now)
    {
        foreach (var skip in await db.EventExceptions.Where(x => x.EventId == eventId).ToListAsync())
        {
            skip.IsDeleted = true;
            skip.DeletedAt = now;
        }
    }

    private static EventDto ToDto(Event e, List<DateOnly> skipped) => new()
    {
        Id = e.Id,
        Title = e.Title,
        Notes = e.Notes,
        Location = e.Location,
        IsAllDay = e.IsAllDay,
        StartDate = e.StartDate,
        EndDate = e.EndDate,
        StartsAt = e.StartsAt,
        EndsAt = e.EndsAt,
        Recurrence = e.RecurrenceFrequency is null
            ? null
            : new EventRecurrenceDto { Frequency = e.RecurrenceFrequency, Interval = e.RecurrenceInterval!.Value, Until = e.RecurrenceUntil },
        TimeZone = e.TimeZone,
        SkippedDates = skipped,
        CreatedAt = e.CreatedAt,
    };

    /// <summary>
    /// Validates the request (mirroring CK_Events_Shape and CK_Events_Recurrence) and copies it onto the entity;
    /// returns an error or null.
    /// </summary>
    private static string? Apply(Event calendarEvent, EventRequest request)
    {
        var title = request.Title.Trim();
        if (title.Length == 0)
        {
            return "Title is required.";
        }

        TimeSpan length;
        if (request.IsAllDay)
        {
            if (request.StartDate is null)
            {
                return "An all-day event needs a start date.";
            }

            var endDate = request.EndDate ?? request.StartDate;
            if (endDate < request.StartDate)
            {
                return "The last day can't be before the first.";
            }

            calendarEvent.StartDate = request.StartDate;
            calendarEvent.EndDate = endDate;
            calendarEvent.StartsAt = null;
            calendarEvent.EndsAt = null;
            length = TimeSpan.FromDays(endDate.Value.DayNumber - request.StartDate.Value.DayNumber + 1);
        }
        else
        {
            if (request.StartsAt is null || request.EndsAt is null)
            {
                return "A timed event needs a start and an end time.";
            }

            // Without a "Z"/offset there's no telling which moment was meant; the server's own timezone is not the user's.
            if (request.StartsAt.Value.Kind == DateTimeKind.Unspecified || request.EndsAt.Value.Kind == DateTimeKind.Unspecified)
            {
                return "Event times must include a timezone (send them as UTC).";
            }

            var startsAt = request.StartsAt.Value.ToUniversalTime();
            var endsAt = request.EndsAt.Value.ToUniversalTime();
            if (endsAt < startsAt)
            {
                return "The event can't end before it starts.";
            }

            calendarEvent.StartsAt = startsAt;
            calendarEvent.EndsAt = endsAt;
            calendarEvent.StartDate = null;
            calendarEvent.EndDate = null;
            length = endsAt - startsAt;
        }

        var recurrenceError = ApplyRecurrence(calendarEvent, request, length);
        if (recurrenceError is not null)
        {
            return recurrenceError;
        }

        calendarEvent.Title = title;
        calendarEvent.Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
        calendarEvent.Location = string.IsNullOrWhiteSpace(request.Location) ? null : request.Location.Trim();
        calendarEvent.IsAllDay = request.IsAllDay;
        return null;
    }

    private static string? ApplyRecurrence(Event calendarEvent, EventRequest request, TimeSpan length)
    {
        var recurrence = request.Recurrence;
        if (recurrence is null)
        {
            calendarEvent.RecurrenceFrequency = null;
            calendarEvent.RecurrenceInterval = null;
            calendarEvent.RecurrenceUntil = null;
            calendarEvent.TimeZone = null;
            return null;
        }

        if (!Frequencies.Contains(recurrence.Frequency))
        {
            return "Repeat must be Daily, Weekly, Monthly or Yearly.";
        }

        if (recurrence.Interval is < 1 or > 999)
        {
            return "Repeat every 1 to 999.";
        }

        string? timeZone = null;
        if (!request.IsAllDay)
        {
            // A timed series follows a wall clock, so it has to know whose.
            if (string.IsNullOrWhiteSpace(request.TimeZone) || !LifeStoryService.TryFindZone(request.TimeZone, out _))
            {
                return "A repeating timed event needs your timezone (an IANA name such as Europe/London).";
            }

            timeZone = request.TimeZone.Trim();
        }

        var lengthError = EventRecurrence.LengthError(recurrence.Frequency, recurrence.Interval, length);
        if (lengthError is not null)
        {
            return lengthError;
        }

        var series = new EventSeries(request.IsAllDay, calendarEvent.StartDate, calendarEvent.EndDate,
            calendarEvent.StartsAt, calendarEvent.EndsAt, recurrence.Frequency, recurrence.Interval, recurrence.Until, timeZone);
        if (recurrence.Until is { } until && until < EventRecurrence.FirstDate(series))
        {
            return "The repeats can't end before the event first happens.";
        }

        calendarEvent.RecurrenceFrequency = recurrence.Frequency;
        calendarEvent.RecurrenceInterval = recurrence.Interval;
        calendarEvent.RecurrenceUntil = recurrence.Until;
        calendarEvent.TimeZone = timeZone;
        return null;
    }
}
