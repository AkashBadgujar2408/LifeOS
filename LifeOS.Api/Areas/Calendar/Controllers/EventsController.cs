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
}
