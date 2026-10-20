using LifeOS.Core.Calendar.ServiceContracts;
using LifeOS.Core.Goals.ServiceContracts;
using LifeOS.Core.Learning.DTOs;
using LifeOS.Core.Learning.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Learning.Services;

/// <summary>
/// Learning roadmaps: ordered steps, each optionally a course, book or goal. Progress is computed
/// (RoadmapProgress); ticking the last step finishes the roadmap and unticking one reopens it.
/// </summary>
public class RoadmapsService(AppDbContext db, IEntityLinksService entityLinksService, IRemindersService remindersService,
    IGoalMeasureService goalMeasureService) : IRoadmapsService
{
    private const string NotFound = "Roadmap not found.";
    private const string StepNotFound = "Step not found.";
    private const int MaxSteps = 100;

    public async Task<List<RoadmapDto>> GetAllAsync()
    {
        var roadmaps = await db.Roadmaps
            .OrderBy(r => r.Status == RoadmapStatuses.Active ? 0 : r.Status == RoadmapStatuses.Completed ? 1 : 2)
            .ThenBy(r => r.Title)
            .Select(r => new RoadmapDto
            {
                Id = r.Id,
                Title = r.Title,
                Description = r.Description,
                Status = r.Status,
                GoalId = r.GoalId,
                GoalTitle = r.Goal != null ? r.Goal.Title : null,
                StepCount = r.RoadmapSteps.Count,
                CompletedStepCount = r.RoadmapSteps.Count(s => s.CompletedAt != null),
                NextStepTitle = r.RoadmapSteps.Where(s => s.CompletedAt == null)
                    .OrderBy(s => s.SortOrder).ThenBy(s => s.Id).Select(s => s.Title).FirstOrDefault(),
            })
            .ToListAsync();
        foreach (var roadmap in roadmaps)
        {
            roadmap.ProgressPercent = RoadmapProgress.Percent(roadmap.Status, roadmap.StepCount, roadmap.CompletedStepCount);
        }

        return roadmaps;
    }

    public async Task<OperationResult<RoadmapDetailDto>> GetAsync(int id)
    {
        var roadmap = await db.Roadmaps
            .Where(r => r.Id == id)
            .Select(r => new RoadmapDetailDto
            {
                Id = r.Id,
                Title = r.Title,
                Description = r.Description,
                Status = r.Status,
                GoalId = r.GoalId,
                GoalTitle = r.Goal != null ? r.Goal.Title : null,
                StepCount = r.RoadmapSteps.Count,
                CompletedStepCount = r.RoadmapSteps.Count(s => s.CompletedAt != null),
                NextStepTitle = r.RoadmapSteps.Where(s => s.CompletedAt == null)
                    .OrderBy(s => s.SortOrder).ThenBy(s => s.Id).Select(s => s.Title).FirstOrDefault(),
                Steps = r.RoadmapSteps.OrderBy(s => s.SortOrder).ThenBy(s => s.Id).Select(s => new RoadmapStepDto
                {
                    Id = s.Id,
                    Title = s.Title,
                    SortOrder = s.SortOrder,
                    CompletedAt = s.CompletedAt,
                    TargetType = s.CourseId != null ? RoadmapStepTargets.Course
                        : s.BookId != null ? RoadmapStepTargets.Book
                        : s.GoalId != null ? RoadmapStepTargets.Goal : null,
                    TargetId = s.CourseId ?? s.BookId ?? s.GoalId,
                    TargetTitle = s.Course != null ? s.Course.Title : s.Book != null ? s.Book.Title : s.Goal != null ? s.Goal.Title : null,
                    TargetStatus = s.Course != null ? s.Course.Status : s.Book != null ? s.Book.Status : s.Goal != null ? s.Goal.Status : null,
                }).ToList(),
            })
            .AsSplitQuery()
            .FirstOrDefaultAsync();
        if (roadmap is null)
        {
            return OperationResult<RoadmapDetailDto>.Fail(NotFound);
        }

        roadmap.ProgressPercent = RoadmapProgress.Percent(roadmap.Status, roadmap.StepCount, roadmap.CompletedStepCount);
        return OperationResult<RoadmapDetailDto>.Ok(roadmap);
    }

    public async Task<OperationResult<RoadmapDetailDto>> CreateAsync(RoadmapRequest request)
    {
        var roadmap = new Roadmap { UserId = db.CurrentUserId!.Value };
        var error = await ApplyAsync(roadmap, request);
        if (error is not null)
        {
            return OperationResult<RoadmapDetailDto>.Fail(error);
        }

        db.Roadmaps.Add(roadmap);
        await db.SaveChangesAsync();
        return await GetAsync(roadmap.Id);
    }

    public async Task<OperationResult<RoadmapDetailDto>> UpdateAsync(int id, RoadmapRequest request)
    {
        var roadmap = await db.Roadmaps.FindAsync(id);
        if (roadmap is null)
        {
            return OperationResult<RoadmapDetailDto>.Fail(NotFound);
        }

        var error = await ApplyAsync(roadmap, request);
        if (error is not null)
        {
            return OperationResult<RoadmapDetailDto>.Fail(error);
        }

        roadmap.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return await GetAsync(id);
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var roadmap = await db.Roadmaps.FindAsync(id);
        if (roadmap is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        var now = DateTime.UtcNow;
        await using var transaction = await db.Database.BeginTransactionAsync();
        // Goals counted from it keep what it counted (Carried over), read before anything it serves is released.
        await goalMeasureService.ReleaseEntityAsync(RoadmapLinkableProvider.Type, id);
        await db.RoadmapSteps.Where(s => s.RoadmapId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.IsDeleted, true).SetProperty(x => x.DeletedAt, now));
        roadmap.IsDeleted = true;
        roadmap.DeletedAt = now;
        await db.SaveChangesAsync();
        await entityLinksService.RemoveAllForEntityAsync(RoadmapLinkableProvider.Type, id);
        await remindersService.RemoveAllForEntityAsync(RoadmapLinkableProvider.Type, id);
        await transaction.CommitAsync();
        return OperationResult<bool>.Ok(true);
    }

    public async Task<OperationResult<RoadmapDetailDto>> AddStepAsync(int roadmapId, RoadmapStepRequest request)
    {
        var roadmap = await db.Roadmaps.FindAsync(roadmapId);
        if (roadmap is null)
        {
            return OperationResult<RoadmapDetailDto>.Fail(NotFound);
        }

        var count = await db.RoadmapSteps.CountAsync(s => s.RoadmapId == roadmapId);
        if (count >= MaxSteps)
        {
            return OperationResult<RoadmapDetailDto>.Fail($"A roadmap holds at most {MaxSteps} steps.");
        }

        var step = new RoadmapStep
        {
            UserId = roadmap.UserId,
            RoadmapId = roadmapId,
            SortOrder = count == 0 ? 0 : await db.RoadmapSteps.Where(s => s.RoadmapId == roadmapId).MaxAsync(s => s.SortOrder) + 1,
        };
        var error = await ApplyStepAsync(step, request);
        if (error is not null)
        {
            return OperationResult<RoadmapDetailDto>.Fail(error);
        }

        db.RoadmapSteps.Add(step);
        // A new open step means a finished roadmap has more to do.
        if (roadmap.Status == RoadmapStatuses.Completed)
        {
            roadmap.Status = RoadmapStatuses.Active;
        }

        roadmap.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return await GetAsync(roadmapId);
    }

    public async Task<OperationResult<RoadmapDetailDto>> UpdateStepAsync(int roadmapId, int stepId, RoadmapStepRequest request)
    {
        var step = await db.RoadmapSteps.FirstOrDefaultAsync(s => s.Id == stepId && s.RoadmapId == roadmapId);
        if (step is null)
        {
            return OperationResult<RoadmapDetailDto>.Fail(StepNotFound);
        }

        var error = await ApplyStepAsync(step, request);
        if (error is not null)
        {
            return OperationResult<RoadmapDetailDto>.Fail(error);
        }

        step.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return await GetAsync(roadmapId);
    }

    public async Task<OperationResult<StepCompletedResultDto>> SetStepCompletedAsync(int roadmapId, int stepId, bool completed)
    {
        var step = await db.RoadmapSteps.Include(s => s.Roadmap).FirstOrDefaultAsync(s => s.Id == stepId && s.RoadmapId == roadmapId);
        if (step is null)
        {
            return OperationResult<StepCompletedResultDto>.Fail(StepNotFound);
        }

        if ((step.CompletedAt is not null) == completed)
        {
            return OperationResult<StepCompletedResultDto>.Fail(completed ? "This step is already done." : "This step isn't done yet.");
        }

        var now = DateTime.UtcNow;
        step.CompletedAt = completed ? now : null;
        step.UpdatedAt = now;

        var steps = await db.RoadmapSteps.Where(s => s.RoadmapId == roadmapId && s.Id != stepId)
            .Select(s => s.CompletedAt != null).ToListAsync();
        var total = steps.Count + 1;
        var done = steps.Count(d => d) + (completed ? 1 : 0);
        var newStatus = RoadmapProgress.StatusAfterStep(step.Roadmap.Status, total, done);
        if (newStatus is not null)
        {
            step.Roadmap.Status = newStatus;
            step.Roadmap.UpdatedAt = now;
        }

        await db.SaveChangesAsync();
        var roadmap = await GetAsync(roadmapId);
        return OperationResult<StepCompletedResultDto>.Ok(new StepCompletedResultDto { Roadmap = roadmap.Data!, StatusChangedTo = newStatus });
    }

    public async Task<OperationResult<RoadmapDetailDto>> ReorderStepsAsync(int roadmapId, IReadOnlyList<int> stepIds)
    {
        var steps = await db.RoadmapSteps.Where(s => s.RoadmapId == roadmapId).ToListAsync();
        if (steps.Count == 0 && !await db.Roadmaps.AnyAsync(r => r.Id == roadmapId))
        {
            return OperationResult<RoadmapDetailDto>.Fail(NotFound);
        }

        if (stepIds.Count != steps.Count || !stepIds.ToHashSet().SetEquals(steps.Select(s => s.Id)))
        {
            return OperationResult<RoadmapDetailDto>.Fail("Send every step of the roadmap, each once.");
        }

        var now = DateTime.UtcNow;
        for (var i = 0; i < stepIds.Count; i++)
        {
            var step = steps.First(s => s.Id == stepIds[i]);
            if (step.SortOrder != i)
            {
                step.SortOrder = i;
                step.UpdatedAt = now;
            }
        }

        await db.SaveChangesAsync();
        return await GetAsync(roadmapId);
    }

    public async Task<OperationResult<RoadmapDetailDto>> DeleteStepAsync(int roadmapId, int stepId)
    {
        var step = await db.RoadmapSteps.Include(s => s.Roadmap).FirstOrDefaultAsync(s => s.Id == stepId && s.RoadmapId == roadmapId);
        if (step is null)
        {
            return OperationResult<RoadmapDetailDto>.Fail(StepNotFound);
        }

        var now = DateTime.UtcNow;
        step.IsDeleted = true;
        step.DeletedAt = now;
        // Removing the last open step can finish the roadmap, as ticking it would.
        var rest = await db.RoadmapSteps.Where(s => s.RoadmapId == roadmapId && s.Id != stepId)
            .Select(s => s.CompletedAt != null).ToListAsync();
        if (RoadmapProgress.StatusAfterStep(step.Roadmap.Status, rest.Count, rest.Count(d => d)) is { } status && rest.Count > 0)
        {
            step.Roadmap.Status = status;
            step.Roadmap.UpdatedAt = now;
        }

        await db.SaveChangesAsync();
        return await GetAsync(roadmapId);
    }

    private async Task<string?> ApplyAsync(Roadmap roadmap, RoadmapRequest request)
    {
        var title = request.Title.Trim();
        if (title.Length == 0)
        {
            return "Give the roadmap a title.";
        }

        if (request.GoalId is { } goalId && !await db.Goals.AnyAsync(g => g.Id == goalId))
        {
            return "Goal not found.";
        }

        roadmap.Title = title;
        roadmap.Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();
        roadmap.Status = request.Status;
        roadmap.GoalId = request.GoalId;
        return null;
    }

    private async Task<string?> ApplyStepAsync(RoadmapStep step, RoadmapStepRequest request)
    {
        var title = request.Title.Trim();
        if (title.Length == 0)
        {
            return "Name the step.";
        }

        if ((request.TargetType is null) != (request.TargetId is null))
        {
            return "Choose what the step points at, or nothing.";
        }

        // Another user's course, book or goal counts as missing (the filters apply).
        var found = request.TargetType switch
        {
            null => true,
            RoadmapStepTargets.Course => await db.Courses.AnyAsync(c => c.Id == request.TargetId),
            RoadmapStepTargets.Book => await db.Books.AnyAsync(b => b.Id == request.TargetId),
            RoadmapStepTargets.Goal => await db.Goals.AnyAsync(g => g.Id == request.TargetId),
            _ => false,
        };
        if (!found)
        {
            return $"{request.TargetType} not found.";
        }

        step.Title = title;
        step.CourseId = request.TargetType == RoadmapStepTargets.Course ? request.TargetId : null;
        step.BookId = request.TargetType == RoadmapStepTargets.Book ? request.TargetId : null;
        step.GoalId = request.TargetType == RoadmapStepTargets.Goal ? request.TargetId : null;
        return null;
    }
}
