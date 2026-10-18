using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
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
    public List<GoalHistoryDto> History { get; init; } = [];
}

public static class GoalHistoryEvents
{
    public const string StatusChanged = "StatusChanged";
    public const string Revised = "Revised";
}

/// <summary>One entry in a goal's review log, newest first.</summary>
public class GoalHistoryDto
{
    public int Id { get; init; }
    public string EventType { get; init; } = string.Empty;
    public string? FromStatus { get; init; }
    public string? ToStatus { get; init; }
    /// <summary>Revised only: property names that changed, e.g. ["TargetDate", "Tags"].</summary>
    public List<string> ChangedFields => ChangedFieldsCsv?.Split(',').ToList() ?? [];

    /// <summary>The column as stored (comma-separated); projected from SQL, split above.</summary>
    [JsonIgnore]
    public string? ChangedFieldsCsv { get; init; }
    public DateOnly? PreviousTargetDate { get; init; }
    public DateOnly? NewTargetDate { get; init; }
    public string? Note { get; init; }
    public DateTime CreatedAt { get; init; }
}

public class SetGoalStatusRequest
{
    [Required]
    [AllowedValues(GoalStatuses.Active, GoalStatuses.Completed, GoalStatuses.Postponed, GoalStatuses.Abandoned,
        ErrorMessage = "Status must be Active, Completed, Postponed or Abandoned.")]
    public string Status { get; init; } = string.Empty;

    [StringLength(1000)]
    public string? Note { get; init; }
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

/// <summary>
/// Create and edit share one shape; status changes have their own endpoint. An edit that changes anything is a
/// revision and gets logged to the goal's history, with RevisionNote as the "why".
/// </summary>
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

    /// <summary>Edit only (ignored on create): why the goal is being revised.</summary>
    [StringLength(1000)]
    public string? RevisionNote { get; init; }
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

/// <summary>A step in a goal's progress trend: from <see cref="At"/> on, the goal stood at <see cref="Percent"/>.</summary>
public class GoalTrendPointDto
{
    public DateTime At { get; init; }
    public int Percent { get; init; }
}

/// <summary>The user's life vision: the premise of their story, shown atop Goals and the Life Story.</summary>
public class LifeVisionDto
{
    public string? Text { get; init; }
}

public class LifeVisionRequest
{
    /// <summary>Blank clears it.</summary>
    [StringLength(2000)]
    public string? Text { get; init; }
}
