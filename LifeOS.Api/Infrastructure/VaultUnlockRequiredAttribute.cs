using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace LifeOS.Api.Infrastructure;

/// <summary>
/// Everything behind this answers 423 Locked without a live vault unlock (the X-Vault-Unlock header) — for areas
/// that are sensitive as a whole (Health), where every read and write needs it, not just opening one item. The
/// client asks for the password with ensureVaultUnlocked and, on a 423, locks and asks again.
/// </summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public sealed class VaultUnlockRequiredAttribute : Attribute, IAsyncActionFilter
{
    public Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var vault = context.HttpContext.RequestServices.GetRequiredService<IVaultService>();
        if (!vault.IsUnlocked)
        {
            context.Result = new ObjectResult(ApiResponse<object>.Fail(VaultErrors.Locked)) { StatusCode = StatusCodes.Status423Locked };
            return Task.CompletedTask;
        }

        return next();
    }
}
