using System.ComponentModel.DataAnnotations;
using LifeOS.Core.Habits.Services;

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
    public DateTime CreatedAt { get; init; }
    public HabitStreak Streak { get; set; } = new(0, 0, false, false, null);
    /// <summary>Days done from the window's start to today, oldest first.</summary>
    public List<DateOnly> DoneDates { get; set; } = [];
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
    public bool Done { get; init; }

    /// <summary>The user's local date: no day after it can be ticked. Defaults to UTC today.</summary>
    public DateOnly? Today { get; init; }
}

/// <summary>A day ticked or un-ticked, and the habit's streak after it.</summary>
public class HabitEntryResultDto
{
    public DateOnly EntryDate { get; init; }
    public bool Done { get; init; }
    public HabitStreak Streak { get; init; } = new(0, 0, false, false, null);
}
