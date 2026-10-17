using System.Globalization;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using LifeOS.Core.Story.Services;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Shared.Services;

public class SettingsService(AppDbContext db) : ISettingsService
{
    private const string NoUser = "Account not found.";

    // Every current currency some region uses, from .NET's own region data — the same list the page offers.
    private static readonly Lazy<List<CurrencyDto>> AllCurrencies = new(() =>
        CultureInfo.GetCultures(CultureTypes.SpecificCultures)
            .Select(c =>
            {
                try
                {
                    return new RegionInfo(c.Name);
                }
                catch (ArgumentException)
                {
                    return null;
                }
            })
            .OfType<RegionInfo>()
            .Where(r => r.ISOCurrencySymbol.Length == 3)
            .GroupBy(r => r.ISOCurrencySymbol)
            .Select(g => new CurrencyDto { Code = g.Key, Name = g.First().CurrencyEnglishName })
            .OrderBy(c => c.Code, StringComparer.Ordinal)
            .ToList());

    public List<CurrencyDto> Currencies() => AllCurrencies.Value;

    public async Task<OperationResult<SettingsDto>> GetAsync()
    {
        var user = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == db.CurrentUserId);
        if (user is null)
        {
            return OperationResult<SettingsDto>.Fail(NoUser);
        }

        // The hidden-module/area and code tables are user-owned, so the global filter already scopes them.
        var hiddenModules = await db.UserHiddenModules.OrderBy(m => m.ModuleKey).Select(m => m.ModuleKey).ToListAsync();
        var hiddenAreas = await db.UserHiddenLifeAreas.OrderBy(a => a.LifeAreaId).Select(a => a.LifeAreaId).ToListAsync();
        var codesLeft = await db.RecoveryCodes.CountAsync(c => c.UsedAt == null);

        return OperationResult<SettingsDto>.Ok(new SettingsDto
        {
            Username = user.Username,
            Email = user.Email,
            DisplayName = user.DisplayName,
            TimeZone = user.TimeZone,
            BaseCurrency = user.BaseCurrency,
            HiddenModules = hiddenModules,
            HiddenLifeAreaIds = hiddenAreas,
            RecoveryCodesLeft = codesLeft,
        });
    }

    public async Task<OperationResult<SettingsDto>> UpdateProfileAsync(ProfileRequest request)
    {
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == db.CurrentUserId);
        if (user is null)
        {
            return OperationResult<SettingsDto>.Fail(NoUser);
        }

        var displayName = request.DisplayName.Trim();
        var email = request.Email.Trim();
        if (displayName.Length == 0)
        {
            return OperationResult<SettingsDto>.Fail("Give yourself a display name.");
        }

        const string emailTaken = "Another account already uses this email.";
        if (await db.Users.AnyAsync(u => u.Email == email && u.Id != user.Id))
        {
            return OperationResult<SettingsDto>.Fail(emailTaken);
        }

        user.DisplayName = displayName;
        user.Email = email;
        user.UpdatedAt = DateTime.UtcNow;
        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            // Taken by a registration between the check and the save (UX_Users_Email).
            return OperationResult<SettingsDto>.Fail(emailTaken);
        }

        return await GetAsync();
    }

    public async Task<OperationResult<SettingsDto>> UpdatePreferencesAsync(PreferencesRequest request)
    {
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == db.CurrentUserId);
        if (user is null)
        {
            return OperationResult<SettingsDto>.Fail(NoUser);
        }

        var timeZone = string.IsNullOrWhiteSpace(request.TimeZone) ? null : request.TimeZone.Trim();
        if (timeZone is not null && !LifeStoryService.TryFindZone(timeZone, out _))
        {
            return OperationResult<SettingsDto>.Fail("Pick a timezone from the list.");
        }

        var currency = string.IsNullOrWhiteSpace(request.BaseCurrency) ? null : request.BaseCurrency.Trim().ToUpperInvariant();
        if (currency is not null && Currencies().All(c => c.Code != currency))
        {
            return OperationResult<SettingsDto>.Fail("Pick a currency from the list.");
        }

        var modules = request.HiddenModules.Distinct(StringComparer.Ordinal).ToList();
        if (modules.FirstOrDefault(m => !ModuleKeys.All.Contains(m)) is { } unknownModule)
        {
            return OperationResult<SettingsDto>.Fail($"There's no module called '{unknownModule}'.");
        }

        var areaIds = request.HiddenLifeAreaIds.Distinct().ToList();
        var knownAreas = await db.LifeAreas.Select(a => a.Id).ToListAsync();
        if (areaIds.Any(id => !knownAreas.Contains(id)))
        {
            return OperationResult<SettingsDto>.Fail("Pick life areas from the list.");
        }

        if (areaIds.Count == knownAreas.Count)
        {
            // Goals need a life area, so at least one has to stay on.
            return OperationResult<SettingsDto>.Fail("Keep at least one life area switched on.");
        }

        var now = DateTime.UtcNow;
        await using var transaction = await db.Database.BeginTransactionAsync();

        user.TimeZone = timeZone;
        user.BaseCurrency = currency;
        user.UpdatedAt = now;

        // Rows for switched-on things are soft-deleted; newly hidden ones added; unchanged ones left alone.
        var storedModules = await db.UserHiddenModules.ToListAsync();
        foreach (var row in storedModules.Where(r => !modules.Contains(r.ModuleKey)))
        {
            row.IsDeleted = true;
            row.DeletedAt = now;
        }

        db.UserHiddenModules.AddRange(modules
            .Where(m => storedModules.All(r => r.ModuleKey != m))
            .Select(m => new UserHiddenModule { UserId = user.Id, ModuleKey = m }));

        var storedAreas = await db.UserHiddenLifeAreas.ToListAsync();
        foreach (var row in storedAreas.Where(r => !areaIds.Contains(r.LifeAreaId)))
        {
            row.IsDeleted = true;
            row.DeletedAt = now;
        }

        db.UserHiddenLifeAreas.AddRange(areaIds
            .Where(id => storedAreas.All(r => r.LifeAreaId != id))
            .Select(id => new UserHiddenLifeArea { UserId = user.Id, LifeAreaId = id }));

        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            // The same change saved twice at once (a double click): the other request already did it.
            return OperationResult<SettingsDto>.Fail("Those settings were just saved elsewhere. Reload and try again.");
        }

        await transaction.CommitAsync();
        return await GetAsync();
    }
}
