using System.ComponentModel.DataAnnotations;

namespace LifeOS.Core.Shared.DTOs;

public class LoginRequest
{
    [Required]
    public string Username { get; init; } = string.Empty;

    [Required]
    public string Password { get; init; } = string.Empty;
}
