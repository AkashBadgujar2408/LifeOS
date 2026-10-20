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
    /// <summary>A savings goal's amount to reach (both or neither); progress comes from linked accounts and investments.</summary>
    public decimal? TargetAmount { get; init; }
    public string? TargetCurrency { get; init; }
    /// <summary>A measured goal (Session 71d): target + unit + what was already done, logged (Manual) or counted (Linked).</summary>
    public decimal? MeasureTarget { get; init; }
    public decimal? MeasureStart { get; init; }
    public string? MeasureUnit { get; init; }
    public string? MeasureSource { get; init; }
    /// <summary>Where a measured goal stands now (already done + logged + counted); null when locked.</summary>
    public decimal? MeasureCurrent { get; set; }
    /// <summary>What ProgressPercent is measured by (<see cref="Services.GoalProgressKinds"/>).</summary>
    public string ProgressKind { get; set; } = Services.GoalProgressKinds.Milestones;
    /// <summary>The figure is Health data and the vault is locked: show "Locked", not the percent.</summary>
    public bool ProgressLocked { get; set; }
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
    /// <summary>The task or project it follows (Session 71g) — it ticks itself when that's done.</summary>
    public int? TaskItemId { get; init; }
    public int? ProjectId { get; init; }
    /// <summary>The followed task's title or project's name.</summary>
    public string? FollowsTitle { get; init; }
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

    /// <summary>Makes it a savings goal: the amount to reach, in TargetCurrency (both or neither).</summary>
    public decimal? TargetAmount { get; init; }

    public string? TargetCurrency { get; init; }

    /// <summary>Makes it a measured goal: the number to reach in MeasureUnit (all of target, unit and source, or none).</summary>
    public decimal? MeasureTarget { get; init; }

    /// <summary>Already done before (0 when left out).</summary>
    public decimal? MeasureStart { get; init; }

    [StringLength(30)]
    public string? MeasureUnit { get; init; }

    /// <summary>Manual (a number I log) or Linked (counted from other items).</summary>
    public string? MeasureSource { get; init; }

    /// <summary>The client's today: when a Linked goal goes back to Manual, what was counted is carried over on this day.</summary>
    public DateOnly? Today { get; init; }

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

    /// <summary>Follow a task (ticks when it's done) — or a project (when all its tasks are done); at most one.</summary>
    public int? TaskItemId { get; init; }

    public int? ProjectId { get; init; }
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

// ---- Measured goals and what they're counted from (Sessions 71d–71h) ----

public static class GoalMeasureSources
{
    public const string Manual = "Manual";
    public const string Linked = "Linked";
}

public static class GoalMeasureEntryKinds
{
    public const string Logged = "Logged";
    public const string CarriedOver = "CarriedOver";
}

/// <summary>A goal's progress as the one rule (GoalProgress) worked it out.</summary>
public class GoalProgressDto
{
    public int Percent { get; init; }
    public string Kind { get; init; } = string.Empty;
    public bool Locked { get; init; }
    public decimal? MeasureCurrent { get; init; }
}

public class GoalMeasureEntryDto
{
    public int Id { get; init; }
    public int GoalId { get; init; }
    public DateOnly EntryDate { get; init; }
    public decimal Value { get; init; }
    /// <summary>Logged, or CarriedOver (what a source had counted when it stopped counting).</summary>
    public string Kind { get; init; } = string.Empty;
    public string? Note { get; init; }
    public DateTime CreatedAt { get; init; }
}

public class GoalMeasureEntryRequest
{
    public DateOnly EntryDate { get; init; }

    public decimal Value { get; init; }

    [StringLength(200)]
    public string? Note { get; init; }

    /// <summary>The client's today: entries can't be for a later day.</summary>
    public DateOnly Today { get; init; }
}

/// <summary>Something a Linked goal is counted from, with what it has counted so far.</summary>
public class GoalSourceDto
{
    public int Id { get; init; }
    public int GoalId { get; init; }
    public string Kind { get; init; } = string.Empty;
    public string? EntityType { get; init; }
    public int? EntityId { get; init; }
    public string? Filter { get; init; }
    public string? Metric { get; init; }
    public DateOnly CountsFrom { get; init; }
    public string Title { get; init; } = string.Empty;
    public string Unit { get; init; } = string.Empty;
    /// <summary>Null when it's Health data and the vault is locked.</summary>
    public decimal? Counted { get; init; }
    public bool Locked { get; init; }
}

public class GoalSourceRequest
{
    [Required]
    public string Kind { get; init; } = string.Empty;

    [StringLength(50)]
    public string? EntityType { get; init; }

    public int? EntityId { get; init; }

    [StringLength(30)]
    public string? Filter { get; init; }

    [StringLength(20)]
    public string? Metric { get; init; }

    /// <summary>Nothing earlier counts; the client's today when left out.</summary>
    public DateOnly? CountsFrom { get; init; }

    public DateOnly Today { get; init; }
}

public class GoalSourceUpdateRequest
{
    public DateOnly CountsFrom { get; init; }

    public DateOnly Today { get; init; }
}

/// <summary>A goal an item counts toward, shown on the item's page.</summary>
public class GoalCountedByDto
{
    public int GoalId { get; init; }
    public string GoalTitle { get; init; } = string.Empty;
    public string Status { get; init; } = string.Empty;
    public int Percent { get; init; }
    public bool Locked { get; init; }
    public decimal? MeasureCurrent { get; init; }
    public decimal? MeasureTarget { get; init; }
    public string? MeasureUnit { get; init; }
    /// <summary>What this item has counted toward it.</summary>
    public decimal? Counted { get; init; }
}

/// <summary>Something a goal could be counted from: what to send as a source, and how it reads and counts.</summary>
public class GoalSourceOptionDto
{
    public string Kind { get; init; } = string.Empty;
    public string? EntityType { get; init; }
    public int? EntityId { get; init; }
    public string? Filter { get; init; }
    public string? Metric { get; init; }
    public string Title { get; init; } = string.Empty;
    /// <summary>What it counts in — a goal's unit must match it.</summary>
    public string Unit { get; init; } = string.Empty;
}
