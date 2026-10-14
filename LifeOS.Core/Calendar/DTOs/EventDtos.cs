using System.ComponentModel.DataAnnotations;

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
    public DateTime CreatedAt { get; init; }
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
}
