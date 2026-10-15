using LifeOS.Core.Journal.DTOs;
using LifeOS.Core.Journal.ServiceContracts;
using LifeOS.Core.Shared.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LifeOS.Api.Areas.Journal.Controllers;

/// <summary>The weekly look back, addressed by the week's Monday: <c>api/Journal/Reflections/2026-10-12</c>.</summary>
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
