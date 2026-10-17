using System.ComponentModel.DataAnnotations;
using LifeOS.Core.Habits.Services;
using LifeOS.Core.Shared.DTOs;

namespace LifeOS.Core.Habits.DTOs;

public static class HabitErrors
{
    /// <summary>Also what another user's habit looks like; the controller maps it to a 404.</summary>
    public const string NotFound = "Habit not found.";
}

public static class HabitStatuses
{
    public const string Active = "Active";
    public const string Archived = "Archived";
}

/// <summary>Matches CK_Habits_Kind: something to do, or something to stop doing.</summary>
public static class HabitKinds
{
    public const string Build = "Build";
    public const string Avoid = "Avoid";
}

/// <summary>A ready-made habit in the library (HabitTemplates). LifeAreaName matches a seeded life area.</summary>
public sealed record HabitTemplateDto(string Key, string Category, string Title, string Description, string Kind,
    decimal? TargetValue, string? Unit, byte ScheduleDays, string LifeAreaName);

/// <summary>A habit as of the client's today: its streak, plus the days it was done inside the requested window.</summary>
public class HabitDto
{
    public int Id { get; init; }
    public string Title { get; init; } = string.Empty;
    public string? Description { get; init; }
    public int? LifeAreaId { get; init; }
    public string? LifeAreaName { get; init; }
    /// <summary>Weekday bitmask, ISO order: Monday = 1 ... Sunday = 64 (127 = every day).</summary>
    public byte ScheduleDays { get; init; }
    public DateOnly StartDate { get; init; }
    public string Status { get; init; } = string.Empty;
    /// <summary>Build (do it) or Avoid (stop it — its logged days are slips).</summary>
    public string Kind { get; init; } = HabitKinds.Build;
    /// <summary>Measurable build habits: the amount a day needs ("20" pages); null for a plain tick.</summary>
    public decimal? TargetValue { get; init; }
    public string? Unit { get; init; }
    public List<TagDto> Tags { get; init; } = [];
    public DateTime CreatedAt { get; init; }
    /// <summary>Build habits: scheduled days done in a row (a measurable day counts once it meets the target).</summary>
    public HabitStreak Streak { get; set; } = new(0, 0, false, false, null);
    /// <summary>Avoid habits: days in a row without a slip.</summary>
    public HabitCleanRun? CleanRun { get; set; }
    /// <summary>Build habits: days done from the window's start to today, oldest first.</summary>
    public List<DateOnly> DoneDates { get; set; } = [];
    /// <summary>Measurable habits: the value logged on each day of the window (including days short of the target).</summary>
    public Dictionary<DateOnly, decimal> Values { get; set; } = [];
    /// <summary>Avoid habits: the slips inside the window, oldest first.</summary>
    public List<DateOnly> SlipDates { get; set; } = [];
}

public class HabitRequest
{
    [Required]
    [StringLength(200)]
    public string Title { get; init; } = string.Empty;

    [StringLength(4000)]
    public string? Description { get; init; }

    public int? LifeAreaId { get; init; }

    [Range(1, HabitStreaks.EveryDay, ErrorMessage = "Pick at least one day of the week.")]
    public byte ScheduleDays { get; init; } = HabitStreaks.EveryDay;

    [Required]
    public DateOnly? StartDate { get; init; }

    /// <summary>Build (default) or Avoid. An avoid habit runs every day and has no target; the kind can't change once days are logged.</summary>
    public string Kind { get; init; } = HabitKinds.Build;

    /// <summary>Makes a build habit measurable: what a day needs (0.01–9,999,999.99). Null = a plain tick.</summary>
    [Range(0.01, 9999999.99, ErrorMessage = "The target must be between 0.01 and 9,999,999.99.")]
    public decimal? TargetValue { get; init; }

    [StringLength(30)]
    public string? Unit { get; init; }

    public List<int> TagIds { get; init; } = [];

    /// <summary>The user's local date, for the streak in the response. Defaults to UTC today.</summary>
    public DateOnly? Today { get; init; }
}

public class SetHabitStatusRequest
{
    [Required]
    [AllowedValues(HabitStatuses.Active, HabitStatuses.Archived, ErrorMessage = "Status must be Active or Archived.")]
    public string Status { get; init; } = string.Empty;

    /// <summary>The user's local date, for the streak in the response. Defaults to UTC today.</summary>
    public DateOnly? Today { get; init; }
}

public class SetHabitEntryRequest
{
    /// <summary>Build: done (or, measurable, a value logged). Avoid: slipped that day. False removes the day's entry.</summary>
    public bool Done { get; init; }

    /// <summary>Measurable habits: what was done that day; leave it out to log the target. 0 removes the entry.</summary>
    [Range(0, 9999999.99, ErrorMessage = "The value must be between 0 and 9,999,999.99.")]
    public decimal? Value { get; init; }

    /// <summary>The user's local date: no day after it can be ticked. Defaults to UTC today.</summary>
    public DateOnly? Today { get; init; }
}

/// <summary>A day ticked or un-ticked (or a slip logged), and the habit's figures after it.</summary>
public class HabitEntryResultDto
{
    public DateOnly EntryDate { get; init; }
    /// <summary>Build: the day counts (measurable: met its target). Avoid: the day is a slip.</summary>
    public bool Done { get; init; }
    /// <summary>Measurable habits: the value now logged for the day (null when it has no entry).</summary>
    public decimal? Value { get; init; }
    public HabitStreak Streak { get; init; } = new(0, 0, false, false, null);
    public HabitCleanRun? CleanRun { get; init; }
}
