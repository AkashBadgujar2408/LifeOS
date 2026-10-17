using System.Threading.RateLimiting;
using LifeOS.Core.Shared.DTOs;

namespace LifeOS.Api.Infrastructure;

/// <summary>
/// Slows down guessing on the account-recovery endpoints (password reset with a recovery code, regenerating codes):
/// a few tries a minute per client address. The codes carry 80 random bits, so this is a speed bump against noise
/// and username probing rather than the main defence. Built into ASP.NET Core — no package.
/// </summary>
public static class RecoveryRateLimit
{
    public const string Policy = "recovery";
    private const int PermitsPerMinute = 5;

    public static IServiceCollection AddRecoveryRateLimit(this IServiceCollection services) =>
        services.AddRateLimiter(options =>
        {
            options.AddPolicy(Policy, context => RateLimitPartition.GetFixedWindowLimiter(
                context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                _ => new FixedWindowRateLimiterOptions { PermitLimit = PermitsPerMinute, Window = TimeSpan.FromMinutes(1) }));

            // Same envelope as every other API error, so the client shows the message.
            options.OnRejected = async (context, cancellationToken) =>
            {
                context.HttpContext.Response.StatusCode = StatusCodes.Status429TooManyRequests;
                await context.HttpContext.Response.WriteAsJsonAsync(
                    ApiResponse<object>.Fail("Too many tries. Wait a minute and try again."), cancellationToken);
            };
        });
}
