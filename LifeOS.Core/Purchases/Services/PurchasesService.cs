using System.Linq.Expressions;
using LifeOS.Core.Calendar.ServiceContracts;
using LifeOS.Core.Career.Services;
using LifeOS.Core.Finance.DTOs;
using LifeOS.Core.Finance.ServiceContracts;
using LifeOS.Core.Home.DTOs;
using LifeOS.Core.Home.ServiceContracts;
using LifeOS.Core.Home.Services;
using LifeOS.Core.Models;
using LifeOS.Core.Purchases.DTOs;
using LifeOS.Core.Purchases.ServiceContracts;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using LifeOS.Core.Shared.Services;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Purchases.Services;

/// <summary>
/// What you've bought. Creating a purchase can, in one transaction, record its Finance expense (through
/// <see cref="ITransactionsService"/>, stored once as TransactionId), add it to the Home inventory (through
/// <see cref="IAssetsService"/>, linked both ways) with its warranty (through <see cref="IWarrantiesService"/>, which
/// owns the expiry reminder), and mark the shopping-list items / wish it fulfils as bought. A purchase in Finance
/// can't change its amount, currency or day until the expense is taken back; deleting the purchase deletes its
/// expense but keeps the item it became.
/// </summary>
public class PurchasesService(
    AppDbContext db,
    ITransactionsService transactionsService,
    IAssetsService assetsService,
    IWarrantiesService warrantiesService,
    IAttachmentsService attachmentsService,
    IEntityLinksService entityLinksService,
    IRemindersService remindersService,
    IBenefitsService benefitsService) : IPurchasesService
{
    private const string NotFound = "Purchase not found.";

    public async Task<List<PurchaseDto>> GetAllAsync(DateOnly? from, DateOnly? to) =>
        await db.Purchases
            .Where(p => (from == null || p.PurchasedOn >= from) && (to == null || p.PurchasedOn <= to))
            .OrderByDescending(p => p.PurchasedOn).ThenByDescending(p => p.Id)
            .Select(ToDto)
            .ToListAsync();

    public async Task<OperationResult<PurchaseDto>> GetAsync(int id)
    {
        var purchase = await db.Purchases.Where(p => p.Id == id).Select(ToDto).FirstOrDefaultAsync();
        return purchase is null ? OperationResult<PurchaseDto>.Fail(NotFound) : OperationResult<PurchaseDto>.Ok(purchase);
    }

    public async Task<OperationResult<PurchaseDto>> CreateAsync(PurchaseRequest request)
    {
        var purchase = new Purchase { UserId = db.CurrentUserId!.Value };
        var error = await ApplyAsync(purchase, request);
        if (error is not null)
        {
            return OperationResult<PurchaseDto>.Fail(error);
        }

        if (request.Warranty is not null && request.Asset is null)
        {
            return OperationResult<PurchaseDto>.Fail("A warranty needs the item in your inventory — add it there too.");
        }

        if (request.Expense is not null && purchase.Amount == 0)
        {
            return OperationResult<PurchaseDto>.Fail("Nothing was paid, so there's no expense to record.");
        }

        var items = request.ShoppingListItemIds.Count == 0
            ? []
            : await db.ShoppingListItems.Where(i => request.ShoppingListItemIds.Contains(i.Id)).ToListAsync();
        if (items.Count != request.ShoppingListItemIds.Distinct().Count())
        {
            return OperationResult<PurchaseDto>.Fail("Shopping list item not found.");
        }

        if (items.Any(i => i.PurchaseId is not null))
        {
            return OperationResult<PurchaseDto>.Fail("Some of those items are already part of a purchase.");
        }

        WishlistItem? wish = null;
        if (request.WishlistItemId is { } wishId)
        {
            wish = await db.WishlistItems.FindAsync(wishId);
            if (wish is null)
            {
                return OperationResult<PurchaseDto>.Fail("Wishlist item not found.");
            }

            if (wish.PurchaseId is not null)
            {
                return OperationResult<PurchaseDto>.Fail("That wish was bought already.");
            }
        }

        await using var transaction = await db.Database.BeginOrJoinTransactionAsync();
        db.Purchases.Add(purchase);
        await db.SaveChangesAsync();
        await SetTagsAsync(purchase, request.TagIds);

        if (request.Expense is { } expense)
        {
            var expenseError = await RecordAsync(purchase, expense, request.TagIds);
            if (expenseError is not null)
            {
                return OperationResult<PurchaseDto>.Fail(expenseError);
            }
        }

        if (request.Asset is { } assetRequest)
        {
            var asset = await assetsService.CreateAsync(new AssetRequest
            {
                Name = string.IsNullOrWhiteSpace(assetRequest.Name) ? purchase.Title : assetRequest.Name.Trim(),
                PropertyId = assetRequest.PropertyId,
                Room = assetRequest.Room,
                Brand = assetRequest.Brand,
                Model = assetRequest.Model,
                SerialNumber = assetRequest.SerialNumber,
                Quantity = assetRequest.Quantity,
                PurchasedOn = purchase.PurchasedOn,
                PurchasePrice = purchase.Amount,
                Currency = purchase.Currency,
                TagIds = request.TagIds,
                Today = request.Today,
            });
            if (!asset.Success)
            {
                return OperationResult<PurchaseDto>.Fail(asset.Error!);
            }

            purchase.AssetId = asset.Data!.Id;
            await db.SaveChangesAsync();
            var link = await entityLinksService.CreateAsync(new CreateEntityLinkRequest
            {
                SourceEntityType = PurchaseLinkableProvider.Type,
                SourceEntityId = purchase.Id,
                TargetEntityType = AssetLinkableProvider.Type,
                TargetEntityId = asset.Data.Id,
            });
            if (!link.Success)
            {
                return OperationResult<PurchaseDto>.Fail(link.Error!);
            }

            if (request.Warranty is { } warranty)
            {
                var created = await warrantiesService.CreateAsync(new WarrantyRequest
                {
                    Kind = warranty.Kind,
                    CoverType = HomeTargets.Asset,
                    CoverId = asset.Data.Id,
                    Provider = warranty.Provider,
                    StartsOn = purchase.PurchasedOn,
                    ExpiresOn = warranty.ExpiresOn,
                    ReminderDays = warranty.ReminderDays,
                    TimeZone = request.TimeZone,
                });
                if (!created.Success)
                {
                    return OperationResult<PurchaseDto>.Fail(created.Error!);
                }
            }
        }

        var now = DateTime.UtcNow;
        foreach (var item in items)
        {
            item.PurchaseId = purchase.Id;
            item.DoneAt ??= now;
            item.UpdatedAt = now;
        }

        if (wish is not null)
        {
            wish.PurchaseId = purchase.Id;
            wish.UpdatedAt = now;
        }

        await db.SaveChangesAsync();

        // Vouchers, coupons or points used on it: each a use of that reward, on this purchase.
        if (request.Redemptions.Count > 0)
        {
            var redeemError = await benefitsService.RedeemOnPurchaseAsync(
                purchase.Id, purchase.PurchasedOn, request.Redemptions, request.Today, request.TimeZone);
            if (redeemError is not null)
            {
                return OperationResult<PurchaseDto>.Fail(redeemError);
            }
        }

        await transaction.CommitAsync();
        return await GetAsync(purchase.Id);
    }

    public async Task<OperationResult<PurchaseDto>> UpdateAsync(int id, PurchaseRequest request)
    {
        var purchase = await db.Purchases.FindAsync(id);
        if (purchase is null)
        {
            return OperationResult<PurchaseDto>.Fail(NotFound);
        }

        var before = (purchase.Amount, purchase.Currency, purchase.PurchasedOn);
        var error = await ApplyAsync(purchase, request);
        if (error is not null)
        {
            return OperationResult<PurchaseDto>.Fail(error);
        }

        // The ledger already has what was paid; changing it here would make the two disagree.
        if (purchase.TransactionId is not null && before != (purchase.Amount, purchase.Currency, purchase.PurchasedOn))
        {
            return OperationResult<PurchaseDto>.Fail("It's in Finance already — take the expense back first to change what you paid or the day.");
        }

        purchase.UpdatedAt = DateTime.UtcNow;
        await using var transaction = await db.Database.BeginOrJoinTransactionAsync();
        await db.SaveChangesAsync();
        await SetTagsAsync(purchase, request.TagIds);
        await transaction.CommitAsync();
        return await GetAsync(id);
    }

    public async Task<OperationResult<PurchaseDto>> RecordExpenseAsync(int id, PurchaseExpenseRequest request)
    {
        var purchase = await db.Purchases.FindAsync(id);
        if (purchase is null)
        {
            return OperationResult<PurchaseDto>.Fail(NotFound);
        }

        if (purchase.TransactionId is not null)
        {
            return OperationResult<PurchaseDto>.Fail("It's in Finance already.");
        }

        if (purchase.Amount == 0)
        {
            return OperationResult<PurchaseDto>.Fail("Nothing was paid, so there's no expense to record.");
        }

        var tagIds = await db.PurchaseTags.Where(t => t.PurchaseId == id).Select(t => t.TagId).ToListAsync();
        await using var transaction = await db.Database.BeginOrJoinTransactionAsync();
        var error = await RecordAsync(purchase, request, tagIds);
        if (error is not null)
        {
            return OperationResult<PurchaseDto>.Fail(error);
        }

        await transaction.CommitAsync();
        return await GetAsync(id);
    }

    public async Task<OperationResult<PurchaseDto>> RemoveExpenseAsync(int id)
    {
        var purchase = await db.Purchases.FindAsync(id);
        if (purchase is null)
        {
            return OperationResult<PurchaseDto>.Fail(NotFound);
        }

        if (purchase.TransactionId is { } transactionId)
        {
            // Deleting the expense also clears TransactionId here.
            var deleted = await transactionsService.DeleteAsync(transactionId);
            if (!deleted.Success)
            {
                return OperationResult<PurchaseDto>.Fail(deleted.Error!);
            }
        }

        return await GetAsync(id);
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var purchase = await db.Purchases.FindAsync(id);
        if (purchase is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        var now = DateTime.UtcNow;
        await using var transaction = await db.Database.BeginOrJoinTransactionAsync();
        // A purchase that didn't happen wasn't paid for: its expense goes too. The item it became stays yours.
        if (purchase.TransactionId is { } transactionId)
        {
            var deleted = await transactionsService.DeleteAsync(transactionId);
            if (!deleted.Success)
            {
                return OperationResult<bool>.Fail(deleted.Error!);
            }
        }

        await db.PurchaseTags.Where(t => t.PurchaseId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.IsDeleted, true).SetProperty(t => t.DeletedAt, now));
        await db.ShoppingListItems.Where(i => i.PurchaseId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(i => i.PurchaseId, (int?)null).SetProperty(i => i.UpdatedAt, now));
        await db.WishlistItems.Where(w => w.PurchaseId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(w => w.PurchaseId, (int?)null).SetProperty(w => w.UpdatedAt, now));
        await PurchaseReferences.ReleaseAsync(db, id, remindersService, now);
        await db.Purchases.Where(p => p.Id == id)
            .ExecuteUpdateAsync(s => s.SetProperty(p => p.IsDeleted, true).SetProperty(p => p.DeletedAt, now));
        await attachmentsService.RemoveAllForEntityAsync(PurchaseLinkableProvider.Type, id);
        await entityLinksService.RemoveAllForEntityAsync(PurchaseLinkableProvider.Type, id);
        await remindersService.RemoveAllForEntityAsync(PurchaseLinkableProvider.Type, id);
        await transaction.CommitAsync();
        return OperationResult<bool>.Ok(true);
    }

    public async Task<List<string>> StoresAsync() =>
        await db.Purchases.Where(p => p.Store != null)
            .GroupBy(p => p.Store!)
            .OrderByDescending(g => g.Count()).ThenBy(g => g.Key)
            .Select(g => g.Key)
            .Take(50)
            .ToListAsync();

    private async Task<string?> ApplyAsync(Purchase purchase, PurchaseRequest request)
    {
        if (request.Today == default)
        {
            return "Today's date is required.";
        }

        var currency = CareerRules.Currency(request.Currency);
        var error = PurchaseRules.CheckPurchase(request.Title, request.Amount, request.EstimatedAmount, currency, request.PurchasedOn, request.Today);
        if (error is not null)
        {
            return error;
        }

        var tagIds = request.TagIds.Distinct().ToList();
        if (tagIds.Count > 0 && await db.Tags.CountAsync(t => tagIds.Contains(t.Id)) != tagIds.Count)
        {
            return "Tag not found.";
        }

        purchase.Title = request.Title.Trim();
        purchase.Store = Clean(request.Store);
        purchase.PurchasedOn = request.PurchasedOn;
        purchase.Amount = request.Amount;
        purchase.EstimatedAmount = request.EstimatedAmount;
        purchase.Currency = currency!;
        purchase.Notes = Clean(request.Notes);
        return null;
    }

    /// <summary>The categories, replaced as a whole.</summary>
    private async Task SetTagsAsync(Purchase purchase, IEnumerable<int> tagIds)
    {
        var wanted = tagIds.ToHashSet();
        var current = await db.PurchaseTags.Where(t => t.PurchaseId == purchase.Id).ToListAsync();
        foreach (var tag in current.Where(t => !wanted.Contains(t.TagId)))
        {
            tag.IsDeleted = true;
            tag.DeletedAt = DateTime.UtcNow;
        }

        foreach (var tagId in wanted.Except(current.Select(t => t.TagId)))
        {
            db.PurchaseTags.Add(new PurchaseTag { UserId = purchase.UserId, PurchaseId = purchase.Id, TagId = tagId });
        }

        await db.SaveChangesAsync();
    }

    /// <summary>One Expense for the purchase (every Finance rule applies), stored as its TransactionId.</summary>
    private async Task<string?> RecordAsync(Purchase purchase, PurchaseExpenseRequest request, List<int> tagIds)
    {
        var expense = await transactionsService.CreateAsync(new TransactionRequest
        {
            Kind = TransactionKinds.Expense,
            OccurredOn = purchase.PurchasedOn,
            Amount = purchase.Amount,
            Currency = purchase.Currency,
            ExchangeRate = request.ExchangeRate,
            FromAccountId = request.AccountId,
            Payee = purchase.Store ?? purchase.Title,
            Note = purchase.Title,
            TagIds = tagIds,
        });
        if (!expense.Success)
        {
            return expense.Error!;
        }

        purchase.TransactionId = expense.Data!.Id;
        purchase.UpdatedAt = DateTime.UtcNow;
        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            return "This purchase was recorded somewhere else at the same time. Reload.";
        }

        return null;
    }

    private static string? Clean(string? text) => string.IsNullOrWhiteSpace(text) ? null : text.Trim();

    private static readonly Expression<Func<Purchase, PurchaseDto>> ToDto = p => new PurchaseDto
    {
        Id = p.Id,
        Title = p.Title,
        Store = p.Store,
        PurchasedOn = p.PurchasedOn,
        Amount = p.Amount,
        EstimatedAmount = p.EstimatedAmount,
        Currency = p.Currency,
        TransactionId = p.TransactionId,
        PaidFromAccountName = p.Transaction != null && p.Transaction.FromAccount != null ? p.Transaction.FromAccount.Name : null,
        AssetId = p.AssetId,
        AssetName = p.Asset != null ? p.Asset.Name : null,
        Notes = p.Notes,
        Tags = p.PurchaseTags.OrderBy(t => t.Tag.Name).Select(t => new TagDto { Id = t.TagId, Name = t.Tag.Name }).ToList(),
        ListItemCount = p.ShoppingListItems.Count,
        WishlistItemName = p.WishlistItems.Select(w => w.Name).FirstOrDefault(),
    };
}

