using LifeOS.Core.Goals.DTOs;

namespace LifeOS.Core.Story.Services;

/// <summary>What kind of mission a goal is in Story Mode. Derived from GoalType, never stored (confirmed 2026-10-15).</summary>
public static class MissionKinds
{
    public const string Main = "Main";
    public const string Side = "Side";
    public const string Collectible = "Collectible";

    /// <summary>Long-term = main mission, short-term = side mission, bucket list = collectible.</summary>
    public static string Of(string goalType) => goalType switch
    {
        GoalTypes.LongTerm => Main,
        GoalTypes.ShortTerm => Side,
        GoalTypes.BucketList => Collectible,
        _ => throw new ArgumentOutOfRangeException(nameof(goalType), goalType, "Unknown goal type."),
    };
}

/// <summary>
/// The "mission A needs mission B first" graph. Pure, unit-tested: the service loads the user's live edges and goal
/// statuses and asks these questions; nothing about locks is stored.
/// </summary>
public static class MissionGraph
{
    /// <summary>
    /// A prerequisite holds a mission back only while it's still in play (Active or Postponed). Completed obviously
    /// releases it; Abandoned does too — you decided it isn't happening, and a mission locked forever behind a dropped
    /// goal would be a dead end, not a story beat.
    /// </summary>
    public static bool Blocks(string prerequisiteStatus) =>
        prerequisiteStatus is GoalStatuses.Active or GoalStatuses.Postponed;

    /// <summary>The prerequisites of <paramref name="goalId"/> still holding it back (empty = unlocked).</summary>
    public static IReadOnlyList<int> BlockedBy(
        int goalId,
        IEnumerable<(int GoalId, int RequiresGoalId)> edges,
        IReadOnlyDictionary<int, string> statusByGoal) =>
        edges
            .Where(e => e.GoalId == goalId)
            .Select(e => e.RequiresGoalId)
            // A prerequisite that's gone (deleted) can't hold anything back.
            .Where(required => statusByGoal.TryGetValue(required, out var status) && Blocks(status))
            .Distinct()
            .ToList();

    /// <summary>
    /// The missions that were waiting on <paramref name="completedGoalId"/> and, with it done, have nothing else
    /// holding them back — what "Mission passed" announces as unlocked. Missions no longer in play (completed or let
    /// go) aren't announced.
    /// </summary>
    public static IReadOnlyList<int> UnlockedBy(
        int completedGoalId,
        IReadOnlyCollection<(int GoalId, int RequiresGoalId)> edges,
        IReadOnlyDictionary<int, string> statusByGoal) =>
        edges
            .Where(e => e.RequiresGoalId == completedGoalId)
            .Select(e => e.GoalId)
            .Distinct()
            .Where(waiting => statusByGoal.TryGetValue(waiting, out var status) && Blocks(status))
            .Where(waiting => BlockedBy(waiting, edges, statusByGoal).Count == 0)
            .ToList();

    /// <summary>
    /// Would adding "<paramref name="goalId"/> requires <paramref name="requiresGoalId"/>" close a loop? True when
    /// <paramref name="requiresGoalId"/> already (directly or through others) requires <paramref name="goalId"/> — or
    /// is the same goal.
    /// </summary>
    public static bool WouldCreateCycle(IEnumerable<(int GoalId, int RequiresGoalId)> edges, int goalId, int requiresGoalId) =>
        Shared.Services.DependencyGraph.WouldCreateCycle(edges.Select(e => (e.GoalId, e.RequiresGoalId)), goalId, requiresGoalId);
}
