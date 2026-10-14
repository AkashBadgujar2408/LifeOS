using AutoMapper;
using LifeOS.Core.Goals.DTOs;
using LifeOS.Core.Goals.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Goals.Services;

public class GoalMilestonesService(AppDbContext db, IMapper mapper) : IGoalMilestonesService
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
        };
        db.GoalMilestones.Add(milestone);
        Touch(goal);
        await db.SaveChangesAsync();

        return OperationResult<GoalMilestoneDto>.Ok(mapper.Map<GoalMilestoneDto>(milestone));
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

        milestone.Title = title;
        milestone.TargetDate = request.TargetDate;
        milestone.UpdatedAt = DateTime.UtcNow;
        Touch(goal);
        await db.SaveChangesAsync();

        return OperationResult<GoalMilestoneDto>.Ok(mapper.Map<GoalMilestoneDto>(milestone));
    }

    public async Task<OperationResult<GoalMilestoneDto>> SetCompletedAsync(int goalId, int id, bool completed)
    {
        var (goal, milestone) = await FindAsync(goalId, id);
        if (goal is null || milestone is null)
        {
            return OperationResult<GoalMilestoneDto>.Fail(MilestoneNotFound);
        }

        milestone.CompletedAt = completed ? milestone.CompletedAt ?? DateTime.UtcNow : null;
        milestone.UpdatedAt = DateTime.UtcNow;
        Touch(goal);
        await db.SaveChangesAsync();

        return OperationResult<GoalMilestoneDto>.Ok(mapper.Map<GoalMilestoneDto>(milestone));
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
}