/// <summary>
/// What else points at a purchase, released when it goes: its return (and that return's reminder) is deleted —
/// a refund already received stays in Finance —, rewards that came from it or were used on it just forget it.
/// </summary>
internal static class PurchaseReferences
{
    public static async Task ReleaseAsync(AppDbContext db, int purchaseId, IRemindersService remindersService, DateTime now)
    {
        var returns = await db.Returns.Where(r => r.PurchaseId == purchaseId).Select(r => r.Id).ToListAsync();
        foreach (var returnId in returns)
        {
            await remindersService.RemoveAllForEntityAsync(ReturnLinkableProvider.Type, returnId);
        }

        await db.Returns.Where(r => r.PurchaseId == purchaseId)
            .ExecuteUpdateAsync(s => s.SetProperty(r => r.IsDeleted, true).SetProperty(r => r.DeletedAt, now).SetProperty(r => r.ReminderId, (int?)null));
        await db.Benefits.Where(b => b.PurchaseId == purchaseId)
            .ExecuteUpdateAsync(s => s.SetProperty(b => b.PurchaseId, (int?)null).SetProperty(b => b.UpdatedAt, now));
        await db.BenefitRedemptions.Where(r => r.PurchaseId == purchaseId)
            .ExecuteUpdateAsync(s => s.SetProperty(r => r.PurchaseId, (int?)null).SetProperty(r => r.UpdatedAt, now));
        await db.PointBatches.Where(b => b.PurchaseId == purchaseId)
            .ExecuteUpdateAsync(s => s.SetProperty(b => b.PurchaseId, (int?)null).SetProperty(b => b.UpdatedAt, now));
    }
}
