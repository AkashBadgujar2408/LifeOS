using System.Linq.Expressions;
using LifeOS.Core.Calendar.ServiceContracts;
using LifeOS.Core.Career.Services;
using LifeOS.Core.Home.DTOs;
using LifeOS.Core.Home.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using LifeOS.Core.Shared.Services;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Home.Services;

/// <summary>Homes (and land, offices) you own, rent or stay in. The deed or rent agreement is a linked Document.</summary>
public class PropertiesService(
    AppDbContext db,
    IWarrantiesService warrantiesService,
    IEntityLinksService entityLinksService,
    IRemindersService remindersService) : IPropertiesService
{
    private const string NotFound = "Property not found.";
    private const string Duplicate = "You already have a property with that name.";

    public async Task<List<PropertyDto>> GetAllAsync() =>
        // Where you live now first, then the ones you've left; A–Z inside.
        await db.Properties.OrderBy(p => p.MovedOutOn != null).ThenBy(p => p.Name).Select(ToDto).ToListAsync();

    public async Task<OperationResult<PropertyDto>> GetAsync(int id)
    {
        var property = await db.Properties.Where(p => p.Id == id).Select(ToDto).FirstOrDefaultAsync();
        return property is null ? OperationResult<PropertyDto>.Fail(NotFound) : OperationResult<PropertyDto>.Ok(property);
    }

    public async Task<OperationResult<PropertyDto>> CreateAsync(PropertyRequest request)
    {
        var property = new Property { UserId = db.CurrentUserId!.Value };
        var error = await ApplyAsync(property, request, null);
        if (error is not null)
        {
            return OperationResult<PropertyDto>.Fail(error);
        }

        db.Properties.Add(property);
        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            return OperationResult<PropertyDto>.Fail(Duplicate);
        }

        return await GetAsync(property.Id);
    }

    public async Task<OperationResult<PropertyDto>> UpdateAsync(int id, PropertyRequest request)
    {
        var property = await db.Properties.FindAsync(id);
        if (property is null)
        {
            return OperationResult<PropertyDto>.Fail(NotFound);
        }

        var error = await ApplyAsync(property, request, id);
        if (error is not null)
        {
            return OperationResult<PropertyDto>.Fail(error);
        }

        property.UpdatedAt = DateTime.UtcNow;
        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            return OperationResult<PropertyDto>.Fail(Duplicate);
        }

        return await GetAsync(id);
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var property = await db.Properties.FindAsync(id);
        if (property is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        var now = DateTime.UtcNow;
        await using var transaction = await db.Database.BeginTransactionAsync();
        await db.Assets.Where(a => a.PropertyId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(a => a.PropertyId, (int?)null).SetProperty(a => a.UpdatedAt, now));
        await db.MaintenanceTasks.Where(m => m.PropertyId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(m => m.PropertyId, (int?)null).SetProperty(m => m.UpdatedAt, now));
        await db.UtilityBills.Where(b => b.PropertyId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(b => b.PropertyId, (int?)null).SetProperty(b => b.UpdatedAt, now));
        await db.HouseholdProjects.Where(h => h.PropertyId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(h => h.PropertyId, (int?)null).SetProperty(h => h.UpdatedAt, now));
        await warrantiesService.RemoveAsync(await db.Warranties.Where(w => w.PropertyId == id).Select(w => w.Id).ToListAsync());
        property.IsDeleted = true;
        property.DeletedAt = now;
        await db.SaveChangesAsync();
        await entityLinksService.RemoveAllForEntityAsync(PropertyLinkableProvider.Type, id);
        await remindersService.RemoveAllForEntityAsync(PropertyLinkableProvider.Type, id);
        await transaction.CommitAsync();
        return OperationResult<bool>.Ok(true);
    }

    private async Task<string?> ApplyAsync(Property property, PropertyRequest request, int? id)
    {
        var name = request.Name.Trim();
        if (name.Length == 0)
        {
            return "Name the property (e.g. Flat 4B, Pune).";
        }

        var currency = request.PurchasePrice is null ? null : CareerRules.Currency(request.Currency);
        var error = HomeRules.CheckProperty(
            request.Kind, request.Ownership, request.MovedInOn, request.MovedOutOn, request.PurchasedOn, request.PurchasePrice, currency);
        if (error is not null)
        {
            return error;
        }

        if (await db.Properties.AnyAsync(p => p.Name == name && p.Id != id))
        {
            return Duplicate;
        }

        property.Name = name;
        property.Kind = request.Kind;
        property.Ownership = request.Ownership;
        property.Address = Clean(request.Address);
        property.MovedInOn = request.MovedInOn;
        property.MovedOutOn = request.MovedOutOn;
        property.PurchasedOn = request.PurchasedOn;
        property.PurchasePrice = request.PurchasePrice;
        property.Currency = currency;
        property.Notes = Clean(request.Notes);
        return null;
    }

    private static string? Clean(string? text) => string.IsNullOrWhiteSpace(text) ? null : text.Trim();

    private static readonly Expression<Func<Property, PropertyDto>> ToDto = p => new PropertyDto
    {
        Id = p.Id,
        Name = p.Name,
        Kind = p.Kind,
        Ownership = p.Ownership,
        Address = p.Address,
        MovedInOn = p.MovedInOn,
        MovedOutOn = p.MovedOutOn,
        PurchasedOn = p.PurchasedOn,
        PurchasePrice = p.PurchasePrice,
        Currency = p.Currency,
        Notes = p.Notes,
        AssetCount = p.Assets.Count(a => a.DisposedOn == null),
    };
}
