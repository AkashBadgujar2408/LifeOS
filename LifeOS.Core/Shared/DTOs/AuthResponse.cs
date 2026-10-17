namespace LifeOS.Core.Shared.DTOs;

public class AuthResponse
{
    public string Token { get; init; } = string.Empty;
    public DateTime ExpiresAtUtc { get; init; }
    public int UserId { get; init; }
    public string Username { get; init; } = string.Empty;
    public string Email { get; init; } = string.Empty;
    public string DisplayName { get; init; } = string.Empty;
    /// <summary>Registration only: the new account's recovery codes, shown once.</summary>
    public List<string>? RecoveryCodes { get; init; }
    /// <summary>Password reset only: unused recovery codes left after this one.</summary>
    public int? RecoveryCodesLeft { get; init; }
}
