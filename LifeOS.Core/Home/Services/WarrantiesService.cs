using System.Linq.Expressions;
using LifeOS.Core.Calendar.ServiceContracts;
using LifeOS.Core.Career.Services;
using LifeOS.Core.Home.DTOs;
using LifeOS.Core.Home.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Home.Services;

/// <summary>
/// Warranties, extended warranties and AMCs on exactly one asset, vehicle or property, each with an expiry reminder
/// owned here (through <see cref="HomeReminders"/>). The warranty card itself is a linked Document.
/// </summary>
public class WarrantiesService(
    AppDbContext db,
    HomeReminders homeReminders,
    IEntityLinksService entityLinksService,
    IRemindersService remindersService) : IWarrantiesService
{
    private const string NotFound = "Warranty not found.";

    public async Task<List<WarrantyDto>> GetAllAsync() =>
        await db.Warranties.OrderBy(w => w.ExpiresOn).ThenBy(w => w.Id).Select(ToDto).ToListAsync();

    public async Task<OperationResult<WarrantyDto>> GetAsync(int id)
    {
        var warranty = await db.Warranties.Where(w => w.Id == id).Select(ToDto).FirstOrDefaultAsync();
        return warranty is null ? OperationResult<WarrantyDto>.Fail(NotFound) : OperationResult<WarrantyDto>.Ok(warranty);
    }

    public async Task<OperationResult<WarrantyDto>> CreateAsync(WarrantyRequest request)
    {
        var warranty = new Warranty { UserId = db.CurrentUserId!.Value };
        var (error, coverName) = await ApplyAsync(warranty, request);
        if (error is not null)
        {
            return OperationResult<WarrantyDto>.Fail(error);
        }

        await using var transaction = await db.Database.BeginTransactionAsync();
        db.Warranties.Add(warranty);
        await db.SaveChangesAsync();
        var reminderError = await SyncReminderAsync(warranty, coverName!, request.TimeZone);
        if (reminderError is not null)
        {
            return OperationResult<WarrantyDto>.Fail(reminderError);
        }

        await transaction.CommitAsync();
        return await GetAsync(warranty.Id);
    }

    public async Task<OperationResult<WarrantyDto>> UpdateAsync(int id, WarrantyRequest request)
    {
        var warranty = await db.Warranties.FindAsync(id);
        if (warranty is null)
        {
            return OperationResult<WarrantyDto>.Fail(NotFound);
        }

        var (error, coverName) = await ApplyAsync(warranty, request);
        if (error is not null)
        {
            return OperationResult<WarrantyDto>.Fail(error);
        }

        warranty.UpdatedAt = DateTime.UtcNow;
        await using var transaction = await db.Database.BeginTransactionAsync();
        await db.SaveChangesAsync();
        var reminderError = await SyncReminderAsync(warranty, coverName!, request.TimeZone);
        if (reminderError is not null)
        {
            return OperationResult<WarrantyDto>.Fail(reminderError);
        }

        await transaction.CommitAsync();
        return await GetAsync(id);
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        if (!await db.Warranties.AnyAsync(w => w.Id == id))
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        await using var transaction = await db.Database.BeginTransactionAsync();
        await RemoveAsync([id]);
        await transaction.CommitAsync();
        return OperationResult<bool>.Ok(true);
    }

    public async Task RemoveAsync(IReadOnlyCollection<int> ids)
    {
        if (ids.Count == 0)
        {
            return;
        }

        var now = DateTime.UtcNow;
        await db.Warranties.Where(w => ids.Contains(w.Id))
            .ExecuteUpdateAsync(s => s.SetProperty(w => w.IsDeleted, true).SetProperty(w => w.DeletedAt, now));
        foreach (var id in ids)
        {
            // The warranty card stays in Documents; only the link goes. Includes the expiry reminder.
            await entityLinksService.RemoveAllForEntityAsync(WarrantyLinkableProvider.Type, id);
            await remindersService.RemoveAllForEntityAsync(WarrantyLinkableProvider.Type, id);
        }
    }

    private async Task<(string? Error, string? CoverName)> ApplyAsync(Warranty warranty, WarrantyRequest request)
    {
        var currency = request.Cost is null ? null : CareerRules.Currency(request.Currency);
        var error = HomeRules.CheckWarranty(
            request.Kind, request.CoverType, request.StartsOn, request.ExpiresOn, request.Cost, currency, request.ReminderDays)
            ?? HomeReminders.CheckZone(request.TimeZone);
        if (error is not null)
        {
            return (error, null);
        }

        var coverName = request.CoverType switch
        {
            HomeTargets.Asset => await db.Assets.Where(a => a.Id == request.CoverId).Select(a => a.Name).FirstOrDefaultAsync(),
            HomeTargets.Vehicle => await db.Vehicles.Where(v => v.Id == request.CoverId).Select(v => v.Name).FirstOrDefaultAsync(),
            _ => await db.Properties.Where(p => p.Id == request.CoverId).Select(p => p.Name).FirstOrDefaultAsync(),
        };
        if (coverName is null)
        {
            return ("What it covers wasn't found.", null);
        }

        if (request.ContactId is { } contactId && !await db.Contacts.AnyAsync(c => c.Id == contactId))
        {
            return ("Contact not found.", null);
        }

        warranty.Kind = request.Kind;
        warranty.AssetId = request.CoverType == HomeTargets.Asset ? request.CoverId : null;
        warranty.VehicleId = request.CoverType == HomeTargets.Vehicle ? request.CoverId : null;
        warranty.PropertyId = request.CoverType == HomeTargets.Property ? request.CoverId : null;
        warranty.Provider = Clean(request.Provider);
        warranty.StartsOn = request.StartsOn;
        warranty.ExpiresOn = request.ExpiresOn;
        warranty.Cost = request.Cost;
        warranty.Currency = currency;
        warranty.ContactId = request.ContactId;
        warranty.ReminderDays = request.ReminderDays;
        warranty.Notes = Clean(request.Notes);
        return (null, coverName);
    }

    private async Task<string?> SyncReminderAsync(Warranty warranty, string coverName, string? zone)
    {
        var (reminderId, error) = await homeReminders.SyncAsync(
            warranty.ReminderId,
            new OwnedReminder(
                WarrantyLinkableProvider.Type,
                warranty.Id,
                warranty.ExpiresOn,
                warranty.ReminderDays,
                HomeRules.WarrantyReminderTitle(warranty.Kind, coverName, warranty.ExpiresOn),
                "Check it still works properly while repairs are free, and decide whether to extend the cover."),
            zone);
        if (error is not null)
        {
            return error;
        }

        if (warranty.ReminderId != reminderId)
        {
            warranty.ReminderId = reminderId;
            await db.SaveChangesAsync();
        }

        return null;
    }

    private static string? Clean(string? text) => string.IsNullOrWhiteSpace(text) ? null : text.Trim();

    private static readonly Expression<Func<Warranty, WarrantyDto>> ToDto = w => new WarrantyDto
    {
        Id = w.Id,
        Kind = w.Kind,
        CoverType = w.AssetId != null ? HomeTargets.Asset : w.VehicleId != null ? HomeTargets.Vehicle : HomeTargets.Property,
        CoverId = w.AssetId ?? w.VehicleId ?? w.PropertyId ?? 0,
        CoverName = w.Asset != null ? w.Asset.Name : w.Vehicle != null ? w.Vehicle.Name : w.Property != null ? w.Property.Name : "",
        CoverDisposed = (w.Asset != null && w.Asset.DisposedOn != null) || (w.Vehicle != null && w.Vehicle.DisposedOn != null),
        Provider = w.Provider,
        StartsOn = w.StartsOn,
        ExpiresOn = w.ExpiresOn,
        Cost = w.Cost,
        Currency = w.Currency,
        ContactId = w.ContactId,
        ContactName = w.Contact != null ? w.Contact.Name : null,
        ReminderDays = w.ReminderDays,
        Notes = w.Notes,
    };
}
