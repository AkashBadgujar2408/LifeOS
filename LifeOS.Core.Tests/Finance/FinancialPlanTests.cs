using LifeOS.Core.Finance.Services;

namespace LifeOS.Core.Tests.Finance;

/// <summary>Reference figures were computed independently with the spreadsheet formulas (PMT / FV, floating point).</summary>
public class FinancialPlanTests
{
    private static readonly DateOnly Today = new(2026, 10, 20);

    private static void Close(decimal expected, decimal actual, decimal tolerance) =>
        Assert.InRange(actual, expected - tolerance, expected + tolerance);

    [Fact]
    public void Needed_per_month_matches_a_spreadsheet_pmt()
    {
        // ₹3,00,000 in 24 months with ₹50,000 saved, at 8% a year: spreadsheet says 9,306.82; at 0%: 10,416.67.
        Close(9_306.82m, FinancialPlan.NeededPerMonth(300_000, 50_000, 24, 8), 0.02m);
        Assert.Equal(10_416.67m, FinancialPlan.NeededPerMonth(300_000, 50_000, 24, 0));
        Assert.Equal(0, FinancialPlan.NeededPerMonth(300_000, 300_000, 24, 8));
        Assert.Equal(250_000m, FinancialPlan.NeededPerMonth(300_000, 50_000, 0, 8)); // no time left: all of it
    }

    [Fact]
    public void Months_until_count_whole_months()
    {
        Assert.Equal(24, FinancialPlan.MonthsUntil(Today, new DateOnly(2028, 10, 20)));
        Assert.Equal(23, FinancialPlan.MonthsUntil(Today, new DateOnly(2028, 10, 19)));
        Assert.Equal(0, FinancialPlan.MonthsUntil(Today, new DateOnly(2026, 1, 1)));
    }

    [Fact]
    public void A_goal_is_on_track_when_the_last_three_months_put_in_at_least_whats_needed()
    {
        var target = new DateOnly(2028, 10, 20);
        // Needs ~9,306.82 a month; saving 10,000 a month lately → on track; 6,000 → behind.
        Assert.Equal(SavingsPlanStatuses.OnTrack, FinancialPlan.Savings(300_000, 50_000, 20_000, target, Today, 8).Status);
        var behind = FinancialPlan.Savings(300_000, 50_000, 32_000, target, Today, 8);
        Assert.Equal((SavingsPlanStatuses.Behind, 6_000m), (behind.Status, behind.ActualPerMonth));
        // Funded ahead of schedule.
        Assert.Equal(SavingsPlanStatuses.Reached, FinancialPlan.Savings(300_000, 310_000, 250_000, target, Today, 8).Status);
        Assert.Equal(SavingsPlanStatuses.NoDate, FinancialPlan.Savings(300_000, 50_000, 40_000, null, Today, 8).Status);
        Assert.Equal(SavingsPlanStatuses.Overdue, FinancialPlan.Savings(300_000, 50_000, 40_000, new DateOnly(2026, 9, 1), Today, 8).Status);
    }

    [Fact]
    public void Retirement_matches_the_spreadsheet()
    {
        // Age 30, retire at 60 for 25 years, ₹50,000 a month today, ₹5,00,000 invested, saving ₹20,000 a month,
        // 10% return, 6% inflation.
        var plan = FinancialPlan.Retirement(30, 60, 25, 50_000, 500_000, 20_000, 10, 6);

        Assert.Equal(30, plan.YearsToRetirement);
        Close(287_174.56m, plan.MonthlySpendingAtRetirement, 0.02m);
        Close(57_228_024.74m, plan.CorpusNeeded, 1m);
        Close(86_152_367.59m, plan.RuleOf25, 1m);
        Close(55_128_458.18m, plan.ProjectedCorpus, 1m);
        Assert.Equal(61, plan.AgeReached); // short at 60, covered a year later
        Assert.Equal(30, plan.Points[0].Age);
        Assert.Equal(65, plan.Points[^1].Age);
    }

    [Fact]
    public void Ages_count_whole_years()
    {
        Assert.Equal(30, FinancialPlan.Age(new DateOnly(1996, 10, 20), Today));
        Assert.Equal(29, FinancialPlan.Age(new DateOnly(1996, 10, 21), Today));
    }
}
