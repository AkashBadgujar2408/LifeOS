using LifeOS.Core.Habits.Services;

namespace LifeOS.Core.Dashboard.DTOs;

/// <summary>
/// Everything the My Day screen shows, as of the user's local <see cref="Today"/> — one call, built from the
/// dashboard.GetMyDay stored procedure.
/// </summary>
public class MyDayDto
{
    public DateOnly Today { get; init; }
    /// <summary>Open tasks due today or overdue, plus today's already done; oldest due first, then priority.</summary>
    public List<MyDayTaskDto> Tasks { get; init; } = [];
    /// <summary>All-day events covering today, then timed events overlapping it by start.</summary>
    public List<MyDayEventDto> Events { get; init; } = [];
    /// <summary>Not dismissed and due before the end of today (overdue ones included).</summary>
    public List<MyDayReminderDto> Reminders { get; init; } = [];
    /// <summary>Active goals, dated ones soonest first.</summary>
    public List<MyDayGoalDto> Goals { get; init; } = [];
    /// <summary>Active habits that have started, with their streak as of today.</summary>
    public List<MyDayHabitDto> Habits { get; init; } = [];
    /// <summary>The latest journal entry on or before today, if any.</summary>
    public MyDayJournalDto? LatestJournalEntry { get; init; }
}

public class MyDayTaskDto
{
    public int Id { get; init; }
    public string Title { get; init; } = string.Empty;
    public DateOnly DueDate { get; init; }
    public string Priority { get; init; } = string.Empty;
    public bool IsDone { get; init; }
    public bool IsRecurring { get; init; }
    public int? ProjectId { get; init; }
    public string? ProjectName { get; init; }
}

/// <summary>All-day events have StartDate/EndDate (inclusive); timed events StartsAt/EndsAt (UTC).</summary>
public class MyDayEventDto
{
    public int Id { get; init; }
    public string Title { get; init; } = string.Empty;
    public bool IsAllDay { get; init; }
    public DateOnly? StartDate { get; init; }
    public DateOnly? EndDate { get; init; }
    public DateTime? StartsAt { get; init; }
    public DateTime? EndsAt { get; init; }
    public string? Location { get; init; }
}

public class MyDayReminderDto
{
    public int Id { get; init; }
    public string Title { get; init; } = string.Empty;
    public DateTime RemindAt { get; init; }
    public string? EntityType { get; init; }
    public int? EntityId { get; init; }
}

public class MyDayGoalDto
{
    public int Id { get; init; }
    public string Title { get; init; } = string.Empty;
    public string GoalType { get; init; } = string.Empty;
    public DateOnly? TargetDate { get; init; }
    public string LifeAreaName { get; init; } = string.Empty;
    public int MilestoneCount { get; init; }
    public int CompletedMilestoneCount { get; init; }
    /// <summary>Same rule as everywhere else: <see cref="Goals.Services.GoalProgress"/>.</summary>
    public int ProgressPercent { get; init; }
    public int? NextMilestoneId { get; init; }
    public string? NextMilestoneTitle { get; init; }
    public DateOnly? NextMilestoneTargetDate { get; init; }
    /// <summary>When the goal or any of its milestones last changed (UTC).</summary>
    public DateTime LastActivityAt { get; init; }
}

public class MyDayHabitDto
{
    public int Id { get; init; }
    public string Title { get; init; } = string.Empty;
    /// <summary>Weekday bitmask, ISO order: Monday = 1 ... Sunday = 64.</summary>
    public byte ScheduleDays { get; init; }
    public DateOnly StartDate { get; init; }
    public string? LifeAreaName { get; init; }
    public HabitStreak Streak { get; init; } = new(0, 0, false, false, null);
}

public class MyDayJournalDto
{
    public int Id { get; init; }
    public DateOnly EntryDate { get; init; }
    public string? Title { get; init; }
    /// <summary>The first 280 characters of the entry.</summary>
    public string? Excerpt { get; init; }
    public byte? Mood { get; init; }
}
