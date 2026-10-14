using AutoMapper;
using AutoMapper.QueryableExtensions;
using LifeOS.Core.Calendar.DTOs;
using LifeOS.Core.Calendar.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Calendar.Services;

public class EventsService(AppDbContext db, IMapper mapper, IEntityLinksService entityLinksService) : IEventsService
{
    private const string NotFound = "Event not found.";

    public async Task<OperationResult<EventDto>> GetAsync(int id)
    {
        var calendarEvent = await db.Events
            .Where(e => e.Id == id)
            .ProjectTo<EventDto>(mapper.ConfigurationProvider)
            .FirstOrDefaultAsync();

        return calendarEvent is null ? OperationResult<EventDto>.Fail(NotFound) : OperationResult<EventDto>.Ok(calendarEvent);
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

        var error = Apply(calendarEvent, request);
        if (error is not null)
        {
            return OperationResult<EventDto>.Fail(error);
        }

        calendarEvent.UpdatedAt = DateTime.UtcNow;
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

        // A reminder about a deleted event would surface something that no longer exists.
        await db.Reminders
            .Where(r => r.EntityType == EventLinkableProvider.Type && r.EntityId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(r => r.IsDeleted, true).SetProperty(r => r.DeletedAt, now));

        calendarEvent.IsDeleted = true;
        calendarEvent.DeletedAt = now;
        await db.SaveChangesAsync();
        await entityLinksService.RemoveAllForEntityAsync(EventLinkableProvider.Type, id);

        await transaction.CommitAsync();
        return OperationResult<bool>.Ok(true);
    }

    /// <summary>Validates the request (mirroring CK_Events_Shape) and copies it onto the entity; returns an error or null.</summary>
    private static string? Apply(Event calendarEvent, EventRequest request)
    {
        var title = request.Title.Trim();
        if (title.Length == 0)
        {
            return "Title is required.";
        }

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
        }

        calendarEvent.Title = title;
        calendarEvent.Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
        calendarEvent.Location = string.IsNullOrWhiteSpace(request.Location) ? null : request.Location.Trim();
        calendarEvent.IsAllDay = request.IsAllDay;
        return null;
    }
}
