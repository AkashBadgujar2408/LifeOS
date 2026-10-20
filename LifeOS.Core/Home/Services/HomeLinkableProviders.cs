using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Home.Services;

/// <summary>Properties can be linked (deeds, rent agreements in Documents), have reminders and be found by search.</summary>
public class PropertyLinkableProvider(AppDbContext db) : ILinkableEntityProvider
{
    public const string Type = "Property";

    public string EntityType => Type;

    public string DisplayName => "Property";

    public async Task<Dictionary<int, string>> GetTitlesAsync(IReadOnlyCollection<int> ids) =>
        await db.Properties.Where(p => ids.Contains(p.Id)).ToDictionaryAsync(p => p.Id, p => p.Name);

    public async Task<List<LinkableItemDto>> SearchAsync(string? search, int take)
    {
        var query = db.Properties.AsQueryable();
        if (!string.IsNullOrEmpty(search))
        {
            query = query.Where(p => p.Name.Contains(search) || (p.Address != null && p.Address.Contains(search)));
        }

        return await query
            .OrderBy(p => p.Name)
            .Take(take)
            .Select(p => new LinkableItemDto { EntityType = Type, EntityId = p.Id, Title = p.Name })
            .ToListAsync();
    }
}

/// <summary>Things in the inventory: linked (bills, manuals), reminders, found by name, brand, model or serial number.</summary>
public class AssetLinkableProvider(AppDbContext db) : ILinkableEntityProvider
{
    public const string Type = "Asset";

    public string EntityType => Type;

    public string DisplayName => "Belonging";

    public async Task<Dictionary<int, string>> GetTitlesAsync(IReadOnlyCollection<int> ids) =>
        await db.Assets.Where(a => ids.Contains(a.Id)).ToDictionaryAsync(a => a.Id, a => a.Name);

    public async Task<List<LinkableItemDto>> SearchAsync(string? search, int take)
    {
        var query = db.Assets.AsQueryable();
        if (!string.IsNullOrEmpty(search))
        {
            query = query.Where(a => a.Name.Contains(search)
                || (a.Brand != null && a.Brand.Contains(search))
                || (a.Model != null && a.Model.Contains(search))
                || (a.SerialNumber != null && a.SerialNumber.Contains(search)));
        }

        return await query
            .OrderBy(a => a.DisposedOn != null).ThenBy(a => a.Name)
            .Take(take)
            .Select(a => new LinkableItemDto { EntityType = Type, EntityId = a.Id, Title = a.Name })
            .ToListAsync();
    }
}

/// <summary>Vehicles: linked (RC, PUC certificate in Documents), reminders, found by name, make, model or registration.</summary>
public class VehicleLinkableProvider(AppDbContext db) : ILinkableEntityProvider
{
    public const string Type = "Vehicle";

    public string EntityType => Type;

    public string DisplayName => "Vehicle";

    public async Task<Dictionary<int, string>> GetTitlesAsync(IReadOnlyCollection<int> ids) =>
        await db.Vehicles.Where(v => ids.Contains(v.Id)).ToDictionaryAsync(v => v.Id, v => v.Name);

    public async Task<List<LinkableItemDto>> SearchAsync(string? search, int take)
    {
        var query = db.Vehicles.AsQueryable();
        if (!string.IsNullOrEmpty(search))
        {
            query = query.Where(v => v.Name.Contains(search)
                || (v.Make != null && v.Make.Contains(search))
                || (v.Model != null && v.Model.Contains(search))
                || (v.RegistrationNumber != null && v.RegistrationNumber.Contains(search)));
        }

        return await query
            .OrderBy(v => v.DisposedOn != null).ThenBy(v => v.Name)
            .Take(take)
            .Select(v => new LinkableItemDto { EntityType = Type, EntityId = v.Id, Title = v.Name })
            .ToListAsync();
    }
}

/// <summary>Warranties and AMCs ("Fridge — warranty"): linked (the warranty card), reminders, found by what they cover or the provider.</summary>
public class WarrantyLinkableProvider(AppDbContext db) : ILinkableEntityProvider
{
    public const string Type = "Warranty";

    public string EntityType => Type;

    public string DisplayName => "Warranty";

    public async Task<Dictionary<int, string>> GetTitlesAsync(IReadOnlyCollection<int> ids) =>
        (await Titled(db.Warranties.Where(w => ids.Contains(w.Id))).ToListAsync()).ToDictionary(w => w.EntityId, w => w.Title);

    public async Task<List<LinkableItemDto>> SearchAsync(string? search, int take)
    {
        var query = db.Warranties.AsQueryable();
        if (!string.IsNullOrEmpty(search))
        {
            query = query.Where(w => (w.Provider != null && w.Provider.Contains(search))
                || (w.Asset != null && w.Asset.Name.Contains(search))
                || (w.Vehicle != null && w.Vehicle.Name.Contains(search))
                || (w.Property != null && w.Property.Name.Contains(search)));
        }

        return await Titled(query.OrderBy(w => w.ExpiresOn)).Take(take).ToListAsync();
    }

    private static IQueryable<LinkableItemDto> Titled(IQueryable<Warranty> query) =>
        query.Select(w => new LinkableItemDto
        {
            EntityType = Type,
            EntityId = w.Id,
            Title = (w.Asset != null ? w.Asset.Name : w.Vehicle != null ? w.Vehicle.Name : w.Property != null ? w.Property.Name : "")
                + (w.Kind == "AMC" ? " — AMC" : w.Kind == "Extended" ? " — extended warranty" : " — warranty"),
        });
}

/// <summary>Maintenance tasks: linked, reminders, found by title.</summary>
public class MaintenanceTaskLinkableProvider(AppDbContext db) : ILinkableEntityProvider
{
    public const string Type = "MaintenanceTask";

    public string EntityType => Type;

    public string DisplayName => "Maintenance";

    public async Task<Dictionary<int, string>> GetTitlesAsync(IReadOnlyCollection<int> ids) =>
        await db.MaintenanceTasks.Where(m => ids.Contains(m.Id)).ToDictionaryAsync(m => m.Id, m => m.Title);

    public async Task<List<LinkableItemDto>> SearchAsync(string? search, int take)
    {
        var query = db.MaintenanceTasks.AsQueryable();
        if (!string.IsNullOrEmpty(search))
        {
            query = query.Where(m => m.Title.Contains(search));
        }

        return await query
            .OrderBy(m => m.Title)
            .Take(take)
            .Select(m => new LinkableItemDto { EntityType = Type, EntityId = m.Id, Title = m.Title })
            .ToListAsync();
    }
}
