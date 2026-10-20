using LifeOS.Core.Purchases.DTOs;
using LifeOS.Core.Shared.DTOs;

namespace LifeOS.Core.Purchases.ServiceContracts;

/// <summary>What you've bought: one purchase can record its expense, add it to the Home inventory and its warranty.</summary>
public interface IPurchasesService
{
    /// <summary>Newest first; <paramref name="from"/>/<paramref name="to"/> limit the days (both optional).</summary>
    Task<List<PurchaseDto>> GetAllAsync(DateOnly? from, DateOnly? to);
    Task<OperationResult<PurchaseDto>> GetAsync(int id);
    /// <summary>The purchase, plus (in one transaction) its expense, asset, warranty, list items and wish.</summary>
    Task<OperationResult<PurchaseDto>> CreateAsync(PurchaseRequest request);
    Task<OperationResult<PurchaseDto>> UpdateAsync(int id, PurchaseRequest request);
    /// <summary>Records it in Finance as one expense (once).</summary>
    Task<OperationResult<PurchaseDto>> RecordExpenseAsync(int id, PurchaseExpenseRequest request);
    /// <summary>Deletes the expense it created.</summary>
    Task<OperationResult<PurchaseDto>> RemoveExpenseAsync(int id);
    /// <summary>Deletes the purchase and its expense; the asset (and its warranty) stay in the inventory.</summary>
    Task<OperationResult<bool>> DeleteAsync(int id);
    /// <summary>Stores you've bought from, most used first (for suggestions).</summary>
    Task<List<string>> StoresAsync();
}

public interface IShoppingListsService
{
    Task<List<ShoppingListDto>> GetAllAsync(bool includeArchived);
    /// <summary>The list with its items (to buy first, in order; then ticked).</summary>
    Task<OperationResult<ShoppingListDto>> GetAsync(int id);
    Task<OperationResult<ShoppingListDto>> CreateAsync(ShoppingListRequest request);
    Task<OperationResult<ShoppingListDto>> UpdateAsync(int id, ShoppingListRequest request);
    Task<OperationResult<bool>> DeleteAsync(int id);
    Task<OperationResult<ShoppingListDto>> AddItemAsync(int listId, ShoppingListItemRequest request);
    Task<OperationResult<ShoppingListDto>> UpdateItemAsync(int listId, int itemId, ShoppingListItemRequest request);
    Task<OperationResult<ShoppingListDto>> SetDoneAsync(int listId, int itemId, bool done);
    Task<OperationResult<ShoppingListDto>> RemoveItemAsync(int listId, int itemId);
    /// <summary>Removes every ticked item (bought ones keep their purchase).</summary>
    Task<OperationResult<ShoppingListDto>> ClearDoneAsync(int listId);
    /// <summary>Puts the items in the given order (every item of the list, once).</summary>
    Task<OperationResult<ShoppingListDto>> ReorderAsync(int listId, IReadOnlyList<int> itemIds);
}

public interface IWishlistService
{
    /// <summary>Most wanted first (at target price, then priority); bought ones last.</summary>
    Task<List<WishlistItemDto>> GetAllAsync();
    Task<OperationResult<WishlistItemDto>> GetAsync(int id);
    Task<OperationResult<WishlistItemDto>> CreateAsync(WishlistItemRequest request);
    Task<OperationResult<WishlistItemDto>> UpdateAsync(int id, WishlistItemRequest request);
    Task<OperationResult<bool>> DeleteAsync(int id);
}

/// <summary>Rewards & vouchers: balances, points and expiries computed; money that moves goes through Finance once.</summary>
public interface IBenefitsService
{
    Task<List<BenefitDto>> GetAllAsync(DateOnly today);
    /// <summary>With its code and PIN (decrypted), uses and points batches.</summary>
    Task<OperationResult<BenefitDetailDto>> GetAsync(int id, DateOnly today);
    Task<RewardsSummaryDto> SummaryAsync(DateOnly today);
    /// <summary>What can be used at a store today (anything without a store too; points only at their programme).</summary>
    Task<List<BenefitDto>> UsableAtAsync(string? store, DateOnly today);
    /// <summary>Expiring within 30 days, or cashback overdue — for My Day.</summary>
    Task<List<BenefitDto>> AttentionAsync(DateOnly today);
    Task<OperationResult<BenefitDetailDto>> CreateAsync(BenefitRequest request);
    Task<OperationResult<BenefitDetailDto>> UpdateAsync(int id, BenefitRequest request);
    Task<OperationResult<bool>> DeleteAsync(int id);
    Task<OperationResult<BenefitDetailDto>> RedeemAsync(int id, RedemptionRequest request);
    Task<OperationResult<BenefitDetailDto>> RemoveRedemptionAsync(int id, int redemptionId, DateOnly today);
    Task<OperationResult<BenefitDetailDto>> AddPointsAsync(int id, PointBatchRequest request);
    Task<OperationResult<BenefitDetailDto>> RemovePointsAsync(int id, int batchId, DateOnly today);
    /// <summary>Cashback arrived: with an account, one Finance income.</summary>
    Task<OperationResult<BenefitDetailDto>> MarkReceivedAsync(int id, CashbackReceivedRequest request);
    Task<OperationResult<BenefitDetailDto>> UndoReceivedAsync(int id, DateOnly today);
    /// <summary>Uses applied while recording a purchase (inside its transaction); an error refuses the purchase.</summary>
    Task<string?> RedeemOnPurchaseAsync(int purchaseId, DateOnly day, IReadOnlyList<PurchaseRedemptionRequest> uses, DateOnly today, string? zone);
}
