using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Shared.Services;

public class AuthService(AppDbContext db, IJwtTokenService jwtTokenService) : IAuthService
{
    private const string WrongCurrentPassword = "That isn't your current password.";

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

        // No email is ever sent, so the codes are the only way back in after a forgotten password: made with the
        // account, shown once.
        var codes = RecoveryCodeFormat.GenerateSet();
        foreach (var code in codes)
        {
            user.RecoveryCodes.Add(new RecoveryCode { CodeHash = RecoveryCodeFormat.Hash(code) });
        }

        db.Users.Add(user);
        await db.SaveChangesAsync();

        return OperationResult<AuthResponse>.Ok(BuildAuthResponse(user, recoveryCodes: codes));
    }

    public async Task<OperationResult<bool>> ChangePasswordAsync(ChangePasswordRequest request)
    {
        var user = await db.Users.FindAsync(db.CurrentUserId!.Value);
        if (user is null || passwordHasher.VerifyHashedPassword(user, user.PasswordHash, request.CurrentPassword) == PasswordVerificationResult.Failed)
        {
            return OperationResult<bool>.Fail(WrongCurrentPassword);
        }

        if (request.NewPassword == request.CurrentPassword)
        {
            return OperationResult<bool>.Fail("The new password is the same as the current one.");
        }

        user.PasswordHash = passwordHasher.HashPassword(user, request.NewPassword);
        user.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return OperationResult<bool>.Ok(true);
    }

    public async Task<OperationResult<RecoveryCodesDto>> RegenerateRecoveryCodesAsync(RegenerateRecoveryCodesRequest request)
    {
        var user = await db.Users.FindAsync(db.CurrentUserId!.Value);
        if (user is null || passwordHasher.VerifyHashedPassword(user, user.PasswordHash, request.CurrentPassword) == PasswordVerificationResult.Failed)
        {
            return OperationResult<RecoveryCodesDto>.Fail(WrongCurrentPassword);
        }

        var now = DateTime.UtcNow;
        await using var transaction = await db.Database.BeginTransactionAsync();
        foreach (var old in await db.RecoveryCodes.Where(c => c.UserId == user.Id).ToListAsync())
        {
            old.IsDeleted = true;
            old.DeletedAt = now;
        }

        var codes = RecoveryCodeFormat.GenerateSet();
        db.RecoveryCodes.AddRange(codes.Select(code => new RecoveryCode { UserId = user.Id, CodeHash = RecoveryCodeFormat.Hash(code) }));
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return OperationResult<RecoveryCodesDto>.Ok(new RecoveryCodesDto { Codes = codes });
    }

    public async Task<OperationResult<AuthResponse>> ResetPasswordAsync(ResetPasswordRequest request)
    {
        // One answer for every failure, so the endpoint doesn't tell which usernames exist.
        const string failed = "That username and recovery code don't match an unused code.";

        var user = await db.Users.SingleOrDefaultAsync(u => u.Username == request.Username.Trim());
        if (user is null)
        {
            return OperationResult<AuthResponse>.Fail(failed);
        }

        // Nobody is logged in yet, so the per-user query filter can't apply: filter by this user explicitly.
        var hash = RecoveryCodeFormat.Hash(request.RecoveryCode);
        var code = await db.RecoveryCodes.IgnoreQueryFilters()
            .FirstOrDefaultAsync(c => c.UserId == user.Id && c.CodeHash == hash && !c.IsDeleted && c.UsedAt == null);
        if (code is null)
        {
            return OperationResult<AuthResponse>.Fail(failed);
        }

        var now = DateTime.UtcNow;
        await using var transaction = await db.Database.BeginTransactionAsync();
        // Spend the code with a conditional UPDATE, so two requests racing with the same code can't both win.
        var spent = await db.RecoveryCodes.IgnoreQueryFilters()
            .Where(c => c.Id == code.Id && c.UsedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(c => c.UsedAt, now).SetProperty(c => c.UpdatedAt, now));
        if (spent == 0)
        {
            return OperationResult<AuthResponse>.Fail(failed);
        }

        user.PasswordHash = passwordHasher.HashPassword(user, request.NewPassword);
        user.UpdatedAt = now;
        await db.SaveChangesAsync();
        await transaction.CommitAsync();

        var left = await db.RecoveryCodes.IgnoreQueryFilters()
            .CountAsync(c => c.UserId == user.Id && !c.IsDeleted && c.UsedAt == null);
        return OperationResult<AuthResponse>.Ok(BuildAuthResponse(user, codesLeft: left));
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

    private AuthResponse BuildAuthResponse(User user, List<string>? recoveryCodes = null, int? codesLeft = null)
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
            RecoveryCodes = recoveryCodes,
            RecoveryCodesLeft = codesLeft,
        };
    }
}
