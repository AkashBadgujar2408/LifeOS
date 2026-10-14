namespace LifeOS.Core.Calendar.DTOs;

/// <summary>Where a feed item comes from; matches the SourceType values calendar.GetCalendarFeed returns.</summary>
public static class CalendarSourceTypes
{
    public const string Event = "Event";
    public const string Task = "Task";
    public const string Milestone = "Milestone";
    public const string Goal = "Goal";
}

/// <summary>
/// One thing on the calendar, whatever module it lives in. Date-based items (all-day events, task due dates,
/// milestone/goal targets) have StartDate/EndDate (inclusive calendar dates); timed events have StartsAt/EndsAt (UTC).
/// </summary>
public class CalendarFeedItemDto
{
    public string SourceType { get; init; } = string.Empty;
    public int SourceId { get; init; }
    public string Title { get; init; } = string.Empty;
    public bool IsAllDay { get; init; }
    public DateOnly? StartDate { get; init; }
    public DateOnly? EndDate { get; init; }
    public DateTime? StartsAt { get; init; }
    public DateTime? EndsAt { get; init; }
    /// <summary>Task done / milestone ticked / goal completed. Always false for events.</summary>
    public bool IsDone { get; init; }
    /// <summary>Tasks only.</summary>
    public string? Priority { get; init; }
    /// <summary>The goal a milestone belongs to, or the project a task is in.</summary>
    public int? ParentId { get; init; }
    public string? ParentTitle { get; init; }
    public string? Location { get; init; }
}
