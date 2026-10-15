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
public class LifeBalanceController(IDashboardService dashboardService) : ControllerBase
{
    /// <summary>
    /// GET api/Dashboard/LifeBalance?from=2026-09-16&amp;to=2026-10-15&amp;fromUtc=2026-09-15T18:30:00Z&amp;toUtc=2026-10-15T18:30:00Z
    /// </summary>
    /// <remarks>fromUtc/toUtc must carry a "Z" (or an offset), as for the calendar feed.</remarks>
    [HttpGet]
    public async Task<IActionResult> Get(
        [FromQuery, BindRequired] DateOnly from,
        [FromQuery, BindRequired] DateOnly to,
        [FromQuery] DateTime? fromUtc,
        [FromQuery] DateTime? toUtc)
    {
        var result = await dashboardService.GetLifeBalanceAsync(from, to, fromUtc, toUtc);
        if (!result.Success)
        {
            return BadRequest(ApiResponse<LifeBalanceDto>.Fail(result.Error!));
        }

        return Ok(ApiResponse<LifeBalanceDto>.Ok(result.Data));
    }
}
