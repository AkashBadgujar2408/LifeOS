using LifeOS.Core.Dashboard.DTOs;
using LifeOS.Core.Dashboard.ServiceContracts;
using LifeOS.Core.Shared.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LifeOS.Api.Areas.Dashboard.Controllers;

/// <summary>Dismissing insights: they're computed on each My Day read, so only the dismissed keys are kept.</summary>
[ApiController]
[Area("Dashboard")]
[Route("api/[area]/[controller]")]
[Authorize]
public class InsightsController(IDashboardService dashboardService) : ControllerBase
{
    /// <summary>POST api/Dashboard/Insights/dismissed { "key": "JournalGap:2026-10-12" }</summary>
    [HttpPost("dismissed")]
    public async Task<IActionResult> Dismiss(DismissInsightRequest request)
    {
        await dashboardService.DismissInsightAsync(request.Key);
        return Ok(ApiResponse<bool>.Ok(true));
    }

    /// <summary>DELETE api/Dashboard/Insights/dismissed — show every dismissed insight again.</summary>
    [HttpDelete("dismissed")]
    public async Task<IActionResult> Restore() => Ok(ApiResponse<int>.Ok(await dashboardService.RestoreInsightsAsync()));
}
