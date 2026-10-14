using System.ComponentModel.DataAnnotations;
using LifeOS.Core.Shared.DTOs;

namespace LifeOS.Core.Goals.DTOs;

public static class GoalTypes
{
    public const string ShortTerm = "ShortTerm";
    public const string LongTerm = "LongTerm";
    public const string BucketList = "BucketList";
}

public static class GoalStatuses
{
    public const string Active = "Active";
    public const string Completed = "Completed";
    public const string Postponed = "Postponed";
    public const string Abandoned = "Abandoned";
}

/// <summary>One goal on the list screen: counts and the next open milestone, not the milestone collection.</summary>
public class GoalSummaryDto
{
    public int Id { get; init; }
    public string Title { get; init; } = string.Empty;
    public int LifeAreaId { get; init; }
    public string LifeAreaName { get; init; } = string.Empty;
    public string GoalType { get; init; } = string.Empty;
    public string Status { get; init; } = string.Empty;
    public DateOnly? TargetDate { get; init; }
    public DateTime? CompletedAt { get; init; }
    public int MilestoneCount { get; init; }
    public int CompletedMilestoneCount { get; init; }
    public int ProgressPercent { get; set; }
    public string? NextMilestoneTitle { get; init; }
    public List<TagDto> Tags { get; init; } = [];
}

public class GoalDetailDto : GoalSummaryDto
{
    public string? Description { get; init; }
    public DateTime CreatedAt { get; init; }
    public List<GoalMilestoneDto> Milestones { get; init; } = [];
}

public class GoalMilestoneDto
{
    public int Id { get; init; }
    public int GoalId { get; init; }
    public string Title { get; init; } = string.Empty;
    public DateOnly? TargetDate { get; init; }
    public DateTime? CompletedAt { get; init; }
    public int SortOrder { get; init; }
}

/// <summary>Create and edit share one shape; Status changes have their own flow (Session 11), not this form.</summary>
public class GoalRequest
{
    [Required]
    [StringLength(200)]
    public string Title { get; init; } = string.Empty;

    [StringLength(4000)]
    public string? Description { get; init; }

    [Range(1, int.MaxValue, ErrorMessage = "Choose a life area.")]
    public int LifeAreaId { get; init; }

    [Required]
    [AllowedValues(GoalTypes.ShortTerm, GoalTypes.LongTerm, GoalTypes.BucketList,
        ErrorMessage = "Goal type must be ShortTerm, LongTerm or BucketList.")]
    public string GoalType { get; init; } = string.Empty;

    public DateOnly? TargetDate { get; init; }

    public List<int> TagIds { get; init; } = [];
}

public class GoalMilestoneRequest
{
    [Required]
    [StringLength(200)]
    public string Title { get; init; } = string.Empty;

    public DateOnly? TargetDate { get; init; }
}

public class SetMilestoneCompletedRequest
{
    public bool Completed { get; init; }
}

public class ReorderMilestonesRequest
{
    [Required]
    public List<int> MilestoneIds { get; init; } = [];
}
