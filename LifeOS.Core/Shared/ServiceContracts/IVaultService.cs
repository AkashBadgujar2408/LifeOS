using LifeOS.Core.Shared.DTOs;

namespace LifeOS.Core.Shared.ServiceContracts;

/// <summary>
/// The vault (sensitive documents now; Health and Safety later): re-entering the password unlocks it for
/// <see cref="Services.VaultService.UnlockMinutes"/> minutes, and every unlock and every sensitive thing opened is
/// logged. What's protected decides for itself when to ask <see cref="IsUnlocked"/>.
/// </summary>
public interface IVaultService
{
    /// <summary>Checks the password and returns the unlock to send back; a wrong password is logged and refused.</summary>
    Task<OperationResult<VaultUnlockDto>> UnlockAsync(VaultUnlockRequest request);

    /// <summary>Whether this request carries a live unlock issued to the logged-in user.</summary>
    bool IsUnlocked { get; }

    /// <summary>Records something sensitive being opened or unprotected (an action from <see cref="VaultActions"/>).</summary>
    Task LogAsync(string action, string entityType, int entityId, string? detail);

    /// <summary>The latest vault activity, newest first.</summary>
    Task<List<VaultAccessDto>> ActivityAsync(int take);
}
