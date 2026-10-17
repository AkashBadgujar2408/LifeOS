using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using LifeOS.Api.Infrastructure;
using Microsoft.AspNetCore.RateLimiting;

namespace LifeOS.Api.Areas.Shared.Controllers;

[ApiController]
[Area("Shared")]
[Route("api/[area]/[controller]")]
public class AuthController(IAuthService authService, ICurrentUserService currentUserService) : ControllerBase
{
    [HttpPost("register")]
    [AllowAnonymous]
    public async Task<IActionResult> Register(RegisterRequest request)
    {
        var result = await authService.RegisterAsync(request);
        if (!result.Success)
        {
            return BadRequest(ApiResponse<AuthResponse>.Fail(result.Error!));
        }

        return Ok(ApiResponse<AuthResponse>.Ok(result.Data));
    }

    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<IActionResult> Login(LoginRequest request)
    {
        var result = await authService.LoginAsync(request);
        if (!result.Success)
        {
            return Unauthorized(ApiResponse<AuthResponse>.Fail(result.Error!));
        }

        return Ok(ApiResponse<AuthResponse>.Ok(result.Data));
    }

    /// <summary>Forgotten password: username + one unused recovery code + the new password; logs in on success.</summary>
    [HttpPost("reset-password")]
    [AllowAnonymous]
    [EnableRateLimiting(RecoveryRateLimit.Policy)]
    public async Task<IActionResult> ResetPassword(ResetPasswordRequest request)
    {
        var result = await authService.ResetPasswordAsync(request);
        return result.Success
            ? Ok(ApiResponse<AuthResponse>.Ok(result.Data))
            : BadRequest(ApiResponse<AuthResponse>.Fail(result.Error!));
    }

    [HttpPut("password")]
    [Authorize]
    public async Task<IActionResult> ChangePassword(ChangePasswordRequest request)
    {
        var result = await authService.ChangePasswordAsync(request);
        return result.Success
            ? Ok(ApiResponse<bool>.Ok(true))
            : BadRequest(ApiResponse<bool>.Fail(result.Error!));
    }

    /// <summary>A new set of recovery codes (the old ones stop working); asks for the password again.</summary>
    [HttpPost("recovery-codes")]
    [Authorize]
    [EnableRateLimiting(RecoveryRateLimit.Policy)]
    public async Task<IActionResult> RegenerateRecoveryCodes(RegenerateRecoveryCodesRequest request)
    {
        var result = await authService.RegenerateRecoveryCodesAsync(request);
        return result.Success
            ? Ok(ApiResponse<RecoveryCodesDto>.Ok(result.Data))
            : BadRequest(ApiResponse<RecoveryCodesDto>.Fail(result.Error!));
    }

    [HttpGet("me")]
    [Authorize]
    public IActionResult Me()
    {
        return Ok(ApiResponse<object>.Ok(new { userId = currentUserService.UserId }));
    }
}
