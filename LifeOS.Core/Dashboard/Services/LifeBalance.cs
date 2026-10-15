namespace LifeOS.Core.Dashboard.Services;

/// <summary>
/// How the Life Balance Wheel turns counts into a spoke length. Pure, unit-tested. The wheel shows *balance* — where
/// your effort went relative to the rest — so scores are relative to the busiest area (it gets 10), not absolute
/// targets nobody set. Finishing things weighs more than ticking things; an active goal alone counts a little, since
/// aiming at something is a start.
/// </summary>
public static class LifeBalance
{
    public const int ActiveGoalPoints = 1;
    public const int GoalCompletedPoints = 5;
    public const int MilestoneCompletedPoints = 3;
    public const int HabitTickPoints = 1;
    public const int JournalEntryPoints = 1;

    public const decimal MaxScore = 10m;

    public static int Points(int activeGoals, int goalsCompleted, int milestonesCompleted, int habitTicks, int journalEntries) =>
        activeGoals * ActiveGoalPoints
        + goalsCompleted * GoalCompletedPoints
        + milestonesCompleted * MilestoneCompletedPoints
        + habitTicks * HabitTickPoints
        + journalEntries * JournalEntryPoints;

    /// <summary>0-10 to one decimal: the busiest area is 10, the rest in proportion; all zero when nothing happened.</summary>
    public static IReadOnlyList<decimal> Scores(IReadOnlyList<int> points)
    {
        var max = points.Count == 0 ? 0 : points.Max();
        return points
            .Select(p => max == 0 ? 0m : Math.Round(p * MaxScore / max, 1, MidpointRounding.AwayFromZero))
            .ToList();
    }
}
