namespace LifeOS.Core.Reports.DTOs;

/// <summary>What a goal's range said about it, decided once by <c>GoalReport.OutcomeOf</c> (first match wins).</summary>
public static class GoalOutcomes
{
    /// <summary>Completed inside the range, on or before its target day.</summary>
    public const string OnTime = "OnTime";
    /// <summary>Completed inside the range, after its target day.</summary>
    public const string Late = "Late";
    /// <summary>Completed inside the range, with no target day.</summary>
    public const string NoTarget = "NoTarget";
    /// <summary>Abandoned inside the range.</summary>
    public const string Abandoned = "Abandoned";
    /// <summary>Its target day fell inside the range and passed without the goal being done by then.</summary>
    public const string Missed = "Missed";
    /// <summary>Still going: started or had its deadline pushed back inside the range, nothing else happened.</summary>
    public const string InProgress = "InProgress";
}

public class GoalReportDto
{
    public DateOnly From { get; init; }
    public DateOnly To { get; init; }
    public GoalReportCountsDto Totals { get; init; } = new();
    /// <summary>Life areas with anything to report, in the taxonomy's order.</summary>
    public List<GoalReportAreaDto> Areas { get; init; } = [];
    public List<GoalReportItemDto> Goals { get; init; } = [];
}

public class GoalReportCountsDto
{
    public int Completed { get; init; }
    public int OnTime { get; init; }
    public int Late { get; init; }
    public int NoTarget { get; init; }
    public int Abandoned { get; init; }
    public int Missed { get; init; }
    public int InProgress { get; init; }
    /// <summary>Goals whose deadline moved later inside the range (whatever their outcome).</summary>
    public int PushedBack { get; init; }
    /// <summary>Goals created inside the range (whatever their outcome).</summary>
    public int Started { get; init; }
    /// <summary>On time ÷ (on time + late) as a whole percent; null when nothing with a target day was completed.</summary>
    public int? OnTimePercent { get; init; }
}

public class GoalReportAreaDto : GoalReportCountsDto
{
    public int LifeAreaId { get; init; }
    public string LifeAreaName { get; init; } = string.Empty;
}

public class GoalReportItemDto
{
    public int Id { get; init; }
    public string Title { get; init; } = string.Empty;
    public string GoalType { get; init; } = string.Empty;
    public string Status { get; init; } = string.Empty;
    public int LifeAreaId { get; init; }
    public string LifeAreaName { get; init; } = string.Empty;
    public string Outcome { get; init; } = string.Empty;
    public DateOnly? TargetDate { get; init; }
    public DateOnly? CompletedOn { get; init; }
    public DateOnly? AbandonedOn { get; init; }
    public DateOnly StartedOn { get; init; }
    /// <summary>Days after the target day it was completed (Late), or completed / still open past it (Missed).</summary>
    public int? DaysLate { get; init; }
    /// <summary>How many times its deadline moved later inside the range.</summary>
    public int PushedBack { get; init; }
}

public class HabitReportDto
{
    public DateOnly From { get; init; }
    public DateOnly To { get; init; }
    /// <summary>Build habits together: scheduled days done ÷ scheduled days passed.</summary>
    public HabitShareDto Build { get; init; } = new();
    /// <summary>Avoid habits together: clean days ÷ days passed.</summary>
    public HabitShareDto Avoid { get; init; } = new();
    public List<HabitReportItemDto> Habits { get; init; } = [];
    /// <summary>
    /// ISO weeks overlapping the range up to today, oldest first, with build habits' consistency — from the first week
    /// with a scheduled day (later weeks without one stay, as gaps).
    /// </summary>
    public List<HabitReportWeekDto> Weeks { get; init; } = [];
}

public class HabitShareDto
{
    /// <summary>Build: scheduled days that have passed (today once done). Avoid: days that have passed.</summary>
    public int Total { get; init; }
    /// <summary>Build: of those, done. Avoid: of those, clean.</summary>
    public int Good { get; init; }
    /// <summary>Good ÷ total as a whole percent; null when there were no days yet.</summary>
    public int? Percent { get; init; }
}

public class HabitReportItemDto : HabitShareDto
{
    public int Id { get; init; }
    public string Title { get; init; } = string.Empty;
    public string Kind { get; init; } = string.Empty;
    public string Status { get; init; } = string.Empty;
    public string? LifeAreaName { get; init; }
    public byte ScheduleDays { get; init; }
    /// <summary>Avoid: days with a slip.</summary>
    public int Slips { get; init; }
    /// <summary>Longest run inside the range: done scheduled days in a row (Build), clean days in a row (Avoid).</summary>
    public int BestRun { get; init; }
    /// <summary>Archived habits count up to this day (the day they were archived).</summary>
    public DateOnly? ArchivedOn { get; init; }
}

public class HabitReportWeekDto : HabitShareDto
{
    /// <summary>The ISO week's Monday.</summary>
    public DateOnly WeekStart { get; init; }
    /// <summary>The part of the week inside the range (a first or last week can be partial).</summary>
    public DateOnly From { get; init; }
    public DateOnly To { get; init; }
}
