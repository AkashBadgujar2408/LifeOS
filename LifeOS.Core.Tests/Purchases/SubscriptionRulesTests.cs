using LifeOS.Core.Purchases.Services;

namespace LifeOS.Core.Tests.Purchases;

public class SubscriptionRulesTests
{
    private static readonly DateOnly Today = new(2026, 10, 20);

    [Fact]
    public void The_next_charge_counts_from_the_first_and_month_ends_clamp()
    {
        Assert.Equal(new DateOnly(2026, 11, 5), SubscriptionRules.NextCharge("Monthly", 1, new DateOnly(2025, 1, 5), "Active", null, Today));
        Assert.Equal(Today, SubscriptionRules.NextCharge("Monthly", 1, new DateOnly(2026, 1, 20), "Active", null, Today)); // today counts
        // The 31st becomes the 30th in November and is the 31st again in December.
        Assert.Equal(new DateOnly(2026, 10, 31), SubscriptionRules.NextCharge("Monthly", 1, new DateOnly(2026, 1, 31), "Active", null, Today));
        Assert.Equal(
            [new DateOnly(2026, 10, 31), new DateOnly(2026, 11, 30), new DateOnly(2026, 12, 31)],
            SubscriptionRules.ChargesBetween("Monthly", 1, new DateOnly(2026, 1, 31), "Active", null, Today, new DateOnly(2026, 12, 31)));
        // A yearly one renews on its anniversary.
        Assert.Equal(new DateOnly(2027, 3, 1), SubscriptionRules.NextCharge("Yearly", 1, new DateOnly(2024, 3, 1), "Active", null, Today));
    }

    [Fact]
    public void Paused_and_cancelled_subscriptions_stop_charging()
    {
        Assert.Null(SubscriptionRules.NextCharge("Monthly", 1, new DateOnly(2025, 1, 5), "Paused", null, Today));
        Assert.Null(SubscriptionRules.NextCharge("Monthly", 1, new DateOnly(2025, 1, 5), "Cancelled", new DateOnly(2026, 11, 5), Today));
        Assert.Empty(SubscriptionRules.ChargesBetween("Monthly", 1, new DateOnly(2025, 1, 5), "Paused", null, Today, Today.AddDays(60)));
        Assert.Equal(
            [new DateOnly(2026, 11, 5)],
            SubscriptionRules.ChargesBetween("Monthly", 1, new DateOnly(2025, 1, 5), "Cancelled", new DateOnly(2026, 12, 1), Today, Today.AddDays(90)));
    }

    [Fact]
    public void Costs_are_averaged_per_month_and_year_over_active_ones()
    {
        Assert.Equal(649m, SubscriptionRules.MonthlyCost(649, "Monthly", 1));
        Assert.Equal(124.92m, SubscriptionRules.MonthlyCost(1499, "Yearly", 1));
        Assert.Equal(433.33m, SubscriptionRules.MonthlyCost(100, "Weekly", 1));
        Assert.Equal(150m, SubscriptionRules.MonthlyCost(300, "Monthly", 2));

        var totals = SubscriptionRules.Totals([
            ("INR", 649m, "Monthly", 1, "Active"),
            ("INR", 1499m, "Yearly", 1, "Active"),
            ("INR", 199m, "Monthly", 1, "Paused"),
            ("USD", 10m, "Monthly", 1, "Active"),
        ]);
        Assert.Equal(["INR:773.92:9287.04", "USD:10:120"], totals.Select(t => $"{t.Currency}:{t.Monthly}:{t.Yearly}"));
    }

    [Fact]
    public void Checks_and_return_states()
    {
        Assert.Null(SubscriptionRules.Check("Netflix", 649, "INR", "Monthly", 1, Today, "Active", null, null, 3, Today));
        Assert.NotNull(SubscriptionRules.Check("Netflix", 649, "INR", "Daily", 1, Today, "Active", null, null, null, Today));
        Assert.NotNull(SubscriptionRules.Check("Netflix", 649, "INR", "Monthly", 1, Today, "Cancelled", null, null, null, Today));
        Assert.NotNull(SubscriptionRules.Check("Netflix", 649, "INR", "Monthly", 1, Today, "Cancelled", Today.AddDays(3), null, null, Today));

        Assert.True(SubscriptionRules.NeedsAttention(Today.AddDays(7), Today));
        Assert.False(SubscriptionRules.NeedsAttention(Today.AddDays(8), Today));
        Assert.True(SubscriptionRules.NeedsAttention(Today.AddDays(-3), Today));

        Assert.Equal(ReturnStates.Open, SubscriptionRules.ReturnState(Today, null, null, Today));
        Assert.Equal(ReturnStates.Missed, SubscriptionRules.ReturnState(Today.AddDays(-1), null, null, Today));
        Assert.Equal(ReturnStates.AwaitingRefund, SubscriptionRules.ReturnState(Today.AddDays(-1), Today.AddDays(-2), null, Today));
        Assert.Equal(ReturnStates.Refunded, SubscriptionRules.ReturnState(null, Today, Today, Today));
        Assert.NotNull(SubscriptionRules.CheckReturn(null, null, null, 3, Today, Today)); // a reminder needs a deadline
        Assert.NotNull(SubscriptionRules.CheckReturn(Today.AddDays(-1), null, null, null, Today, Today));
    }
}
