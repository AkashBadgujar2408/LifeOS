using LifeOS.Core.Reports.DTOs;
using LifeOS.Core.Reports.Services;

namespace LifeOS.Core.Tests.Reports;

public class CustomReportsTests
{
    private static readonly DateOnly Today = new(2026, 10, 22);
    private static DateOnly D(int year, int month, int day) => new(year, month, day);

    private static CustomReportDefinition Def(string metric = CustomMetricKeys.TasksDone, int? area = null, int? tag = null,
        string grouping = CustomGroupings.Month, string compare = CustomCompares.None, string? preset = "year",
        DateOnly? from = null, DateOnly? to = null) =>
        new() { Metric = metric, LifeAreaId = area, TagId = tag, Grouping = grouping, Compare = compare, RangePreset = preset, From = from, To = to };

    [Fact]
    public void Presets_match_the_report_pages()
    {
        Assert.Equal((D(2026, 10, 1), D(2026, 10, 31)), CustomReports.Preset("month", Today));
        Assert.Equal((D(2026, 9, 1), D(2026, 9, 30)), CustomReports.Preset("last-month", Today));
        Assert.Equal((D(2026, 8, 1), D(2026, 10, 31)), CustomReports.Preset("3-months", Today));
        Assert.Equal((D(2025, 1, 1), D(2025, 12, 31)), CustomReports.Preset("last-year", Today));
        Assert.Equal((D(2025, 12, 1), D(2025, 12, 31)), CustomReports.Preset("last-month", D(2026, 1, 5)));
        Assert.Null(CustomReports.Preset("decade", Today));
    }

    [Fact]
    public void A_definition_is_checked_before_it_runs()
    {
        Assert.Null(CustomReports.Check(Def(), Today, out var from, out var to));
        Assert.Equal((D(2026, 1, 1), D(2026, 12, 31)), (from, to));
        Assert.NotNull(CustomReports.Check(Def("nope"), Today, out _, out _));
        Assert.NotNull(CustomReports.Check(Def(area: 1), Today, out _, out _));                                   // tasks have no area filter
        Assert.NotNull(CustomReports.Check(Def(CustomMetricKeys.LifeRating), Today, out _, out _));                // rating needs an area
        Assert.NotNull(CustomReports.Check(Def(CustomMetricKeys.Income, tag: 3), Today, out _, out _));            // only spending by tag
        Assert.Null(CustomReports.Check(Def(CustomMetricKeys.Spending, tag: 3), Today, out _, out _));
        Assert.NotNull(CustomReports.Check(Def(preset: "year", from: D(2026, 1, 1), to: D(2026, 2, 1)), Today, out _, out _));
        Assert.NotNull(CustomReports.Check(Def(preset: null, from: D(2026, 3, 1), to: D(2026, 2, 1)), Today, out _, out _));
        // Three years of weeks is too many bars; by month it's fine.
        Assert.NotNull(CustomReports.Check(Def(grouping: CustomGroupings.Week, preset: null, from: D(2024, 1, 1), to: D(2026, 10, 1)), Today, out _, out _));
        Assert.Null(CustomReports.Check(Def(preset: null, from: D(2024, 1, 1), to: D(2026, 10, 1)), Today, out _, out _));
    }

    [Fact]
    public void A_comparison_is_the_same_length_just_before_or_the_same_days_a_year_back()
    {
        Assert.Equal((D(2026, 8, 2), D(2026, 8, 31)), CustomReports.CompareRange(D(2026, 9, 1), D(2026, 9, 30), CustomCompares.PreviousPeriod));
        Assert.Equal((D(2025, 9, 1), D(2025, 9, 30)), CustomReports.CompareRange(D(2026, 9, 1), D(2026, 9, 30), CustomCompares.PreviousYear));
        Assert.Null(CustomReports.CompareRange(D(2026, 9, 1), D(2026, 9, 30), CustomCompares.None));
    }

    [Fact]
    public void Metrics_read_the_same_figure_the_tabs_show_filtered_where_there_is_a_breakdown()
    {
        var goals = new GoalReportDto
        {
            Totals = new GoalReportCountsDto { Completed = 5, OnTimePercent = 60 },
            Areas = [new GoalReportAreaDto { LifeAreaId = 2, Completed = 2, OnTimePercent = 100 }],
        };
        Assert.Equal(5, CustomReports.FromGoals(goals, CustomMetricKeys.GoalsCompleted, null));
        Assert.Equal(100, CustomReports.FromGoals(goals, CustomMetricKeys.GoalsOnTime, 2));
        Assert.Equal(0, CustomReports.FromGoals(goals, CustomMetricKeys.GoalsCompleted, 9)); // nothing in that area

        var habits = new HabitReportDto
        {
            Habits =
            [
                new() { Kind = "Build", LifeAreaId = 3, Good = 8, Total = 10 },
                new() { Kind = "Build", LifeAreaId = 4, Good = 1, Total = 10 },
                new() { Kind = "Avoid", LifeAreaId = 3, Good = 0, Total = 10 },
            ],
        };
        Assert.Equal(45, CustomReports.FromHabits(habits, null));
        Assert.Equal(80, CustomReports.FromHabits(habits, 3));

        var money = new FinanceReportDto { Currency = "INR", Spending = 900, Tags = [new() { TagId = 7, Spent = 250 }] };
        Assert.Equal(250m, CustomReports.FromFinance(money, CustomMetricKeys.Spending, 7));
        Assert.Equal(0m, CustomReports.FromFinance(money, CustomMetricKeys.Spending, 8));
        Assert.Equal(900m, CustomReports.FromFinance(money, CustomMetricKeys.Spending, null));
        Assert.Null(CustomReports.FromFinance(new FinanceReportDto(), CustomMetricKeys.Income, null)); // no base currency
    }
}
