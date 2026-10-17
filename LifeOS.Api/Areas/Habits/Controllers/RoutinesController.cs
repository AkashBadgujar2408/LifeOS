using LifeOS.Core.Habits.DTOs;
using LifeOS.Core.Habits.ServiceContracts;
using LifeOS.Core.Shared.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LifeOS.Api.Areas.Habits.Controllers;

/// <summary>Routines: <c>api/Habits/Routines</c>.</summary>
[ApiController]
[Area("Habits")]
[Route("api/[area]/[controller]")]
[Authorize]
public class RoutinesController(IRoutinesService routinesService) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List() => Ok(ApiResponse<List<RoutineDto>>.Ok(await routinesService.ListAsync()));

    [HttpPost]
    public async Task<IActionResult> Create(RoutineRequest request) => Respond(await routinesService.CreateAsync(request));

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, RoutineRequest request) =>
        Respond(await routinesService.UpdateAsync(id, request));

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var result = await routinesService.DeleteAsync(id);
        return result.Success ? Ok(ApiResponse<bool>.Ok(true)) : NotFound(ApiResponse<bool>.Fail(result.Error!));
    }

    /// <summary>PUT api/Habits/Routines/2/done/2026-10-17 { "done": true, "today": "2026-10-17" } — ticks the routine's habits due that day.</summary>
    [HttpPut("{id:int}/done/{date}")]
    public async Task<IActionResult> SetDone(int id, DateOnly date, SetRoutineDoneRequest request)
    {
        var result = await routinesService.SetDoneAsync(id, date, request.Done, request.Today!.Value);
        if (result.Success)
        {
            return Ok(ApiResponse<RoutineTickResultDto>.Ok(result.Data));
        }

        return result.Error == RoutineErrors.NotFound
            ? NotFound(ApiResponse<RoutineTickResultDto>.Fail(result.Error))
            : BadRequest(ApiResponse<RoutineTickResultDto>.Fail(result.Error!));
    }

    private IActionResult Respond(OperationResult<RoutineDto> result)
    {
        if (result.Success)
        {
            return Ok(ApiResponse<RoutineDto>.Ok(result.Data));
        }

        return result.Error == RoutineErrors.NotFound
            ? NotFound(ApiResponse<RoutineDto>.Fail(result.Error))
            : BadRequest(ApiResponse<RoutineDto>.Fail(result.Error!));
    }
}
