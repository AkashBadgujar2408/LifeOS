using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LifeOS.Api.Areas.Shared.Controllers;

/// <summary>The logged-in user's settings. Password and recovery codes are on AuthController.</summary>
[ApiController]
[Area("Shared")]
[Route("api/[area]/[controller]")]
[Authorize]
public class SettingsController(ISettingsService settingsService) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get() => Respond(await settingsService.GetAsync());

    [HttpPut("profile")]
    public async Task<IActionResult> UpdateProfile(ProfileRequest request) =>
        Respond(await settingsService.UpdateProfileAsync(request));

    [HttpPut("preferences")]
    public async Task<IActionResult> UpdatePreferences(PreferencesRequest request) =>
        Respond(await settingsService.UpdatePreferencesAsync(request));

    [HttpGet("currencies")]
    public IActionResult Currencies() => Ok(ApiResponse<List<CurrencyDto>>.Ok(settingsService.Currencies()));

    private IActionResult Respond(OperationResult<SettingsDto> result) => result.Success
        ? Ok(ApiResponse<SettingsDto>.Ok(result.Data))
        : BadRequest(ApiResponse<SettingsDto>.Fail(result.Error!));
}
