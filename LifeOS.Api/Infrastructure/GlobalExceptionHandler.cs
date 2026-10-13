using LifeOS.Core.Shared.DTOs;
using Microsoft.AspNetCore.Diagnostics;

namespace LifeOS.Api.Infrastructure;

public class GlobalExceptionHandler(ILogger<GlobalExceptionHandler> logger) : IExceptionHandler
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

        var response = ApiResponse.Fail(exception.Message);

        await httpContext.Response.WriteAsJsonAsync(response, cancellationToken);

        return true;
    }
}
