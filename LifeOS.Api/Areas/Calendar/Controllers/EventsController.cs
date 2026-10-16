using LifeOS.Core.Calendar.DTOs;
using LifeOS.Core.Calendar.ServiceContracts;
using LifeOS.Core.Shared.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LifeOS.Api.Areas.Calendar.Controllers;

[ApiController]
[Area("Calendar")]
[Route("api/[area]/[controller]")]
[Authorize]
public class EventsController(IEventsService eventsService) : ControllerBase
{
    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id)
    {
        var result = await eventsService.GetAsync(id);
        if (!result.Success)
        {
            return NotFound(ApiResponse<EventDto>.Fail(result.Error!));
        }

        return Ok(ApiResponse<EventDto>.Ok(result.Data));
    }

    [HttpPost]
    public async Task<IActionResult> Create(EventRequest request)
    {
        var result = await eventsService.CreateAsync(request);
        if (!result.Success)
        {
            return BadRequest(ApiResponse<EventDto>.Fail(result.Error!));
        }

        return Ok(ApiResponse<EventDto>.Ok(result.Data));
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, EventRequest request)
    {
        var result = await eventsService.UpdateAsync(id, request);
        if (!result.Success)
        {
            return BadRequest(ApiResponse<EventDto>.Fail(result.Error!));
        }

        return Ok(ApiResponse<EventDto>.Ok(result.Data));
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var result = await eventsService.DeleteAsync(id);
        if (!result.Success)
        {
            return NotFound(ApiResponse<bool>.Fail(result.Error!));
        }

        return Ok(ApiResponse<bool>.Ok(true));
    }

    /// <summary>PUT api/Calendar/Events/5/occurrences/2026-10-20/skipped { "skipped": true } — returns the series.</summary>
    [HttpPut("{id:int}/occurrences/{date}/skipped")]
    public async Task<IActionResult> SetSkipped(int id, DateOnly date, EventOccurrenceSkipRequest request) =>
        Respond(await eventsService.SetSkippedAsync(id, date, request.Skipped));

    /// <summary>POST api/Calendar/Events/5/occurrences/2026-10-20/detach { one-off event } — returns the new event.</summary>
    [HttpPost("{id:int}/occurrences/{date}/detach")]
    public async Task<IActionResult> Detach(int id, DateOnly date, EventRequest request) =>
        Respond(await eventsService.DetachOccurrenceAsync(id, date, request));

    /// <summary>POST api/Calendar/Events/5/occurrences/2026-10-20/end — "delete this and following"; data = series deleted.</summary>
    [HttpPost("{id:int}/occurrences/{date}/end")]
    public async Task<IActionResult> EndSeries(int id, DateOnly date) =>
        Respond(await eventsService.EndSeriesAsync(id, date));

    private IActionResult Respond<T>(OperationResult<T> result)
    {
        if (result.Success)
        {
            return Ok(ApiResponse<T>.Ok(result.Data));
        }

        return result.Error == EventErrors.NotFound
            ? NotFound(ApiResponse<T>.Fail(result.Error))
            : BadRequest(ApiResponse<T>.Fail(result.Error!));
    }
}
