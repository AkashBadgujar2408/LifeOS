using LifeOS.Core.Finance.DTOs;
using LifeOS.Core.Finance.Services;

namespace LifeOS.Core.Tests.Finance;

public class FinanceRulesTests
{
    private static readonly DateOnly Day = new(2026, 10, 18);
    private static readonly LedgerAccount Bank = new(1, "INR", new DateOnly(2026, 1, 1), false);
    private static readonly LedgerAccount Wallet = new(2, "INR", new DateOnly(2026, 1, 1), false);
    private static readonly LedgerAccount Dollars = new(3, "USD", new DateOnly(2026, 1, 1), false);
    private static readonly HashSet<int> None = [];

    private static TransactionInput Input(
        string kind, LedgerAccount? from, LedgerAccount? to, decimal amount = 100, decimal? rate = null, decimal? toAmount = null,
        DateOnly? on = null, bool incomeSource = false) =>
        new(kind, on ?? Day, amount, rate, toAmount, from, to, incomeSource);

    [Fact]
    public void Each_kind_needs_its_own_accounts()
    {
        Assert.Null(FinanceRules.CheckTransaction(Input("Income", null, Bank), "INR", None).Error);
        Assert.Null(FinanceRules.CheckTransaction(Input("Expense", Bank, null), "INR", None).Error);
        Assert.Null(FinanceRules.CheckTransaction(Input("Transfer", Bank, Wallet), "INR", None).Error);

        Assert.NotNull(FinanceRules.CheckTransaction(Input("Income", Bank, null), "INR", None).Error);
        Assert.NotNull(FinanceRules.CheckTransaction(Input("Income", Bank, Wallet), "INR", None).Error);
        Assert.NotNull(FinanceRules.CheckTransaction(Input("Expense", null, Bank), "INR", None).Error);
        Assert.NotNull(FinanceRules.CheckTransaction(Input("Expense", Bank, Wallet), "INR", None).Error);
        Assert.NotNull(FinanceRules.CheckTransaction(Input("Transfer", Bank, null), "INR", None).Error);
        Assert.NotNull(FinanceRules.CheckTransaction(Input("Transfer", Bank, Bank), "INR", None).Error);
        Assert.NotNull(FinanceRules.CheckTransaction(Input("Refund", Bank, null), "INR", None).Error);
    }

    [Fact]
    public void Amounts_are_positive_and_fit()
    {
        Assert.NotNull(FinanceRules.CheckTransaction(Input("Expense", Bank, null, amount: 0), "INR", None).Error);
        Assert.NotNull(FinanceRules.CheckTransaction(Input("Expense", Bank, null, amount: -5), "INR", None).Error);
        Assert.NotNull(FinanceRules.CheckTransaction(Input("Expense", Bank, null, amount: FinanceRules.MaxAmount + 1), "INR", None).Error);
    }

    [Fact]
    public void Only_income_is_salary_or_side_income()
    {
        Assert.Null(FinanceRules.CheckTransaction(Input("Income", null, Bank, incomeSource: true), "INR", None).Error);
        Assert.NotNull(FinanceRules.CheckTransaction(Input("Expense", Bank, null, incomeSource: true), "INR", None).Error);
    }

    [Fact]
    public void Nothing_before_an_accounts_opening_date()
    {
        var early = new DateOnly(2025, 12, 31);
        Assert.NotNull(FinanceRules.CheckTransaction(Input("Expense", Bank, null, on: early), "INR", None).Error);
        Assert.NotNull(FinanceRules.CheckTransaction(Input("Transfer", Bank, Wallet with { OpeningDate = Day.AddDays(1) }), "INR", None).Error);
        Assert.Null(FinanceRules.CheckTransaction(Input("Expense", Bank, null, on: Bank.OpeningDate), "INR", None).Error);
    }

    [Fact]
    public void An_archived_account_takes_nothing_new_but_keeps_what_it_has()
    {
        var archived = Bank with { IsArchived = true };
        Assert.NotNull(FinanceRules.CheckTransaction(Input("Expense", archived, null), "INR", None).Error);
        Assert.Null(FinanceRules.CheckTransaction(Input("Expense", archived, null), "INR", new HashSet<int> { archived.Id }).Error);
    }

