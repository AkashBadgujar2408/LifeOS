using System.Linq.Expressions;
using LifeOS.Core.Calendar.ServiceContracts;
using LifeOS.Core.Career.DTOs;
using LifeOS.Core.Career.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Career.Services;

/// <summary>
/// Job applications through their stages. The stage only changes through <see cref="MoveAsync"/>, which logs every
/// move to <c>ApplicationStageChanges</c> (ApplicationRules keeps the dates consistent) and, on a move to Interview,
/// can schedule the first round on the calendar in the same transaction.
/// </summary>
public class JobApplicationsService(AppDbContext db, IEntityLinksService entityLinksService, IRemindersService remindersService)
    : IJobApplicationsService
{
    private const string NotFound = "Application not found.";

    public async Task<List<JobApplicationDto>> GetAllAsync(int? contactId = null)
    {
        var now = DateTime.UtcNow;
        var query = db.JobApplications.AsQueryable();
        if (contactId is { } contact)
        {
            query = query.Where(a => a.ContactId == contact);
        }

        return await query
            .OrderByDescending(a => a.UpdatedAt ?? a.CreatedAt).ThenByDescending(a => a.Id)
            .Select(ToDto(now))
            .ToListAsync();
    }

    public async Task<OperationResult<JobApplicationDetailDto>> GetAsync(int id)
    {
        var now = DateTime.UtcNow;
        var application = await db.JobApplications.Where(a => a.Id == id).Select(ToDto(now)).FirstOrDefaultAsync();
        if (application is null)
        {
            return OperationResult<JobApplicationDetailDto>.Fail(NotFound);
        }

        var history = await db.ApplicationStageChanges
            .Where(c => c.JobApplicationId == id)
            .OrderBy(c => c.ChangedOn).ThenBy(c => c.Id)
            .Select(c => new ApplicationStageChangeDto
            {
                Id = c.Id,
                FromStage = c.FromStage,
                ToStage = c.ToStage,
                ChangedOn = c.ChangedOn,
                Note = c.Note,
            })
            .ToListAsync();
        var interviews = await db.Interviews.Where(i => i.JobApplicationId == id).Select(InterviewsService.ToDto).ToListAsync();

        return OperationResult<JobApplicationDetailDto>.Ok(new JobApplicationDetailDto
        {
            Id = application.Id,
            Organisation = application.Organisation,
            Role = application.Role,
            Stage = application.Stage,
            AppliedOn = application.AppliedOn,
            ClosedOn = application.ClosedOn,
            StageSince = application.StageSince,
            Source = application.Source,
            Url = application.Url,
            ContactId = application.ContactId,
            ContactName = application.ContactName,
            ResumeVersionId = application.ResumeVersionId,
            ResumeVersionName = application.ResumeVersionName,
            Notes = application.Notes,
            InterviewCount = application.InterviewCount,
            NextInterviewAt = application.NextInterviewAt,
            MockInterviewCount = application.MockInterviewCount,
            LatestMockRating = application.LatestMockRating,
            History = history,
            Interviews = [.. interviews.OrderBy(i => i.StartsAt is null).ThenBy(i => i.StartsAt).ThenBy(i => i.Id)],
        });
    }

    public async Task<OperationResult<JobApplicationDetailDto>> CreateAsync(JobApplicationRequest request)
    {
        if (request.Today == default)
        {
            return OperationResult<JobApplicationDetailDto>.Fail("Today's date is required.");
        }

        var (state, stateError) = ApplicationRules.Start(request.Stage, request.StageOn ?? request.Today, request.Today);
        if (stateError is not null)
        {
            return OperationResult<JobApplicationDetailDto>.Fail(stateError);
        }

        var userId = db.CurrentUserId!.Value;
        var application = new JobApplication { UserId = userId };
        var error = await ApplyAsync(application, request);
        if (error is not null)
        {
            return OperationResult<JobApplicationDetailDto>.Fail(error);
        }

        Set(application, state!.Value);
        application.ApplicationStageChanges.Add(new ApplicationStageChange
        {
            UserId = userId,
            ToStage = state.Value.Stage,
            ChangedOn = request.StageOn ?? request.Today,
        });
        db.JobApplications.Add(application);
        await db.SaveChangesAsync();
        return await GetAsync(application.Id);
    }

    public async Task<OperationResult<JobApplicationDetailDto>> UpdateAsync(int id, JobApplicationRequest request)
    {
        var application = await db.JobApplications.FindAsync(id);
        if (application is null)
        {
            return OperationResult<JobApplicationDetailDto>.Fail(NotFound);
        }

        var error = await ApplyAsync(application, request);
        if (error is not null)
        {
            return OperationResult<JobApplicationDetailDto>.Fail(error);
        }

        application.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return await GetAsync(id);
    }

    public async Task<OperationResult<JobApplicationDetailDto>> MoveAsync(int id, ApplicationStageRequest request)
    {
        var application = await db.JobApplications.FindAsync(id);
        if (application is null)
        {
            return OperationResult<JobApplicationDetailDto>.Fail(NotFound);
        }

        if (request.On == default || request.Today == default)
        {
            return OperationResult<JobApplicationDetailDto>.Fail("The date is required.");
        }

        if (request.Interview is not null && request.Stage != ApplicationStages.Interview)
        {
            return OperationResult<JobApplicationDetailDto>.Fail("A round can only be scheduled with a move to Interview.");
        }

        var lastChangedOn = await db.ApplicationStageChanges
            .Where(c => c.JobApplicationId == id)
            .MaxAsync(c => (DateOnly?)c.ChangedOn);
        var current = new ApplicationState(application.Stage, application.AppliedOn, application.ClosedOn);
        var (state, error) = ApplicationRules.Move(current, lastChangedOn, request.Stage, request.On, request.Today);
        if (error is not null)
        {
            return OperationResult<JobApplicationDetailDto>.Fail(error);
        }

        await using var transaction = await db.Database.BeginTransactionAsync();
        db.ApplicationStageChanges.Add(new ApplicationStageChange
        {
            UserId = application.UserId,
            JobApplicationId = id,
            FromStage = application.Stage,
            ToStage = state!.Value.Stage,
            ChangedOn = request.On,
            Note = string.IsNullOrWhiteSpace(request.Note) ? null : request.Note.Trim(),
        });
        Set(application, state.Value);
        application.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        if (request.Interview is { } round)
        {
            var (_, roundError) = await InterviewsService.AddAsync(db, entityLinksService, remindersService, application, round);
            if (roundError is not null)
            {
                return OperationResult<JobApplicationDetailDto>.Fail(roundError);
            }
        }

        await transaction.CommitAsync();
        return await GetAsync(id);
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var application = await db.JobApplications.FindAsync(id);
        if (application is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        var now = DateTime.UtcNow;
        await using var transaction = await db.Database.BeginTransactionAsync();
        foreach (var interview in await db.Interviews.Where(i => i.JobApplicationId == id).ToListAsync())
        {
            await InterviewsService.RemoveAsync(db, entityLinksService, remindersService, interview, now);
        }

        await db.ApplicationStageChanges.Where(c => c.JobApplicationId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(c => c.IsDeleted, true).SetProperty(c => c.DeletedAt, now));
        // Questions asked in it stay in the bank, as general ones.
        await db.InterviewQuestions.Where(q => q.JobApplicationId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(q => q.JobApplicationId, (int?)null).SetProperty(q => q.UpdatedAt, now));
        // So do its mock interviews, as general practice.
        await db.MockInterviews.Where(m => m.JobApplicationId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(m => m.JobApplicationId, (int?)null).SetProperty(m => m.UpdatedAt, now));
        application.IsDeleted = true;
        application.DeletedAt = now;
        await db.SaveChangesAsync();
        await entityLinksService.RemoveAllForEntityAsync(JobApplicationLinkableProvider.Type, id);
        await remindersService.RemoveAllForEntityAsync(JobApplicationLinkableProvider.Type, id);
        await transaction.CommitAsync();
        return OperationResult<bool>.Ok(true);
    }

    private static void Set(JobApplication application, ApplicationState state)
    {
        application.Stage = state.Stage;
        application.AppliedOn = state.AppliedOn;
        application.ClosedOn = state.ClosedOn;
    }

    private async Task<string?> ApplyAsync(JobApplication application, JobApplicationRequest request)
    {
        var organisation = request.Organisation.Trim();
        var role = request.Role.Trim();
        if (organisation.Length == 0)
        {
            return "Name the organisation.";
        }

        if (role.Length == 0)
        {
            return "Name the role.";
        }

        var url = Clean(request.Url);
        if (!CareerRules.IsWebAddress(url))
        {
            return "The link has to be a web address (https://…).";
        }

        if (request.ContactId is { } contactId && !await db.Contacts.AnyAsync(c => c.Id == contactId))
        {
            return "Contact not found.";
        }

        if (request.ResumeVersionId is { } resumeId && !await db.ResumeVersions.AnyAsync(r => r.Id == resumeId))
        {
            return "Resume version not found.";
        }

        application.Organisation = organisation;
        application.Role = role;
        application.Source = Clean(request.Source);
        application.Url = url;
        application.ContactId = request.ContactId;
        application.ResumeVersionId = request.ResumeVersionId;
        application.Notes = Clean(request.Notes);
        return null;
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static Expression<Func<JobApplication, JobApplicationDto>> ToDto(DateTime now) => a => new JobApplicationDto
    {
        Id = a.Id,
        Organisation = a.Organisation,
        Role = a.Role,
        Stage = a.Stage,
        AppliedOn = a.AppliedOn,
        ClosedOn = a.ClosedOn,
        StageSince = a.ApplicationStageChanges.Max(c => (DateOnly?)c.ChangedOn),
        Source = a.Source,
        Url = a.Url,
        ContactId = a.ContactId,
        ContactName = a.Contact != null ? a.Contact.Name : null,
        ResumeVersionId = a.ResumeVersionId,
        ResumeVersionName = a.ResumeVersion != null ? a.ResumeVersion.Name : null,
        Notes = a.Notes,
        InterviewCount = a.Interviews.Count,
        NextInterviewAt = a.Interviews
            .Where(i => i.Event != null && i.Event.EndsAt > now)
            .Min(i => i.Event!.StartsAt),
        MockInterviewCount = a.MockInterviews.Count,
        LatestMockRating = a.MockInterviews
            .Where(m => m.Rating != null)
            .OrderByDescending(m => m.HeldOn)
            .ThenByDescending(m => m.Id)
            .Select(m => m.Rating)
            .FirstOrDefault(),
    };
}

/// <summary>Applications can be linked, have reminders ("follow up on Friday") and be found by search.</summary>
public class JobApplicationLinkableProvider(AppDbContext db) : ILinkableEntityProvider
{
    public const string Type = "JobApplication";

    public string EntityType => Type;

    public string DisplayName => "Job application";

    public async Task<Dictionary<int, string>> GetTitlesAsync(IReadOnlyCollection<int> ids) =>
        await db.JobApplications.Where(a => ids.Contains(a.Id)).ToDictionaryAsync(a => a.Id, a => a.Role + " at " + a.Organisation);

    public async Task<List<LinkableItemDto>> SearchAsync(string? search, int take)
    {
        var query = db.JobApplications.AsQueryable();
        if (!string.IsNullOrEmpty(search))
        {
            query = query.Where(a => a.Role.Contains(search) || a.Organisation.Contains(search));
        }

        return await query
            .OrderByDescending(a => a.UpdatedAt ?? a.CreatedAt)
            .Take(take)
            .Select(a => new LinkableItemDto { EntityType = Type, EntityId = a.Id, Title = a.Role + " at " + a.Organisation })
            .ToListAsync();
    }
}
