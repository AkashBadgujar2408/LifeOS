using LifeOS.Core.Habits.DTOs;
using LifeOS.Core.Reports.DTOs;

namespace LifeOS.Core.Reports.Services;

/// <summary>
/// Custom reports (Session 93), the pure part: the metric catalogue, the checks on a definition, its days, buckets and
/// comparison, and how each metric is read off the report it repeats. Every number comes from a report tab's own
/// builder (run per bucket by <c>CustomReportsService</c>), so a custom report always agrees with the tabs.
/// </summary>
public static class CustomReports
{
    /// <summary>At most this many weeks or months on one chart.</summary>
    public const int MaxBuckets = 60;

    private static CustomMetricDto M(string key, string label, string unit, string filter, string? module, string report) =>
        new() { Key = key, Label = label, Unit = unit, Filter = filter, Module = module, Report = report };

    /// <summary>The catalogue, in the order the picker shows it. Health stays out (its figures need the vault).</summary>
    public static readonly IReadOnlyList<CustomMetricDto> Metrics =
    [
        M(CustomMetricKeys.GoalsCompleted, "Goals completed", CustomMetricUnits.Count, CustomMetricFilters.LifeArea, "Goals", "goals"),
        M(CustomMetricKeys.GoalsOnTime, "Goals completed on time", CustomMetricUnits.Percent, CustomMetricFilters.LifeArea, "Goals", "goals"),
        M(CustomMetricKeys.HabitConsistency, "Habit consistency", CustomMetricUnits.Percent, CustomMetricFilters.LifeArea, "Habits", "habits"),
        M(CustomMetricKeys.TasksDone, "Tasks done", CustomMetricUnits.Count, CustomMetricFilters.None, "Tasks", "productivity"),
        M(CustomMetricKeys.OverdueRate, "Overdue rate", CustomMetricUnits.Percent, CustomMetricFilters.None, "Tasks", "productivity"),
        M(CustomMetricKeys.FocusMinutes, "Focus time", CustomMetricUnits.Minutes, CustomMetricFilters.LifeArea, "Tasks", "productivity"),
        M(CustomMetricKeys.TrackedMinutes, "Tracked time (focus, study, practice)", CustomMetricUnits.Minutes, CustomMetricFilters.LifeArea, null, "productivity"),
        M(CustomMetricKeys.PlannedMinutes, "Planned time (calendar blocks)", CustomMetricUnits.Minutes, CustomMetricFilters.LifeArea, "Calendar", "productivity"),
        M(CustomMetricKeys.StudyMinutes, "Study time", CustomMetricUnits.Minutes, CustomMetricFilters.None, "Learning", "learning"),
        M(CustomMetricKeys.Income, "Income", CustomMetricUnits.Money, CustomMetricFilters.None, "Finance", "money"),
        M(CustomMetricKeys.Spending, "Spending", CustomMetricUnits.Money, CustomMetricFilters.Tag, "Finance", "money"),
        M(CustomMetricKeys.SavingsRate, "Savings rate", CustomMetricUnits.Percent, CustomMetricFilters.None, "Finance", "money"),
        M(CustomMetricKeys.NetWorthChange, "Net worth change", CustomMetricUnits.Money, CustomMetricFilters.None, "Finance", "money"),
        M(CustomMetricKeys.LifeBalanceScore, "Life balance activity", CustomMetricUnits.Score, CustomMetricFilters.LifeAreaRequired, null, "balance"),
        M(CustomMetricKeys.LifeRating, "Your life area rating", CustomMetricUnits.Score, CustomMetricFilters.LifeAreaRequired, null, "balance"),
    ];

    public static CustomMetricDto? Metric(string key) => Metrics.FirstOrDefault(m => m.Key == key);

    /// <summary>A moving range's days for <paramref name="today"/> — the same presets as the client's report-range.ts.</summary>
    public static (DateOnly From, DateOnly To)? Preset(string? preset, DateOnly today)
    {
        var month = new DateOnly(today.Year, today.Month, 1);
        return preset switch
        {
            "month" => (month, month.AddMonths(1).AddDays(-1)),
            "last-month" => (month.AddMonths(-1), month.AddDays(-1)),
            "3-months" => (month.AddMonths(-2), month.AddMonths(1).AddDays(-1)),
            "year" => (new DateOnly(today.Year, 1, 1), new DateOnly(today.Year, 12, 31)),
            "last-year" => (new DateOnly(today.Year - 1, 1, 1), new DateOnly(today.Year - 1, 12, 31)),
            _ => null,
        };
    }

