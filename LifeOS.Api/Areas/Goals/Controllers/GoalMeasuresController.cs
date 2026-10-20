using LifeOS.Core.Goals.DTOs;
using LifeOS.Core.Goals.ServiceContracts;
using LifeOS.Core.Shared.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LifeOS.Api.Areas.Goals.Controllers;

/// <summary>
/// A measured goal's manual log (api/Goals/Goals/7/measure/entries) and what it's counted from
/// (api/Goals/Goals/7/measure/sources); plus, for an item's page, the goals it counts toward
/// (api/Goals/CountsToward?entityType=Habit&amp;entityId=3).
/// </summary>
[ApiController]
[Area("Goals")]
[Authorize]
public class GoalMeasuresController(IGoalMeasureService measureService) : ControllerBase
{
    private const string GoalNotFound = "Goal not found.";

    [HttpGet("api/[area]/Goals/{goalId:int}/measure/entries")]
    public async Task<IActionResult> GetEntries(int goalId) =>
        Respond(await measureService.GetEntriesAsync(goalId));

    [HttpPost("api/[area]/Goals/{goalId:int}/measure/entries")]
    public async Task<IActionResult> AddEntry(int goalId, GoalMeasureEntryRequest request) =>
        Respond(await measureService.AddEntryAsync(goalId, request));

    [HttpPut("api/[area]/Goals/{goalId:int}/measure/entries/{entryId:int}")]
    public async Task<IActionResult> UpdateEntry(int goalId, int entryId, GoalMeasureEntryRequest request) =>
        Respond(await measureService.UpdateEntryAsync(goalId, entryId, request));

    [HttpDelete("api/[area]/Goals/{goalId:int}/measure/entries/{entryId:int}")]
    public async Task<IActionResult> DeleteEntry(int goalId, int entryId) =>
        Respond(await measureService.DeleteEntryAsync(goalId, entryId));

    [HttpGet("api/[area]/Goals/{goalId:int}/measure/sources")]
    public async Task<IActionResult> GetSources(int goalId, [FromQuery] DateOnly today) =>
        Respond(await measureService.GetSourcesAsync(goalId, today));

    [HttpPost("api/[area]/Goals/{goalId:int}/measure/sources")]
    public async Task<IActionResult> AddSource(int goalId, GoalSourceRequest request) =>
        Respond(await measureService.AddSourceAsync(goalId, request));

    [HttpPut("api/[area]/Goals/{goalId:int}/measure/sources/{sourceId:int}")]
    public async Task<IActionResult> UpdateSource(int goalId, int sourceId, GoalSourceUpdateRequest request) =>
        Respond(await measureService.UpdateSourceAsync(goalId, sourceId, request));

    /// <summary>Stops counting from it; what it counted stays as a Carried over entry dated <paramref name="today"/>.</summary>
    [HttpDelete("api/[area]/Goals/{goalId:int}/measure/sources/{sourceId:int}")]
    public async Task<IActionResult> RemoveSource(int goalId, int sourceId, [FromQuery] DateOnly today) =>
        Respond(await measureService.RemoveSourceAsync(goalId, sourceId, today));

    /// <summary>GET api/Goals/SourceOptions — everything a goal could be counted from, each with its unit.</summary>
    [HttpGet("api/[area]/SourceOptions")]
    public async Task<IActionResult> SourceOptions() =>
        Ok(ApiResponse<List<GoalSourceOptionDto>>.Ok(await measureService.OptionsAsync()));

    [HttpGet("api/[area]/CountsToward")]
    public async Task<IActionResult> CountsToward([FromQuery] string entityType, [FromQuery] int entityId, [FromQuery] DateOnly today) =>
        Ok(ApiResponse<List<GoalCountedByDto>>.Ok(await measureService.CountsTowardAsync(entityType, entityId, today)));

    private IActionResult Respond<T>(OperationResult<T> result)
    {
        if (result.Success)
        {
            return Ok(ApiResponse<T>.Ok(result.Data));
        }

        return result.Error == GoalNotFound
            ? NotFound(ApiResponse<T>.Fail(result.Error))
            : BadRequest(ApiResponse<T>.Fail(result.Error!));
    }
}
