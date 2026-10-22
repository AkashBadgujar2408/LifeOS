namespace LifeOS.Core.Reports.DTOs;

/// <summary>What a task's range said about it, decided once by <c>ProductivityReport.OutcomeOf</c> (first match wins).</summary>
public static class TaskOutcomes
{
    /// <summary>Done inside the range, on or before its due day.</summary>
    public const string OnTime = "OnTime";
    /// <summary>Done inside the range, after its due day.</summary>
    public const string Late = "Late";
    /// <summary>Done inside the range, with no due day.</summary>
    public const string NoDueDate = "NoDueDate";
    /// <summary>Its due day fell inside the range and passed without it being done by then.</summary>
    public const string Overdue = "Overdue";
}

public class ProductivityReportDto
{
    public DateOnly From { get; init; }
    public DateOnly To { get; init; }
    public TaskReportCountsDto Tasks { get; init; } = new();
    public EstimateReportDto Estimates { get; init; } = new();
    public FocusReportDto Focus { get; init; } = new();
    /// <summary>ISO weeks overlapping the range up to today, oldest first.</summary>
    public List<ProductivityWeekDto> Weeks { get; init; } = [];
    /// <summary>Planned vs tracked time per life area (taxonomy order, no life area last), only areas with any.</summary>
    public List<TimeByAreaDto> Areas { get; init; } = [];
    /// <summary>Tasks done in the range or overdue in it, one outcome each.</summary>
    public List<TaskReportItemDto> TaskItems { get; init; } = [];
}

public class TaskReportCountsDto
{
    /// <summary>Done inside the range (on time + late + no due day).</summary>
    public int Completed { get; init; }
    public int OnTime { get; init; }
    public int Late { get; init; }
    public int NoDueDate { get; init; }
    /// <summary>Created inside the range.</summary>
    public int Created { get; init; }
    /// <summary>Due inside the range on a day that has passed (or done by a due day that hasn't come yet).</summary>
    public int DuePassed { get; init; }
    /// <summary>Of those, done by their due day.</summary>
    public int DoneByDue { get; init; }
    /// <summary>Of those, not done by their due day (done later, or still open).</summary>
    public int Overdue { get; init; }
    /// <summary>Overdue ÷ due-passed as a whole percent; null when nothing was due.</summary>
    public int? OverdueRate { get; init; }
}

public class EstimateReportDto
{
    /// <summary>Tasks done in the range that had an estimate.</summary>
    public int Tasks { get; init; }
    public int EstimateMinutes { get; init; }
    /// <summary>Their focus time — all of it, not just the range's (a task's actual time is the sum of its sessions).</summary>
    public int ActualMinutes { get; init; }
    /// <summary>Took longer than estimated.</summary>
    public int Over { get; init; }
    /// <summary>Took no longer than estimated.</summary>
    public int WithinEstimate { get; init; }
    /// <summary>Actual ÷ estimate as a whole percent (100 = spot on); null without estimates.</summary>
    public int? ActualPercent { get; init; }
}

public class FocusReportDto
{
    public int Minutes { get; init; }
    public int Sessions { get; init; }
    /// <summary>Local days with at least one focus session.</summary>
    public int Days { get; init; }
}

public class ProductivityWeekDto
{
    public DateOnly WeekStart { get; init; }
    public DateOnly From { get; init; }
    public DateOnly To { get; init; }
    public int TasksDone { get; init; }
    public int FocusMinutes { get; init; }
}

public class TimeByAreaDto
{
    /// <summary>Null = no life area.</summary>
    public int? LifeAreaId { get; init; }
    public string LifeAreaName { get; init; } = string.Empty;
    /// <summary>Timed calendar events with this area, clipped to the range (repeating ones expanded).</summary>
    public int PlannedMinutes { get; init; }
    public int FocusMinutes { get; init; }
    public int StudyMinutes { get; init; }
    public int PracticeMinutes { get; init; }
    /// <summary>Focus + study + practice.</summary>
    public int TrackedMinutes { get; init; }
}

public class TaskReportItemDto
{
    public int Id { get; init; }
    public string Title { get; init; } = string.Empty;
    public string? ProjectName { get; init; }
    public string? LifeAreaName { get; init; }
    public string Outcome { get; init; } = string.Empty;
    public DateOnly? DueDate { get; init; }
    public DateOnly? CompletedOn { get; init; }
    /// <summary>Done after the due day (Late), or done / still open past it (Overdue).</summary>
    public int? DaysLate { get; init; }
    public int? EstimateMinutes { get; init; }
    public int ActualMinutes { get; init; }
}
