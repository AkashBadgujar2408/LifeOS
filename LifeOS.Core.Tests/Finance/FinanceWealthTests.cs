using LifeOS.Core.Finance.Services;

namespace LifeOS.Core.Tests.Finance;

public class FinanceWealthTests
{
    private static readonly DateOnly Start = new(2026, 1, 15);

    [Fact]
    public void The_emi_matches_a_bank_calculator()
    {
        // ₹10,00,000 at 8.5% for 20 years: the figure every Indian EMI calculator gives.
        Assert.Equal(8678.23m, LoanSchedule.Emi(1_000_000m, 8.5m, 240));
        // ₹5,00,000 at 9.5% for 5 years.
        Assert.Equal(10500.93m, LoanSchedule.Emi(500_000m, 9.5m, 60));
        // Interest-free: an even split.
        Assert.Equal(10000m, LoanSchedule.Emi(120_000m, 0m, 12));
    }

    [Fact]
    public void The_schedule_splits_each_instalment_and_clears_the_loan_on_time()
    {
        var schedule = LoanSchedule.Build(1_000_000m, 8.5m, 240, Start);

        Assert.Equal(240, schedule.Count);
        var first = schedule[0];
        Assert.Equal(new DateOnly(2026, 2, 15), first.DueOn);
        Assert.Equal(7083.33m, first.Interest);
        Assert.Equal(1594.90m, first.Principal);
        Assert.Equal(998_405.10m, first.Balance);
        Assert.Equal(0m, schedule[^1].Balance);
        Assert.Equal(1_000_000m, schedule.Sum(i => i.Principal));
        // Every instalment but the last is the EMI; the last one only clears what's left.
        Assert.All(schedule.SkipLast(1), i => Assert.Equal(8678.23m, i.Payment));
        Assert.InRange(schedule[^1].Payment, 8670m, 8690m);
    }

    [Fact]
    public void A_lenders_bigger_emi_finishes_early_and_a_too_small_one_is_refused()
    {
        var faster = LoanSchedule.Build(500_000m, 9.5m, 60, Start, lenderEmi: 12_000m);
        Assert.True(faster.Count < 60);
        Assert.Equal(0m, faster[^1].Balance);

        Assert.NotNull(LoanSchedule.CheckEmi(500_000m, 9.5m, 3_958.33m));
        Assert.Null(LoanSchedule.CheckEmi(500_000m, 9.5m, 10_500.93m));
        Assert.Null(LoanSchedule.CheckEmi(500_000m, 9.5m, null));
    }

    [Fact]
    public void Outstanding_follows_the_instalments_due()
    {
        var schedule = LoanSchedule.Build(120_000m, 0m, 12, Start);
        Assert.Equal(0m, LoanSchedule.OutstandingOn(schedule, 120_000m, Start, null, Start.AddDays(-1)));
        Assert.Equal(120_000m, LoanSchedule.OutstandingOn(schedule, 120_000m, Start, null, Start));
        Assert.Equal(110_000m, LoanSchedule.OutstandingOn(schedule, 120_000m, Start, null, new DateOnly(2026, 2, 15)));
        Assert.Equal(90_000m, LoanSchedule.OutstandingOn(schedule, 120_000m, Start, null, new DateOnly(2026, 5, 1)));
        Assert.Equal(0m, LoanSchedule.OutstandingOn(schedule, 120_000m, Start, new DateOnly(2026, 4, 30), new DateOnly(2026, 5, 1)));
        Assert.Equal(0m, LoanSchedule.OutstandingOn(schedule, 120_000m, Start, null, new DateOnly(2027, 6, 1)));
    }

