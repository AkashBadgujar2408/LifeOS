using System.ComponentModel.DataAnnotations;
using LifeOS.Core.Shared.DTOs;

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
    public List<TagDto> Tags { get; init; } = [];
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

    public List<int> TagIds { get; init; } = [];
}

/// <summary>Matches CK_JournalNotes_Kind.</summary>
public static class JournalNoteKinds
{
    public const string Gratitude = "Gratitude";
    public const string Lesson = "Lesson";
}

/// <summary>A day's short lists, in the order written.</summary>
public class DayNotesDto
{
    public DateOnly EntryDate { get; init; }
    public List<string> Gratitude { get; init; } = [];
    public List<string> Lessons { get; init; } = [];
}

/// <summary>Replaces the day's lists; blank lines are dropped.</summary>
public class DayNotesRequest
{
    [MaxLength(20, ErrorMessage = "Keep it to 20 things a day.")]
    public List<string> Gratitude { get; init; } = [];

    [MaxLength(20, ErrorMessage = "Keep it to 20 lessons a day.")]
    public List<string> Lessons { get; init; } = [];
}

/// <summary>One gratitude item or lesson with the day it was written for (the monthly look back lists them).</summary>
public class DatedNoteDto
{
    public DateOnly EntryDate { get; init; }
    public string Text { get; init; } = string.Empty;
}

public class MonthlyReflectionDto
{
    public DateOnly MonthStart { get; init; }
    public string? Highlights { get; init; }
    public string? Learned { get; init; }
    public string? WouldChange { get; init; }
    public string? NextFocus { get; init; }
    public DateTime CreatedAt { get; init; }
    public DateTime? UpdatedAt { get; init; }
}

/// <summary>A decision made in the month, for the monthly look back.</summary>
public class MonthDecisionDto
{
    public int Id { get; init; }
    public DateOnly DecidedOn { get; init; }
    public string Title { get; init; } = string.Empty;
    public DateOnly? ReviewedOn { get; init; }
    public string? Verdict { get; init; }
}

/// <summary>Everything the monthly reflection screen shows: the answers (if any) and what the month's journal holds.</summary>
public class MonthlyReviewDto
{
    public DateOnly MonthStart { get; init; }
    public DateOnly MonthEnd { get; init; }
    public MonthlyReflectionDto? Reflection { get; init; }
    public int DaysWritten { get; init; }
    public int MoodDays { get; init; }
    /// <summary>Average mood of the days that have one, to one decimal; null when none do.</summary>
    public double? MoodAverage { get; init; }
    public List<DatedNoteDto> Gratitude { get; init; } = [];
    public List<DatedNoteDto> Lessons { get; init; } = [];
    public List<MonthDecisionDto> Decisions { get; init; } = [];
    /// <summary>The month's days with a mood of 5 or 1, for "the days worth remembering".</summary>
    public List<JournalDaySummaryDto> StandoutDays { get; init; } = [];
}

public class MonthlyReflectionRequest
{
    [StringLength(4000)]
    public string? Highlights { get; init; }

    [StringLength(4000)]
    public string? Learned { get; init; }

    [StringLength(4000)]
    public string? WouldChange { get; init; }

    [StringLength(4000)]
    public string? NextFocus { get; init; }
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
