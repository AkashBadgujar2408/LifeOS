using System.ComponentModel.DataAnnotations;

namespace LifeOS.Core.Story.DTOs;

public static class StoryErrors
{
    /// <summary>Also what another user's chapter looks like; the controller maps it to a 404.</summary>
    public const string ChapterNotFound = "Chapter not found.";
}

/// <summary>A named era of your life. EndDate null = the chapter you're in now.</summary>
public class ChapterDto
{
    public int Id { get; init; }
    public string Title { get; init; } = string.Empty;
    public string? Summary { get; init; }
    public DateOnly StartDate { get; init; }
    public DateOnly? EndDate { get; init; }
    public bool IsCurrent => EndDate is null;
}

public class ChapterRequest
{
    [Required]
    [StringLength(200)]
    public string Title { get; init; } = string.Empty;

    [StringLength(4000)]
    public string? Summary { get; init; }

    [Required]
    public DateOnly? StartDate { get; init; }

    /// <summary>Leave empty for the chapter you're in now (starting one closes the previous current chapter).</summary>
    public DateOnly? EndDate { get; init; }
}

/// <summary>What saving a chapter did: the chapter, and the previous current chapter if it was closed to make way.</summary>
public class ChapterSaveResultDto
{
    public ChapterDto Chapter { get; init; } = new();
    public ChapterDto? ClosedChapter { get; init; }
}

/// <summary>Beat kinds; match the Kind values story.GetLifeStory returns.</summary>
public static class StoryBeatKinds
{
    public const string GoalStarted = "GoalStarted";
    public const string MissionPassed = "MissionPassed";
    public const string GoalPostponed = "GoalPostponed";
    public const string GoalAbandoned = "GoalAbandoned";
    public const string GoalResumed = "GoalResumed";
    public const string GoalRescheduled = "GoalRescheduled";
    public const string MilestoneDone = "MilestoneDone";
    public const string HabitStarted = "HabitStarted";
    public const string JournalHighlight = "JournalHighlight";
    /// <summary>A journal day with photos (Session 42); its Mood is the day's, if any.</summary>
    public const string Memory = "Memory";
    /// <summary>Not from the procedure: an achievement, on the day it was earned (Achievements.Evaluate).</summary>
    public const string AchievementUnlocked = "AchievementUnlocked";
}

/// <summary>
/// One thing that happened, on the user's local <see cref="Day"/>. <see cref="At"/> is the UTC moment when the source
/// recorded one (goal events, milestones); calendar-day sources (habit starts, journal days) have only the day.
/// </summary>
public class StoryBeatDto
{
    public string Kind { get; init; } = string.Empty;
    public DateOnly Day { get; init; }
    public DateTime? At { get; init; }
    public string? Title { get; init; }
    /// <summary>Debrief "How it went" (MissionPassed), the journal excerpt (JournalHighlight) or what earned an achievement.</summary>
    public string? Detail { get; init; }
    /// <summary>The note written with a status change or revision.</summary>
    public string? Note { get; init; }
    /// <summary>Debrief "What I'd tell my past self" (MissionPassed).</summary>
    public string? Advice { get; init; }
    /// <summary>Main / Side / Collectible, for goal beats (MissionKinds).</summary>
    public string? MissionKind { get; init; }
    public string? LifeAreaName { get; init; }
    public byte? Mood { get; init; }
    /// <summary>GoalRescheduled: the target date before and after. GoalStarted: ToDate is the target date.</summary>
    public DateOnly? FromDate { get; init; }
    public DateOnly? ToDate { get; init; }
    public string? EntityType { get; init; }
    public int? EntityId { get; init; }
    /// <summary>MilestoneDone: the goal it belongs to.</summary>
    public string? ParentTitle { get; init; }
}

/// <summary>A stretch of the story: a chapter with what happened in it, or (Chapter null) days no chapter covers.</summary>
public class StorySectionDto
{
    public ChapterDto? Chapter { get; init; }
    /// <summary>For a section without a chapter: the first and last day with something in it.</summary>
    public DateOnly? From { get; init; }
    public DateOnly? To { get; init; }
    public List<StoryBeatDto> Beats { get; init; } = [];
}

/// <summary>The whole story, oldest first, like a book.</summary>
public class LifeStoryDto
{
    public List<StorySectionDto> Sections { get; init; } = [];
    public int MissionsPassed { get; init; }
    public int MilestonesDone { get; init; }
    public int ChapterCount { get; init; }
    public int AchievementsUnlocked { get; init; }
}
