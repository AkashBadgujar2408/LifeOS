using LifeOS.Core.Dashboard.DTOs;
using LifeOS.Core.Dashboard.Services;
using LifeOS.Core.Finance.Services;

namespace LifeOS.Core.Tests.Finance;

public class FinancePlansTests
{
    private static readonly DateOnly Today = new(2026, 10, 18);

    [Fact]
    public void A_new_monthly_schedule_writes_every_day_due_so_far_and_nothing_twice()
    {
        var start = new DateOnly(2026, 8, 1);
        var first = RecurringSchedule.Due("Monthly", 1, start, null, null, Today);
        Assert.Equal([new(2026, 8, 1), new(2026, 9, 1), new(2026, 10, 1)], first);

        var through = RecurringSchedule.WrittenThrough(first, null, Today);
        Assert.Equal(Today, through);
        Assert.Empty(RecurringSchedule.Due("Monthly", 1, start, null, through, Today));

        // The next month's rent arrives once, on its day.
        Assert.Empty(RecurringSchedule.Due("Monthly", 1, start, null, through, new DateOnly(2026, 10, 31)));
        Assert.Equal([new DateOnly(2026, 11, 1)], RecurringSchedule.Due("Monthly", 1, start, null, through, new DateOnly(2026, 11, 1)));
        Assert.Equal(new DateOnly(2026, 11, 1), RecurringSchedule.Next("Monthly", 1, start, null, through));
    }

    [Fact]
    public void Month_ends_clamp_and_come_back()
    {
        var due = RecurringSchedule.Due("Monthly", 1, new DateOnly(2026, 1, 31), null, null, new DateOnly(2026, 4, 30));
        Assert.Equal([new(2026, 1, 31), new(2026, 2, 28), new(2026, 3, 31), new(2026, 4, 30)], due);
    }

    [Fact]
    public void A_schedule_stops_at_its_last_day()
    {
        var until = new DateOnly(2026, 9, 15);
        var due = RecurringSchedule.Due("Weekly", 2, new DateOnly(2026, 8, 1), until, null, Today);
        Assert.Equal([new(2026, 8, 1), new(2026, 8, 15), new(2026, 8, 29), new(2026, 9, 12)], due);
        Assert.Equal(until, RecurringSchedule.WrittenThrough(due, until, Today));
        Assert.Null(RecurringSchedule.Next("Weekly", 2, new DateOnly(2026, 8, 1), until, until));
    }

    [Fact]
    public void A_future_start_writes_nothing_yet()
    {
        Assert.Empty(RecurringSchedule.Due("Monthly", 1, new DateOnly(2026, 11, 5), null, null, Today));
        Assert.Equal(new DateOnly(2026, 11, 5), RecurringSchedule.Next("Monthly", 1, new DateOnly(2026, 11, 5), null, null));
    }

    [Fact]
    public void A_long_catch_up_is_written_in_slices()
    {
        var due = RecurringSchedule.Due("Daily", 1, new DateOnly(2024, 1, 1), null, null, Today);
        Assert.Equal(RecurringSchedule.MaxPerRun, due.Count);
        var through = RecurringSchedule.WrittenThrough(due, null, Today);
        Assert.Equal(due[^1], through);
        Assert.Equal(through.AddDays(1), RecurringSchedule.Due("Daily", 1, new DateOnly(2024, 1, 1), null, through, Today)[0]);
    }

    [Fact]
    public void Resuming_carries_on_from_today_without_catching_up()
    {
        Assert.Equal(Today.AddDays(-1), RecurringSchedule.OnResume(new DateOnly(2026, 7, 1), Today));
        Assert.Equal(Today.AddDays(-1), RecurringSchedule.OnResume(null, Today));
        Assert.Equal(Today, RecurringSchedule.OnResume(Today, Today));
    }

    [Fact]
    public void Budget_lines_say_what_is_left_and_what_is_over()
    {
        var lines = BudgetSummary.Summarise(
            [
                new BudgetSummary.Line(1, "Groceries", 8000m, "INR", 9250m, 6, 0),
                new BudgetSummary.Line(2, "Eating out", 3000m, "INR", 1500m, 3, 0),
                new BudgetSummary.Line(3, "Books", null, null, 600m, 1, 0),
                new BudgetSummary.Line(4, "Fuel", 2000m, "USD", 1800m, 2, 0),
                new BudgetSummary.Line(5, "Gifts", null, null, 2500m, 1, 0),
            ],
            "INR");

        Assert.Equal(["Groceries", "Eating out", "Fuel", "Gifts", "Books"], lines.Select(l => l.TagName));
        var groceries = lines[0];
        Assert.True(groceries.IsOver);
        Assert.Equal(-1250m, groceries.Remaining);
        Assert.Equal(115, groceries.PercentUsed);
        Assert.Equal(1500m, lines[1].Remaining);
        Assert.Equal(50, lines[1].PercentUsed);
        // A budget set in another currency (before the base changed) is shown, not judged.
        Assert.Null(lines[2].PercentUsed);
        Assert.False(lines[2].IsOver);
        Assert.Null(lines[4].Remaining);
    }

    [Fact]
    public void Spending_exactly_the_budget_is_not_over()
    {
        var line = BudgetSummary.Summarise([new BudgetSummary.Line(1, "Rent", 20000m, "INR", 20000m, 1, 0)], "INR")[0];
        Assert.False(line.IsOver);
        Assert.Equal(100, line.PercentUsed);
        Assert.Equal(0m, line.Remaining);
    }

    [Fact]
    public void An_over_budget_tag_is_a_nudge_keyed_by_the_month()
    {
        var insights = DashboardInsights.Evaluate(new InsightInputs(
            Today, new DateTime(2026, 10, 18, 9, 0, 0, DateTimeKind.Utc), [], [], null, 0, null,
            [new InsightBudget(7, "Groceries", 9250m, 8000m, "INR")]));

        var insight = Assert.Single(insights);
        Assert.Equal(InsightKinds.OverBudget, insight.Kind);
        Assert.Equal(InsightTones.Nudge, insight.Tone);
        Assert.Equal("OverBudget:7:2026-10", insight.Key);
        Assert.Equal("Budgets", insight.EntityType);
        Assert.Equal("\"Groceries\" has gone past its October budget: 9,250 INR of 8,000. Worth a look before the month is out.", insight.Message);

        Assert.Contains("1,650.50 INR of 1,500.", DashboardInsights.OverBudgetMessage(new InsightBudget(7, "Groceries", 1650.5m, 1500m, "INR"), Today));

        // Back under (the budget raised) or nothing budgeted: no nudge.
        Assert.Empty(DashboardInsights.Evaluate(new InsightInputs(Today, DateTime.UtcNow, [], [], null, 0, null, [])));
    }
}
