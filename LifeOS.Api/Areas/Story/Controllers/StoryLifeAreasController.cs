using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Story.DTOs;
using LifeOS.Core.Story.ServiceContracts;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;

namespace LifeOS.Api.Areas.Story.Controllers;

/// <summary>
/// Life areas in Story Mode: <c>api/Story/LifeAreas</c> — levels from what you've finished, and the monthly
/// self-rating. (The taxonomy itself is <c>api/Shared/LifeAreas</c>; this class is named apart from that one.)
/// </summary>
[ApiController]
[Area("Story")]
[Route("api/[area]/LifeAreas")]
[Authorize]
public class StoryLifeAreasController(ILifeAreasStoryService lifeAreasService) : ControllerBase
{
    /// <summary>GET api/Story/LifeAreas/stats — every area's all-time XP and level.</summary>
    [HttpGet("stats")]
    public async Task<IActionResult> Stats() =>
        Ok(ApiResponse<List<LifeAreaStatsDto>>.Ok(await lifeAreasService.GetStatsAsync()));

    /// <summary>GET api/Story/LifeAreas/ratings?from=2026-09-01&amp;to=2026-10-01 — months by their first day.</summary>
    [HttpGet("ratings")]
    public async Task<IActionResult> Ratings([FromQuery, BindRequired] DateOnly from, [FromQuery, BindRequired] DateOnly to)
    {
        var result = await lifeAreasService.GetRatingsAsync(from, to);
        return result.Success
            ? Ok(ApiResponse<List<LifeAreaRatingDto>>.Ok(result.Data))
            : BadRequest(ApiResponse<List<LifeAreaRatingDto>>.Fail(result.Error!));
    }

    /// <summary>PUT api/Story/LifeAreas/ratings/2026-10-01 — the month's ratings; a null rating clears that area.</summary>
    [HttpPut("ratings/{month}")]
    public async Task<IActionResult> SaveRatings(DateOnly month, LifeAreaRatingsRequest request)
    {
        var result = await lifeAreasService.SaveRatingsAsync(month, request);
        return result.Success
            ? Ok(ApiResponse<List<LifeAreaRatingDto>>.Ok(result.Data))
            : BadRequest(ApiResponse<List<LifeAreaRatingDto>>.Fail(result.Error!));
    }
}
