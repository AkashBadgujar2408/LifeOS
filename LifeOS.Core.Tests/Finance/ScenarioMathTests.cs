using LifeOS.Core.Finance.Services;

namespace LifeOS.Core.Tests.Finance;

public class ScenarioMathTests
{
    private static readonly DateOnly Today = new(2026, 10, 20);

    private static ScenarioLineInput Line(string kind, decimal amount, DateOnly starts, DateOnly? ends = null, decimal? rate = null, int? term = null) =>
        new(kind, kind, amount, starts, ends, 1, rate, term);

    [Fact]
    public void A_scenario_becomes_dated_money_for_the_forecast()
    {
        var flows = ScenarioMath.Flows(
            [
                Line("Purchase", 50_000, new DateOnly(2026, 11, 1)),
                Line("MonthlyCost", 2_000, new DateOnly(2026, 11, 5), new DateOnly(2027, 1, 5)),
                Line("Loan", 12_000, new DateOnly(2026, 11, 1), rate: 0, term: 12),
            ],
            new DateOnly(2027, 1, 31), "INR");

        Assert.Equal(-50_000, flows.Where(f => f.Title == "Purchase").Sum(f => f.Amount));
        Assert.Equal([new DateOnly(2026, 11, 5), new DateOnly(2026, 12, 5), new DateOnly(2027, 1, 5)],
            flows.Where(f => f.Title == "MonthlyCost").Select(f => f.Day));
        // The loan pays for what it's for: only its EMIs move money.
        Assert.DoesNotContain(flows, f => f.Title == "Loan" || f.Amount > 0);
        // 0% over 12 months: ₹1,000 EMIs from a month after the start, two of them by the end of January.
        Assert.Equal([-1_000m, -1_000m], flows.Where(f => f.Title == "Loan EMI").Select(f => f.Amount));
    }

    [Fact]
    public void Money_falls_in_the_month_it_happens()
    {
        var changes = ScenarioMath.MonthlyChanges(
            [Line("Purchase", 500, new DateOnly(2026, 11, 20)), Line("Purchase", 700, new DateOnly(2026, 11, 21)), Line("Purchase", 100, Today)],
            Today, 3);

        // (20 Oct, 20 Nov] is month 1, (20 Nov, 20 Dec] month 2; today's own money is already in the balance.
        Assert.Equal([0m, -500m, -700m, 0m], changes);
    }

    [Fact]
    public void A_goal_is_reached_later_when_less_goes_in()
    {
        Assert.Equal(12, ScenarioMath.MonthsToReach(12_000, 0, 1_000, 0));
        var less = Enumerable.Repeat(-500m, 40).ToArray();
        Assert.Equal(24, ScenarioMath.MonthsToReach(12_000, 0, 1_000, 0, less));
        Assert.Equal(0, ScenarioMath.MonthsToReach(12_000, 12_000, 0, 0));
        Assert.Null(ScenarioMath.MonthsToReach(12_000, 0, 0, 0));

        // Two goals getting 1,000 and 3,000 a month share a −2,000 change 1 : 3.
        var shifts = ScenarioMath.Goals(
            [new ScenarioGoal(1, "Car", 12_000, 0, 1_000), new ScenarioGoal(2, "House", 36_000, 0, 3_000)],
            Enumerable.Repeat(-2_000m, 100).ToArray(), 0);
        Assert.Equal((12, 24), (shifts[0].MonthsBefore, shifts[0].MonthsAfter));
        Assert.Equal((12, 24), (shifts[1].MonthsBefore, shifts[1].MonthsAfter));
    }

    [Fact]
    public void Retirement_without_changes_equals_the_plan_and_a_big_purchase_pushes_it_back()
    {
        var plan = FinancialPlan.Retirement(30, 60, 25, 50_000, 500_000, 20_000, 10, 6);
        var (before, projected) = ScenarioMath.Retirement(30, 60, 25, 50_000, 500_000, 20_000, 10, 6);

        Assert.Equal(plan.AgeReached, before);
        Assert.InRange(projected, plan.ProjectedCorpus - 1, plan.ProjectedCorpus + 1);

        // ₹20 lakh spent next month: retiring is pushed back.
        var changes = new decimal[841];
        changes[1] = -2_000_000;
        var (after, lower) = ScenarioMath.Retirement(30, 60, 25, 50_000, 500_000, 20_000, 10, 6, changes);
        Assert.True(after > before);
        Assert.True(lower < projected);
    }

    [Fact]
    public void Lines_are_checked_by_kind()
    {
        Assert.Null(ScenarioMath.Check(Line("Purchase", 50_000, Today.AddDays(10)), Today));
        Assert.Null(ScenarioMath.Check(Line("PayChange", -5_000, Today.AddDays(10)), Today));
        Assert.NotNull(ScenarioMath.Check(Line("Purchase", -1, Today), Today));
        Assert.NotNull(ScenarioMath.Check(Line("PayChange", 0, Today), Today));
        Assert.NotNull(ScenarioMath.Check(Line("Loan", 10_000, Today), Today)); // no rate / term
        Assert.NotNull(ScenarioMath.Check(Line("Purchase", 10, Today, Today.AddDays(30)), Today)); // a one-off has no end
        Assert.NotNull(ScenarioMath.Check(Line("MonthlyCost", 10, Today, Today.AddDays(-1)), Today));
        Assert.NotNull(ScenarioMath.Check(Line("PayChange", -5_000, Today.AddYears(-2)), Today)); // a pay change still checks its day
        Assert.NotNull(ScenarioMath.Check(Line("Purchase", 10, Today.AddDays(-1)), Today)); // nothing in the past
    }

    [Fact]
    public void A_what_if_dated_today_counts_tomorrow()
    {
        var lines = ScenarioMath.Upcoming([Line("Purchase", 500, Today), Line("Purchase", 700, Today.AddDays(5))], Today);

        Assert.Equal([Today.AddDays(1), Today.AddDays(5)], lines.Select(l => l.StartsOn));
        Assert.Equal(-1_200, ScenarioMath.MonthlyChanges(lines, Today, 1).Sum());
    }
}
