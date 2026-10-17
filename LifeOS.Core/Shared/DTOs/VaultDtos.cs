using System.ComponentModel.DataAnnotations;

namespace LifeOS.Core.Shared.DTOs;

/// <summary>Matches CK_VaultAccessLog_Action. Never rename one once stored.</summary>
public static class VaultActions
{
    public const string Unlocked = "Unlocked";
    public const string UnlockFailed = "UnlockFailed";
    public const string Opened = "Opened";
    public const string Unprotected = "Unprotected";
}

public static class VaultErrors
{
    public const string Locked = "The vault is locked: enter your password to open this.";
}

/// <summary>
/// The vault unlock travels in its own header, held only in the page's memory (never in storage or a URL), so a
/// reload or another tab starts locked.
/// </summary>
public static class VaultHeaders
{
    public const string Unlock = "X-Vault-Unlock";
}

public class VaultUnlockRequest
{
    [Required(ErrorMessage = "Enter your password.")]
    public string Password { get; init; } = string.Empty;
}

/// <summary>Send Token back in the X-Vault-Unlock header until ExpiresAtUtc.</summary>
public class VaultUnlockDto
{
    public string Token { get; init; } = string.Empty;
    public DateTime ExpiresAtUtc { get; init; }
}

/// <summary>One line of vault activity, newest first.</summary>
public class VaultAccessDto
{
    public int Id { get; init; }
    public string Action { get; init; } = string.Empty;
    public string? EntityType { get; init; }
    public int? EntityId { get; init; }
    /// <summary>The item's title now; null when it has since been deleted.</summary>
    public string? EntityTitle { get; init; }
    /// <summary>The file opened, when it was a file.</summary>
    public string? Detail { get; init; }
    public string? ClientAddress { get; init; }
    public DateTime CreatedAt { get; init; }
}
