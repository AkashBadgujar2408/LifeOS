using LifeOS.Core.Shared.DTOs;

namespace LifeOS.Core.Shared.ServiceContracts;

/// <summary>The logged-in user's profile and preferences (password + recovery codes live in IAuthService).</summary>
public interface ISettingsService
{
    Task<OperationResult<SettingsDto>> GetAsync();

    /// <summary>Display name and email (unique among live accounts). The username never changes.</summary>
    Task<OperationResult<SettingsDto>> UpdateProfileAsync(ProfileRequest request);

    /// <summary>Timezone, base currency, hidden modules and life areas — the lists replace what was stored.</summary>
    Task<OperationResult<SettingsDto>> UpdatePreferencesAsync(PreferencesRequest request);

    /// <summary>ISO 4217 currencies the base currency can be, by code.</summary>
    List<CurrencyDto> Currencies();
}
