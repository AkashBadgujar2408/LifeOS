using LifeOS.Core.Journal.DTOs;
using LifeOS.Core.Journal.ServiceContracts;
using LifeOS.Core.Shared.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LifeOS.Api.Areas.Journal.Controllers;

/// <summary>
/// The weekly look back, addressed by the week's Monday (<c>api/Journal/Reflections/2026-10-12</c>), and the monthly
/// one by the month's first day (<c>api/Journal/Reflections/month/2026-10-01</c>).
/// </summary>
[ApiController]
[Area("Journal")]
[Route("api/[area]/[controller]")]
[Authorize]
public class ReflectionsController(IJournalService journalService) : ControllerBase
{
    /// <summary>The week's saved answers (null if none yet) plus its journal entries.</summary>
    [HttpGet("{weekStart}")]
    public async Task<IActionResult> Get(DateOnly weekStart)
    {
        var result = await journalService.GetWeekAsync(weekStart);
        if (!result.Success)
        {
            return BadRequest(ApiResponse<WeeklyReviewDto>.Fail(result.Error!));
        }

        return Ok(ApiResponse<WeeklyReviewDto>.Ok(result.Data));
    }

    /// <summary>The month's saved answers (null if none yet) plus what the month's journal holds.</summary>
    [HttpGet("month/{monthStart}")]
    public async Task<IActionResult> GetMonth(DateOnly monthStart)
    {
        var result = await journalService.GetMonthAsync(monthStart);
        return result.Success
            ? Ok(ApiResponse<MonthlyReviewDto>.Ok(result.Data))
            : BadRequest(ApiResponse<MonthlyReviewDto>.Fail(result.Error!));
    }

    [HttpPut("month/{monthStart}")]
    public async Task<IActionResult> SaveMonth(DateOnly monthStart, MonthlyReflectionRequest request)
    {
        var result = await journalService.SaveMonthAsync(monthStart, request);
        return result.Success
            ? Ok(ApiResponse<MonthlyReviewDto>.Ok(result.Data))
            : BadRequest(ApiResponse<MonthlyReviewDto>.Fail(result.Error!));
    }

    [HttpPut("{weekStart}")]
    public async Task<IActionResult> Save(DateOnly weekStart, WeeklyReflectionRequest request)
    {
        var result = await journalService.SaveWeekAsync(weekStart, request);
        if (!result.Success)
        {
            return BadRequest(ApiResponse<WeeklyReviewDto>.Fail(result.Error!));
        }

        return Ok(ApiResponse<WeeklyReviewDto>.Ok(result.Data));
    }
}
