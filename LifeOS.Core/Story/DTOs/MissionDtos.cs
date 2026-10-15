using System.ComponentModel.DataAnnotations;

namespace LifeOS.Core.Story.DTOs;

public static class MissionErrors
{
    /// <summary>Also what another user's goal looks like; the controller maps it to a 404.</summary>
    public const string NotFound = "Mission not found.";
}

/// <summary>Another mission, as far as a prerequisite list needs it.</summary>
public class MissionRefDto
{
    public int Id { get; init; }
    public string Title { get; init; } = string.Empty;
    public string Status { get; init; } = string.Empty;
    public string Kind { get; init; } = string.Empty;
}

/// <summary>A milestone, seen as one of the mission's objectives.</summary>
public class MissionObjectiveDto
{
    public int Id { get; init; }
    public string Title { get; init; } = string.Empty;
    public bool Done { get; init; }
    public DateOnly? TargetDate { get; init; }
}

/// <summary>
/// A goal seen as a mission: its kind (from the goal type), objectives, and where it sits in the unlock graph.
/// Locks are advisory — shown, never enforced (life doesn't wait for a quest flag).
/// </summary>
public class MissionDto
{
    public int Id { get; init; }
    public string Title { get; init; } = string.Empty;
    /// <summary>Main / Side / Collectible.</summary>
    public string Kind { get; init; } = string.Empty;
    public string Status { get; init; } = string.Empty;
    public string LifeAreaName { get; init; } = string.Empty;
    public DateOnly? TargetDate { get; init; }
    public DateTime CreatedAt { get; init; }
    public DateTime? CompletedAt { get; init; }
    public int ProgressPercent { get; init; }
    public List<MissionObjectiveDto> Objectives { get; init; } = [];
    /// <summary>Everything this mission needs first (any status).</summary>
    public List<MissionRefDto> Prerequisites { get; init; } = [];
    /// <summary>The prerequisites still holding it back; empty = unlocked.</summary>
    public List<MissionRefDto> BlockedBy { get; init; } = [];
    /// <summary>Missions that need this one.</summary>
    public List<MissionRefDto> Unlocks { get; init; } = [];
    public bool IsLocked => BlockedBy.Count > 0;
    public bool HasDebrief { get; init; }
}

public class MissionPrerequisiteRequest
{
    [Range(1, int.MaxValue, ErrorMessage = "Pick the mission that has to come first.")]
    public int RequiresGoalId { get; init; }
}

public class MissionDebriefDto
{
    public int GoalId { get; init; }
    public string? HowItWent { get; init; }
    public string? AdviceToPastSelf { get; init; }
    public DateTime CreatedAt { get; init; }
    public DateTime? UpdatedAt { get; init; }
}

public class MissionDebriefRequest
{
    [StringLength(4000)]
    public string? HowItWent { get; init; }

    [StringLength(4000)]
    public string? AdviceToPastSelf { get; init; }
}

/// <summary>What the "Mission passed" screen shows after a goal is completed.</summary>
public class MissionPassedDto
{
    public MissionDto Mission { get; init; } = new();
    /// <summary>Missions that were waiting on this one and now have nothing left blocking them.</summary>
    public List<MissionRefDto> NowUnlocked { get; init; } = [];
    public MissionDebriefDto? Debrief { get; init; }
}
