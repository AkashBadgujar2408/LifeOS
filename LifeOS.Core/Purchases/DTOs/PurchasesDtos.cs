using System.ComponentModel.DataAnnotations;
using LifeOS.Core.Shared.DTOs;

namespace LifeOS.Core.Purchases.DTOs;

/// <summary>Matches CK_WishlistItems_Priority.</summary>
public static class WishPriorities
{
    public const string Low = "Low";
    public const string Medium = "Medium";
    public const string High = "High";

    public static readonly IReadOnlySet<string> All = new HashSet<string>([Low, Medium, High], StringComparer.Ordinal);
}

/// <summary>Money in one currency.</summary>
public class MoneyAmountDto
{
    public string Currency { get; init; } = string.Empty;
    public decimal Amount { get; init; }
}

// ---- Purchases ----

public class PurchaseDto
{
    public int Id { get; init; }
    public string Title { get; init; } = string.Empty;
    public string? Store { get; init; }
    public DateOnly PurchasedOn { get; init; }
    /// <summary>What was actually paid in money (after any voucher or coupon).</summary>
    public decimal Amount { get; init; }
    public decimal? EstimatedAmount { get; init; }
    public string Currency { get; init; } = string.Empty;
    /// <summary>The Finance expense it was paid with (null: not in the ledger).</summary>
    public int? TransactionId { get; init; }
    public string? PaidFromAccountName { get; init; }
    /// <summary>What it became in the Home inventory.</summary>
    public int? AssetId { get; init; }
    public string? AssetName { get; init; }
    public string? Notes { get; init; }
    public List<TagDto> Tags { get; init; } = [];
    /// <summary>Shopping-list items it covered.</summary>
    public int ListItemCount { get; init; }
    public string? WishlistItemName { get; init; }
}

/// <summary>Recording a purchase in Finance: the account it was paid from (and a rate when not in the base currency).</summary>
public class PurchaseExpenseRequest
{
    public int AccountId { get; init; }
    public decimal? ExchangeRate { get; init; }
}

/// <summary>Adding what was bought to the Home inventory (name defaults to the purchase's title).</summary>
public class PurchaseAssetRequest
{
    [StringLength(200)]
    public string? Name { get; init; }

    public int? PropertyId { get; init; }

    [StringLength(100)]
    public string? Room { get; init; }

    [StringLength(100)]
    public string? Brand { get; init; }

    [StringLength(100)]
    public string? Model { get; init; }

    [StringLength(100)]
    public string? SerialNumber { get; init; }

    public int Quantity { get; init; } = 1;
}

/// <summary>The warranty that came with it (needs the asset).</summary>
public class PurchaseWarrantyRequest
{
    [Required]
    public string Kind { get; init; } = "Warranty";

    [StringLength(200)]
    public string? Provider { get; init; }

    public DateOnly ExpiresOn { get; init; }
    public int? ReminderDays { get; init; }
}

public class PurchaseRequest
{
    [Required]
    [StringLength(200)]
    public string Title { get; init; } = string.Empty;

    [StringLength(200)]
    public string? Store { get; init; }

    public DateOnly PurchasedOn { get; init; }
    public decimal Amount { get; init; }
    public decimal? EstimatedAmount { get; init; }

    [Required]
    public string Currency { get; init; } = string.Empty;

    [StringLength(2000)]
    public string? Notes { get; init; }

    /// <summary>Categories (also given to its expense).</summary>
    public List<int> TagIds { get; init; } = [];

    // ---- Create only: what this one purchase does in one step ----

    /// <summary>One Finance expense from this account.</summary>
    public PurchaseExpenseRequest? Expense { get; init; }

    /// <summary>A new Home inventory item.</summary>
    public PurchaseAssetRequest? Asset { get; init; }

    /// <summary>A warranty on that item.</summary>
    public PurchaseWarrantyRequest? Warranty { get; init; }

    /// <summary>Ticked shopping-list items it covers (they're marked bought).</summary>
    public List<int> ShoppingListItemIds { get; init; } = [];

    /// <summary>Vouchers, coupons or points used on it (each recorded as a redemption of this purchase).</summary>
    public List<PurchaseRedemptionRequest> Redemptions { get; init; } = [];

    /// <summary>The wishlist item it fulfils (it leaves the wishlist).</summary>
    public int? WishlistItemId { get; init; }

    public DateOnly Today { get; init; }

    /// <summary>The browser's IANA zone, for the warranty reminder's 09:00 when Settings has none.</summary>
    [StringLength(100)]
    public string? TimeZone { get; init; }
}

// ---- Shopping lists ----

