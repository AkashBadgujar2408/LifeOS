using System.Linq.Expressions;
using LifeOS.Core.Calendar.ServiceContracts;
using LifeOS.Core.Calendar.Services;
using LifeOS.Core.Career.DTOs;
using LifeOS.Core.Career.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Career.Services;

/// <summary>
/// Interview rounds. A scheduled round's time lives on its calendar event (<c>Interviews.EventId</c>), which this
/// service creates, keeps in step (title, time, place) and removes with the round — so the round shows on the
/// calendar and My Day like any other event. Deleting the event from the calendar just unschedules the round.
/// </summary>
public class InterviewsService(AppDbContext db, IEntityLinksService entityLinksService, IRemindersService remindersService)
    : IInterviewsService
{
    private const string NotFound = "Interview round not found.";

    public async Task<OperationResult<InterviewDto>> CreateAsync(int applicationId, InterviewRequest request)
    {
        var application = await db.JobApplications.FindAsync(applicationId);
        if (application is null)
        {
            return OperationResult<InterviewDto>.Fail("Application not found.");
        }

        await using var transaction = await db.Database.BeginTransactionAsync();
        var (interview, error) = await AddAsync(db, entityLinksService, remindersService, application, request);
        if (error is not null)
        {
            return OperationResult<InterviewDto>.Fail(error);
        }

        await transaction.CommitAsync();
        return await GetAsync(interview!.Id);
    }

    public async Task<OperationResult<InterviewDto>> UpdateAsync(int id, InterviewRequest request)
    {
        var interview = await db.Interviews.Include(i => i.JobApplication).FirstOrDefaultAsync(i => i.Id == id);
        if (interview is null)
        {
            return OperationResult<InterviewDto>.Fail(NotFound);
        }

        await using var transaction = await db.Database.BeginTransactionAsync();
        var error = await ApplyAsync(db, entityLinksService, remindersService, interview, interview.JobApplication, request);
        if (error is not null)
        {
            return OperationResult<InterviewDto>.Fail(error);
        }

        interview.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return await GetAsync(id);
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var interview = await db.Interviews.FindAsync(id);
        if (interview is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        await using var transaction = await db.Database.BeginTransactionAsync();
        await RemoveAsync(db, entityLinksService, remindersService, interview, DateTime.UtcNow);
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return OperationResult<bool>.Ok(true);
    }

    private async Task<OperationResult<InterviewDto>> GetAsync(int id)
    {
        var interview = await db.Interviews.Where(i => i.Id == id).Select(ToDto).FirstOrDefaultAsync();
        return interview is null ? OperationResult<InterviewDto>.Fail(NotFound) : OperationResult<InterviewDto>.Ok(interview);
    }

    /// <summary>Adds a round (and its calendar event when it has a time) and saves; the caller owns the transaction.</summary>
    internal static async Task<(Interview? Interview, string? Error)> AddAsync(
        AppDbContext db, IEntityLinksService links, IRemindersService reminders, JobApplication application, InterviewRequest request)
    {
        var interview = new Interview { UserId = application.UserId, JobApplicationId = application.Id };
        var error = await ApplyAsync(db, links, reminders, interview, application, request);
        if (error is not null)
        {
            return (null, error);
        }

        db.Interviews.Add(interview);
        await db.SaveChangesAsync();
        return (interview, null);
    }

    /// <summary>
    /// Soft-deletes a round and the calendar event made for it (with that event's links and reminders); the caller
    /// saves.
    /// </summary>
    internal static async Task RemoveAsync(
        AppDbContext db, IEntityLinksService links, IRemindersService reminders, Interview interview, DateTime now)
    {
        interview.IsDeleted = true;
        interview.DeletedAt = now;
        if (interview.EventId is { } eventId)
        {
            await RemoveEventAsync(db, links, reminders, eventId, now);
        }
    }

    private static async Task<string?> ApplyAsync(
        AppDbContext db, IEntityLinksService links, IRemindersService reminders,
        Interview interview, JobApplication application, InterviewRequest request)
    {
        var title = request.Title.Trim();
        if (title.Length == 0)
        {
            return "Name the round.";
        }

        if (request.Outcome is not null && !InterviewOutcomes.All.Contains(request.Outcome))
        {
            return "Unknown outcome.";
        }

        if (request.StartsAt is { Kind: DateTimeKind.Unspecified } || request.EndsAt is { Kind: DateTimeKind.Unspecified })
        {
            return "Give the times with a timezone.";
        }

        var requestStart = request.StartsAt?.ToUniversalTime();
        var requestEnd = request.EndsAt?.ToUniversalTime();
        if (ApplicationRules.CheckInterviewTime(requestStart, requestEnd) is { } timeError)
        {
            return timeError;
        }

        interview.Title = title;
        interview.PrepNotes = Clean(request.PrepNotes);
        interview.ReviewNotes = Clean(request.ReviewNotes);
        interview.Outcome = request.Outcome;

        var location = Clean(request.Location);
        var calendarEvent = interview.EventId is { } eventId ? await db.Events.FindAsync(eventId) : null;
        if (requestStart is { } startsAt && requestEnd is { } endsAt)
        {
            if (calendarEvent is null)
            {
                calendarEvent = new Event
                {
                    UserId = application.UserId,
                    LifeAreaId = await db.LifeAreas.Where(a => a.Name == "Career").Select(a => (int?)a.Id).FirstOrDefaultAsync(),
                };
                db.Events.Add(calendarEvent);
                interview.Event = calendarEvent;
            }

            // The round owns its entry's schedule: always a one-off timed event.
            calendarEvent.Title = ApplicationRules.EventTitle(title, application.Organisation);
            calendarEvent.Location = location;
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
        else if (interview.EventId is { } unscheduled)
        {
            await RemoveEventAsync(db, links, reminders, unscheduled, DateTime.UtcNow);
            interview.EventId = null;
            interview.Event = null;
        }

        return null;
    }

    private static async Task RemoveEventAsync(
        AppDbContext db, IEntityLinksService links, IRemindersService reminders, int eventId, DateTime now)
    {
        var calendarEvent = await db.Events.FindAsync(eventId);
        if (calendarEvent is null)
        {
            return;
        }

        calendarEvent.IsDeleted = true;
        calendarEvent.DeletedAt = now;
        await db.SaveChangesAsync();
        await links.RemoveAllForEntityAsync(EventLinkableProvider.Type, eventId);
        await reminders.RemoveAllForEntityAsync(EventLinkableProvider.Type, eventId);
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    internal static readonly Expression<Func<Interview, InterviewDto>> ToDto = i => new InterviewDto
    {
        Id = i.Id,
        JobApplicationId = i.JobApplicationId,
        Title = i.Title,
        EventId = i.EventId,
        StartsAt = i.Event != null ? i.Event.StartsAt : null,
        EndsAt = i.Event != null ? i.Event.EndsAt : null,
        Location = i.Event != null ? i.Event.Location : null,
        PrepNotes = i.PrepNotes,
        ReviewNotes = i.ReviewNotes,
        Outcome = i.Outcome,
    };
}
