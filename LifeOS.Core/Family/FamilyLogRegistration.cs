using LifeOS.Core.Family.ServiceContracts;
using LifeOS.Core.Family.Services;
using Microsoft.Extensions.DependencyInjection;

namespace LifeOS.Core.Family;

/// <summary>Family's log (Session 74): interactions, keep in touch, gifts, responsibilities — one line in Program.cs.</summary>
public static class FamilyLogRegistration
{
    public static IServiceCollection AddFamilyLog(this IServiceCollection services)
    {
        services.AddScoped<IInteractionsService, InteractionsService>();
        services.AddScoped<IKeepInTouchService, KeepInTouchService>();
        services.AddScoped<IGiftIdeasService, GiftIdeasService>();
        services.AddScoped<IResponsibilitiesService, ResponsibilitiesService>();
        services.AddScoped<IFamilyLogCleanup, FamilyLogCleanup>();
        return services;
    }
}
