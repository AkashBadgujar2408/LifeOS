using LifeOS.Core.Goals.DTOs;
using LifeOS.Core.Goals.Services;

namespace LifeOS.Core.Tests.Goals;

public class GoalProgressTests
{
    [Theory]
    [InlineData(GoalStatuses.Active, 0, 0, 0)]
    [InlineData(GoalStatuses.Active, 3, 1, 33)]
    [InlineData(GoalStatuses.Active, 3, 2, 66)]
    [InlineData(GoalStatuses.Active, 3, 3, 100)]
    [InlineData(GoalStatuses.Active, 200, 199, 99)] // floored: never shows 100% while something is left
    [InlineData(GoalStatuses.Completed, 0, 0, 100)]
    [InlineData(GoalStatuses.Completed, 4, 1, 100)]
    [InlineData(GoalStatuses.Postponed, 4, 2, 50)]
    public void Percent_is_floored_share_of_done_milestones_and_completed_goals_are_full(
        string status, int milestones, int done, int expected)
    {
        Assert.Equal(expected, GoalProgress.Percent(status, milestones, done));
    }

    [Fact]
    public void A_measure_counts_what_was_already_done_and_is_floored_and_capped()
    {
        // 12,000 already walked + 28,000 logged of 1,00,000 steps.
        Assert.Equal(40, GoalProgress.MeasurePercent(new MeasureFacts(12_000, 100_000, 40_000)));
        Assert.Equal(99, GoalProgress.MeasurePercent(new MeasureFacts(0, 100_000, 99_999)));
        Assert.Equal(100, GoalProgress.MeasurePercent(new MeasureFacts(0, 100_000, 150_000)));
        Assert.Equal(0, GoalProgress.MeasurePercent(new MeasureFacts(0, 100_000, 0)));
    }

    [Fact]
    public void The_goals_target_decides_what_the_percent_means()
    {
        // Milestones only when there is no target.
        Assert.Equal(new GoalProgressResult(50, GoalProgressKinds.Milestones, false),
            GoalProgress.Of(new GoalProgressFacts(GoalStatuses.Active, 4, 2)));
        // A measure beats milestones: 37% of 2,000 pages, though half the milestones are done.
        Assert.Equal(new GoalProgressResult(37, GoalProgressKinds.Measure, false),
            GoalProgress.Of(new GoalProgressFacts(GoalStatuses.Active, 4, 2, new MeasureFacts(0, 2000, 750))));
        // Savings is the headline now (it was only a side card).
        Assert.Equal(new GoalProgressResult(64, GoalProgressKinds.Savings, false),
            GoalProgress.Of(new GoalProgressFacts(GoalStatuses.Active, 0, 0, SavingsPercent: 64)));
        // A body target behind the vault: locked, no figure.
        Assert.Equal(new GoalProgressResult(0, GoalProgressKinds.Body, true),
            GoalProgress.Of(new GoalProgressFacts(GoalStatuses.Active, 2, 2, HasBodyTarget: true)));
        Assert.Equal(new GoalProgressResult(30, GoalProgressKinds.Body, false),
            GoalProgress.Of(new GoalProgressFacts(GoalStatuses.Active, 2, 2, HasBodyTarget: true, BodyPercent: 30)));
    }

    [Fact]
    public void A_completed_goal_is_full_whatever_it_is_measured_by_and_never_locked()
    {
        Assert.Equal(new GoalProgressResult(100, GoalProgressKinds.Measure, false),
            GoalProgress.Of(new GoalProgressFacts(GoalStatuses.Completed, 0, 0, new MeasureFacts(0, 100, 10))));
        Assert.Equal(new GoalProgressResult(100, GoalProgressKinds.Body, false),
            GoalProgress.Of(new GoalProgressFacts(GoalStatuses.Completed, 0, 0, HasBodyTarget: true)));
    }
}
