using LifeOS.Core.Calendar.ServiceContracts;
using LifeOS.Core.Career.Services;
using LifeOS.Core.Models;
using LifeOS.Core.Purchases.DTOs;
using LifeOS.Core.Purchases.ServiceContracts;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using LifeOS.Core.Shared.Services;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Purchases.Services;

/// <summary>
/// Shopping lists and what's on them. Ticking an item puts it in the basket; recording a purchase for ticked items
/// (PurchasesService) marks them bought. What a list still costs is <see cref="PurchaseRules.EstimatedLeft"/>.
/// </summary>
public class ShoppingListsService(AppDbContext db, IEntityLinksService entityLinksService, IRemindersService remindersService)
    : IShoppingListsService
{
    private const string NotFound = "Shopping list not found.";
    private const string ItemNotFound = "Item not found.";
    private const string Duplicate = "You already have a list with that name.";

    public async Task<List<ShoppingListDto>> GetAllAsync(bool includeArchived)
    {
        var lists = await db.ShoppingLists
            .Where(l => includeArchived || !l.IsArchived)
            .OrderBy(l => l.IsArchived).ThenBy(l => l.Name)
            .Select(l => new
            {
                List = new ShoppingListDto
                {
                    Id = l.Id,
                    Name = l.Name,
                    IsArchived = l.IsArchived,
                    Notes = l.Notes,
                    ItemCount = l.ShoppingListItems.Count,
                    DoneCount = l.ShoppingListItems.Count(i => i.DoneAt != null),
                },
                Prices = l.ShoppingListItems.Select(i => new { Done = i.DoneAt != null, i.EstimatedPrice, i.Currency }).ToList(),
            })
            .AsSplitQuery()
            .ToListAsync();
        foreach (var row in lists)
        {
            row.List.EstimatedLeft = PurchaseRules.EstimatedLeft(row.Prices.Select(p => (p.Done, p.EstimatedPrice, p.Currency)));
        }

        return lists.Select(l => l.List).ToList();
    }

    public async Task<OperationResult<ShoppingListDto>> GetAsync(int id)
    {
        var list = await db.ShoppingLists.Where(l => l.Id == id)
            .Select(l => new ShoppingListDto { Id = l.Id, Name = l.Name, IsArchived = l.IsArchived, Notes = l.Notes })
            .FirstOrDefaultAsync();
        if (list is null)
        {
            return OperationResult<ShoppingListDto>.Fail(NotFound);
        }

        var items = await db.ShoppingListItems.Where(i => i.ListId == id)
            .OrderBy(i => i.DoneAt != null).ThenBy(i => i.SortOrder).ThenBy(i => i.Id)
            .Select(i => new ShoppingListItemDto
            {
                Id = i.Id,
                ListId = i.ListId,
                Name = i.Name,
                Quantity = i.Quantity,
                EstimatedPrice = i.EstimatedPrice,
                Currency = i.Currency,
                SortOrder = i.SortOrder,
                Done = i.DoneAt != null,
                PurchaseId = i.PurchaseId,
                PurchaseTitle = i.Purchase != null ? i.Purchase.Title : null,
            })
            .ToListAsync();
        return OperationResult<ShoppingListDto>.Ok(new ShoppingListDto
        {
            Id = list.Id,
            Name = list.Name,
            IsArchived = list.IsArchived,
            Notes = list.Notes,
            ItemCount = items.Count,
            DoneCount = items.Count(i => i.Done),
            Items = items,
            EstimatedLeft = PurchaseRules.EstimatedLeft(items.Select(i => (i.Done, i.EstimatedPrice, i.Currency))),
        });
    }

    public async Task<OperationResult<ShoppingListDto>> CreateAsync(ShoppingListRequest request)
    {
        var list = new ShoppingList { UserId = db.CurrentUserId!.Value };
        var error = await ApplyAsync(list, request, null);
        if (error is not null)
        {
            return OperationResult<ShoppingListDto>.Fail(error);
        }

        db.ShoppingLists.Add(list);
        return await SaveAsync(list);
    }

    public async Task<OperationResult<ShoppingListDto>> UpdateAsync(int id, ShoppingListRequest request)
    {
        var list = await db.ShoppingLists.FindAsync(id);
        if (list is null)
        {
            return OperationResult<ShoppingListDto>.Fail(NotFound);
        }

        var error = await ApplyAsync(list, request, id);
        if (error is not null)
        {
            return OperationResult<ShoppingListDto>.Fail(error);
        }

        list.UpdatedAt = DateTime.UtcNow;
        return await SaveAsync(list);
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var list = await db.ShoppingLists.FindAsync(id);
        if (list is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        var now = DateTime.UtcNow;
        await using var transaction = await db.Database.BeginTransactionAsync();
        // Its items go with it; purchases made from them stay.
        await db.ShoppingListItems.Where(i => i.ListId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(i => i.IsDeleted, true).SetProperty(i => i.DeletedAt, now));
        list.IsDeleted = true;
        list.DeletedAt = now;
        await db.SaveChangesAsync();
        await entityLinksService.RemoveAllForEntityAsync(ShoppingListLinkableProvider.Type, id);
        await remindersService.RemoveAllForEntityAsync(ShoppingListLinkableProvider.Type, id);
        await transaction.CommitAsync();
        return OperationResult<bool>.Ok(true);
    }

    public async Task<OperationResult<ShoppingListDto>> AddItemAsync(int listId, ShoppingListItemRequest request)
    {
        var list = await db.ShoppingLists.FindAsync(listId);
        if (list is null)
        {
            return OperationResult<ShoppingListDto>.Fail(NotFound);
        }

        var item = new ShoppingListItem
        {
            UserId = list.UserId,
            ListId = listId,
            // New items go to the end of what's still to buy.
            SortOrder = (await db.ShoppingListItems.Where(i => i.ListId == listId).MaxAsync(i => (int?)i.SortOrder) ?? 0) + 1,
        };
        var error = ApplyItem(item, request);
        if (error is not null)
        {
            return OperationResult<ShoppingListDto>.Fail(error);
        }

        db.ShoppingListItems.Add(item);
        await db.SaveChangesAsync();
        return await GetAsync(listId);
    }

    public async Task<OperationResult<ShoppingListDto>> UpdateItemAsync(int listId, int itemId, ShoppingListItemRequest request)
    {
        var item = await db.ShoppingListItems.FirstOrDefaultAsync(i => i.Id == itemId && i.ListId == listId);
        if (item is null)
        {
            return OperationResult<ShoppingListDto>.Fail(ItemNotFound);
        }

        var error = ApplyItem(item, request);
        if (error is not null)
        {
            return OperationResult<ShoppingListDto>.Fail(error);
        }

        item.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return await GetAsync(listId);
    }

    public async Task<OperationResult<ShoppingListDto>> SetDoneAsync(int listId, int itemId, bool done)
    {
        var item = await db.ShoppingListItems.FirstOrDefaultAsync(i => i.Id == itemId && i.ListId == listId);
        if (item is null)
        {
            return OperationResult<ShoppingListDto>.Fail(ItemNotFound);
        }

        if (!done && item.PurchaseId is not null)
        {
            return OperationResult<ShoppingListDto>.Fail("It's part of a purchase — delete that purchase to put it back on the list.");
        }

        item.DoneAt = done ? item.DoneAt ?? DateTime.UtcNow : null;
        item.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return await GetAsync(listId);
    }

    public async Task<OperationResult<ShoppingListDto>> RemoveItemAsync(int listId, int itemId)
    {
        var item = await db.ShoppingListItems.FirstOrDefaultAsync(i => i.Id == itemId && i.ListId == listId);
        if (item is null)
        {
            return OperationResult<ShoppingListDto>.Fail(ItemNotFound);
        }

        item.IsDeleted = true;
        item.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return await GetAsync(listId);
    }

    public async Task<OperationResult<ShoppingListDto>> ClearDoneAsync(int listId)
    {
        if (!await db.ShoppingLists.AnyAsync(l => l.Id == listId))
        {
            return OperationResult<ShoppingListDto>.Fail(NotFound);
        }

        var now = DateTime.UtcNow;
        await db.ShoppingListItems.Where(i => i.ListId == listId && i.DoneAt != null)
            .ExecuteUpdateAsync(s => s.SetProperty(i => i.IsDeleted, true).SetProperty(i => i.DeletedAt, now));
        return await GetAsync(listId);
    }

    public async Task<OperationResult<ShoppingListDto>> ReorderAsync(int listId, IReadOnlyList<int> itemIds)
    {
        var items = await db.ShoppingListItems.Where(i => i.ListId == listId).ToListAsync();
        if (!await db.ShoppingLists.AnyAsync(l => l.Id == listId))
        {
            return OperationResult<ShoppingListDto>.Fail(NotFound);
        }

        if (itemIds.Count != items.Count || itemIds.Distinct().Count() != items.Count || items.Any(i => !itemIds.Contains(i.Id)))
        {
            return OperationResult<ShoppingListDto>.Fail("Send every item of the list once, in the new order.");
        }

        var now = DateTime.UtcNow;
        for (var position = 0; position < itemIds.Count; position++)
        {
            var item = items.First(i => i.Id == itemIds[position]);
            if (item.SortOrder != position + 1)
            {
                item.SortOrder = position + 1;
                item.UpdatedAt = now;
            }
        }

        await db.SaveChangesAsync();
        return await GetAsync(listId);
    }

    private async Task<string?> ApplyAsync(ShoppingList list, ShoppingListRequest request, int? id)
    {
        var name = request.Name.Trim();
        if (name.Length == 0)
        {
            return "Name the list (e.g. Groceries).";
        }

        if (await db.ShoppingLists.AnyAsync(l => l.Name == name && l.Id != id))
        {
            return Duplicate;
        }

        list.Name = name;
        list.IsArchived = request.IsArchived;
        list.Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
        return null;
    }

    private static string? ApplyItem(ShoppingListItem item, ShoppingListItemRequest request)
    {
        var currency = request.EstimatedPrice is null ? null : CareerRules.Currency(request.Currency);
        var error = PurchaseRules.CheckListItem(request.Name, request.EstimatedPrice, currency);
        if (error is not null)
        {
            return error;
        }

        item.Name = request.Name.Trim();
        item.Quantity = string.IsNullOrWhiteSpace(request.Quantity) ? null : request.Quantity.Trim();
        item.EstimatedPrice = request.EstimatedPrice;
        item.Currency = currency;
        return null;
    }

    private async Task<OperationResult<ShoppingListDto>> SaveAsync(ShoppingList list)
    {
        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            return OperationResult<ShoppingListDto>.Fail(Duplicate);
        }

        return await GetAsync(list.Id);
    }
}

