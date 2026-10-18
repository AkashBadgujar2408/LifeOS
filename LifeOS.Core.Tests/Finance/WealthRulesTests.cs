using LifeOS.Core.Finance.Services;

namespace LifeOS.Core.Tests.Finance;

public class WealthRulesTests
{
    private static readonly DateOnly Today = new(2026, 10, 18);

    [Fact]
    public void Savings_count_linked_money_in_the_goals_currency()
    {
        var (saved, percent, items) = SavingsProgress.Of(300_000m, "INR", "INR",
        [
            new WealthItem("FinanceAccount", 1, "Savings", "INR", 90_000m, 90_000m),
            new WealthItem("Holding", 2, "Gold", "INR", 30_000m, 30_000m),
            new WealthItem("FinanceAccount", 3, "Wise", "USD", 100m, 8_400m),
            new WealthItem("FinanceAccount", 4, "No rate", "EUR", 50m, null),
        ]);

        Assert.Equal(128_400m, saved);
        Assert.Equal(42, percent);
        Assert.Null(items.Single(i => i.Item.Name == "No rate").Counted);
    }

    [Fact]
    public void Savings_never_go_below_nothing_or_past_the_whole()
    {
        Assert.Equal(0m, SavingsProgress.Of(1000m, "INR", "INR", [new WealthItem("FinanceAccount", 1, "Card", "INR", -500m, -500m)]).Saved);
        Assert.Equal(100, SavingsProgress.Of(1000m, "INR", "INR", [new WealthItem("FinanceAccount", 1, "Bank", "INR", 2500m, 2500m)]).Percent);
        // A goal in another currency than the base only counts money already in that currency.
        Assert.Equal(200m, SavingsProgress.Of(1000m, "USD", "INR",
        [
            new WealthItem("FinanceAccount", 1, "Wise", "USD", 200m, 16_800m),
            new WealthItem("FinanceAccount", 2, "Bank", "INR", 5000m, 5000m),
        ]).Saved);
    }

    [Fact]
    public void Investments_follow_their_constraints()
    {
        Assert.Null(WealthRules.CheckHolding("Gold", "INR", null, 50_000m, null, new DateOnly(2026, 1, 1), null, null, Today));
        Assert.NotNull(WealthRules.CheckHolding("Beanie", "INR", null, null, null, null, null, null, Today));
        Assert.NotNull(WealthRules.CheckHolding("FD", "INR", null, null, 7m, new DateOnly(2026, 5, 1), new DateOnly(2026, 4, 1), null, Today));
        Assert.NotNull(WealthRules.CheckHolding("Stock", "INR", 0m, null, null, null, null, null, Today));
        Assert.NotNull(WealthRules.CheckHolding("Stock", "INR", null, null, null, Today.AddDays(1), null, null, Today));
        Assert.NotNull(WealthRules.CheckValuation(Today.AddDays(1), 10m, null, Today));
        Assert.NotNull(WealthRules.CheckValuation(new DateOnly(2025, 1, 1), 10m, new DateOnly(2026, 1, 1), Today));
        Assert.NotNull(WealthRules.CheckValuation(Today, -1m, null, Today));
    }

    [Fact]
    public void Loans_follow_their_constraints()
    {
        var start = new DateOnly(2026, 1, 15);
        Assert.Null(WealthRules.CheckLoan("Home", "Borrowed", "INR", 1_000_000m, 8.5m, 240, start, null, null, Today));
        Assert.NotNull(WealthRules.CheckLoan("Home", "Gifted", "INR", 1_000_000m, 8.5m, 240, start, null, null, Today));
        Assert.NotNull(WealthRules.CheckLoan("Home", "Borrowed", "INR", 0m, 8.5m, 240, start, null, null, Today));
        Assert.NotNull(WealthRules.CheckLoan("Home", "Borrowed", "INR", 1_000m, 101m, 12, start, null, null, Today));
        Assert.NotNull(WealthRules.CheckLoan("Home", "Borrowed", "INR", 1_000m, 8m, 601, start, null, null, Today));
        Assert.NotNull(WealthRules.CheckLoan("Home", "Borrowed", "INR", 1_000m, 8m, 12, start, null, start.AddDays(-1), Today));
        Assert.NotNull(WealthRules.CheckLoan("Home", "Borrowed", "INR", 1_000_000m, 8.5m, 240, start, 7_000m, null, Today));
    }
}

public class ExchangeRateTests
{
    private static readonly DateOnly Today = new(2026, 10, 18);

    [Fact]
    public void The_master_rate_wins_over_a_typed_one_and_follows_its_dates()
    {
        List<CurrencyRate> master = [new("GBP", new DateOnly(2026, 6, 1), 105m), new("GBP", new DateOnly(2026, 10, 1), 110m)];
        List<CurrencyRate> typed = [new("GBP", new DateOnly(2026, 10, 15), 112m), new("USD", new DateOnly(2026, 9, 1), 84m)];

        Assert.Equal(110m, NetWorth.RateFor("GBP", Today, master, typed));
        Assert.Equal(105m, NetWorth.RateFor("GBP", new DateOnly(2026, 9, 30), master, typed));
        // Before the master has any rate for it, a typed one still converts; without either, nothing does.
        Assert.Null(NetWorth.RateFor("GBP", new DateOnly(2026, 5, 31), master, typed));
        Assert.Equal(84m, NetWorth.RateFor("USD", Today, master, typed));
        Assert.Null(NetWorth.RateFor("EUR", Today, master, typed));

        Assert.Equal(1100m, NetWorth.ToBase(10m, "GBP", "INR", Today, master, typed));
        Assert.Equal(10m, NetWorth.ToBase(10m, "INR", "INR", Today, master, typed));
        Assert.Null(NetWorth.ToBase(10m, "EUR", "INR", Today, master, typed));
    }

    [Fact]
    public void Net_worth_converts_at_the_master_rate()
    {
        var inputs = new WealthInputs(
            [new WealthAccount(1, "UK account", "GBP", 1000m, new DateOnly(2026, 1, 1))], [], [], [],
            [new CurrencyRate("GBP", new DateOnly(2026, 10, 15), 112m)],
            [new CurrencyRate("GBP", new DateOnly(2026, 10, 1), 110m)]);
        Assert.Equal(110_000m, NetWorth.At(Today, inputs, "INR").Assets);
    }

    [Fact]
    public void A_rate_is_for_another_currency_positive_and_not_ahead_of_time()
    {
        Assert.Null(RateRules.Check("GBP", "INR", 110.25m, Today, Today));
        Assert.NotNull(RateRules.Check("GBP", null, 110m, Today, Today));
        Assert.NotNull(RateRules.Check("INR", "INR", 1m, Today, Today));
        Assert.NotNull(RateRules.Check("GBP", "INR", 0m, Today, Today));
        Assert.NotNull(RateRules.Check("GBP", "INR", 110m, Today.AddDays(1), Today));
        Assert.NotNull(RateRules.Check(null, "INR", 110m, Today, Today));
    }
}
