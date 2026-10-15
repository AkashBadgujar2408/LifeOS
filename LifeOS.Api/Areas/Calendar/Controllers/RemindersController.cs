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
public class RemindersController(IRemindersService remindersService) : ControllerBase
{
    /// <summary>GET api/Calendar/Reminders?status=Pending|Dismissed[&amp;entityType=Task&amp;entityId=5]</summary>
    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] string status = ReminderStatuses.Pending,
        [FromQuery] string? entityType = null,
        [FromQuery] int? entityId = null)
    {
        if (status is not (ReminderStatuses.Pending or ReminderStatuses.Dismissed))
        {
            return BadRequest(ApiResponse<List<ReminderDto>>.Fail("Status must be Pending or Dismissed."));
        }

        var result = await remindersService.ListAsync(status, entityType, entityId);
        if (!result.Success)
        {
            return BadRequest(ApiResponse<List<ReminderDto>>.Fail(result.Error!));
        }

        return Ok(ApiResponse<List<ReminderDto>>.Ok(result.Data));
    }

    /// <summary>What should surface right now — asked for on app load and periodically while the app is open.</summary>
    [HttpGet("due")]
    public async Task<IActionResult> GetDue() =>
        Ok(ApiResponse<List<ReminderDto>>.Ok(await remindersService.GetDueAsync()));

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id)
    {
        var result = await remindersService.GetAsync(id);
        if (!result.Success)
        {
            return NotFound(ApiResponse<ReminderDto>.Fail(result.Error!));
        }

        return Ok(ApiResponse<ReminderDto>.Ok(result.Data));
    }

    [HttpPost]
    public async Task<IActionResult> Create(ReminderRequest request)
    {
        var result = await remindersService.CreateAsync(request);
        if (!result.Success)
        {
            return BadRequest(ApiResponse<ReminderDto>.Fail(result.Error!));
        }

        return Ok(ApiResponse<ReminderDto>.Ok(result.Data));
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, ReminderRequest request)
    {
        var result = await remindersService.UpdateAsync(id, request);
        if (!result.Success)
        {
            return BadRequest(ApiResponse<ReminderDto>.Fail(result.Error!));
        }

        return Ok(ApiResponse<ReminderDto>.Ok(result.Data));
    }

    [HttpPut("{id:int}/dismissed")]
    public async Task<IActionResult> SetDismissed(int id, SetReminderDismissedRequest request)
    {
        var result = await remindersService.SetDismissedAsync(id, request.Dismissed);
        if (!result.Success)
        {
            return NotFound(ApiResponse<ReminderDto>.Fail(result.Error!));
        }

        return Ok(ApiResponse<ReminderDto>.Ok(result.Data));
    }

    [HttpPut("{id:int}/snooze")]
    public async Task<IActionResult> Snooze(int id, SnoozeReminderRequest request)
    {
        var result = await remindersService.SnoozeAsync(id, request.Until!.Value);
        if (!result.Success)
        {
            return BadRequest(ApiResponse<ReminderDto>.Fail(result.Error!));
        }

        return Ok(ApiResponse<ReminderDto>.Ok(result.Data));
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var result = await remindersService.DeleteAsync(id);
        if (!result.Success)
        {
            return NotFound(ApiResponse<bool>.Fail(result.Error!));
        }

        return Ok(ApiResponse<bool>.Ok(true));
    }
}
