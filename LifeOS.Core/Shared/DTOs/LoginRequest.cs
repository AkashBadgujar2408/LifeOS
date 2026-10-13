using System.ComponentModel.DataAnnotations;

namespace LifeOS.Core.Shared.DTOs;

public class LoginRequest
{
    [Required, EmailAddress]
    public string Email { get; init; } = string.Empty;

    [Required]
    public string Password { get; init; } = string.Empty;
}
