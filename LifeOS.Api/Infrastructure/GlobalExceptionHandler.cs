using LifeOS.Core.Shared.DTOs;
using Microsoft.AspNetCore.Diagnostics;

namespace LifeOS.Api.Infrastructure;

public class GlobalExceptionHandler(ILogger<GlobalExceptionHandler> logger, IHostEnvironment environment) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken cancellationToken)
    {
        logger.LogError(exception, "Unhandled exception while processing {Method} {Path}",
            httpContext.Request.Method, httpContext.Request.Path);

        httpContext.Response.StatusCode = StatusCodes.Status500InternalServerError;
        httpContext.Response.ContentType = "application/json";

        // The exception text helps while developing; anywhere else it's an internal detail (SQL, stack-ish wording)
        // the user can't act on — the full exception is in the log either way.
        var message = environment.IsDevelopment()
            ? exception.Message
            : "Something went wrong on our side. Please try again.";

        await httpContext.Response.WriteAsJsonAsync(ApiResponse.Fail(message), cancellationToken);

        return true;
    }
}
