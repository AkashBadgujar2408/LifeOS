using LifeOS.Core.Habits.DTOs;
using LifeOS.Core.Habits.ServiceContracts;
using LifeOS.Core.Habits.Services;
using LifeOS.Core.Shared.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LifeOS.Api.Areas.Habits.Controllers;

[ApiController]
[Area("Habits")]
[Route("api/[area]/[controller]")]
[Authorize]
public class HabitsController(IHabitsService habitsService) : ControllerBase
{
    /// <summary>
    /// GET api/Habits/Habits?today=2026-10-15&amp;from=2026-10-09 — every habit with its streak as of the client's
    /// today and the days done from <c>from</c> to today. Both default to the UTC week ending today.
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] DateOnly? today, [FromQuery] DateOnly? from)
    {
        var (day, start) = Window(today, from);
        var result = await habitsService.GetAllAsync(day, start);
        if (!result.Success)
        {
            return BadRequest(ApiResponse<List<HabitDto>>.Fail(result.Error!));
        }

        return Ok(ApiResponse<List<HabitDto>>.Ok(result.Data));
    }

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id, [FromQuery] DateOnly? today, [FromQuery] DateOnly? from)
    {
        var (day, start) = Window(today, from);
        var result = await habitsService.GetAsync(id, day, start);
        if (!result.Success)
        {
            return result.Error == HabitErrors.NotFound
                ? NotFound(ApiResponse<HabitDto>.Fail(result.Error))
                : BadRequest(ApiResponse<HabitDto>.Fail(result.Error!));
        }

        return Ok(ApiResponse<HabitDto>.Ok(result.Data));
    }

    [HttpPost]
    public async Task<IActionResult> Create(HabitRequest request)
    {
        var result = await habitsService.CreateAsync(request, request.Today ?? UtcToday());
        if (!result.Success)
        {
            return BadRequest(ApiResponse<HabitDto>.Fail(result.Error!));
        }

        return Ok(ApiResponse<HabitDto>.Ok(result.Data));
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, HabitRequest request)
    {
        var result = await habitsService.UpdateAsync(id, request, request.Today ?? UtcToday());
        if (!result.Success)
        {
            return BadRequest(ApiResponse<HabitDto>.Fail(result.Error!));
        }

        return Ok(ApiResponse<HabitDto>.Ok(result.Data));
    }

    [HttpPut("{id:int}/status")]
    public async Task<IActionResult> SetStatus(int id, SetHabitStatusRequest request)
    {
        var result = await habitsService.SetStatusAsync(id, request.Status, request.Today ?? UtcToday());
        if (!result.Success)
        {
            return NotFound(ApiResponse<HabitDto>.Fail(result.Error!));
        }

        return Ok(ApiResponse<HabitDto>.Ok(result.Data));
    }

    /// <summary>PUT api/Habits/Habits/5/entries/2026-10-15 { "done": true, "today": "2026-10-15" }</summary>
    [HttpPut("{id:int}/entries/{date}")]
    public async Task<IActionResult> SetEntry(int id, DateOnly date, SetHabitEntryRequest request)
    {
        var result = await habitsService.SetEntryAsync(id, date, request.Done, request.Value, request.Today ?? UtcToday());
        if (!result.Success)
        {
            return result.Error == HabitErrors.NotFound
                ? NotFound(ApiResponse<HabitEntryResultDto>.Fail(result.Error))
                : BadRequest(ApiResponse<HabitEntryResultDto>.Fail(result.Error!));
        }

        return Ok(ApiResponse<HabitEntryResultDto>.Ok(result.Data));
    }

    /// <summary>POST api/Habits/Habits/5/challenges { "days": 30, "today": "2026-10-17" } — starts today unless startDate is given.</summary>
    [HttpPost("{id:int}/challenges")]
    public async Task<IActionResult> StartChallenge(int id, StartChallengeRequest request) =>
        RespondChallenges(await habitsService.StartChallengeAsync(id, request));

    /// <summary>DELETE api/Habits/Habits/5/challenges/3?today=2026-10-17</summary>
    [HttpDelete("{id:int}/challenges/{challengeId:int}")]
    public async Task<IActionResult> RemoveChallenge(int id, int challengeId, [FromQuery] DateOnly? today) =>
        RespondChallenges(await habitsService.RemoveChallengeAsync(id, challengeId, today ?? UtcToday()));

    private IActionResult RespondChallenges(OperationResult<List<HabitChallengeDto>> result)
    {
        if (result.Success)
        {
            return Ok(ApiResponse<List<HabitChallengeDto>>.Ok(result.Data));
        }

        return result.Error is HabitErrors.NotFound or HabitErrors.ChallengeNotFound
            ? NotFound(ApiResponse<List<HabitChallengeDto>>.Fail(result.Error))
            : BadRequest(ApiResponse<List<HabitChallengeDto>>.Fail(result.Error!));
    }

    /// <summary>GET api/Habits/Habits/templates — the habit library.</summary>
    [HttpGet("templates")]
    public IActionResult Templates() => Ok(ApiResponse<IReadOnlyList<HabitTemplateDto>>.Ok(HabitTemplates.All));

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var result = await habitsService.DeleteAsync(id);
        if (!result.Success)
        {
            return NotFound(ApiResponse<bool>.Fail(result.Error!));
        }

        return Ok(ApiResponse<bool>.Ok(true));
    }

    private static DateOnly UtcToday() => DateOnly.FromDateTime(DateTime.UtcNow);

    private static (DateOnly Today, DateOnly From) Window(DateOnly? today, DateOnly? from)
    {
        var day = today ?? UtcToday();
        return (day, from ?? day.AddDays(-6));
    }
}
