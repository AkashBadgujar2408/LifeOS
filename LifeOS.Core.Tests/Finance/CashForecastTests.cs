using LifeOS.Core.Finance.Services;

namespace LifeOS.Core.Tests.Finance;

public class CashForecastTests
{
    private static readonly DateOnly Today = new(2026, 10, 20);
    private static readonly DateOnly Until = new(2027, 1, 20);

    private static decimal? Rate(string currency, DateOnly day) => currency == "USD" ? 84m : null;

    [Fact]
    public void A_balance_is_carried_forward_day_by_day_and_its_lowest_point_found()
    {
        // ₹20,000 today; salary +₹50,000 on 1 Nov; rent −₹25,000 on 25 Oct and 25 Nov; a ₹40,000 EMI on 28 Oct.
        var pockets = new[] { new ForecastPocket(1, "HDFC", "INR", 20_000, false) };
        var flows = new[]
        {
            new ForecastFlow(new DateOnly(2026, 10, 25), 1, "INR", -25_000, "Repeating", "Rent"),
            new ForecastFlow(new DateOnly(2026, 10, 28), 1, "INR", -40_000, "Loan", "EMI"),
            new ForecastFlow(new DateOnly(2026, 11, 1), 1, "INR", 50_000, "Repeating", "Salary"),
            new ForecastFlow(new DateOnly(2026, 11, 25), 1, "INR", -25_000, "Repeating", "Rent"),
            new ForecastFlow(Today, 1, "INR", -999, "Repeating", "Already written today"),
            new ForecastFlow(Until.AddDays(1), 1, "INR", -999, "Repeating", "After the window"),
        };

        var result = CashForecast.Build(pockets, flows, Today, Until, "INR", Rate);
        var hdfc = Assert.Single(result.Accounts);

        Assert.Equal(
            ["2026-10-20:20000", "2026-10-25:-5000", "2026-10-28:-45000", "2026-11-01:5000", "2026-11-25:-20000", "2027-01-20:-20000"],
            hdfc.Points.Select(p => $"{p.Day:yyyy-MM-dd}:{p.Balance:0}"));
        Assert.Equal(new ForecastPoint(new DateOnly(2026, 10, 28), -45_000), hdfc.Lowest);
        Assert.Equal(-20_000, hdfc.End);
        Assert.Equal(4, result.Flows.Count); // today's and after-the-window ones left out

        var below = Assert.Single(CashForecast.GoesNegative(result, Today.AddDays(60)));
        Assert.Equal(new DateOnly(2026, 10, 25), below.Below.Day);
    }

    [Fact]
    public void The_overall_line_is_in_the_base_currency_with_money_not_tied_to_an_account()
    {
        var pockets = new[]
        {
            new ForecastPocket(1, "HDFC", "INR", 10_000, false),
            new ForecastPocket(2, "Wise", "USD", 100, false),
            new ForecastPocket(3, "Card", "INR", -2_000, true),
            new ForecastPocket(4, "Euro cash", "EUR", 50, false),
        };
        var flows = new[]
        {
            new ForecastFlow(new DateOnly(2026, 11, 5), null, "INR", -1_840, "Bill", "MSEDCL bill"),
            new ForecastFlow(new DateOnly(2026, 11, 6), 2, "USD", -10, "Subscription", "iCloud"),
        };

        var result = CashForecast.Build(pockets, flows, Today, Until, "INR", Rate);

        // 10,000 + 100 × 84 − 2,000 = 16,400 (the euros have no rate: left out, named).
        Assert.Equal(16_400, result.Overall.Start);
        Assert.Equal(16_400 - 1_840 - 840, result.Overall.End);
        Assert.Equal(["EUR"], result.Unconverted);
        Assert.Equal(-840m, result.Flows.Single(f => f.Flow.Title == "iCloud").InBase);
        // The bill isn't tied to HDFC, so HDFC's own line doesn't move; the card may be negative.
        Assert.Equal(10_000, result.Accounts.Single(a => a.AccountId == 1).End);
        Assert.Empty(CashForecast.GoesNegative(result, Until));
    }

    [Fact]
    public void Expected_bills_follow_the_last_three_monthly_and_average_their_amounts()
    {
        var bills = new[]
        {
            (new DateOnly(2026, 7, 25), 1_500m, "INR"),
            (new DateOnly(2026, 8, 25), 1_700m, "INR"),
            (new DateOnly(2026, 9, 25), 1_840m, "INR"),
            (new DateOnly(2026, 6, 25), 9_999m, "INR"), // older than the last three: not averaged
        };

        var expected = CashForecast.ExpectedBills(bills, Today, Until);

        Assert.Equal(
            [new DateOnly(2026, 10, 25), new DateOnly(2026, 11, 25), new DateOnly(2026, 12, 25)],
            expected.Select(e => e.Day));
        Assert.All(expected, e => Assert.Equal(1_680m, e.Amount)); // (1,500 + 1,700 + 1,840) / 3
        Assert.Empty(CashForecast.ExpectedBills([(new DateOnly(2026, 9, 25), 100m, "INR")], Today, Until)); // one bill: no pattern
        // Every two months.
        Assert.Equal([new DateOnly(2026, 11, 10)], CashForecast.ExpectedBills(
            [(new DateOnly(2026, 7, 10), 900m, "INR"), (new DateOnly(2026, 9, 10), 900m, "INR")], Today, new DateOnly(2026, 12, 31)).Select(e => e.Day));
    }

    [Fact]
    public void Premiums_fall_due_every_period_from_their_start_until_the_policy_ends()
    {
        Assert.Equal(
            [new DateOnly(2027, 1, 15)],
            CashForecast.PremiumDays("Quarterly", new DateOnly(2026, 1, 15), null, Today, Until));
        Assert.Equal(
            [new DateOnly(2026, 10, 31), new DateOnly(2026, 11, 30), new DateOnly(2026, 12, 31)],
            CashForecast.PremiumDays("Monthly", new DateOnly(2026, 1, 31), new DateOnly(2027, 1, 15), Today, Until));
        Assert.Empty(CashForecast.PremiumDays("Single", new DateOnly(2026, 1, 15), null, Today, Until));
    }
}
