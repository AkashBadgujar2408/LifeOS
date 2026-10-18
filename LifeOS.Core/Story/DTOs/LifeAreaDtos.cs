using System.ComponentModel.DataAnnotations;

namespace LifeOS.Core.Story.DTOs;

/// <summary>One life area's stats: everything finished in it, all time, as XP and a level (LifeAreaLevels).</summary>
public class LifeAreaStatsDto
{
    public int LifeAreaId { get; init; }
    public string LifeAreaName { get; init; } = string.Empty;
    public int GoalsCompleted { get; init; }
    public int MilestonesCompleted { get; init; }
    public int HabitDays { get; init; }
    public int JournalEntries { get; init; }
    public int StudyMinutes { get; init; }
    public DateOnly? LastActivityOn { get; init; }
    public int Xp { get; init; }
    public int Level { get; init; }
    public int XpIntoLevel { get; init; }
    public int XpForNextLevel { get; init; }
}

/// <summary>A month's self-rating of one life area: how satisfied you are with it, 1-10.</summary>
public class LifeAreaRatingDto
{
    public int LifeAreaId { get; init; }
    /// <summary>The month's first day ("2026-10-01").</summary>
    public DateOnly Month { get; init; }
    public byte Rating { get; init; }
    public string? Note { get; init; }
}

public class LifeAreaRatingItem
{
    [Range(1, int.MaxValue)]
    public int LifeAreaId { get; init; }

    /// <summary>Null clears the area's rating for the month.</summary>
    [Range(1, 10, ErrorMessage = "Ratings go from 1 to 10.")]
    public byte? Rating { get; init; }

    [StringLength(500)]
    public string? Note { get; init; }
}

/// <summary>A whole month's ratings at once; areas left out are left as they are.</summary>
public class LifeAreaRatingsRequest
{
    /// <summary>The user's local today — a month can't be rated before it has begun.</summary>
    [Required]
    public DateOnly? Today { get; init; }

    public List<LifeAreaRatingItem> Ratings { get; init; } = [];
}

/// <summary>The "Previously on…" card on My Day.</summary>
public class StoryRecapDto
{
    /// <summary>The chapter you're in now, if one is open.</summary>
    public ChapterDto? Chapter { get; init; }
    /// <summary>Its number in the book (1-based).</summary>
    public int? ChapterNumber { get; init; }
    /// <summary>The latest few beats, newest first.</summary>
    public List<StoryBeatDto> RecentBeats { get; init; } = [];
    /// <summary>The active, unlocked mission to keep going with (StoryRecap.CurrentMission).</summary>
    public MissionDto? CurrentMission { get; init; }
}

/// <summary>One achievement (computed, never stored): unlocked on a local day, or locked with its progress.</summary>
public class AchievementDto
{
    /// <summary>Stable identifier ("streak-7").</summary>
    public string Key { get; init; } = string.Empty;
    public string Title { get; init; } = string.Empty;
    public string Description { get; init; } = string.Empty;
    /// <summary>A Bootstrap Icons class ("bi-fire").</summary>
    public string Icon { get; init; } = string.Empty;
    public int Progress { get; init; }
    public int Target { get; init; }
    public DateOnly? UnlockedOn { get; init; }
    public bool Unlocked => UnlockedOn is not null;
}