public class ShoppingListDto
{
    public int Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public bool IsArchived { get; init; }
    public string? Notes { get; init; }
    public int ItemCount { get; init; }
    public int DoneCount { get; init; }
    /// <summary>The estimated cost of what's still to buy, per currency.</summary>
    public List<MoneyAmountDto> EstimatedLeft { get; set; } = [];
    /// <summary>Only on a single list's read.</summary>
    public List<ShoppingListItemDto> Items { get; set; } = [];
}

public class ShoppingListItemDto
{
    public int Id { get; init; }
    public int ListId { get; init; }
    public string Name { get; init; } = string.Empty;
    public string? Quantity { get; init; }
    public decimal? EstimatedPrice { get; init; }
    public string? Currency { get; init; }
    public int SortOrder { get; init; }
    public bool Done { get; init; }
    public int? PurchaseId { get; init; }
    public string? PurchaseTitle { get; init; }
}

public class ShoppingListRequest
{
    [Required]
    [StringLength(200)]
    public string Name { get; init; } = string.Empty;

    public bool IsArchived { get; init; }

    [StringLength(2000)]
    public string? Notes { get; init; }
}

public class ShoppingListItemRequest
{
    [Required]
    [StringLength(200)]
    public string Name { get; init; } = string.Empty;

    [StringLength(50)]
    public string? Quantity { get; init; }

    public decimal? EstimatedPrice { get; init; }
    public string? Currency { get; init; }
}

public class ItemDoneRequest
{
    public bool Done { get; init; }
}

// ---- Wishlist ----

public class WishlistItemDto
{
    public int Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public string? Store { get; init; }
    public string? Url { get; init; }
    public decimal? Price { get; init; }
    public decimal? TargetPrice { get; init; }
    public string? Currency { get; init; }
    public string Priority { get; init; } = WishPriorities.Medium;
    public string? Notes { get; init; }
    public int? PurchaseId { get; init; }
    public DateOnly? PurchasedOn { get; init; }
    /// <summary>The price has come down to the target (computed).</summary>
    public bool AtTarget { get; set; }
}

public class WishlistItemRequest
{
    [Required]
    [StringLength(200)]
    public string Name { get; init; } = string.Empty;

    [StringLength(200)]
    public string? Store { get; init; }

    [StringLength(500)]
    public string? Url { get; init; }

    public decimal? Price { get; init; }
    public decimal? TargetPrice { get; init; }
    public string? Currency { get; init; }

    [Required]
    public string Priority { get; init; } = WishPriorities.Medium;

    [StringLength(2000)]
    public string? Notes { get; init; }
}

// ---- Rewards & vouchers (Session 70a) ----

public class BenefitDto
{
    public int Id { get; init; }
    /// <summary>Voucher / GiftCard / StoreCredit / Coupon / Cashback / Points / WalletCredit.</summary>
    public string Kind { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    /// <summary>Where it can be used — or, for points, the programme.</summary>
    public string? Store { get; init; }
    public decimal? Value { get; init; }
    public string? Currency { get; init; }
    public decimal? DiscountPercent { get; init; }
    public decimal? MinSpend { get; init; }
    public decimal? ValuePerPoint { get; init; }
    public bool HasCode { get; init; }
    public bool HasPin { get; init; }
    /// <summary>Only on a single benefit's read (decrypted).</summary>
    public string? Code { get; set; }
    public string? Pin { get; set; }
    public DateOnly? ExpiresOn { get; init; }
    public int? ReminderDays { get; init; }
    /// <summary>The purchase it came from (a gift card bought, cashback on an order).</summary>
    public int? PurchaseId { get; init; }
    public string? PurchaseTitle { get; init; }
    /// <summary>Wallet credit: the wallet it's in.</summary>
    public int? AccountId { get; init; }
    public string? AccountName { get; init; }
    public DateOnly? ExpectedBy { get; init; }
    public DateOnly? ReceivedOn { get; init; }
    /// <summary>Cashback: the Finance income it arrived as.</summary>
    public int? TransactionId { get; init; }
    public string? Notes { get; init; }
    // ---- Computed (BenefitRules.State) ----
    public string Status { get; set; } = string.Empty;
    public decimal? Balance { get; set; }
    public int? PointsAvailable { get; set; }
    public decimal? PointsValue { get; set; }
    public decimal Lost { get; set; }
    public DateOnly? LostOn { get; set; }
    public bool ExpiringSoon { get; set; }
    public bool Overdue { get; set; }
    public DateOnly? NextExpiry { get; set; }
}

public class BenefitRedemptionDto
{
    public int Id { get; init; }
    public DateOnly RedeemedOn { get; init; }
    public decimal? Amount { get; init; }
    public int? Points { get; init; }
    public int? PurchaseId { get; init; }
    public string? PurchaseTitle { get; init; }
    /// <summary>Points cashed in: the Finance income they became.</summary>
    public int? TransactionId { get; init; }
    public string? Notes { get; init; }
}

public class PointBatchDto
{
    public int Id { get; init; }
    public DateOnly EarnedOn { get; init; }
    public int Points { get; init; }
    public DateOnly? ExpiresOn { get; init; }
    public int? PurchaseId { get; init; }
    public string? PurchaseTitle { get; init; }
    public string? Notes { get; init; }
    /// <summary>Points of this batch not yet spent (computed).</summary>
    public int Remaining { get; set; }
}

public class BenefitDetailDto
{
    public BenefitDto Benefit { get; init; } = new();
    /// <summary>Newest first.</summary>
    public List<BenefitRedemptionDto> Redemptions { get; init; } = [];
    /// <summary>Points only, newest first.</summary>
    public List<PointBatchDto> Batches { get; init; } = [];
}

/// <summary>Money in Finance for a benefit: the account (and a rate when not in the base currency).</summary>
public class BenefitMoneyRequest
{
    public int AccountId { get; init; }
    public decimal? ExchangeRate { get; init; }
}

public class BenefitRequest
{
    [Required]
    public string Kind { get; init; } = string.Empty;

