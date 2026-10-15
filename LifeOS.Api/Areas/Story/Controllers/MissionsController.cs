using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Story.DTOs;
using LifeOS.Core.Story.ServiceContracts;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LifeOS.Api.Areas.Story.Controllers;

/// <summary>Goals seen as missions, addressed by goal id: <c>api/Story/Missions/9</c>.</summary>
[ApiController]
[Area("Story")]
[Route("api/[area]/[controller]")]
[Authorize]
public class MissionsController(IMissionsService missionsService) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List() => Ok(ApiResponse<List<MissionDto>>.Ok(await missionsService.ListAsync()));

    [HttpGet("{goalId:int}")]
    public async Task<IActionResult> Get(int goalId) => Reply(await missionsService.GetAsync(goalId));

    [HttpPost("{goalId:int}/prerequisites")]
    public async Task<IActionResult> AddPrerequisite(int goalId, MissionPrerequisiteRequest request) =>
        Reply(await missionsService.AddPrerequisiteAsync(goalId, request.RequiresGoalId));

    [HttpDelete("{goalId:int}/prerequisites/{requiresGoalId:int}")]
    public async Task<IActionResult> RemovePrerequisite(int goalId, int requiresGoalId) =>
        Reply(await missionsService.RemovePrerequisiteAsync(goalId, requiresGoalId));

    /// <summary>The "Mission passed" screen: only for a completed goal.</summary>
    [HttpGet("{goalId:int}/passed")]
    public async Task<IActionResult> Passed(int goalId) => Reply(await missionsService.GetPassedAsync(goalId));

    /// <summary>Writes the debrief; both prompts blank removes it and returns data: null.</summary>
    [HttpPut("{goalId:int}/debrief")]
    public async Task<IActionResult> SaveDebrief(int goalId, MissionDebriefRequest request) =>
        Reply(await missionsService.SaveDebriefAsync(goalId, request));

    private IActionResult Reply<T>(OperationResult<T> result)
    {
        if (result.Success)
        {
            return Ok(ApiResponse<T>.Ok(result.Data));
        }

        var body = ApiResponse<T>.Fail(result.Error!);
        return result.Error == MissionErrors.NotFound ? NotFound(body) : BadRequest(body);
    }
}
