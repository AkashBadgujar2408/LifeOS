using LifeOS.Core.Finance.DTOs;
using LifeOS.Core.Reports.DTOs;
using LifeOS.Core.Story.DTOs;

namespace LifeOS.Core.Reports.Services;

/// <summary>
/// The consolidated money report (Session 92): cash flow from <c>finance.GetCashFlow</c> (the ledger's own counting)
/// and net worth from <c>NetWorth.At</c> before and after the range — never stored.
/// </summary>
public static class FinanceReport
{
    /// <summary>
    /// The days net worth is read on: the day before the range (its opening), every month end inside it, and its last
    /// day — or today when the range runs on past today. Empty when the range is all ahead.
    /// </summary>
    public static List<DateOnly> NetWorthDays(DateOnly from, DateOnly to, DateOnly today)
    {
        var end = to < today ? to : today;
        if (end < from)
        {
            return [];
        }

        var days = new List<DateOnly> { from.AddDays(-1) };
        for (var monthEnd = new DateOnly(from.Year, from.Month, 1).AddMonths(1).AddDays(-1);
             monthEnd < end;
             monthEnd = monthEnd.AddDays(1).AddMonths(1).AddDays(-1))
        {
            days.Add(monthEnd);
        }

        days.Add(end);
        return days;
    }

    public static FinanceReportDto Build(CashFlowReportDto cashFlow, NetWorthPointsDto netWorth, DateOnly from, DateOnly to)
    {
        if (cashFlow.Currency is null)
        {
            return new FinanceReportDto { From = from, To = to };
        }

        var points = netWorth.Points;
        var start = points.Count > 0 ? points[0] : null;
        var end = points.Count > 0 ? points[^1] : null;
        return new FinanceReportDto
        {
            From = from,
            To = to,
            Currency = cashFlow.Currency,
            Income = cashFlow.Total.Income,
            Spending = cashFlow.Total.Spending,
            Net = cashFlow.Total.Net,
            SavingsRate = cashFlow.Total.SavingsRate,
            Unconverted = cashFlow.Total.Unconverted,
            Months = cashFlow.Months,
            Tags = [.. cashFlow.Tags.OrderByDescending(t => t.Spent).ThenBy(t => t.TagName, StringComparer.OrdinalIgnoreCase)],
            UntaggedSpending = cashFlow.UntaggedSpending,
            NetWorthStart = start,
            NetWorthEnd = end,
            NetWorthChange = start is not null && end is not null ? end.Net - start.Net : null,
            NetWorth = points,
        };
    }
}

/// <summary>One month's life balance as My Day's card computes it for those days (LifeBalance.Points/Scores).</summary>
public record LifeBalanceMonthFact(DateOnly MonthStart, DateOnly From, DateOnly To, IReadOnlyList<(int LifeAreaId, int Points, decimal Score)> Areas);

/// <summary>A self-rating: the month (its first day), the area, 1–10.</summary>
public record RatingFact(DateOnly MonthStart, int LifeAreaId, byte Rating);

/// <summary>
/// Life balance over time (Session 92): each month's activity score beside the rating you gave that area that month,
/// and per area the averages over the months — never stored.
/// </summary>
public static class LifeBalanceReport
{
    public static LifeBalanceReportDto Build(
        IReadOnlyList<AreaFact> areas,
        IReadOnlyList<LifeBalanceMonthFact> months,
        IReadOnlyCollection<RatingFact> ratings,
        DateOnly from,
        DateOnly to)
    {
        var rated = ratings.ToDictionary(r => (r.MonthStart, r.LifeAreaId), r => r.Rating);
        var monthDtos = months
            .Select(m => new LifeBalanceMonthDto
            {
                MonthStart = m.MonthStart,
                From = m.From,
                To = m.To,
                Areas = areas
                    .Select(a =>
                    {
                        var cell = m.Areas.FirstOrDefault(x => x.LifeAreaId == a.Id);
                        return new LifeBalanceCellDto
                        {
                            LifeAreaId = a.Id,
                            Points = cell.Points,
                            Score = cell.Score,
                            Rating = rated.TryGetValue((m.MonthStart, a.Id), out var rating) ? rating : null,
                        };
                    })
                    .ToList(),
            })
            .ToList();

        return new LifeBalanceReportDto
        {
            From = from,
            To = to,
            Months = monthDtos,
            Areas = areas
                .Select(a =>
                {
                    var cells = monthDtos.Select(m => m.Areas.First(c => c.LifeAreaId == a.Id)).ToList();
                    var ratingsGiven = cells.Where(c => c.Rating is not null).Select(c => (int?)c.Rating).ToList();
                    return new LifeBalanceReportAreaDto
                    {
                        LifeAreaId = a.Id,
                        LifeAreaName = a.Name,
                        AverageScore = cells.Count == 0 ? null
                            : Math.Round(cells.Average(c => c.Score), 1, MidpointRounding.AwayFromZero),
                        AverageRating = ReportMath.Average(ratingsGiven),
                        MonthsRated = ratingsGiven.Count,
                        Points = cells.Sum(c => c.Points),
                    };
                })
                .ToList(),
        };
    }
}

/// <summary>Pure pieces of the Annual Life Review (Session 92).</summary>
public static class AnnualReview
{
    /// <summary>The beat kinds that make a year's highlights — the big moments, not the everyday ones.</summary>
    public static readonly IReadOnlySet<string> HighlightKinds = new HashSet<string>(StringComparer.Ordinal)
    {
        StoryBeatKinds.MissionPassed,
        StoryBeatKinds.NewRole,
        StoryBeatKinds.CareerPromotion,
        StoryBeatKinds.CareerProject,
        StoryBeatKinds.CareerAward,
        StoryBeatKinds.CareerContribution,
        StoryBeatKinds.CareerOther,
        StoryBeatKinds.Memory,
        StoryBeatKinds.MediaFinished,
    };

    /// <summary>Chapters that overlap the year (an open chapter runs to today).</summary>
    public static List<ChapterDto> ChaptersIn(IEnumerable<ChapterDto> chapters, int year, DateOnly today) =>
        [.. chapters
            .Where(c => c.StartDate.Year <= year && (c.EndDate ?? today).Year >= year)
            .OrderBy(c => c.StartDate)];

    /// <summary>The year's beats: how many, and its highlights oldest first.</summary>
    public static (int Count, List<StoryBeatDto> Highlights) Beats(IEnumerable<StoryBeatDto> beats, int year)
    {
        var inYear = beats.Where(b => b.Day.Year == year).ToList();
        return (inYear.Count, [.. inYear.Where(b => HighlightKinds.Contains(b.Kind)).OrderBy(b => b.Day).ThenBy(b => b.At)]);
    }
}
