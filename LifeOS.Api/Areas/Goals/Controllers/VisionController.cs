using LifeOS.Core.Goals.DTOs;
using LifeOS.Core.Goals.ServiceContracts;
using LifeOS.Core.Shared.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LifeOS.Api.Areas.Goals.Controllers;

/// <summary>The user's life vision statement: GET / PUT api/Goals/Vision (a blank text clears it).</summary>
[ApiController]
[Area("Goals")]
[Route("api/[area]/[controller]")]
[Authorize]
public class VisionController(ILifeVisionService lifeVisionService) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get() => Ok(ApiResponse<LifeVisionDto>.Ok(await lifeVisionService.GetAsync()));

    [HttpPut]
    public async Task<IActionResult> Save(LifeVisionRequest request) =>
        Ok(ApiResponse<LifeVisionDto>.Ok(await lifeVisionService.SaveAsync(request)));
}
