using LifeOS.Core.Goals.DTOs;
using LifeOS.Core.Goals.ServiceContracts;
using LifeOS.Core.Shared.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LifeOS.Api.Areas.Goals.Controllers;

[ApiController]
[Area("Goals")]
[Route("api/[area]/[controller]")]
[Authorize]
public class GoalsController(IGoalsService goalsService) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] string? status, [FromQuery] DateOnly? today)
    {
        var goals = await goalsService.GetAllAsync(status, today);
        return Ok(ApiResponse<List<GoalSummaryDto>>.Ok(goals));
    }

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id, [FromQuery] DateOnly? today)
    {
        var result = await goalsService.GetAsync(id, today);
        if (!result.Success)
        {
            return NotFound(ApiResponse<GoalDetailDto>.Fail(result.Error!));
        }

        return Ok(ApiResponse<GoalDetailDto>.Ok(result.Data));
    }

    /// <summary>GET api/Goals/Goals/7/trend — progress % over time, oldest first.</summary>
    [HttpGet("{id:int}/trend")]
    public async Task<IActionResult> GetTrend(int id, [FromQuery] DateOnly? today)
    {
        var result = await goalsService.GetTrendAsync(id, today);
        if (!result.Success)
        {
            return NotFound(ApiResponse<List<GoalTrendPointDto>>.Fail(result.Error!));
        }

        return Ok(ApiResponse<List<GoalTrendPointDto>>.Ok(result.Data));
    }

    [HttpPost]
    public async Task<IActionResult> Create(GoalRequest request)
    {
        var result = await goalsService.CreateAsync(request);
        if (!result.Success)
        {
            return BadRequest(ApiResponse<GoalDetailDto>.Fail(result.Error!));
        }

        return Ok(ApiResponse<GoalDetailDto>.Ok(result.Data));
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, GoalRequest request)
    {
        var result = await goalsService.UpdateAsync(id, request);
        if (!result.Success)
        {
            return BadRequest(ApiResponse<GoalDetailDto>.Fail(result.Error!));
        }

        return Ok(ApiResponse<GoalDetailDto>.Ok(result.Data));
    }

    [HttpPut("{id:int}/status")]
    public async Task<IActionResult> SetStatus(int id, SetGoalStatusRequest request)
    {
        var result = await goalsService.SetStatusAsync(id, request);
        if (!result.Success)
        {
            return BadRequest(ApiResponse<GoalDetailDto>.Fail(result.Error!));
        }

        return Ok(ApiResponse<GoalDetailDto>.Ok(result.Data));
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var result = await goalsService.DeleteAsync(id);
        if (!result.Success)
        {
            return NotFound(ApiResponse<bool>.Fail(result.Error!));
        }

        return Ok(ApiResponse<bool>.Ok(true));
    }
}
