using LifeOS.Core.Finance.DTOs;
using LifeOS.Core.Reports.Services;
using LifeOS.Core.Story.DTOs;

namespace LifeOS.Core.Tests.Reports;

public class YearReportsTests
{
    private static DateOnly D(int year, int month, int day) => new(year, month, day);

    [Fact]
    public void Net_worth_is_read_the_day_before_the_range_at_each_month_end_and_on_its_last_day_or_today()
    {
        Assert.Equal(
            [D(2026, 1, 14), D(2026, 1, 31), D(2026, 2, 28), D(2026, 3, 10)],
            FinanceReport.NetWorthDays(D(2026, 1, 15), D(2026, 3, 10), D(2026, 10, 22)));
        // Running on past today: ends today; a range all ahead has none.
        Assert.Equal([D(2026, 9, 30), D(2026, 10, 22)], FinanceReport.NetWorthDays(D(2026, 10, 1), D(2026, 12, 31), D(2026, 10, 22)));
        Assert.Empty(FinanceReport.NetWorthDays(D(2026, 11, 1), D(2026, 11, 30), D(2026, 10, 22)));
    }

    [Fact]
    public void The_money_report_takes_cash_flow_totals_and_the_net_worth_change()
    {
        var cashFlow = new CashFlowReportDto
        {
            Currency = "INR",
            Total = new CashFlowMonthDto { Income = 1000, Spending = 600, Net = 400, SavingsRate = 40 },
            Tags = [new() { TagName = "Food", Spent = 100 }, new() { TagName = "Rent", Spent = 500 }],
        };
        var netWorth = new NetWorthPointsDto
        {
            Currency = "INR",
            Points = [new() { Day = D(2026, 9, 30), Net = 5000 }, new() { Day = D(2026, 10, 22), Net = 5400 }],
        };

        var report = FinanceReport.Build(cashFlow, netWorth, D(2026, 10, 1), D(2026, 10, 31));

        Assert.Equal((1000m, 600m, 400m, 40m), (report.Income, report.Spending, report.Net, report.SavingsRate!.Value));
        Assert.Equal(400m, report.NetWorthChange);
        Assert.Equal(["Rent", "Food"], report.Tags.Select(t => t.TagName)); // biggest spending first
        Assert.Null(FinanceReport.Build(new CashFlowReportDto(), new NetWorthPointsDto(), D(2026, 10, 1), D(2026, 10, 31)).Currency);
    }

    [Fact]
    public void Months_are_clipped_to_the_range_and_stop_at_today()
    {
        var months = ReportMath.Months(D(2026, 8, 15), D(2026, 12, 31), D(2026, 10, 22));
        Assert.Equal(3, months.Count);
        Assert.Equal((D(2026, 8, 1), D(2026, 8, 15), D(2026, 8, 31)), months[0]);
        Assert.Equal((D(2026, 10, 1), D(2026, 10, 1), D(2026, 10, 22)), months[2]);
    }

    [Fact]
    public void Life_balance_puts_each_month_score_beside_its_rating_and_averages_per_area()
    {
        AreaFact[] areas = [new(1, "Career"), new(2, "Health")];
        LifeBalanceMonthFact[] months =
        [
            new(D(2026, 8, 1), D(2026, 8, 1), D(2026, 8, 31), [(1, 40, 10m), (2, 20, 5m)]),
            new(D(2026, 9, 1), D(2026, 9, 1), D(2026, 9, 30), [(1, 10, 5m), (2, 20, 10m)]),
        ];
        RatingFact[] ratings = [new(D(2026, 8, 1), 1, 7), new(D(2026, 9, 1), 1, 8), new(D(2026, 9, 1), 2, 4)];

        var report = LifeBalanceReport.Build(areas, months, ratings, D(2026, 8, 1), D(2026, 9, 30));

        var career = report.Areas[0];
        Assert.Equal((7.5m, 7.5m, 2, 50), (career.AverageScore!.Value, career.AverageRating!.Value, career.MonthsRated, career.Points));
        Assert.Equal((4m, 1), (report.Areas[1].AverageRating!.Value, report.Areas[1].MonthsRated));
        Assert.Null(report.Months[0].Areas[1].Rating);
        Assert.Equal((byte)8, report.Months[1].Areas[0].Rating);
    }

    [Fact]
    public void The_year_takes_overlapping_chapters_and_its_big_moments()
    {
        ChapterDto[] chapters =
        [
            new() { Id = 1, Title = "University", StartDate = D(2020, 9, 1), EndDate = D(2025, 6, 30) },
            new() { Id = 2, Title = "First job", StartDate = D(2025, 7, 1), EndDate = D(2026, 3, 31) },
            new() { Id = 3, Title = "Moving abroad", StartDate = D(2026, 4, 1) },
        ];
        Assert.Equal([2, 3], AnnualReview.ChaptersIn(chapters, 2026, D(2026, 10, 22)).Select(c => c.Id));
        Assert.Equal([1, 2], AnnualReview.ChaptersIn(chapters, 2025, D(2026, 10, 22)).Select(c => c.Id));

        StoryBeatDto[] beats =
        [
            new() { Kind = StoryBeatKinds.MissionPassed, Day = D(2026, 5, 1), Title = "Run a half marathon" },
            new() { Kind = StoryBeatKinds.MilestoneDone, Day = D(2026, 4, 1), Title = "10 km" },
            new() { Kind = StoryBeatKinds.NewRole, Day = D(2026, 2, 1), Title = "Engineer" },
            new() { Kind = StoryBeatKinds.MissionPassed, Day = D(2025, 12, 31), Title = "Last year" },
        ];
        var (count, highlights) = AnnualReview.Beats(beats, 2026);
        Assert.Equal(3, count);
        Assert.Equal(["Engineer", "Run a half marathon"], highlights.Select(b => b.Title));
    }
}
