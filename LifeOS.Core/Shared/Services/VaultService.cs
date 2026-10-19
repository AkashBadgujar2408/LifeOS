using System.Globalization;
using System.Security.Cryptography;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Shared.Services;

/// <summary>
/// An unlock is the user's id protected by a time-limited Data Protection protector: tamper-proof, expires on its
/// own, and only this app's key ring can read it. Nothing is stored server-side, so "lock now" is the client
/// forgetting it (a stolen one is good for at most <see cref="UnlockMinutes"/> minutes, and only with the login).
/// </summary>
public class VaultService(AppDbContext db, IDataProtectionProvider dataProtection, IHttpContextAccessor httpContextAccessor,
    IEnumerable<ILinkableEntityProvider> providers) : IVaultService
{
    public const int UnlockMinutes = 15;
    private const string WrongPassword = "That isn't your password.";

    private readonly PasswordHasher<User> passwordHasher = new();

    private ITimeLimitedDataProtector Protector =>
        dataProtection.CreateProtector("LifeOS.VaultUnlock.v1").ToTimeLimitedDataProtector();

    public async Task<OperationResult<VaultUnlockDto>> UnlockAsync(VaultUnlockRequest request)
    {
        var userId = db.CurrentUserId!.Value;
        var user = await db.Users.FindAsync(userId);
        if (user is null || passwordHasher.VerifyHashedPassword(user, user.PasswordHash, request.Password) == PasswordVerificationResult.Failed)
        {
            await WriteAsync(VaultActions.UnlockFailed, null, null, null);
            return OperationResult<VaultUnlockDto>.Fail(WrongPassword);
        }

        var expiresAtUtc = DateTime.UtcNow.AddMinutes(UnlockMinutes);
        var token = Protector.Protect(userId.ToString(CultureInfo.InvariantCulture), new DateTimeOffset(expiresAtUtc));
        await WriteAsync(VaultActions.Unlocked, null, null, null);
        return OperationResult<VaultUnlockDto>.Ok(new VaultUnlockDto { Token = token, ExpiresAtUtc = expiresAtUtc });
    }

    public bool IsUnlocked
    {
        get
        {
            var header = httpContextAccessor.HttpContext?.Request.Headers[VaultHeaders.Unlock].ToString();
            if (string.IsNullOrEmpty(header) || db.CurrentUserId is not { } userId)
            {
                return false;
            }

            try
            {
                return Protector.Unprotect(header) == userId.ToString(CultureInfo.InvariantCulture);
            }
            catch (CryptographicException)
            {
                // Expired, tampered with, or not one of ours.
                return false;
            }
        }
    }

    public Task LogAsync(string action, string? entityType, int? entityId, string? detail) =>
        WriteAsync(action, entityType, entityId, detail);

    public async Task<List<VaultAccessDto>> ActivityAsync(int take)
    {
        var rows = await db.VaultAccessLogs.AsNoTracking()
            .OrderByDescending(l => l.CreatedAt).ThenByDescending(l => l.Id)
            .Take(take)
            .ToListAsync();

        // Titles as they are now, through each type's provider (so deleted items simply have none).
        var titles = new Dictionary<(string, int), string>();
        foreach (var group in rows.Where(r => r.EntityType is not null).GroupBy(r => r.EntityType!))
        {
            var provider = providers.FirstOrDefault(p => p.EntityType == group.Key);
            if (provider is null)
            {
                continue;
            }

            foreach (var (id, title) in await provider.GetTitlesAsync(group.Select(r => r.EntityId!.Value).Distinct().ToList()))
            {
                titles[(group.Key, id)] = title;
            }
        }

        return rows.Select(r => new VaultAccessDto
        {
            Id = r.Id,
            Action = r.Action,
            EntityType = r.EntityType,
            EntityId = r.EntityId,
            EntityTitle = r.EntityType is not null && titles.TryGetValue((r.EntityType, r.EntityId!.Value), out var t) ? t : null,
            Detail = r.Detail,
            ClientAddress = r.ClientAddress,
            CreatedAt = r.CreatedAt,
        }).ToList();
    }

    private async Task WriteAsync(string action, string? entityType, int? entityId, string? detail)
    {
        db.VaultAccessLogs.Add(new VaultAccessLog
        {
            UserId = db.CurrentUserId!.Value,
            Action = action,
            EntityType = entityType,
            EntityId = entityId,
            Detail = detail is { Length: > 255 } ? detail[..255] : detail,
            ClientAddress = httpContextAccessor.HttpContext?.Connection.RemoteIpAddress?.ToString(),
        });
        await db.SaveChangesAsync();
    }
}
