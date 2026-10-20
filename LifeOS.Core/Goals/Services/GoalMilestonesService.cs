using AutoMapper;
using AutoMapper.QueryableExtensions;
using LifeOS.Core.Goals.DTOs;
using LifeOS.Core.Goals.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Goals.Services;

public class GoalMilestonesService(AppDbContext db, IMapper mapper, MilestoneLinksService milestoneLinks) : IGoalMilestonesService
{
    private const string GoalNotFound = "Goal not found.";
    private const string MilestoneNotFound = "Milestone not found.";

    public async Task<OperationResult<GoalMilestoneDto>> CreateAsync(int goalId, GoalMilestoneRequest request)
    {
        var goal = await db.Goals.FindAsync(goalId);
        if (goal is null)
        {
            return OperationResult<GoalMilestoneDto>.Fail(GoalNotFound);
        }

        var title = request.Title.Trim();
        if (title.Length == 0)
        {
            return OperationResult<GoalMilestoneDto>.Fail("Title is required.");
        }

        var trackError = await ValidateTrackedAsync(request);
        if (trackError is not null)
        {
            return OperationResult<GoalMilestoneDto>.Fail(trackError);
        }

        var lastSortOrder = await db.GoalMilestones
            .Where(m => m.GoalId == goalId)
            .MaxAsync(m => (int?)m.SortOrder) ?? 0;

        var milestone = new GoalMilestone
        {
            UserId = goal.UserId,
            GoalId = goalId,
            Title = title,
            TargetDate = request.TargetDate,
            SortOrder = lastSortOrder + 1,
            TaskItemId = request.TaskItemId,
            ProjectId = request.ProjectId,
        };
        db.GoalMilestones.Add(milestone);
        // Pointing at a task that's already done ticks it straight away.
        await milestoneLinks.ApplyAsync([milestone]);
        Touch(goal);
        await db.SaveChangesAsync();

        return OperationResult<GoalMilestoneDto>.Ok(await ToDtoAsync(milestone.Id));
    }

    public async Task<OperationResult<GoalMilestoneDto>> UpdateAsync(int goalId, int id, GoalMilestoneRequest request)
    {
        var (goal, milestone) = await FindAsync(goalId, id);
        if (goal is null || milestone is null)
        {
            return OperationResult<GoalMilestoneDto>.Fail(MilestoneNotFound);
        }

        var title = request.Title.Trim();
        if (title.Length == 0)
        {
            return OperationResult<GoalMilestoneDto>.Fail("Title is required.");
        }

        var trackError = await ValidateTrackedAsync(request);
        if (trackError is not null)
        {
            return OperationResult<GoalMilestoneDto>.Fail(trackError);
        }

        milestone.Title = title;
        milestone.TargetDate = request.TargetDate;
        milestone.TaskItemId = request.TaskItemId;
        milestone.ProjectId = request.ProjectId;
        await milestoneLinks.ApplyAsync([milestone]);
        milestone.UpdatedAt = DateTime.UtcNow;
        Touch(goal);
        await db.SaveChangesAsync();

        return OperationResult<GoalMilestoneDto>.Ok(await ToDtoAsync(milestone.Id));
    }

    public async Task<OperationResult<GoalMilestoneDto>> SetCompletedAsync(int goalId, int id, bool completed)
    {
        var (goal, milestone) = await FindAsync(goalId, id);
        if (goal is null || milestone is null)
        {
            return OperationResult<GoalMilestoneDto>.Fail(MilestoneNotFound);
        }

        if (milestone.TaskItemId is not null || milestone.ProjectId is not null)
        {
            return OperationResult<GoalMilestoneDto>.Fail(
                "This milestone follows a task or project and ticks itself when that's done — change it there.");
        }

        milestone.CompletedAt = completed ? milestone.CompletedAt ?? DateTime.UtcNow : null;
        milestone.UpdatedAt = DateTime.UtcNow;
        Touch(goal);
        await db.SaveChangesAsync();

        return OperationResult<GoalMilestoneDto>.Ok(await ToDtoAsync(milestone.Id));
    }

    public async Task<OperationResult<bool>> ReorderAsync(int goalId, List<int> milestoneIds)
    {
        var goal = await db.Goals.FindAsync(goalId);
        if (goal is null)
        {
            return OperationResult<bool>.Fail(GoalNotFound);
        }

        var milestones = await db.GoalMilestones.Where(m => m.GoalId == goalId).ToListAsync();
        if (milestoneIds.Count != milestones.Count || !milestones.All(m => milestoneIds.Contains(m.Id)))
        {
            return OperationResult<bool>.Fail("The new order must list every milestone of this goal exactly once.");
        }

        var now = DateTime.UtcNow;
        foreach (var milestone in milestones)
        {
            var sortOrder = milestoneIds.IndexOf(milestone.Id) + 1;
            if (milestone.SortOrder != sortOrder)
            {
                milestone.SortOrder = sortOrder;
                milestone.UpdatedAt = now;
            }
        }

        Touch(goal);
        await db.SaveChangesAsync();
        return OperationResult<bool>.Ok(true);
    }

    public async Task<OperationResult<bool>> DeleteAsync(int goalId, int id)
    {
        var (goal, milestone) = await FindAsync(goalId, id);
        if (goal is null || milestone is null)
        {
            return OperationResult<bool>.Fail(MilestoneNotFound);
        }

        milestone.IsDeleted = true;
        milestone.DeletedAt = DateTime.UtcNow;
        Touch(goal);
        await db.SaveChangesAsync();

        return OperationResult<bool>.Ok(true);
    }

    /// <summary>Both go through the per-user filter; a milestone only counts if it belongs to that goal.</summary>
    private async Task<(Goal? Goal, GoalMilestone? Milestone)> FindAsync(int goalId, int id)
    {
        var goal = await db.Goals.FindAsync(goalId);
        if (goal is null)
        {
            return (null, null);
        }

        var milestone = await db.GoalMilestones.FirstOrDefaultAsync(m => m.Id == id && m.GoalId == goalId);
        return (goal, milestone);
    }

    // Milestone work counts as activity on the goal, which keeps "goal untouched for 14+ days" (Session 24) honest.
    private static void Touch(Goal goal) => goal.UpdatedAt = DateTime.UtcNow;

    /// <summary>A milestone follows at most one task or project (CK_GoalMilestones_OneTarget), and it has to be yours.</summary>
    private async Task<string?> ValidateTrackedAsync(GoalMilestoneRequest request)
    {
        if (request.TaskItemId is not null && request.ProjectId is not null)
        {
            return "A milestone can follow a task or a project, not both.";
        }

        if (request.TaskItemId is { } taskId && !await db.TaskItems.AnyAsync(t => t.Id == taskId))
        {
            return "Task not found.";
        }

        if (request.ProjectId is { } projectId && !await db.Projects.AnyAsync(p => p.Id == projectId))
        {
            return "Project not found.";
        }

        return null;
    }

    /// <summary>Read back through the projection, so what it follows comes with its name.</summary>
    private async Task<GoalMilestoneDto> ToDtoAsync(int id) =>
        await db.GoalMilestones.Where(m => m.Id == id).ProjectTo<GoalMilestoneDto>(mapper.ConfigurationProvider).FirstAsync();
}
