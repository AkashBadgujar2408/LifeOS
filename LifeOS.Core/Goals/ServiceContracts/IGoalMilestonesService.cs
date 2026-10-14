using LifeOS.Core.Goals.DTOs;
using LifeOS.Core.Shared.DTOs;

namespace LifeOS.Core.Goals.ServiceContracts;

public interface IGoalMilestonesService
{
    Task<OperationResult<GoalMilestoneDto>> CreateAsync(int goalId, GoalMilestoneRequest request);
    Task<OperationResult<GoalMilestoneDto>> UpdateAsync(int goalId, int id, GoalMilestoneRequest request);
    Task<OperationResult<GoalMilestoneDto>> SetCompletedAsync(int goalId, int id, bool completed);
    Task<OperationResult<bool>> ReorderAsync(int goalId, List<int> milestoneIds);
    Task<OperationResult<bool>> DeleteAsync(int goalId, int id);
}
