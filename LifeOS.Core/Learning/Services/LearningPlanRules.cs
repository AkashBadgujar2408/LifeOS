using LifeOS.Core.Learning.DTOs;

namespace LifeOS.Core.Learning.Services;

/// <summary>A note's place in the revision schedule.</summary>
public record ReviewState(byte Stage, DateOnly? NextReviewOn, DateOnly? LastReviewedOn);

/// <summary>
/// The revision planner: spaced review at 1, 3, 7, 14 and 30 days. Stage = reviews in a row that went well. Starting
/// to review a note asks for it tomorrow; each good review moves it one interval further (30 days from then on); a
/// review that didn't come back starts the intervals again. Pure, so tested.
/// </summary>
public static class RevisionPlanner
{
    public static readonly IReadOnlyList<int> IntervalDays = [1, 3, 7, 14, 30];

    /// <summary>The highest stage the schema allows (CK_KnowledgeNotes_ReviewStage).</summary>
    public const byte MaxStage = 5;

    /// <summary>Put a note into review: first look tomorrow.</summary>
    public static ReviewState Start(DateOnly today) => new(0, today.AddDays(IntervalDays[0]), null);

    /// <summary>The schedule after reviewing a note today.</summary>
    public static ReviewState Review(byte stage, bool remembered, DateOnly today)
    {
        if (!remembered)
        {
            return new ReviewState(0, today.AddDays(IntervalDays[0]), today);
        }

        var next = (byte)Math.Min(stage + 1, MaxStage);
        return new ReviewState(next, today.AddDays(IntervalDays[Math.Min(next, IntervalDays.Count - 1)]), today);
    }

    /// <summary>Due on or before today (a missed day stays due until it's reviewed).</summary>
    public static bool IsDue(DateOnly? nextReviewOn, DateOnly today) => nextReviewOn is { } next && next <= today;
}

/// <summary>A roadmap's progress, worked out from its steps (never stored).</summary>
public static class RoadmapProgress
{
    /// <summary>Floor of done/total (99.5% never reads 100); a roadmap without steps is 0, a Completed one 100.</summary>
    public static int Percent(string status, int stepCount, int completedStepCount)
    {
        if (status == RoadmapStatuses.Completed)
        {
            return 100;
        }

        return stepCount == 0 ? 0 : completedStepCount * 100 / stepCount;
    }

    /// <summary>
    /// The roadmap's status after a step was ticked or unticked: ticking the last open step of an Active roadmap
    /// finishes it; unticking a step of a Completed one reopens it. An Archived roadmap stays archived. Returns the
    /// new status, or null when it doesn't change.
    /// </summary>
    public static string? StatusAfterStep(string status, int stepCount, int completedStepCount)
    {
        var allDone = stepCount > 0 && completedStepCount == stepCount;
        return status switch
        {
            RoadmapStatuses.Active when allDone => RoadmapStatuses.Completed,
            RoadmapStatuses.Completed when !allDone => RoadmapStatuses.Active,
            _ => null,
        };
    }
}
