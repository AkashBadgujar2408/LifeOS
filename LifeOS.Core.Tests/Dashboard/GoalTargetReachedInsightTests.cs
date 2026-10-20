using LifeOS.Core.Dashboard.DTOs;
using LifeOS.Core.Dashboard.Services;
using LifeOS.Core.Goals.Services;

namespace LifeOS.Core.Tests.Dashboard;

public class GoalTargetReachedInsightTests
{
    private static readonly DateOnly Today = new(2026, 10, 20);
    private static readonly DateTime Now = new(2026, 10, 20, 9, 0, 0, DateTimeKind.Utc);

    private static List<InsightDto> Evaluate(params InsightGoal[] goals) =>
        DashboardInsights.Evaluate(new InsightInputs(Today, Now, [], goals, Today, 0));

    private static InsightGoal Steps(int percent, bool counted = false, bool locked = false) =>
        new(7, "Walk 100k", Now, GoalProgressKinds.Measure, percent, locked, 100_000, "steps", counted);

    [Fact]
    public void Reaching_a_number_asks_to_mark_the_goal_complete()
    {
        var insight = Assert.Single(Evaluate(Steps(100)));
        Assert.Equal(InsightKinds.GoalTargetReached, insight.Kind);
        Assert.Equal(InsightTones.Cheer, insight.Tone);
        Assert.Equal("You've reached 100,000 steps on \"Walk 100k\". Mark it complete?", insight.Message);
        Assert.Equal(("Goal", 7), (insight.EntityType, insight.EntityId));
        Assert.Equal("GoalTargetReached:7:Measure:100000", insight.Key);
    }

    [Fact]
    public void Nothing_until_the_number_is_reached_or_while_it_is_locked()
    {
        Assert.Empty(Evaluate(Steps(99)));
        Assert.Empty(Evaluate(Steps(100, locked: true)));
    }

    [Fact]
    public void A_saved_amount_asks_too_but_finished_milestones_do_not()
    {
        var saved = new InsightGoal(3, "Emergency fund", Now, GoalProgressKinds.Savings, 100);
        Assert.Equal("You've saved what \"Emergency fund\" needed. Mark it complete?", Assert.Single(Evaluate(saved)).Message);
        Assert.Empty(Evaluate(new InsightGoal(4, "Ship it", Now, GoalProgressKinds.Milestones, 100)));
    }

    [Fact]
    public void A_counted_goal_is_never_untouched_since_it_moves_by_itself()
    {
        var longAgo = Now.AddDays(-30);
        Assert.Empty(Evaluate(new InsightGoal(7, "Walk 100k", longAgo, GoalProgressKinds.Measure, 40, false, 100_000, "steps", true)));
        Assert.Equal(InsightKinds.GoalUntouched,
            Assert.Single(Evaluate(new InsightGoal(7, "Walk 100k", longAgo, GoalProgressKinds.Measure, 40))).Kind);
    }
}
