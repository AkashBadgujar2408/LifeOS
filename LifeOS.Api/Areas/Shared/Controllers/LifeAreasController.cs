using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LifeOS.Api.Areas.Shared.Controllers;

/// <summary>Read-only: life areas are a fixed, seeded taxonomy, not something users manage.</summary>
[ApiController]
[Area("Shared")]
[Route("api/[area]/[controller]")]
[Authorize]
public class LifeAreasController(ILifeAreasService lifeAreasService) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var areas = await lifeAreasService.GetAllAsync();
        return Ok(ApiResponse<List<LifeAreaDto>>.Ok(areas));
    }
}
