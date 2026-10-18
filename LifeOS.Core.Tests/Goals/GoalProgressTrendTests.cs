using LifeOS.Core.Goals.DTOs;
using LifeOS.Core.Goals.Services;

namespace LifeOS.Core.Tests.Goals;

public class GoalProgressTrendTests
{
    private static DateTime T(int day, int hour = 9) => new(2026, 10, day, hour, 0, 0, DateTimeKind.Utc);

    private static readonly DateTime Now = T(18, 12);

    private static List<(DateTime At, int Percent)> Build(
        IReadOnlyCollection<TrendMilestone> milestones,
        IReadOnlyCollection<TrendStatusChange>? changes = null,
        string status = GoalStatuses.Active) =>
        GoalProgressTrend.Build(T(1), status, milestones, changes ?? [], Now).Select(p => (p.At, p.Percent)).ToList();

    [Fact]
    public void Steps_up_with_each_ticked_milestone_and_runs_to_now()
    {
        var points = Build(
        [
            new TrendMilestone(T(1), T(5), null),
            new TrendMilestone(T(1), T(10), null),
            new TrendMilestone(T(1), null, null),
            new TrendMilestone(T(1), null, null),
        ]);

        Assert.Equal([(T(1), 0), (T(5), 25), (T(10), 50), (Now, 50)], points);
    }

    [Fact]
    public void Adding_a_milestone_later_lowers_the_percent_from_that_moment()
    {
        var points = Build(
        [
            new TrendMilestone(T(1), T(3), null),
            new TrendMilestone(T(1), null, null),
            new TrendMilestone(T(7), null, null),
        ]);

        Assert.Equal([(T(1), 0), (T(3), 50), (T(7), 33), (Now, 33)], points);
    }

    [Fact]
    public void A_removed_milestone_counted_until_it_was_removed()
    {
        var points = Build(
        [
            new TrendMilestone(T(1), T(4), null),
            new TrendMilestone(T(1), null, T(6)),
        ]);

        Assert.Equal([(T(1), 0), (T(4), 50), (T(6), 100), (Now, 100)], points);
    }

    [Fact]
    public void Completing_the_goal_is_100_and_reopening_it_drops_back()
    {
        var points = Build(
            [new TrendMilestone(T(1), T(2), null), new TrendMilestone(T(1), null, null)],
            [
                new TrendStatusChange(T(8), GoalStatuses.Active, GoalStatuses.Completed),
                new TrendStatusChange(T(12), GoalStatuses.Completed, GoalStatuses.Active),
            ]);

        Assert.Equal([(T(1), 0), (T(2), 50), (T(8), 100), (T(12), 50), (Now, 50)], points);
    }

    [Fact]
    public void Without_milestones_or_history_the_line_is_flat()
    {
        Assert.Equal([(T(1), 0), (Now, 0)], Build([]));
        // A goal completed before status history existed is simply 100% throughout.
        Assert.Equal([(T(1), 100), (Now, 100)], Build([], status: GoalStatuses.Completed));
    }
}
