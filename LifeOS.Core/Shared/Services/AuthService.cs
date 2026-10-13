using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Shared.Services;

public class AuthService(AppDbContext db, IJwtTokenService jwtTokenService) : IAuthService
{
    private readonly PasswordHasher<User> passwordHasher = new();

    public async Task<AuthResult> RegisterAsync(RegisterRequest request)
    {
        var emailExists = await db.Users.AnyAsync(u => u.Email == request.Email);
        if (emailExists)
        {
            return AuthResult.Fail("An account with this email already exists.");
        }

        var user = new User
        {
            Email = request.Email,
            DisplayName = request.DisplayName,
            PasswordHash = string.Empty,
        };
        user.PasswordHash = passwordHasher.HashPassword(user, request.Password);

        db.Users.Add(user);
        await db.SaveChangesAsync();

        return AuthResult.Ok(BuildAuthResponse(user));
    }

    public async Task<AuthResult> LoginAsync(LoginRequest request)
    {
        var user = await db.Users.SingleOrDefaultAsync(u => u.Email == request.Email);
        if (user is null)
        {
            return AuthResult.Fail("Invalid email or password.");
        }

        var verification = passwordHasher.VerifyHashedPassword(user, user.PasswordHash, request.Password);
        if (verification == PasswordVerificationResult.Failed)
        {
            return AuthResult.Fail("Invalid email or password.");
        }

        return AuthResult.Ok(BuildAuthResponse(user));
    }

    private AuthResponse BuildAuthResponse(User user)
    {
        var (token, expiresAtUtc) = jwtTokenService.GenerateToken(user);
        return new AuthResponse
        {
            Token = token,
            ExpiresAtUtc = expiresAtUtc,
            UserId = user.Id,
            Email = user.Email,
            DisplayName = user.DisplayName,
        };
    }
}
