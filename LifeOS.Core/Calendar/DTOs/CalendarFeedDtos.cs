namespace LifeOS.Core.Calendar.DTOs;

/// <summary>Where a feed item comes from; matches the SourceType values calendar.GetCalendarFeed returns.</summary>
public static class CalendarSourceTypes
{
    public const string Event = "Event";
    public const string Task = "Task";
    public const string Milestone = "Milestone";
    public const string Goal = "Goal";
    public const string TaxItem = "TaxItem";
    public const string UtilityBill = "UtilityBill";
    /// <summary>A subscription's renewal (computed from its rhythm, never stored).</summary>
    public const string Subscription = "Subscription";
    /// <summary>A birthday, anniversary or other yearly day (Family; ParentId is the contact).</summary>
    public const string SignificantDate = "SignificantDate";
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
    /// <summary>The goal a milestone belongs to, the project a task is in, or the contact a significant date is about.</summary>
    public int? ParentId { get; init; }
    public string? ParentTitle { get; init; }
    public string? Location { get; init; }
    /// <summary>Events only: this is one occurrence of a recurring series (SourceId is the series).</summary>
    /// <summary>Events only: the life area the time is for (time blocking).</summary>
    public int? LifeAreaId { get; init; }
    public bool IsRecurring { get; init; }
    /// <summary>Recurring events only: the day this occurrence starts, which identifies it within the series.</summary>
    public DateOnly? OccurrenceDate { get; init; }
}
