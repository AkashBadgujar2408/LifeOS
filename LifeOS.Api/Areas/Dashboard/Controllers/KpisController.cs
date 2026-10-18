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
public class KpisController(IKpisService kpisService) : ControllerBase
{
    /// <summary>GET api/Dashboard/Kpis?today=2026-10-18&amp;tz=Asia/Kolkata — the chosen tiles + the catalogue.</summary>
    [HttpGet]
    public async Task<IActionResult> Get([FromQuery, BindRequired] DateOnly today, [FromQuery] string? tz)
    {
        var result = await kpisService.GetAsync(today, tz);
        if (!result.Success)
        {
            return BadRequest(ApiResponse<KpisDto>.Fail(result.Error!));
        }

        return Ok(ApiResponse<KpisDto>.Ok(result.Data));
    }

    /// <summary>PUT api/Dashboard/Kpis { "keys": ["tasks-done-week", ...] } — replaces the choice, order kept.</summary>
    [HttpPut]
    public async Task<IActionResult> Save(SaveKpisRequest request)
    {
        var result = await kpisService.SaveAsync(request);
        if (!result.Success)
        {
            return BadRequest(ApiResponse<List<string>>.Fail(result.Error!));
        }

        return Ok(ApiResponse<List<string>>.Ok(result.Data));
    }
}
