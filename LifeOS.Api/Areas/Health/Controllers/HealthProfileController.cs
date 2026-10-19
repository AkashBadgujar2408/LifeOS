using LifeOS.Api.Infrastructure;
using LifeOS.Core.Health.DTOs;
using LifeOS.Core.Health.ServiceContracts;
using LifeOS.Core.Shared.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LifeOS.Api.Areas.Health.Controllers;

[ApiController]
[Area("Health")]
[Route("api/[area]/[controller]")]
[Authorize]
[VaultUnlockRequired]
public class HealthProfileController(IHealthProfileService profileService) : ControllerBase
{
    /// <summary>GET api/Health/HealthProfile?today — the profile (all blank before the first save).</summary>
    [HttpGet]
    public async Task<IActionResult> Get(DateOnly today) =>
        Ok(ApiResponse<HealthProfileDto>.Ok(await profileService.GetAsync(today)));

    /// <summary>PUT api/Health/HealthProfile — creates it the first time, rewrites it after.</summary>
    [HttpPut]
    public async Task<IActionResult> Save(HealthProfileRequest request)
    {
        var result = await profileService.SaveAsync(request);
        return result.Success
            ? Ok(ApiResponse<HealthProfileDto>.Ok(result.Data))
            : BadRequest(ApiResponse<HealthProfileDto>.Fail(result.Error!));
    }
}
