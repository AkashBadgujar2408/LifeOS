using System.ComponentModel.DataAnnotations;

namespace LifeOS.Core.Journal.DTOs;

public static class JournalErrors
{
    /// <summary>Also what another user's entry looks like; the controller maps it to a 404.</summary>
    public const string NotFound = "Journal entry not found.";
}

public class JournalEntryDto
{
    public int Id { get; init; }
    public DateOnly EntryDate { get; init; }
    public string? Title { get; init; }
    public string? Content { get; init; }
    /// <summary>1 (awful) to 5 (great); null when only words were written.</summary>
    public byte? Mood { get; init; }
    public int? LifeAreaId { get; init; }
    public string? LifeAreaName { get; init; }
    public DateTime CreatedAt { get; init; }
    public DateTime? UpdatedAt { get; init; }
}

/// <summary>The day's entry, written or rewritten as a whole (the day is in the route).</summary>
public class JournalEntryRequest
{
    [StringLength(200)]
    public string? Title { get; init; }

    [StringLength(20000)]
    public string? Content { get; init; }

    [Range(1, 5, ErrorMessage = "Mood must be between 1 and 5.")]
    public byte? Mood { get; init; }

    public int? LifeAreaId { get; init; }
}

public class JournalEntryFromInboxRequest
{
    /// <summary>The day the captured thought belongs to (the user's local date).</summary>
    [Required]
    public DateOnly? EntryDate { get; init; }
}

/// <summary>One point on the mood trend: a day that has a mood.</summary>
public class MoodPointDto
{
    public DateOnly EntryDate { get; init; }
    public byte Mood { get; init; }
}

public class WeeklyReflectionDto
{
    public DateOnly WeekStartDate { get; init; }
    public string? WentWell { get; init; }
    public string? WasHard { get; init; }
    public string? NextFocus { get; init; }
    public DateTime CreatedAt { get; init; }
    public DateTime? UpdatedAt { get; init; }
}

/// <summary>A day of the week under review, as the journal recorded it.</summary>
public class JournalDaySummaryDto
{
    public DateOnly EntryDate { get; init; }
    public string? Title { get; init; }
    public byte? Mood { get; init; }
    /// <summary>The first line or so of the entry, for the week overview.</summary>
    public string? Excerpt { get; init; }
}

/// <summary>Everything the weekly reflection screen shows: the saved answers (if any) and the week's entries.</summary>
public class WeeklyReviewDto
{
    public DateOnly WeekStartDate { get; init; }
    public DateOnly WeekEndDate { get; init; }
    public WeeklyReflectionDto? Reflection { get; init; }
    public List<JournalDaySummaryDto> Days { get; init; } = [];
}

public class WeeklyReflectionRequest
{
    [StringLength(4000)]
    public string? WentWell { get; init; }

    [StringLength(4000)]
    public string? WasHard { get; init; }

    [StringLength(4000)]
    public string? NextFocus { get; init; }
}
