using LifeOS.Core.Calendar.DTOs;
using LifeOS.Core.Calendar.ServiceContracts;
using LifeOS.Core.Calendar.Services;
using LifeOS.Core.Documents.Services;
using LifeOS.Core.Health.DTOs;
using LifeOS.Core.Health.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using LifeOS.Core.Story.Services;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Health.Services;

/// <summary>
/// Doctor visits. A visit's appointment time lives on its own one-off calendar event (<c>DoctorVisits.EventId</c>,
/// Health life area), created, moved and removed with the visit — like interview rounds; the title names the doctor,
/// never the reason, because the calendar isn't behind the vault. Deleting that event from the calendar keeps the
/// visit without a time. The follow-up reminder is owned here (<see cref="SyncFollowUpReminderAsync"/>), with a
/// neutral title for the same reason.
/// </summary>
public class DoctorVisitsService(AppDbContext db, IEntityLinksService entityLinksService, IRemindersService remindersService)
    : IDoctorVisitsService
{
    private const string NotFound = "Visit not found.";

    public async Task<List<DoctorVisitDto>> GetAllAsync()
    {
        var visits = await Query().OrderByDescending(v => v.VisitOn).ThenByDescending(v => v.Id).ToListAsync();
        return visits.Select(ToDto).ToList();
    }

    public async Task<OperationResult<DoctorVisitDto>> GetAsync(int id)
    {
        var visit = await Query().FirstOrDefaultAsync(v => v.Id == id);
        return visit is null ? OperationResult<DoctorVisitDto>.Fail(NotFound) : OperationResult<DoctorVisitDto>.Ok(ToDto(visit));
    }

    public async Task<OperationResult<DoctorVisitDto>> CreateAsync(DoctorVisitRequest request)
    {
        var visit = new DoctorVisit { UserId = db.CurrentUserId!.Value };
        await using var transaction = await db.Database.BeginTransactionAsync();
        var error = await ApplyAsync(visit, request);
        if (error is not null)
        {
            return OperationResult<DoctorVisitDto>.Fail(error);
        }

        db.DoctorVisits.Add(visit);
        await db.SaveChangesAsync();
        if (await SyncFollowUpReminderAsync(visit, request.TimeZone) is { } reminderError)
        {
            return OperationResult<DoctorVisitDto>.Fail(reminderError);
        }

        await transaction.CommitAsync();
        return await GetAsync(visit.Id);
    }

    public async Task<OperationResult<DoctorVisitDto>> UpdateAsync(int id, DoctorVisitRequest request)
    {
        var visit = await db.DoctorVisits.FindAsync(id);
        if (visit is null)
        {
            return OperationResult<DoctorVisitDto>.Fail(NotFound);
        }

        await using var transaction = await db.Database.BeginTransactionAsync();
        var error = await ApplyAsync(visit, request);
        if (error is not null)
        {
            return OperationResult<DoctorVisitDto>.Fail(error);
        }

        visit.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        if (await SyncFollowUpReminderAsync(visit, request.TimeZone) is { } reminderError)
        {
            return OperationResult<DoctorVisitDto>.Fail(reminderError);
        }

        await transaction.CommitAsync();
        return await GetAsync(visit.Id);
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var visit = await db.DoctorVisits.FindAsync(id);
        if (visit is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        var now = DateTime.UtcNow;
        await using var transaction = await db.Database.BeginTransactionAsync();
        visit.IsDeleted = true;
        visit.DeletedAt = now;
        if (visit.EventId is { } eventId)
        {
            await RemoveEventAsync(eventId, now);
        }

        await db.Medications.Where(m => m.PrescribedAtVisitId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(m => m.PrescribedAtVisitId, (int?)null).SetProperty(m => m.UpdatedAt, now));
        await db.LabResults.Where(r => r.VisitId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(r => r.VisitId, (int?)null).SetProperty(r => r.UpdatedAt, now));
        await db.SaveChangesAsync();
        // The follow-up reminder is about the visit, so this takes it too.
        await entityLinksService.RemoveAllForEntityAsync(DoctorVisitLinkableProvider.Type, id);
        await remindersService.RemoveAllForEntityAsync(DoctorVisitLinkableProvider.Type, id);
        await transaction.CommitAsync();
        return OperationResult<bool>.Ok(true);
    }

    private IQueryable<DoctorVisit> Query() =>
        db.DoctorVisits.AsNoTracking()
            .Include(v => v.Contact).Include(v => v.Condition).Include(v => v.Event)
            .Include(v => v.Medications.Where(m => !m.IsDeleted))
            .AsSplitQuery();

    private async Task<string?> ApplyAsync(DoctorVisit visit, DoctorVisitRequest request)
    {
        if (HealthRules.CheckVisit(request) is { } error)
        {
            return error;
        }

        Contact? contact = null;
        if (request.ContactId is { } contactId && (contact = await db.Contacts.FindAsync(contactId)) is null)
        {
            return "That contact wasn't found.";
        }

        if (request.ConditionId is { } conditionId && !await db.MedicalConditions.AnyAsync(c => c.Id == conditionId))
        {
            return "That medical history item wasn't found.";
        }

        visit.Reason = request.Reason.Trim();
        visit.VisitOn = request.VisitOn;
        visit.ContactId = request.ContactId;
        visit.Specialty = HealthRules.Text(request.Specialty);
        visit.Place = HealthRules.Text(request.Place);
        visit.ConditionId = request.ConditionId;
        visit.FollowUpOn = request.FollowUpOn;
        visit.Notes = HealthRules.Text(request.Notes);

        var calendarEvent = visit.EventId is { } eventId ? await db.Events.FindAsync(eventId) : null;
        if (request.StartsAt?.ToUniversalTime() is { } startsAt && request.EndsAt?.ToUniversalTime() is { } endsAt)
        {
            if (calendarEvent is null)
            {
                calendarEvent = new Event
                {
                    UserId = visit.UserId,
                    LifeAreaId = await db.LifeAreas.Where(a => a.Name == "Health").Select(a => (int?)a.Id).FirstOrDefaultAsync(),
                };
                db.Events.Add(calendarEvent);
                visit.Event = calendarEvent;
            }

            // The visit owns its entry's schedule: always a one-off timed event (EF maps it one-to-one: updated in place).
            calendarEvent.Title = HealthRules.AppointmentTitle(contact?.Name);
            calendarEvent.Location = visit.Place;
            calendarEvent.IsAllDay = false;
            calendarEvent.StartDate = null;
            calendarEvent.EndDate = null;
            calendarEvent.StartsAt = startsAt;
            calendarEvent.EndsAt = endsAt;
            calendarEvent.RecurrenceFrequency = null;
            calendarEvent.RecurrenceInterval = null;
            calendarEvent.RecurrenceUntil = null;
            calendarEvent.TimeZone = null;
            calendarEvent.ReminderMinutesBefore = null;
            if (calendarEvent.Id != 0)
            {
                calendarEvent.UpdatedAt = DateTime.UtcNow;
            }
        }
        else if (visit.EventId is { } unscheduled)
        {
            await RemoveEventAsync(unscheduled, DateTime.UtcNow);
            visit.EventId = null;
            visit.Event = null;
        }

        return null;
    }

    private async Task RemoveEventAsync(int eventId, DateTime now)
    {
        var calendarEvent = await db.Events.FindAsync(eventId);
        if (calendarEvent is null)
        {
            return;
        }

        calendarEvent.IsDeleted = true;
        calendarEvent.DeletedAt = now;
        await db.SaveChangesAsync();
        await entityLinksService.RemoveAllForEntityAsync(EventLinkableProvider.Type, eventId);
        await remindersService.RemoveAllForEntityAsync(EventLinkableProvider.Type, eventId);
    }

    /// <summary>
    /// One reminder per follow-up: 09:00 local, a week before the day, about the visit. Moving the day moves it (and
    /// makes it pending again if it had been dismissed); clearing the day removes it.
    /// </summary>
    private async Task<string?> SyncFollowUpReminderAsync(DoctorVisit visit, string? requestZone)
    {
        var existing = visit.FollowUpReminderId is { } reminderId ? (await remindersService.GetAsync(reminderId)).Data : null;
        if (visit.FollowUpOn is not { } followUpOn)
        {
            if (existing is not null)
            {
                await remindersService.DeleteAsync(existing.Id);
            }

            if (visit.FollowUpReminderId is not null)
            {
                visit.FollowUpReminderId = null;
                await db.SaveChangesAsync();
            }

            return null;
        }

        var zone = await ReminderZoneAsync(requestZone);
        var request = new ReminderRequest
        {
            Title = HealthRules.FollowUpReminderTitle(followUpOn),
            RemindAt = DocumentRules.ExpiryReminderAt(followUpOn, HealthRules.FollowUpReminderDays, zone),
            EntityType = DoctorVisitLinkableProvider.Type,
            EntityId = visit.Id,
        };

        if (existing is null)
        {
            var created = await remindersService.CreateAsync(request);
            if (!created.Success)
            {
                return created.Error;
            }

            visit.FollowUpReminderId = created.Data!.Id;
            await db.SaveChangesAsync();
            return null;
        }

        var moved = existing.RemindAt != request.RemindAt;
        if (moved || existing.Title != request.Title)
        {
            var updated = await remindersService.UpdateAsync(existing.Id, request);
            if (!updated.Success)
            {
                return updated.Error;
            }

            if (moved && existing.DismissedAt is not null)
            {
                await remindersService.SetDismissedAsync(existing.Id, false);
            }
        }

        return null;
    }

    /// <summary>The Settings zone if there is one, else the browser's, else UTC.</summary>
    private async Task<TimeZoneInfo> ReminderZoneAsync(string? requestZone)
    {
        var preferred = await db.Users.Where(u => u.Id == db.CurrentUserId).Select(u => u.TimeZone).FirstOrDefaultAsync();
        foreach (var candidate in new[] { preferred, requestZone })
        {
            if (!string.IsNullOrWhiteSpace(candidate) && LifeStoryService.TryFindZone(candidate, out var zone))
            {
                return zone;
            }
        }

        return TimeZoneInfo.Utc;
    }

    private static DoctorVisitDto ToDto(DoctorVisit v) => new()
    {
        Id = v.Id,
        Reason = v.Reason,
        VisitOn = v.VisitOn,
        ContactId = v.ContactId,
        ContactName = v.Contact?.Name,
        Specialty = v.Specialty,
        Place = v.Place,
        ConditionId = v.ConditionId,
        ConditionName = v.Condition is { IsDeleted: false } condition ? condition.Name : null,
        StartsAt = v.Event is { IsDeleted: false } e ? e.StartsAt : null,
        EndsAt = v.Event is { IsDeleted: false } e2 ? e2.EndsAt : null,
        EventId = v.EventId,
        FollowUpOn = v.FollowUpOn,
        Notes = v.Notes,
        Prescribed = v.Medications.OrderBy(m => m.Name).Select(m => m.Strength is null ? m.Name : $"{m.Name} {m.Strength}").ToList(),
    };
}