    private static WealthInputs Inputs() => new(
        [
            new WealthAccount(1, "Bank", "INR", 10_000m, new DateOnly(2026, 1, 1)),
            new WealthAccount(2, "Card", "INR", 0m, new DateOnly(2026, 1, 1)),
            new WealthAccount(3, "Wise", "USD", 200m, new DateOnly(2026, 1, 1)),
            new WealthAccount(4, "Opens later", "INR", 999m, new DateOnly(2026, 12, 1)),
        ],
        [
            new AccountFlow(1, new DateOnly(2026, 3, 1), 50_000m),
            new AccountFlow(1, new DateOnly(2026, 3, 5), -2_000m),
            new AccountFlow(2, new DateOnly(2026, 3, 6), -4_000m),
            new AccountFlow(1, new DateOnly(2026, 11, 1), -1_000_000m),
        ],
        [
            new WealthHolding(1, "Gold", "INR", 50_000m, new DateOnly(2026, 2, 1), null,
                [(new DateOnly(2026, 3, 1), 52_000m), (new DateOnly(2026, 6, 1), 55_000m)]),
            new WealthHolding(2, "Old FD", "INR", 100_000m, new DateOnly(2025, 1, 1), new DateOnly(2026, 2, 1), []),
        ],
        [
            new WealthLoan(1, "Car loan", false, "INR", 120_000m, 0m, 12, new DateOnly(2026, 1, 15), null, null,
                Moves: [new LoanMove(1, new DateOnly(2026, 2, 15), -10_000m), new LoanMove(2, new DateOnly(2026, 3, 15), -10_000m)]),
            new WealthLoan(2, "Lent to Ravi", true, "INR", 20_000m, 0m, 2, new DateOnly(2026, 3, 1), null, null),
        ],
        [new CurrencyRate("USD", new DateOnly(2026, 2, 10), 83m), new CurrencyRate("USD", new DateOnly(2026, 4, 1), 84m)]);

    [Fact]
    public void Net_worth_is_assets_minus_liabilities_by_hand()
    {
        var day = new DateOnly(2026, 3, 31);
        var snapshot = NetWorth.At(day, Inputs(), "INR");

        // Assets: bank 10,000 + 50,000 − 2,000 = 58,000; USD 200 × 83 (the rate typed on 10 Feb) = 16,600; gold's
        // 1 Mar valuation 52,000; the 20,000 lent on 1 Mar (first repayment due 1 Apr) — 1,46,600 in all.
        // Liabilities: the card's −4,000 and the car loan after two 10,000 instalments, 1,00,000 — 1,04,000.
        // The FD was disposed of before; "Opens later" didn't exist yet.
        Assert.Equal(146_600m, snapshot.Assets);
        Assert.Equal(104_000m, snapshot.Liabilities);
        Assert.Equal(42_600m, snapshot.Net);
        Assert.DoesNotContain(snapshot.Items, i => i.Name is "Old FD" or "Opens later");
        Assert.Empty(snapshot.Unconverted);
    }

    [Fact]
    public void A_foreign_balance_without_a_rate_yet_is_shown_but_left_out()
    {
        var snapshot = NetWorth.At(new DateOnly(2026, 2, 1), Inputs(), "INR");
        var wise = Assert.Single(snapshot.Unconverted);
        Assert.Equal("Wise", wise.Name);
        Assert.Equal(10_000m + 50_000m, snapshot.Assets);
    }

    [Fact]
    public void Holdings_count_their_latest_valuation_else_what_was_put_in()
    {
        var gold = Inputs().Holdings[0];
        Assert.Null(NetWorth.HoldingValue(gold, new DateOnly(2026, 1, 31)));
        Assert.Equal(50_000m, NetWorth.HoldingValue(gold, new DateOnly(2026, 2, 20)));
        Assert.Equal(52_000m, NetWorth.HoldingValue(gold, new DateOnly(2026, 5, 31)));
        Assert.Equal(55_000m, NetWorth.HoldingValue(gold, new DateOnly(2026, 6, 1)));
        Assert.Null(NetWorth.HoldingValue(Inputs().Holdings[1], new DateOnly(2026, 2, 1)));
    }

    [Fact]
    public void History_is_month_ends_then_today()
    {
        Assert.Equal(
            [new(2026, 7, 31), new(2026, 8, 31), new(2026, 9, 30), new(2026, 10, 18)],
            NetWorth.HistoryDays(new DateOnly(2026, 10, 18), 3));
    }
}
