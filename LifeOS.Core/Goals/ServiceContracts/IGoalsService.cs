using LifeOS.Core.Goals.DTOs;
using LifeOS.Core.Shared.DTOs;

namespace LifeOS.Core.Goals.ServiceContracts;

public interface IGoalsService
{
    Task<List<GoalSummaryDto>> GetAllAsync(string? status);
    Task<OperationResult<GoalDetailDto>> GetAsync(int id);
    /// <summary>Progress % over time, rebuilt from milestone and status history (GoalProgressTrend).</summary>
    Task<OperationResult<List<GoalTrendPointDto>>> GetTrendAsync(int id);
    Task<OperationResult<GoalDetailDto>> CreateAsync(GoalRequest request);
    Task<OperationResult<GoalDetailDto>> UpdateAsync(int id, GoalRequest request);
    Task<OperationResult<GoalDetailDto>> SetStatusAsync(int id, SetGoalStatusRequest request);
    Task<OperationResult<bool>> DeleteAsync(int id);
}
