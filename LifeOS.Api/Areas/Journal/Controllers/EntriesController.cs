using LifeOS.Core.Journal.DTOs;
using LifeOS.Core.Journal.ServiceContracts;
using LifeOS.Core.Shared.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;

namespace LifeOS.Api.Areas.Journal.Controllers;

/// <summary>
/// Journal entries are addressed by their day (one entry per day): <c>GET/PUT/DELETE api/Journal/Entries/day/2026-10-15</c>.
/// The id route exists for links and reminders, which only know the id.
/// </summary>
[ApiController]
[Area("Journal")]
[Route("api/[area]/[controller]")]
[Authorize]
public class EntriesController(IJournalService journalService) : ControllerBase
{
    /// <summary>GET api/Journal/Entries?from=2026-10-01&amp;to=2026-10-31 — newest first.</summary>
    [HttpGet]
    public async Task<IActionResult> List([FromQuery, BindRequired] DateOnly from, [FromQuery, BindRequired] DateOnly to)
    {
        var result = await journalService.ListAsync(from, to);
        if (!result.Success)
        {
            return BadRequest(ApiResponse<List<JournalEntryDto>>.Fail(result.Error!));
        }

        return Ok(ApiResponse<List<JournalEntryDto>>.Ok(result.Data));
    }

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id)
    {
        var result = await journalService.GetAsync(id);
        if (!result.Success)
        {
            return NotFound(ApiResponse<JournalEntryDto>.Fail(result.Error!));
        }

        return Ok(ApiResponse<JournalEntryDto>.Ok(result.Data));
    }

    /// <summary>The day's entry; <c>data: null</c> when nothing was written that day.</summary>
    [HttpGet("day/{day}")]
    public async Task<IActionResult> GetForDay(DateOnly day)
    {
        var entry = await journalService.GetForDayAsync(day);
        return Ok(ApiResponse<JournalEntryDto?>.Ok(entry));
    }

    /// <summary>Creates or rewrites the day's entry.</summary>
    [HttpPut("day/{day}")]
    public async Task<IActionResult> SaveForDay(DateOnly day, JournalEntryRequest request)
    {
        var result = await journalService.SaveForDayAsync(day, request);
        if (!result.Success)
        {
            return BadRequest(ApiResponse<JournalEntryDto>.Fail(result.Error!));
        }

        return Ok(ApiResponse<JournalEntryDto>.Ok(result.Data));
    }

    [HttpDelete("day/{day}")]
    public async Task<IActionResult> DeleteForDay(DateOnly day)
    {
        var result = await journalService.DeleteForDayAsync(day);
        if (!result.Success)
        {
            return NotFound(ApiResponse<bool>.Fail(result.Error!));
        }

        return Ok(ApiResponse<bool>.Ok(true));
    }

    /// <summary>POST api/Journal/Entries/from-inbox/12 { "entryDate": "2026-10-15" }</summary>
    [HttpPost("from-inbox/{inboxItemId:int}")]
    public async Task<IActionResult> CreateFromInbox(int inboxItemId, JournalEntryFromInboxRequest request)
    {
        var result = await journalService.CreateFromInboxAsync(inboxItemId, request.EntryDate!.Value);
        if (!result.Success)
        {
            return BadRequest(ApiResponse<JournalEntryDto>.Fail(result.Error!));
        }

        return Ok(ApiResponse<JournalEntryDto>.Ok(result.Data));
    }

    /// <summary>GET api/Journal/Entries/moods?from=2026-09-16&amp;to=2026-10-15 — days with a mood, oldest first.</summary>
    [HttpGet("moods")]
    public async Task<IActionResult> Moods([FromQuery, BindRequired] DateOnly from, [FromQuery, BindRequired] DateOnly to)
    {
        var result = await journalService.GetMoodsAsync(from, to);
        if (!result.Success)
        {
            return BadRequest(ApiResponse<List<MoodPointDto>>.Fail(result.Error!));
        }

        return Ok(ApiResponse<List<MoodPointDto>>.Ok(result.Data));
    }
}
