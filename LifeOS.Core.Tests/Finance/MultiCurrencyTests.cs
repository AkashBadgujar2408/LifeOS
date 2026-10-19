using LifeOS.Core.Finance.Services;

namespace LifeOS.Core.Tests.Finance;

public class MultiCurrencyTests
{
    private static readonly DateOnly Day = new(2026, 10, 19);
    private static readonly DateOnly Opened = new(2026, 1, 1);
    private static readonly LedgerAccount Bank = new(1, "INR", Opened, false);
    private static readonly LedgerAccount Wise = new(2, "USD", Opened, false, ["EUR", "GBP"]);
    private static readonly LedgerAccount PayPal = new(3, "USD", Opened, false, ["GBP"]);
    private static readonly HashSet<int> None = [];

    private static TransactionInput Input(
        string kind, LedgerAccount? from, LedgerAccount? to, string? currency = null, string? toCurrency = null,
        decimal? rate = null, decimal? toAmount = null) =>
        new(kind, Day, 100, rate, toAmount, from, to, false, currency, toCurrency);

    [Fact]
    public void A_multi_currency_account_moves_money_in_any_currency_it_holds()
    {
        var gbp = FinanceRules.CheckTransaction(Input("Expense", Wise, null, "GBP", rate: 110.5m), "INR", None);
        Assert.Equal("GBP", gbp.Ok!.Currency);
        // No currency chosen: the account's main one.
        Assert.Equal("USD", FinanceRules.CheckTransaction(Input("Income", null, Wise, rate: 84m), "INR", None).Ok!.Currency);
        // One it doesn't hold is refused — so is choosing another currency on a single-currency account.
        Assert.Contains("doesn't hold JPY", FinanceRules.CheckTransaction(Input("Expense", Wise, null, "JPY", rate: 1m), "INR", None).Error);
        Assert.NotNull(FinanceRules.CheckTransaction(Input("Expense", Bank, null, "USD", rate: 84m), "INR", None).Error);
    }

    [Fact]
    public void A_transfer_arrives_as_it_left_when_it_can_else_says_what_arrived()
    {
        // GBP from Wise into PayPal, which holds GBP: nothing changes on the way.
        var same = FinanceRules.CheckTransaction(Input("Transfer", Wise, PayPal, "GBP", rate: 110m), "INR", None).Ok!;
        Assert.Null(same.ToAmount);
        Assert.Null(same.ToCurrency);

        // EUR into PayPal, which doesn't hold EUR: it arrives in PayPal's main currency, so say how much.
        Assert.Contains("arrived in USD", FinanceRules.CheckTransaction(Input("Transfer", Wise, PayPal, "EUR", rate: 90m), "INR", None).Error);
        var converted = FinanceRules.CheckTransaction(Input("Transfer", Wise, PayPal, "EUR", rate: 90m, toAmount: 108m), "INR", None).Ok!;
        Assert.Equal((108m, "USD"), (converted.ToAmount!.Value, converted.ToCurrency));

        // Choosing what arrives: USD from Wise arriving as GBP in PayPal.
        var chosen = FinanceRules.CheckTransaction(Input("Transfer", Wise, PayPal, "USD", "GBP", rate: 84m, toAmount: 79m), "INR", None).Ok!;
        Assert.Equal("GBP", chosen.ToCurrency);
        Assert.NotNull(FinanceRules.CheckTransaction(Input("Transfer", Wise, PayPal, "USD", "EUR", rate: 84m, toAmount: 92m), "INR", None).Error);

        // Into the base currency: the rate is what arrived ÷ what left.
        var home = FinanceRules.CheckTransaction(Input("Transfer", Wise, Bank, "GBP", toAmount: 11_050m), "INR", None).Ok!;
        Assert.Equal((110.5m, "INR"), (home.ExchangeRate!.Value, home.ToCurrency));
    }

    [Fact]
    public void Extra_currencies_follow_their_rules()
    {
        Assert.Null(MultiCurrency.CheckExtras("USD", [("GBP", 50m), ("EUR", 0m)], new HashSet<string>()));
        Assert.NotNull(MultiCurrency.CheckExtras("USD", [("USD", 0m)], new HashSet<string>()));
        Assert.NotNull(MultiCurrency.CheckExtras("USD", [("GBP", 0m), ("GBP", 5m)], new HashSet<string>()));
        Assert.NotNull(MultiCurrency.CheckExtras("USD", [(null, 0m)], new HashSet<string>()));
        Assert.Contains("GBP", MultiCurrency.CheckExtras("USD", [("EUR", 0m)], new HashSet<string> { "USD", "GBP" }));
        Assert.NotNull(MultiCurrency.CheckExtras("USD", Enumerable.Range(0, 21).Select(i => ((string?)$"A{(char)('A' + i)}Z", 0m)).ToList(), new HashSet<string>()));
    }

    [Fact]
    public void Each_currency_has_its_own_balance()
    {
        var balances = MultiCurrency.Balances(
            new HeldCurrency("USD", 200m),
            [new HeldCurrency("EUR", 0m), new HeldCurrency("GBP", 50m)],
            [new CurrencyMoves("USD", 100m, 30m), new CurrencyMoves("GBP", 0m, 20m), new CurrencyMoves(null, 0m, 0m)]);

        Assert.Equal([("USD", 200m, 270m), ("EUR", 0m, 0m), ("GBP", 50m, 30m)], balances);
    }

    [Fact]
    public void Net_worth_counts_each_currency_at_its_own_rate()
    {
        var inputs = new WealthInputs(
            [new WealthAccount(2, "Wise", "USD", 100m, Opened, [new HeldCurrency("GBP", 10m)])],
            [new AccountFlow(2, Day, 50m, "USD"), new AccountFlow(2, Day, -5m, "GBP")],
            [],
            [],
            [],
            [new CurrencyRate("USD", Opened, 84m), new CurrencyRate("GBP", Opened, 110m)]);
        var snapshot = NetWorth.At(Day, inputs, "INR");

        Assert.Equal(["Wise (USD)", "Wise (GBP)"], snapshot.Items.Select(i => i.Name));
        Assert.Equal(150m * 84 + 5m * 110, snapshot.Net);
    }
}
