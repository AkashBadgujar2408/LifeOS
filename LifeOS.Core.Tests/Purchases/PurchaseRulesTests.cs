using LifeOS.Core.Purchases.DTOs;
using LifeOS.Core.Purchases.Services;

namespace LifeOS.Core.Tests.Purchases;

public class PurchaseRulesTests
{
    private static readonly DateOnly Today = new(2026, 10, 20);

    [Fact]
    public void A_purchase_needs_a_title_a_day_not_ahead_and_a_currency()
    {
        Assert.Null(PurchaseRules.CheckPurchase("Kettle", 1500, 1800, "INR", Today, Today));
        Assert.Null(PurchaseRules.CheckPurchase("Free sample", 0, null, "INR", Today, Today)); // free is fine
        Assert.NotNull(PurchaseRules.CheckPurchase("  ", 1500, null, "INR", Today, Today));
        Assert.NotNull(PurchaseRules.CheckPurchase("Kettle", 1500, null, "INR", Today.AddDays(1), Today));
        Assert.NotNull(PurchaseRules.CheckPurchase("Kettle", -1, null, "INR", Today, Today));
        Assert.NotNull(PurchaseRules.CheckPurchase("Kettle", 1500, -5, "INR", Today, Today));
        Assert.NotNull(PurchaseRules.CheckPurchase("Kettle", 1500, null, null, Today, Today));
    }

    [Fact]
    public void Wishes_need_an_http_link_and_a_currency_for_prices()
    {
        Assert.Null(PurchaseRules.CheckWish("Kindle", "https://amazon.in/kindle", 13999, 11000, "INR", "High"));
        Assert.Null(PurchaseRules.CheckWish("Kindle", null, null, null, null, "Low"));
        Assert.NotNull(PurchaseRules.CheckWish("Kindle", "javascript:alert(1)", null, null, null, "Low"));
        Assert.NotNull(PurchaseRules.CheckWish("Kindle", null, 13999, null, null, "Low"));
        Assert.NotNull(PurchaseRules.CheckWish("Kindle", null, null, null, null, "Urgent"));
        Assert.NotNull(PurchaseRules.CheckListItem("Milk", 60, null));
        Assert.Null(PurchaseRules.CheckListItem("Milk", null, null));
    }

    [Fact]
    public void A_wish_at_its_target_price_comes_first_then_priority()
    {
        static WishlistItemDto Wish(int id, string name, string priority, decimal? price = null, decimal? target = null, int? bought = null) =>
            new() { Id = id, Name = name, Priority = priority, Price = price, TargetPrice = target, PurchaseId = bought };

        Assert.True(PurchaseRules.AtTarget(10_999, 11_000));
        Assert.True(PurchaseRules.AtTarget(11_000, 11_000));
        Assert.False(PurchaseRules.AtTarget(13_999, 11_000));
        Assert.False(PurchaseRules.AtTarget(null, 11_000));

        var ordered = PurchaseRules.WishlistOrder([
            Wish(1, "Bought lamp", "High", bought: 9),
            Wish(2, "Headphones", "Low"),
            Wish(3, "Kindle", "Low", 10_500, 11_000),
            Wish(4, "Camera", "High", 60_000, 45_000),
            Wish(5, "Backpack", "Medium"),
        ]);
        Assert.Equal(["Kindle", "Camera", "Backpack", "Headphones", "Bought lamp"], ordered.Select(w => w.Name));
    }

    [Fact]
    public void What_a_list_still_costs_adds_unticked_priced_items_per_currency()
    {
        var left = PurchaseRules.EstimatedLeft([
            (false, 60m, "INR"), (false, 240m, "INR"), (true, 500m, "INR"), (false, null, null), (false, 4m, "EUR"),
        ]);
        Assert.Equal(["EUR:4", "INR:300"], left.Select(m => $"{m.Currency}:{m.Amount}"));
    }
}
