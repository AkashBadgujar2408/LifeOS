using LifeOS.Core.Career.Services;
using LifeOS.Core.Finance.Services;
using LifeOS.Core.Purchases.DTOs;

namespace LifeOS.Core.Purchases.Services;

/// <summary>
/// Purchases' rules, mirroring the CHECKs in 15_shopping.sql so a refusal reads as a sentence, plus what's computed
/// and never stored (a wish at its target price, the wishlist order, what a list still costs). Pure and unit-tested.
/// </summary>
public static class PurchaseRules
{
    public static string? CheckPurchase(string title, decimal amount, decimal? estimated, string? currency, DateOnly purchasedOn, DateOnly today) =>
        title.Trim().Length == 0 ? "Say what you bought."
        : purchasedOn == default ? "Say when you bought it."
        : purchasedOn > today ? "It can't be bought in the future."
        : amount < 0 || amount > FinanceRules.MaxAmount ? "What you paid can't be negative."
        : estimated is < 0 || estimated > FinanceRules.MaxAmount ? "The estimate can't be negative."
        : currency is null ? "Choose the currency."
        : null;

    public static string? CheckListItem(string name, decimal? estimatedPrice, string? currency) =>
        name.Trim().Length == 0 ? "Say what to buy."
        : estimatedPrice is < 0 || estimatedPrice > FinanceRules.MaxAmount ? "The price can't be negative."
        : estimatedPrice is not null && currency is null ? "Choose the price's currency."
        : null;

    public static string? CheckWish(string name, string? url, decimal? price, decimal? targetPrice, string? currency, string priority) =>
        name.Trim().Length == 0 ? "Say what you'd like."
        : url is not null && !CareerRules.IsWebAddress(url) ? "The link has to be a web address (http:// or https://)."
        : price is < 0 || price > FinanceRules.MaxAmount ? "The price can't be negative."
        : targetPrice is < 0 || targetPrice > FinanceRules.MaxAmount ? "The target price can't be negative."
        : (price is not null || targetPrice is not null) && currency is null ? "Choose the prices' currency."
        : !WishPriorities.All.Contains(priority) ? "Choose how much you want it."
        : null;

    /// <summary>The price has come down to (or below) what you'd pay — worth buying now.</summary>
    public static bool AtTarget(decimal? price, decimal? targetPrice) =>
        price is { } p && targetPrice is { } t && p <= t;

    /// <summary>
    /// The wishlist, most wanted first: still wanted before bought, at-target before not, then priority (High →
    /// Low), then A–Z.
    /// </summary>
    public static List<WishlistItemDto> WishlistOrder(IEnumerable<WishlistItemDto> items) =>
        items.OrderBy(i => i.PurchaseId is not null)
            .ThenBy(i => AtTarget(i.Price, i.TargetPrice) ? 0 : 1)
            .ThenBy(i => i.Priority switch { WishPriorities.High => 0, WishPriorities.Medium => 1, _ => 2 })
            .ThenBy(i => i.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();

    /// <summary>The estimated cost of what's not ticked yet, per currency (items without a price add nothing).</summary>
    public static List<MoneyAmountDto> EstimatedLeft(IEnumerable<(bool Done, decimal? Price, string? Currency)> items) =>
        items.Where(i => !i.Done && i.Price is not null && i.Currency is not null)
            .GroupBy(i => i.Currency!)
            .OrderBy(g => g.Key, StringComparer.Ordinal)
            .Select(g => new MoneyAmountDto { Currency = g.Key, Amount = g.Sum(i => i.Price!.Value) })
            .ToList();
}
