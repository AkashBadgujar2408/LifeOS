using System.ComponentModel.DataAnnotations;
using LifeOS.Core.Tasks.DTOs;

namespace LifeOS.Core.Calendar.DTOs;

/// <summary>
/// An all-day event has StartDate/EndDate (calendar dates, EndDate inclusive); a timed one has StartsAt/EndsAt (UTC).
/// The other pair is always null (CK_Events_Shape).
/// </summary>
public class EventDto
{
    public int Id { get; init; }
    public string Title { get; init; } = string.Empty;
    public string? Notes { get; init; }
    public string? Location { get; init; }
    public bool IsAllDay { get; init; }
    public DateOnly? StartDate { get; init; }
    public DateOnly? EndDate { get; init; }
    public DateTime? StartsAt { get; init; }
    public DateTime? EndsAt { get; init; }
    /// <summary>Null for a one-off event. For a series, the dates/times above are its first occurrence.</summary>
    public EventRecurrenceDto? Recurrence { get; init; }
    /// <summary>IANA zone a timed series follows; null otherwise.</summary>
    public string? TimeZone { get; init; }
    /// <summary>Timed series only: remind this many minutes before each occurrence (0 = as it starts); null = no.</summary>
    public int? ReminderMinutesBefore { get; init; }
    /// <summary>Occurrences of the series that were skipped, oldest first.</summary>
    public List<DateOnly> SkippedDates { get; init; } = [];
    /// <summary>The life area this time is for (time blocking); null = none.</summary>
    public int? LifeAreaId { get; init; }
    public DateTime CreatedAt { get; init; }
}

/// <summary>"Every {Interval} {Frequency}" from the first occurrence, until {Until} (inclusive) or forever.</summary>
public class EventRecurrenceDto
{
    [Required]
    [AllowedValues(RecurrenceFrequencies.Daily, RecurrenceFrequencies.Weekly, RecurrenceFrequencies.Monthly, RecurrenceFrequencies.Yearly,
        ErrorMessage = "Repeat must be Daily, Weekly, Monthly or Yearly.")]
    public string Frequency { get; init; } = string.Empty;

    [Range(1, 999, ErrorMessage = "Repeat every 1 to 999.")]
    public int Interval { get; init; } = 1;

    /// <summary>Last day an occurrence may start on; null = no end.</summary>
    public DateOnly? Until { get; init; }
}

/// <summary>Skip one occurrence of a series, or bring a skipped one back.</summary>
public class EventOccurrenceSkipRequest
{
    public bool Skipped { get; init; }
}

public class EventRequest
{
    [Required]
    [StringLength(200)]
    public string Title { get; init; } = string.Empty;

    [StringLength(4000)]
    public string? Notes { get; init; }

    [StringLength(200)]
    public string? Location { get; init; }

    public bool IsAllDay { get; init; }

    /// <summary>All-day only: first day.</summary>
    public DateOnly? StartDate { get; init; }

    /// <summary>All-day only: last day, inclusive. Defaults to StartDate.</summary>
    public DateOnly? EndDate { get; init; }

    /// <summary>Timed only: a moment with a "Z" or an offset.</summary>
    public DateTime? StartsAt { get; init; }

    /// <summary>Timed only: a moment with a "Z" or an offset.</summary>
    public DateTime? EndsAt { get; init; }

    /// <summary>Null = a one-off event.</summary>
    public EventRecurrenceDto? Recurrence { get; init; }

    /// <summary>The user's IANA zone (e.g. "Europe/London"); required for a timed recurring event.</summary>
    [StringLength(64)]
    public string? TimeZone { get; init; }

    /// <summary>Timed recurring events only: remind N minutes before each occurrence (0–10080); null = no.</summary>
    [Range(0, 10080, ErrorMessage = "Remind between 0 minutes and a week before.")]
    public int? ReminderMinutesBefore { get; init; }

    /// <summary>Optional life area the time is for ("Deep work — Career").</summary>
    public int? LifeAreaId { get; init; }
}

/// <summary>Which occurrences a drag on a recurring event moves.</summary>
public static class EventMoveScopes
{
    public const string One = "One";
    public const string Series = "Series";
}

/// <summary>
/// A drag or resize on the calendar: the new dates/times (same shape rules as EventRequest). For an occurrence of a
/// series, OccurrenceDate names it and Scope says whether only it moves (it becomes a one-off, as with "change just
/// this one") or the whole series shifts by the same amount.
/// </summary>
public class EventMoveRequest
{
    public bool IsAllDay { get; init; }
    public DateOnly? StartDate { get; init; }
    public DateOnly? EndDate { get; init; }
    public DateTime? StartsAt { get; init; }
    public DateTime? EndsAt { get; init; }

    /// <summary>Recurring events only: the occurrence that was dragged.</summary>
    public DateOnly? OccurrenceDate { get; init; }

    /// <summary>Recurring events only: One or Series.</summary>
    public string? Scope { get; init; }
}

public static class EventErrors
{
    public const string NotFound = "Event not found.";
}
