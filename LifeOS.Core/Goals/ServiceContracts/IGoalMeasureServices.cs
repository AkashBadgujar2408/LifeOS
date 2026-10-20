using LifeOS.Core.Goals.DTOs;
using LifeOS.Core.Shared.DTOs;

namespace LifeOS.Core.Goals.ServiceContracts;

/// <summary>A goal as the progress rule needs it: its status and milestone counts (everything else is looked up).</summary>
public sealed record GoalProgressInput(int Id, string Status, int MilestoneCount, int CompletedMilestoneCount);

/// <summary>
/// Works out goals' progress through the one rule (<see cref="Services.GoalProgress"/>) — measure (entries + sources),
/// savings, body target or milestones — for any number of goals in a few queries. Never stored.
/// </summary>
public interface IGoalProgressService
{
    Task<Dictionary<int, GoalProgressDto>> ForGoalsAsync(IReadOnlyCollection<GoalProgressInput> goals, DateOnly today);

    /// <summary>
    /// A measured goal's figure by day: already done (on the day it was set), every logged entry and every source's
    /// amounts. Null when the goal has no measure, or counts something locked in the vault.
    /// </summary>
    Task<List<(DateOnly Day, decimal Amount)>?> MeasureHistoryAsync(int goalId, DateOnly today);
}

/// <summary>A source as stored (goals.GoalSources).</summary>
public sealed record GoalSourceRef(
    int Id, int GoalId, string Kind, string? EntityType, int? EntityId, string? Filter, string? Metric, DateOnly CountsFrom);

/// <summary>What a source counted on a day.</summary>
public sealed record SourceAmount(int SourceId, DateOnly Day, decimal Amount);

/// <summary>How a source reads: a title ("Walk 8k steps") and the unit it counts in ("steps").</summary>
public sealed record SourceDescription(string Title, string Unit);

/// <summary>
/// One kind of thing a goal can be counted from (habits, study time, books, …) — registered like linkable providers.
/// Reads go through AppDbContext so the user and soft-delete filters apply: another user's item is simply missing.
/// </summary>
public interface IGoalProgressSource
{
    /// <summary>The GoalSources.Kind values this provider answers for.</summary>
    IReadOnlyCollection<string> Kinds { get; }

    /// <summary>Health data: only read with the vault unlocked, and named by a neutral word otherwise.</summary>
    bool IsSensitive => false;

    /// <summary>Title + unit of each source whose item still exists (missing ones are left out).</summary>
    Task<Dictionary<int, SourceDescription>> DescribeAsync(IReadOnlyCollection<GoalSourceRef> sources);

    /// <summary>What each source counted, by day, from its CountsFrom up to today.</summary>
    Task<List<SourceAmount>> AmountsAsync(IReadOnlyCollection<GoalSourceRef> sources, DateOnly today);

    /// <summary>Everything of this provider's kinds a goal could be counted from, for the picker.</summary>
    Task<List<GoalSourceOptionDto>> OptionsAsync();

    /// <summary>A reason this item can't be counted (an Avoid habit counts slips, not progress), or null.</summary>
    Task<string?> CheckAsync(GoalSourceRef source) => Task.FromResult<string?>(null);
}

/// <summary>A measured goal's manual log and its sources.</summary>
public interface IGoalMeasureService
{
    Task<OperationResult<List<GoalMeasureEntryDto>>> GetEntriesAsync(int goalId);
    Task<OperationResult<GoalMeasureEntryDto>> AddEntryAsync(int goalId, GoalMeasureEntryRequest request);
    Task<OperationResult<GoalMeasureEntryDto>> UpdateEntryAsync(int goalId, int entryId, GoalMeasureEntryRequest request);
    Task<OperationResult<bool>> DeleteEntryAsync(int goalId, int entryId);

    Task<OperationResult<List<GoalSourceDto>>> GetSourcesAsync(int goalId, DateOnly today);

    /// <summary>Everything a goal could be counted from (every provider's options), for the picker.</summary>
    Task<List<GoalSourceOptionDto>> OptionsAsync();
    Task<OperationResult<GoalSourceDto>> AddSourceAsync(int goalId, GoalSourceRequest request);
    Task<OperationResult<GoalSourceDto>> UpdateSourceAsync(int goalId, int sourceId, GoalSourceUpdateRequest request);
    /// <summary>Stops counting from it; what it had counted stays as a Carried over entry.</summary>
    Task<OperationResult<bool>> RemoveSourceAsync(int goalId, int sourceId, DateOnly today);

    /// <summary>What goals an item counts toward ("Counts toward: Walk 100k — 40%") — habit, skill, project pages.</summary>
    Task<List<GoalCountedByDto>> CountsTowardAsync(string entityType, int entityId, DateOnly today);

    /// <summary>
    /// An item is being deleted: every source pointing at it is frozen into a Carried over entry and removed. Called by
    /// the item's own delete (habits, skills, courses, books, roadmaps, projects).
    /// </summary>
    Task ReleaseEntityAsync(string entityType, int entityId);

    /// <summary>
    /// The goal stops being counted from its sources (switched to Manual, or its measure removed): their total so far
    /// becomes Carried over entries (one per source), then they're removed. Saves nothing itself — the caller saves.
    /// Fails when a source can't be read (Health data with the vault locked).
    /// </summary>
    Task<OperationResult<bool>> FreezeSourcesAsync(int goalId, DateOnly today);
}
