using LifeOS.Core.Journal.DTOs;
using LifeOS.Core.Journal.ServiceContracts;
using LifeOS.Core.Shared.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LifeOS.Api.Areas.Journal.Controllers;

/// <summary>The decision journal: <c>api/Journal/Decisions</c>.</summary>
[ApiController]
[Area("Journal")]
[Route("api/[area]/[controller]")]
[Authorize]
public class DecisionsController(IDecisionsService decisionsService) : ControllerBase
{
    /// <summary>GET api/Journal/Decisions[?day=2026-10-15] — newest first.</summary>
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] DateOnly? day) =>
        Ok(ApiResponse<List<DecisionDto>>.Ok(await decisionsService.ListAsync(day)));

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id) => Respond(await decisionsService.GetAsync(id));

    [HttpPost]
    public async Task<IActionResult> Create(DecisionRequest request) => Respond(await decisionsService.CreateAsync(request));

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, DecisionRequest request) =>
        Respond(await decisionsService.UpdateAsync(id, request));

    /// <summary>PUT api/Journal/Decisions/5/outcome { actualOutcome, verdict, today } — blank outcome reopens it.</summary>
    [HttpPut("{id:int}/outcome")]
    public async Task<IActionResult> RecordOutcome(int id, DecisionOutcomeRequest request) =>
        Respond(await decisionsService.RecordOutcomeAsync(id, request));

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var result = await decisionsService.DeleteAsync(id);
        return result.Success ? Ok(ApiResponse<bool>.Ok(true)) : NotFound(ApiResponse<bool>.Fail(result.Error!));
    }

    private IActionResult Respond(OperationResult<DecisionDto> result)
    {
        if (result.Success)
        {
            return Ok(ApiResponse<DecisionDto>.Ok(result.Data));
        }

        return result.Error == DecisionErrors.NotFound
            ? NotFound(ApiResponse<DecisionDto>.Fail(result.Error))
            : BadRequest(ApiResponse<DecisionDto>.Fail(result.Error!));
    }
}
