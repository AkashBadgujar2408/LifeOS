using LifeOS.Core.Dashboard.DTOs;
using LifeOS.Core.Dashboard.ServiceContracts;
using LifeOS.Core.Shared.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;

namespace LifeOS.Api.Areas.Dashboard.Controllers;

[ApiController]
[Area("Dashboard")]
[Route("api/[area]/[controller]")]
[Authorize]
public class MyDayController(IDashboardService dashboardService) : ControllerBase
{
    /// <summary>
    /// GET api/Dashboard/MyDay?today=2026-10-15&amp;dayStartUtc=2026-10-14T18:30:00Z&amp;dayEndUtc=2026-10-15T18:30:00Z
    /// </summary>
    /// <remarks>
    /// dayStartUtc/dayEndUtc must carry a "Z" (or an offset): without one, model binding reads them as the server's
    /// local time.
    /// </remarks>
    [HttpGet]
    public async Task<IActionResult> Get(
        [FromQuery, BindRequired] DateOnly today,
        [FromQuery] DateTime? dayStartUtc,
        [FromQuery] DateTime? dayEndUtc)
    {
        var result = await dashboardService.GetMyDayAsync(today, dayStartUtc, dayEndUtc);
        if (!result.Success)
        {
            return BadRequest(ApiResponse<MyDayDto>.Fail(result.Error!));
        }

        return Ok(ApiResponse<MyDayDto>.Ok(result.Data));
    }
}
