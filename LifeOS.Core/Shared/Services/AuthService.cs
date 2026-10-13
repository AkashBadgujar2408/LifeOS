using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Shared.Services;

public class AuthService(AppDbContext db, IJwtTokenService jwtTokenService) : IAuthService
{
    private readonly PasswordHasher<User> passwordHasher = new();

    public async Task<OperationResult<AuthResponse>> RegisterAsync(RegisterRequest request)
    {
        var emailExists = await db.Users.AnyAsync(u => u.Email == request.Email);
        if (emailExists)
        {
            return OperationResult<AuthResponse>.Fail("An account with this email already exists.");
        }

        var usernameExists = await db.Users.AnyAsync(u => u.Username == request.Username);
        if (usernameExists)
        {
            return OperationResult<AuthResponse>.Fail("This username is already taken.");
        }

        var user = new User
        {
            Username = request.Username,
            Email = request.Email,
            DisplayName = request.DisplayName,
            PasswordHash = string.Empty,
        };
        user.PasswordHash = passwordHasher.HashPassword(user, request.Password);

        db.Users.Add(user);
        await db.SaveChangesAsync();

        return OperationResult<AuthResponse>.Ok(BuildAuthResponse(user));
    }

    public async Task<OperationResult<AuthResponse>> LoginAsync(LoginRequest request)
    {
        var user = await db.Users.SingleOrDefaultAsync(u => u.Username == request.Username);
        if (user is null)
        {
            return OperationResult<AuthResponse>.Fail("Invalid username or password.");
        }

        var verification = passwordHasher.VerifyHashedPassword(user, user.PasswordHash, request.Password);
        if (verification == PasswordVerificationResult.Failed)
        {
            return OperationResult<AuthResponse>.Fail("Invalid username or password.");
        }

        return OperationResult<AuthResponse>.Ok(BuildAuthResponse(user));
    }

    private AuthResponse BuildAuthResponse(User user)
    {
        var (token, expiresAtUtc) = jwtTokenService.GenerateToken(user);
        return new AuthResponse
        {
            Token = token,
            ExpiresAtUtc = expiresAtUtc,
            UserId = user.Id,
            Username = user.Username,
            Email = user.Email,
            DisplayName = user.DisplayName,
        };
    }
}
