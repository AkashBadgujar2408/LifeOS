namespace LifeOS.Core.Reports.DTOs;

/// <summary>What a custom report can count. Keys are stored (reports.SavedReports.Metric) — never rename one.</summary>
public static class CustomMetricKeys
{
    public const string GoalsCompleted = "goals-completed";
    public const string GoalsOnTime = "goals-on-time";
    public const string HabitConsistency = "habit-consistency";
    public const string TasksDone = "tasks-done";
    public const string OverdueRate = "overdue-rate";
    public const string FocusMinutes = "focus-minutes";
    public const string TrackedMinutes = "tracked-minutes";
    public const string PlannedMinutes = "planned-minutes";
    public const string StudyMinutes = "study-minutes";
    public const string Income = "income";
    public const string Spending = "spending";
    public const string SavingsRate = "savings-rate";
    public const string NetWorthChange = "net-worth-change";
    public const string LifeBalanceScore = "life-balance-score";
    public const string LifeRating = "life-rating";
}

/// <summary>How a metric's number reads.</summary>
public static class CustomMetricUnits
{
    public const string Count = "Count";
    public const string Percent = "Percent";
    public const string Minutes = "Minutes";
    public const string Money = "Money";
    /// <summary>Out of 10 (one decimal).</summary>
    public const string Score = "Score";
}

/// <summary>Which filter a metric takes.</summary>
public static class CustomMetricFilters
{
    public const string None = "None";
    /// <summary>Optional life area.</summary>
    public const string LifeArea = "LifeArea";
    /// <summary>A life area is required (life balance is per area).</summary>
    public const string LifeAreaRequired = "LifeAreaRequired";
    /// <summary>Optional tag (spending).</summary>
    public const string Tag = "Tag";
}

public static class CustomGroupings
{
    public const string Week = "Week";
    public const string Month = "Month";
}

public static class CustomCompares
{
    public const string None = "None";
    /// <summary>The same number of days just before.</summary>
    public const string PreviousPeriod = "PreviousPeriod";
    /// <summary>The same days a year earlier.</summary>
    public const string PreviousYear = "PreviousYear";
}

/// <summary>One metric of the catalogue (GET api/Reports/Custom/metrics).</summary>
public class CustomMetricDto
{
    public string Key { get; init; } = string.Empty;
    public string Label { get; init; } = string.Empty;
    public string Unit { get; init; } = string.Empty;
    public string Filter { get; init; } = CustomMetricFilters.None;
    /// <summary>The module it comes from (hidden with it on the client); null = always shown.</summary>
    public string? Module { get; init; }
    /// <summary>The report tab whose figures it repeats.</summary>
    public string Report { get; init; } = string.Empty;
}

/// <summary>What to count, over which days, grouped how, compared with what.</summary>
public class CustomReportDefinition
{
    public string Metric { get; init; } = string.Empty;
    public int? LifeAreaId { get; init; }
    public int? TagId { get; init; }
    public string Grouping { get; init; } = CustomGroupings.Month;
    public string Compare { get; init; } = CustomCompares.None;
    /// <summary>A moving range (this month, last year …) — or <see cref="From"/>/<see cref="To"/>, fixed.</summary>
    public string? RangePreset { get; init; }
    public DateOnly? From { get; init; }
    public DateOnly? To { get; init; }
}

/// <summary>POST api/Reports/Custom/run.</summary>
public class CustomReportRunRequest : CustomReportDefinition
{
    public DateOnly Today { get; init; }
    public string? TimeZone { get; init; }
}

/// <summary>POST/PUT api/Reports/Custom — a definition with a name.</summary>
public class SavedReportRequest : CustomReportDefinition
{
    public string Name { get; init; } = string.Empty;
}

public class SavedReportDto : SavedReportRequest
{
    public int Id { get; init; }
}

public class CustomReportResultDto
{
    public CustomMetricDto Metric { get; init; } = new();
    public int? LifeAreaId { get; init; }
    public string? LifeAreaName { get; init; }
    public int? TagId { get; init; }
    public string? TagName { get; init; }
    /// <summary>The base currency for money metrics.</summary>
    public string? Currency { get; init; }
    public string Grouping { get; init; } = CustomGroupings.Month;
    public CustomPeriodDto Period { get; init; } = new();
    /// <summary>The period it's compared with (null: no comparison).</summary>
    public CustomPeriodDto? Compared { get; init; }
    /// <summary>Period total − compared total (null without both).</summary>
    public decimal? Change { get; init; }
}

public class CustomPeriodDto
{
    public DateOnly From { get; init; }
    public DateOnly To { get; init; }
    /// <summary>The metric over the whole period (not a sum of the buckets — a % is worked out over the whole).</summary>
    public decimal? Total { get; init; }
    public List<CustomBucketDto> Buckets { get; init; } = [];
}

public class CustomBucketDto
{
    public DateOnly From { get; init; }
    public DateOnly To { get; init; }
    /// <summary>Null when the metric has nothing to divide by in that bucket (a % with no days).</summary>
    public decimal? Value { get; init; }
}
