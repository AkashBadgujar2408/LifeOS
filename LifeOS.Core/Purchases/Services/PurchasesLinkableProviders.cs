using System.Globalization;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Purchases.Services;

/// <summary>Purchases: linked (the item they became, receipts in Documents), reminders, found by what or where.</summary>
public class PurchaseLinkableProvider(AppDbContext db) : ILinkableEntityProvider
{
    public const string Type = "Purchase";

    public string EntityType => Type;

    public string DisplayName => "Purchase";

    public async Task<Dictionary<int, string>> GetTitlesAsync(IReadOnlyCollection<int> ids) =>
        (await Titled(db.Purchases.Where(p => ids.Contains(p.Id)))).ToDictionary(p => p.EntityId, p => p.Title);

    public async Task<List<LinkableItemDto>> SearchAsync(string? search, int take)
    {
        var query = db.Purchases.AsQueryable();
        if (!string.IsNullOrEmpty(search))
        {
            query = query.Where(p => p.Title.Contains(search) || (p.Store != null && p.Store.Contains(search)));
        }

        return await Titled(query.OrderByDescending(p => p.PurchasedOn).Take(take));
    }

    /// <summary>"Kettle (Croma, 12/Oct/2026)" — the date formatted here, not in SQL.</summary>
    private static async Task<List<LinkableItemDto>> Titled(IQueryable<Purchase> query) =>
        (await query.Select(p => new { p.Id, p.Title, p.Store, p.PurchasedOn }).ToListAsync())
            .Select(p => new LinkableItemDto
            {
                EntityType = Type,
                EntityId = p.Id,
                Title = $"{p.Title} ({(p.Store is null ? string.Empty : p.Store + ", ")}" +
                    $"{p.PurchasedOn.ToString("dd'/'MMM'/'yyyy", CultureInfo.InvariantCulture)})",
            })
            .ToList();
}

/// <summary>Shopping lists: linked (an event, a trip), reminders ("shop on Saturday"), found by name.</summary>
public class ShoppingListLinkableProvider(AppDbContext db) : ILinkableEntityProvider
{
    public const string Type = "ShoppingList";

    public string EntityType => Type;

    public string DisplayName => "Shopping list";

    public async Task<Dictionary<int, string>> GetTitlesAsync(IReadOnlyCollection<int> ids) =>
        await db.ShoppingLists.Where(l => ids.Contains(l.Id)).ToDictionaryAsync(l => l.Id, l => l.Name);

    public async Task<List<LinkableItemDto>> SearchAsync(string? search, int take)
    {
        var query = db.ShoppingLists.AsQueryable();
        if (!string.IsNullOrEmpty(search))
        {
            query = query.Where(l => l.Name.Contains(search) || l.ShoppingListItems.Any(i => i.Name.Contains(search)));
        }

        return await query
            .OrderBy(l => l.IsArchived).ThenBy(l => l.Name)
            .Take(take)
            .Select(l => new LinkableItemDto { EntityType = Type, EntityId = l.Id, Title = l.Name })
            .ToListAsync();
    }
}

/// <summary>Wishlist items: linked (a savings goal), reminders, found by name or store.</summary>
public class WishlistItemLinkableProvider(AppDbContext db) : ILinkableEntityProvider
{
    public const string Type = "WishlistItem";

    public string EntityType => Type;

    public string DisplayName => "Wish";

    public async Task<Dictionary<int, string>> GetTitlesAsync(IReadOnlyCollection<int> ids) =>
        await db.WishlistItems.Where(w => ids.Contains(w.Id)).ToDictionaryAsync(w => w.Id, w => w.Name);

    public async Task<List<LinkableItemDto>> SearchAsync(string? search, int take)
    {
        var query = db.WishlistItems.AsQueryable();
        if (!string.IsNullOrEmpty(search))
        {
            query = query.Where(w => w.Name.Contains(search) || (w.Store != null && w.Store.Contains(search)));
        }

        return await query
            .OrderBy(w => w.PurchaseId != null).ThenBy(w => w.Name)
            .Take(take)
            .Select(w => new LinkableItemDto { EntityType = Type, EntityId = w.Id, Title = w.Name })
            .ToListAsync();
    }
}

/// <summary>Returns: reminders ("ship it back"), found by the purchase's title.</summary>
public class ReturnLinkableProvider(AppDbContext db) : ILinkableEntityProvider
{
    public const string Type = "Return";

    public string EntityType => Type;

    public string DisplayName => "Return";

    public async Task<Dictionary<int, string>> GetTitlesAsync(IReadOnlyCollection<int> ids) =>
        await db.Returns.Where(r => ids.Contains(r.Id))
            .Select(r => new { r.Id, Title = "Return: " + r.Purchase.Title })
            .ToDictionaryAsync(r => r.Id, r => r.Title);

    public async Task<List<LinkableItemDto>> SearchAsync(string? search, int take)
    {
        var query = db.Returns.AsQueryable();
        if (!string.IsNullOrEmpty(search))
        {
            query = query.Where(r => r.Purchase.Title.Contains(search) || (r.Purchase.Store != null && r.Purchase.Store.Contains(search)));
        }

        return await query
            .OrderByDescending(r => r.Id)
            .Take(take)
            .Select(r => new LinkableItemDto { EntityType = Type, EntityId = r.Id, Title = "Return: " + r.Purchase.Title })
            .ToListAsync();
    }
}
