using LifeOS.Api.Infrastructure;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace LifeOS.Api.Areas.Shared.Controllers;

[ApiController]
[Area("Shared")]
[Route("api/[area]/[controller]")]
[Authorize]
public class VaultController(IVaultService vaultService) : ControllerBase
{
    /// <summary>POST api/Shared/Vault/unlock { password } — 15 minutes; send the token back in X-Vault-Unlock.</summary>
    [HttpPost("unlock")]
    [EnableRateLimiting(RecoveryRateLimit.Policy)]
    public async Task<IActionResult> Unlock(VaultUnlockRequest request)
    {
        var result = await vaultService.UnlockAsync(request);
        return result.Success
            ? Ok(ApiResponse<VaultUnlockDto>.Ok(result.Data))
            : BadRequest(ApiResponse<VaultUnlockDto>.Fail(result.Error!));
    }

    /// <summary>GET api/Shared/Vault/activity — the latest 50 unlocks and opens, newest first.</summary>
    [HttpGet("activity")]
    public async Task<IActionResult> Activity() =>
        Ok(ApiResponse<List<VaultAccessDto>>.Ok(await vaultService.ActivityAsync(50)));
}