    [Fact]
    public void The_currency_is_the_moving_accounts_and_a_foreign_one_needs_a_rate()
    {
        var expense = FinanceRules.CheckTransaction(Input("Expense", Dollars, null, rate: 84.1m), "INR", None).Ok!;
        Assert.Equal("USD", expense.Currency);
        Assert.Equal(84.1m, expense.ExchangeRate);

        Assert.NotNull(FinanceRules.CheckTransaction(Input("Expense", Dollars, null), "INR", None).Error);

        var income = FinanceRules.CheckTransaction(Input("Income", null, Bank, rate: 2m), "INR", None).Ok!;
        Assert.Equal("INR", income.Currency);
        Assert.Null(income.ExchangeRate);
    }

    [Fact]
    public void A_cross_currency_transfer_says_what_arrived()
    {
        Assert.NotNull(FinanceRules.CheckTransaction(Input("Transfer", Dollars, Bank), "INR", None).Error);

        // Into the base currency: the rate is what arrived over what left.
        var home = FinanceRules.CheckTransaction(Input("Transfer", Dollars, Bank, amount: 100, toAmount: 8350), "INR", None).Ok!;
        Assert.Equal("USD", home.Currency);
        Assert.Equal(8350m, home.ToAmount);
        Assert.Equal(83.5m, home.ExchangeRate);

        // Out of the base currency: nothing to convert, ToAmount kept.
        var abroad = FinanceRules.CheckTransaction(Input("Transfer", Bank, Dollars, amount: 8400, toAmount: 100), "INR", None).Ok!;
        Assert.Equal("INR", abroad.Currency);
        Assert.Null(abroad.ExchangeRate);
        Assert.Equal(100m, abroad.ToAmount);

        // Same currency: a stray ToAmount is dropped.
        Assert.Null(FinanceRules.CheckTransaction(Input("Transfer", Bank, Wallet, toAmount: 5), "INR", None).Ok!.ToAmount);
    }

    [Fact]
    public void Totals_count_income_and_spending_in_the_base_currency_and_skip_transfers()
    {
        var totals = FinanceRules.Totals(
            [
                new LedgerLine("Income", 50_000m, "INR", null),
                new LedgerLine("Expense", 1_200m, "INR", null),
                new LedgerLine("Expense", 10m, "USD", 84m),
                new LedgerLine("Transfer", 5_000m, "INR", null),
                new LedgerLine("Expense", 20m, "EUR", null),
            ],
            "INR");

        Assert.Equal("INR", totals.Currency);
        Assert.Equal(50_000m, totals.Income);
        Assert.Equal(2_040m, totals.Spending);
        Assert.Equal(47_960m, totals.Net);
        Assert.Equal(1, totals.Unconverted);
    }

    [Fact]
    public void Without_a_base_currency_nothing_converts()
    {
        var totals = FinanceRules.Totals([new LedgerLine("Expense", 10m, "INR", null)], null);
        Assert.Equal(0m, totals.Spending);
        Assert.Equal(1, totals.Unconverted);
    }

    [Fact]
    public void An_account_cant_rewrite_its_history_once_money_has_moved()
    {
        var opened = new DateOnly(2026, 1, 1);
        Assert.Null(FinanceRules.CheckAccount("Bank", "INR", 1000, opened, null, null));
        Assert.NotNull(FinanceRules.CheckAccount("Piggy", "INR", 0, opened, null, null));
        Assert.NotNull(FinanceRules.CheckAccount("Bank", null, 0, opened, null, null));
        Assert.NotNull(FinanceRules.CheckAccount("Bank", "INR", 0, default, null, null));

        var first = new DateOnly(2026, 3, 1);
        Assert.NotNull(FinanceRules.CheckAccount("Bank", "USD", 0, opened, "INR", first));
        Assert.Null(FinanceRules.CheckAccount("Bank", "USD", 0, opened, "INR", null));
        Assert.NotNull(FinanceRules.CheckAccount("Bank", "INR", 0, first.AddDays(1), "INR", first));
        Assert.Null(FinanceRules.CheckAccount("Bank", "INR", -250, first, "INR", first));
    }
}
