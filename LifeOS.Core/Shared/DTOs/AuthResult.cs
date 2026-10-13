namespace LifeOS.Core.Shared.DTOs;

public record AuthResult(bool Success, AuthResponse? Response, string? Error)
{
    public static AuthResult Ok(AuthResponse response) => new(true, response, null);
    public static AuthResult Fail(string error) => new(false, null, error);
}
