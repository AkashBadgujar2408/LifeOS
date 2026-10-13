using System.ComponentModel.DataAnnotations;

namespace LifeOS.Core.Shared.DTOs;

public class RegisterRequest
{
    [Required, EmailAddress, MaxLength(256)]
    public string Email { get; init; } = string.Empty;

    [Required, MinLength(8), MaxLength(100)]
    public string Password { get; init; } = string.Empty;

    [Required, MaxLength(200)]
    public string DisplayName { get; init; } = string.Empty;
}