/// <summary>The wishlist: what you'd like, what you'd pay, how much you want it. Buying one is a purchase.</summary>
public class WishlistService(AppDbContext db, IEntityLinksService entityLinksService, IRemindersService remindersService)
    : IWishlistService
{
    private const string NotFound = "Wishlist item not found.";

    public async Task<List<WishlistItemDto>> GetAllAsync() =>
        PurchaseRules.WishlistOrder(Fill(await db.WishlistItems.Select(ToDto).ToListAsync()));

    public async Task<OperationResult<WishlistItemDto>> GetAsync(int id)
    {
        var item = await db.WishlistItems.Where(w => w.Id == id).Select(ToDto).FirstOrDefaultAsync();
        return item is null ? OperationResult<WishlistItemDto>.Fail(NotFound) : OperationResult<WishlistItemDto>.Ok(Fill([item])[0]);
    }

    public async Task<OperationResult<WishlistItemDto>> CreateAsync(WishlistItemRequest request)
    {
        var item = new WishlistItem { UserId = db.CurrentUserId!.Value };
        var error = Apply(item, request);
        if (error is not null)
        {
            return OperationResult<WishlistItemDto>.Fail(error);
        }

        db.WishlistItems.Add(item);
        await db.SaveChangesAsync();
        return await GetAsync(item.Id);
    }

    public async Task<OperationResult<WishlistItemDto>> UpdateAsync(int id, WishlistItemRequest request)
    {
        var item = await db.WishlistItems.FindAsync(id);
        if (item is null)
        {
            return OperationResult<WishlistItemDto>.Fail(NotFound);
        }

        var error = Apply(item, request);
        if (error is not null)
        {
            return OperationResult<WishlistItemDto>.Fail(error);
        }

        item.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return await GetAsync(id);
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var item = await db.WishlistItems.FindAsync(id);
        if (item is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        await using var transaction = await db.Database.BeginTransactionAsync();
        item.IsDeleted = true;
        item.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        await entityLinksService.RemoveAllForEntityAsync(WishlistItemLinkableProvider.Type, id);
        await remindersService.RemoveAllForEntityAsync(WishlistItemLinkableProvider.Type, id);
        await transaction.CommitAsync();
        return OperationResult<bool>.Ok(true);
    }

    private static string? Apply(WishlistItem item, WishlistItemRequest request)
    {
        var url = string.IsNullOrWhiteSpace(request.Url) ? null : request.Url.Trim();
        var currency = request.Price is null && request.TargetPrice is null ? null : CareerRules.Currency(request.Currency);
        var error = PurchaseRules.CheckWish(request.Name, url, request.Price, request.TargetPrice, currency, request.Priority);
        if (error is not null)
        {
            return error;
        }

        item.Name = request.Name.Trim();
        item.Store = string.IsNullOrWhiteSpace(request.Store) ? null : request.Store.Trim();
        item.Url = url;
        item.Price = request.Price;
        item.TargetPrice = request.TargetPrice;
        item.Currency = currency;
        item.Priority = request.Priority;
        item.Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
        return null;
    }

    private static List<WishlistItemDto> Fill(List<WishlistItemDto> items)
    {
        items.ForEach(i => i.AtTarget = PurchaseRules.AtTarget(i.Price, i.TargetPrice));
        return items;
    }

    private static readonly System.Linq.Expressions.Expression<Func<WishlistItem, WishlistItemDto>> ToDto = w => new WishlistItemDto
    {
        Id = w.Id,
        Name = w.Name,
        Store = w.Store,
        Url = w.Url,
        Price = w.Price,
        TargetPrice = w.TargetPrice,
        Currency = w.Currency,
        Priority = w.Priority,
        Notes = w.Notes,
        PurchaseId = w.PurchaseId,
        PurchasedOn = w.Purchase != null ? w.Purchase.PurchasedOn : null,
    };
}
