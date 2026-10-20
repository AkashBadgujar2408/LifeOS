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
