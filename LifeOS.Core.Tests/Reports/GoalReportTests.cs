using LifeOS.Core.Goals.DTOs;
using LifeOS.Core.Reports.DTOs;
using LifeOS.Core.Reports.Services;

namespace LifeOS.Core.Tests.Reports;

public class GoalReportTests
{
    private static readonly DateOnly From = new(2026, 9, 1);
    private static readonly DateOnly To = new(2026, 9, 30);
    private static readonly DateOnly Today = new(2026, 10, 21);

    private static DateOnly D(int month, int day) => new(2026, month, day);

    private static GoalFact Goal(int id, string status, DateOnly? target = null, DateOnly? started = null,
        DateOnly? completed = null, DateOnly? abandoned = null, int pushed = 0, int area = 1) =>
        new(id, $"Goal {id}", "ShortTerm", status, area, $"Area {area}", target, started ?? D(1, 1), completed, abandoned, pushed);

    [Fact]
    public void A_goal_completed_in_the_range_is_on_time_late_or_without_a_target_day()
    {
        Assert.Equal(GoalOutcomes.OnTime, GoalReport.OutcomeOf(Goal(1, GoalStatuses.Completed, D(9, 10), completed: D(9, 10)), From, To, Today));
        Assert.Equal(GoalOutcomes.Late, GoalReport.OutcomeOf(Goal(2, GoalStatuses.Completed, D(9, 5), completed: D(9, 12)), From, To, Today));
        Assert.Equal(GoalOutcomes.NoTarget, GoalReport.OutcomeOf(Goal(3, GoalStatuses.Completed, completed: D(9, 30)), From, To, Today));
        // Completed the day after the range: the range has nothing to say about it.
        Assert.Null(GoalReport.OutcomeOf(Goal(4, GoalStatuses.Completed, D(12, 1), completed: D(10, 1)), From, To, Today));
    }

    [Fact]
    public void A_target_day_in_the_range_that_passed_undone_is_missed_even_if_finished_later()
    {
        Assert.Equal(GoalOutcomes.Missed, GoalReport.OutcomeOf(Goal(1, GoalStatuses.Active, D(9, 15)), From, To, Today));
        Assert.Equal(GoalOutcomes.Missed, GoalReport.OutcomeOf(Goal(2, GoalStatuses.Completed, D(9, 15), completed: D(10, 2)), From, To, Today));
        // Abandoned before its day: it wasn't missed, it was let go (earlier, outside the range).
        Assert.Null(GoalReport.OutcomeOf(Goal(3, GoalStatuses.Abandoned, D(9, 15), abandoned: D(8, 20)), From, To, Today));
        // A target day that hasn't passed yet isn't missed.
        Assert.Null(GoalReport.OutcomeOf(Goal(4, GoalStatuses.Active, Today), Today.AddDays(-5), Today, Today));
    }

    [Fact]
    public void Abandoned_and_still_going_goals_count_only_when_the_range_saw_it_happen()
    {
        Assert.Equal(GoalOutcomes.Abandoned, GoalReport.OutcomeOf(Goal(1, GoalStatuses.Abandoned, D(12, 1), abandoned: D(9, 3)), From, To, Today));
        Assert.Equal(GoalOutcomes.InProgress, GoalReport.OutcomeOf(Goal(2, GoalStatuses.Active, started: D(9, 9)), From, To, Today));
        Assert.Equal(GoalOutcomes.InProgress, GoalReport.OutcomeOf(Goal(3, GoalStatuses.Postponed, D(12, 1), pushed: 1), From, To, Today));
        Assert.Null(GoalReport.OutcomeOf(Goal(4, GoalStatuses.Active, D(12, 1)), From, To, Today));
    }

    [Fact]
    public void Totals_and_areas_add_up_with_the_on_time_share_of_dated_completions()
    {
        var goals = new[]
        {
            Goal(1, GoalStatuses.Completed, D(9, 10), completed: D(9, 8), area: 2),
            Goal(2, GoalStatuses.Completed, D(9, 10), completed: D(9, 14), area: 2),
            Goal(3, GoalStatuses.Completed, D(9, 10), completed: D(9, 9), started: D(9, 1), area: 1),
            Goal(4, GoalStatuses.Completed, completed: D(9, 20), area: 1),
            Goal(5, GoalStatuses.Active, D(9, 25), pushed: 2, area: 1),
            Goal(6, GoalStatuses.Active, D(12, 1), area: 3),
        };

        var report = GoalReport.Build(goals, From, To, Today);

        Assert.Equal(5, report.Goals.Count);
        Assert.Equal(4, report.Totals.Completed);
        Assert.Equal(2, report.Totals.OnTime);
        Assert.Equal(1, report.Totals.Late);
        Assert.Equal(1, report.Totals.NoTarget);
        Assert.Equal(1, report.Totals.Missed);
        Assert.Equal(1, report.Totals.PushedBack);
        Assert.Equal(1, report.Totals.Started);
        Assert.Equal(67, report.Totals.OnTimePercent);
        Assert.Equal([1, 2], report.Areas.Select(a => a.LifeAreaId));
        Assert.Equal(100, report.Areas[0].OnTimePercent);
        Assert.Equal(50, report.Areas[1].OnTimePercent);
        Assert.Equal(4, report.Goals.Single(g => g.Id == 2).DaysLate);
        Assert.Equal(26, report.Goals.Single(g => g.Id == 5).DaysLate); // open since 25 Sep, today 21 Oct
    }

    [Fact]
    public void Nothing_dated_completed_means_no_on_time_share()
    {
        var report = GoalReport.Build([Goal(1, GoalStatuses.Completed, completed: D(9, 2))], From, To, Today);

        Assert.Null(report.Totals.OnTimePercent);
        Assert.Equal(1, report.Totals.NoTarget);
    }
}
