using LifeOS.Core.Goals.DTOs;
using LifeOS.Core.Goals.ServiceContracts;
using LifeOS.Core.Shared.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LifeOS.Api.Areas.Goals.Controllers;

/// <summary>Milestones only exist inside a goal, so they're routed under it: api/Goals/Goals/{goalId}/Milestones.</summary>
[ApiController]
[Area("Goals")]
[Route("api/[area]/Goals/{goalId:int}/Milestones")]
[Authorize]
public class GoalMilestonesController(IGoalMilestonesService milestonesService) : ControllerBase
{
    [HttpPost]
    public async Task<IActionResult> Create(int goalId, GoalMilestoneRequest request)
    {
        var result = await milestonesService.CreateAsync(goalId, request);
        if (!result.Success)
        {
            return BadRequest(ApiResponse<GoalMilestoneDto>.Fail(result.Error!));
        }

        return Ok(ApiResponse<GoalMilestoneDto>.Ok(result.Data));
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int goalId, int id, GoalMilestoneRequest request)
    {
        var result = await milestonesService.UpdateAsync(goalId, id, request);
        if (!result.Success)
        {
            return BadRequest(ApiResponse<GoalMilestoneDto>.Fail(result.Error!));
        }

        return Ok(ApiResponse<GoalMilestoneDto>.Ok(result.Data));
    }

    [HttpPut("{id:int}/completed")]
    public async Task<IActionResult> SetCompleted(int goalId, int id, SetMilestoneCompletedRequest request)
    {
        var result = await milestonesService.SetCompletedAsync(goalId, id, request.Completed);
        if (!result.Success)
        {
            return NotFound(ApiResponse<GoalMilestoneDto>.Fail(result.Error!));
        }

        return Ok(ApiResponse<GoalMilestoneDto>.Ok(result.Data));
    }

    [HttpPut("order")]
    public async Task<IActionResult> Reorder(int goalId, ReorderMilestonesRequest request)
    {
        var result = await milestonesService.ReorderAsync(goalId, request.MilestoneIds);
        if (!result.Success)
        {
            return BadRequest(ApiResponse<bool>.Fail(result.Error!));
        }

        return Ok(ApiResponse<bool>.Ok(true));
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int goalId, int id)
    {
        var result = await milestonesService.DeleteAsync(goalId, id);
        if (!result.Success)
        {
            return NotFound(ApiResponse<bool>.Fail(result.Error!));
        }

        return Ok(ApiResponse<bool>.Ok(true));
    }
}