    [Required]
    [StringLength(200)]
    public string Name { get; init; } = string.Empty;

    [StringLength(200)]
    public string? Store { get; init; }

    public decimal? Value { get; init; }
    public string? Currency { get; init; }
    public decimal? DiscountPercent { get; init; }
    public decimal? MinSpend { get; init; }
    public decimal? ValuePerPoint { get; init; }

    /// <summary>Kept encrypted; send the current one back on an edit (null removes it).</summary>
    [StringLength(200)]
    public string? Code { get; init; }

    [StringLength(50)]
    public string? Pin { get; init; }

    public DateOnly? ExpiresOn { get; init; }
    public int? ReminderDays { get; init; }
    public int? PurchaseId { get; init; }
    public int? AccountId { get; init; }
    public DateOnly? ExpectedBy { get; init; }

    [StringLength(2000)]
    public string? Notes { get; init; }

    /// <summary>On create only (voucher / gift card / store credit): you paid for it — one purchase with its Finance expense.</summary>
    public BenefitMoneyRequest? Bought { get; init; }

    public DateOnly Today { get; init; }

    [StringLength(100)]
    public string? TimeZone { get; init; }
}

public class RedemptionRequest
{
    public DateOnly RedeemedOn { get; init; }
    public decimal? Amount { get; init; }
    public int? Points { get; init; }
    public int? PurchaseId { get; init; }

    [StringLength(500)]
    public string? Notes { get; init; }

    /// <summary>Points cashed in to an account: one Finance income worth points × value per point.</summary>
    public BenefitMoneyRequest? CashIn { get; init; }

    public DateOnly Today { get; init; }

    [StringLength(100)]
    public string? TimeZone { get; init; }
}

public class PointBatchRequest
{
    public DateOnly EarnedOn { get; init; }
    public int Points { get; init; }
    public DateOnly? ExpiresOn { get; init; }
    public int? PurchaseId { get; init; }

    [StringLength(500)]
    public string? Notes { get; init; }

    public DateOnly Today { get; init; }

    [StringLength(100)]
    public string? TimeZone { get; init; }
}

/// <summary>Cashback landed: the day and, to record it in Finance, the account it arrived in.</summary>
public class CashbackReceivedRequest
{
    public DateOnly ReceivedOn { get; init; }

    /// <summary>Null: received, but not recorded in Finance.</summary>
    public int? AccountId { get; init; }

    public decimal? ExchangeRate { get; init; }
    public DateOnly Today { get; init; }
}

/// <summary>The rewards page's totals, per currency.</summary>
public class RewardsSummaryDto
{
    /// <summary>Money you can still spend (vouchers, cards, credit) plus points' worth.</summary>
    public List<MoneyAmountDto> Usable { get; init; } = [];
    /// <summary>What ran out unused this calendar year.</summary>
    public List<MoneyAmountDto> LostThisYear { get; init; } = [];
    /// <summary>Cashback received this calendar year.</summary>
    public List<MoneyAmountDto> CashbackThisYear { get; init; } = [];
    /// <summary>Cashback still to come (exposed for the forecasts of Session 71a).</summary>
    public List<MoneyAmountDto> CashbackPending { get; init; } = [];
}

/// <summary>Using a voucher or coupon on a purchase being recorded.</summary>
public class PurchaseRedemptionRequest
{
    public int BenefitId { get; init; }
    /// <summary>What it took off the bill (money benefits and coupons).</summary>
    public decimal? Amount { get; init; }
    /// <summary>Points spent on it.</summary>
    public int? Points { get; init; }
}