    /// <summary>
    /// Why a definition can't run, or null — and its days. Life areas and tags are checked to exist by the service
    /// (they're data); everything else is here.
    /// </summary>
    public static string? Check(CustomReportDefinition definition, DateOnly today, out DateOnly from, out DateOnly to)
    {
        from = to = default;
        if (Metric(definition.Metric) is not { } metric)
        {
            return "Pick something to count.";
        }

        if (definition.LifeAreaId is not null && metric.Filter is not (CustomMetricFilters.LifeArea or CustomMetricFilters.LifeAreaRequired))
        {
            return $"{metric.Label} can't be filtered by life area.";
        }

        if (definition.LifeAreaId is null && metric.Filter == CustomMetricFilters.LifeAreaRequired)
        {
            return $"Pick the life area for {metric.Label.ToLowerInvariant()}.";
        }

        if (definition.TagId is not null && metric.Filter != CustomMetricFilters.Tag)
        {
            return $"{metric.Label} can't be filtered by tag.";
        }

        if (definition.Grouping is not (CustomGroupings.Week or CustomGroupings.Month))
        {
            return "Group by week or by month.";
        }

        if (definition.Compare is not (CustomCompares.None or CustomCompares.PreviousPeriod or CustomCompares.PreviousYear))
        {
            return "Compare with nothing, the period before, or the year before.";
        }

        if (definition.RangePreset is not null)
        {
            if (definition.From is not null || definition.To is not null)
            {
                return "Pick a moving range or two dates, not both.";
            }

            if (Preset(definition.RangePreset, today) is not { } preset)
            {
                return "That range isn't one of the presets.";
            }

            (from, to) = preset;
        }
        else
        {
            if (definition.From is not { } first || definition.To is not { } last)
            {
                return "Pick the first and last day.";
            }

            if (last < first)
            {
                return "The end date must be on or after the start date.";
            }

            (from, to) = (first, last);
        }

        if (to.DayNumber - from.DayNumber + 1 > ReportMath.MaxDays)
        {
            return "Pick at most five years.";
        }

        return Buckets(from, to, today, definition.Grouping).Count > MaxBuckets
            ? $"That's more than {MaxBuckets} {(definition.Grouping == CustomGroupings.Week ? "weeks" : "months")} — group by month or pick a shorter range."
            : null;
    }

    /// <summary>The period a comparison runs over: the same number of days just before, or the same days a year back.</summary>
    public static (DateOnly From, DateOnly To)? CompareRange(DateOnly from, DateOnly to, string compare) => compare switch
    {
        CustomCompares.PreviousPeriod => (from.AddDays(-(to.DayNumber - from.DayNumber + 1)), from.AddDays(-1)),
        CustomCompares.PreviousYear => (from.AddYears(-1), to.AddYears(-1)),
        _ => null,
    };

    /// <summary>The weeks or months of a period up to today (each clipped to it).</summary>
    public static List<(DateOnly From, DateOnly To)> Buckets(DateOnly from, DateOnly to, DateOnly today, string grouping) =>
        grouping == CustomGroupings.Week
            ? [.. ReportMath.Weeks(from, to, today).Select(w => (w.From, w.To))]
            : [.. ReportMath.Months(from, to, today).Select(m => (m.From, m.To))];

    // ---- Reading a metric off its report: the same figure the tab shows (filtered where it has a breakdown) ----

    public static decimal? FromGoals(GoalReportDto report, string metric, int? lifeAreaId)
    {
        var counts = lifeAreaId is { } id
            ? report.Areas.FirstOrDefault(a => a.LifeAreaId == id) ?? new GoalReportAreaDto()
            : report.Totals;
        return metric == CustomMetricKeys.GoalsOnTime ? counts.OnTimePercent : counts.Completed;
    }

    /// <summary>Build habits' scheduled days done ÷ scheduled days, over the habits of the area (or all).</summary>
    public static decimal? FromHabits(HabitReportDto report, int? lifeAreaId)
    {
        var habits = report.Habits
            .Where(h => h.Kind != HabitKinds.Avoid && (lifeAreaId is null || h.LifeAreaId == lifeAreaId))
            .ToList();
        return ReportMath.Percent(habits.Sum(h => h.Good), habits.Sum(h => h.Total));
    }

    public static decimal? FromProductivity(ProductivityReportDto report, string metric, int? lifeAreaId)
    {
        var areas = lifeAreaId is { } id ? report.Areas.Where(a => a.LifeAreaId == id).ToList() : report.Areas;
        return metric switch
        {
            CustomMetricKeys.TasksDone => report.Tasks.Completed,
            CustomMetricKeys.OverdueRate => report.Tasks.OverdueRate,
            CustomMetricKeys.FocusMinutes => lifeAreaId is null ? report.Focus.Minutes : areas.Sum(a => a.FocusMinutes),
            CustomMetricKeys.TrackedMinutes => areas.Sum(a => a.TrackedMinutes),
            CustomMetricKeys.PlannedMinutes => areas.Sum(a => a.PlannedMinutes),
            _ => null,
        };
    }

    public static decimal? FromFinance(FinanceReportDto report, string metric, int? tagId)
    {
        if (report.Currency is null)
        {
            return null;
        }

        return metric switch
        {
            CustomMetricKeys.Income => report.Income,
            CustomMetricKeys.Spending => tagId is { } id ? report.Tags.FirstOrDefault(t => t.TagId == id)?.Spent ?? 0 : report.Spending,
            CustomMetricKeys.SavingsRate => report.SavingsRate,
            CustomMetricKeys.NetWorthChange => report.NetWorthChange,
            _ => null,
        };
    }

    public static decimal? FromBalance(LifeBalanceReportDto report, string metric, int lifeAreaId)
    {
        var area = report.Areas.FirstOrDefault(a => a.LifeAreaId == lifeAreaId);
        return metric == CustomMetricKeys.LifeRating ? area?.AverageRating : area?.AverageScore;
    }
}
