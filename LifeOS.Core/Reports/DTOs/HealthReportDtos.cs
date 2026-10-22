namespace LifeOS.Core.Reports.DTOs;

/// <summary>The health report — served only with the vault unlocked. Unknowns stay null, never zero.</summary>
public class HealthReportDto
{
    public DateOnly From { get; init; }
    public DateOnly To { get; init; }
    public WorkoutReportDto Workouts { get; init; } = new();
    public SleepReportDto Sleep { get; init; } = new();
    public WellbeingReportDto Wellbeing { get; init; } = new();
    /// <summary>One row per measurement kind measured in the range.</summary>
    public List<BodyReportDto> Body { get; init; } = [];
    /// <summary>ISO weeks overlapping the range up to today, oldest first (empty weeks kept).</summary>
    public List<HealthWeekDto> Weeks { get; init; } = [];
}

public class WorkoutReportDto
{
    public int Sessions { get; init; }
    public int Minutes { get; init; }
    /// <summary>Days with a workout.</summary>
    public int ActiveDays { get; init; }
    /// <summary>Sum of the steps given (null when no workout gave any).</summary>
    public int? Steps { get; init; }
    public decimal? DistanceKm { get; init; }
    public List<WorkoutKindReportDto> Kinds { get; init; } = [];
}

public class WorkoutKindReportDto
{
    public string Kind { get; init; } = string.Empty;
    public int Sessions { get; init; }
    public int Minutes { get; init; }
    public decimal? DistanceKm { get; init; }
}

public class SleepReportDto
{
    /// <summary>Nights logged (naps left out; a night split in two is one).</summary>
    public int Nights { get; init; }
    /// <summary>Average per night logged.</summary>
    public int? AverageMinutes { get; init; }
    public decimal? AverageQuality { get; init; }
}

public class WellbeingReportDto
{
    public int CheckIns { get; init; }
    public decimal? AverageStress { get; init; }
    public decimal? AverageEnergy { get; init; }
    public int MoodDays { get; init; }
    public decimal? AverageMood { get; init; }
}

public class BodyReportDto
{
    public string Kind { get; init; } = string.Empty;
    public string Unit { get; init; } = string.Empty;
    public int Readings { get; init; }
    public DateOnly FirstOn { get; init; }
    public decimal First { get; init; }
    public decimal? First2 { get; init; }
    public DateOnly LastOn { get; init; }
    public decimal Last { get; init; }
    public decimal? Last2 { get; init; }
    /// <summary>Last − first (0 with one reading).</summary>
    public decimal Change { get; init; }
    public decimal? Change2 { get; init; }
    /// <summary>Every reading in the range, oldest first (for the line).</summary>
    public List<BodyReadingDto> Points { get; init; } = [];
}

public class BodyReadingDto
{
    public DateOnly Day { get; init; }
    public decimal Value { get; init; }
    public decimal? Value2 { get; init; }
}

public class HealthWeekDto
{
    public DateOnly WeekStart { get; init; }
    public DateOnly From { get; init; }
    public DateOnly To { get; init; }
    public int WorkoutMinutes { get; init; }
    public int SleepNights { get; init; }
    public int? SleepAverageMinutes { get; init; }
    public decimal? AverageStress { get; init; }
    public decimal? AverageEnergy { get; init; }
    public decimal? AverageMood { get; init; }
}
