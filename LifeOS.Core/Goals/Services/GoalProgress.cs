namespace LifeOS.Core.Goals.Services;

/// <summary>What a goal's headline % is measured by.</summary>
public static class GoalProgressKinds
{
    public const string Milestones = "Milestones";
    /// <summary>Its own number: a target + unit, logged or counted from other items (Session 71d).</summary>
    public const string Measure = "Measure";
    /// <summary>An amount to save, from linked accounts and investments (Session 58).</summary>
    public const string Savings = "Savings";
    /// <summary>A Health body target (Session 65) — only readable with the vault unlocked.</summary>
    public const string Body = "Body";
}

/// <summary>A measured goal: what was already done, the target, and where it stands now (already + logged + counted).</summary>
public sealed record MeasureFacts(decimal Start, decimal Target, decimal Current);

/// <summary>
/// Everything a goal's progress can come from. At most one target is set (the database allows one of measure or
/// savings; a body target is refused on goals with either). <see cref="BodyPercent"/> is null when the goal has a body
/// target but the vault is locked.
/// </summary>
public sealed record GoalProgressFacts(
    string Status,
    int MilestoneCount,
    int CompletedMilestoneCount,
    MeasureFacts? Measure = null,
    int? SavingsPercent = null,
    bool HasBodyTarget = false,
    int? BodyPercent = null);

public sealed record GoalProgressResult(int Percent, string Kind, bool Locked);

/// <summary>
/// The one place goal progress is calculated. Progress is never stored. A Completed goal is always 100% (you can
/// finish a goal without reaching every number). Otherwise the goal's target decides — its own measure, then a savings
/// amount, then a body target — and a goal with none is measured by its milestones.
/// </summary>
public static class GoalProgress
{
    public static GoalProgressResult Of(GoalProgressFacts facts)
    {
        var kind = facts.Measure is not null ? GoalProgressKinds.Measure
            : facts.SavingsPercent is not null ? GoalProgressKinds.Savings
            : facts.HasBodyTarget ? GoalProgressKinds.Body
            : GoalProgressKinds.Milestones;

        if (facts.Status == DTOs.GoalStatuses.Completed)
        {
            return new GoalProgressResult(100, kind, false);
        }

        return kind switch
        {
            GoalProgressKinds.Measure => new GoalProgressResult(MeasurePercent(facts.Measure!), kind, false),
            GoalProgressKinds.Savings => new GoalProgressResult(Math.Clamp(facts.SavingsPercent!.Value, 0, 100), kind, false),
            GoalProgressKinds.Body => facts.BodyPercent is { } body
                ? new GoalProgressResult(Math.Clamp(body, 0, 100), kind, false)
                : new GoalProgressResult(0, kind, true),
            _ => new GoalProgressResult(Percent(facts.Status, facts.MilestoneCount, facts.CompletedMilestoneCount), kind, false),
        };
    }

    /// <summary>
    /// How much of the target the current figure is — "already done" counts, so 12,000 already walked + 28,000 logged
    /// of 1,00,000 steps is 40%. Floor, never past 100.
    /// </summary>
    public static int MeasurePercent(MeasureFacts measure)
    {
        if (measure.Target <= 0 || measure.Current <= 0)
        {
            return 0;
        }

        return (int)Math.Min(100, Math.Floor(measure.Current * 100 / measure.Target));
    }

    public static int Percent(string status, int milestoneCount, int completedMilestoneCount)
    {
        if (status == DTOs.GoalStatuses.Completed)
        {
            return 100;
        }

        if (milestoneCount == 0)
        {
            return 0;
        }

        // Floor, not round: 199 of 200 milestones done must never show as 100%.
        return completedMilestoneCount * 100 / milestoneCount;
    }
}
