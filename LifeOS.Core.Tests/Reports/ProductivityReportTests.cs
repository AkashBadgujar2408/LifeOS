using LifeOS.Core.Reports.DTOs;
using LifeOS.Core.Reports.Services;

namespace LifeOS.Core.Tests.Reports;

public class ProductivityReportTests
{
    private static readonly DateOnly From = new(2026, 9, 1);
    private static readonly DateOnly To = new(2026, 9, 30);
    private static readonly DateOnly Today = new(2026, 9, 20);
    private static readonly DateTime FromUtc = new(2026, 9, 1, 0, 0, 0, DateTimeKind.Utc);
    private static readonly DateTime ToUtc = new(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc);
    private static readonly AreaFact[] Areas = [new(1, "Career"), new(2, "Learning")];

    private static DateOnly D(int month, int day) => new(2026, month, day);

    private static TaskFact Task(int id, DateOnly? due = null, DateOnly? completed = null, DateOnly? created = null,
        int? estimate = null, int focus = 0, int? area = null) =>
        new(id, $"Task {id}", null, due, completed, created ?? D(8, 1), estimate, focus, area);

    private static ProductivityReportDto Build(TaskFact[] tasks, TimeFact[]? focus = null, BlockFact[]? blocks = null,
        TimeFact[]? study = null, TimeFact[]? practice = null) =>
        ProductivityReport.Build(tasks, focus ?? [], study ?? [], practice ?? [], blocks ?? [], Areas, From, To, Today, FromUtc, ToUtc);

    [Fact]
    public void A_task_done_in_the_range_is_on_time_late_or_without_a_due_day_and_an_undone_passed_due_day_is_overdue()
    {
        Assert.Equal(TaskOutcomes.OnTime, ProductivityReport.OutcomeOf(Task(1, D(9, 10), D(9, 10)), From, To, Today));
        Assert.Equal(TaskOutcomes.Late, ProductivityReport.OutcomeOf(Task(2, D(9, 5), D(9, 8)), From, To, Today));
        Assert.Equal(TaskOutcomes.NoDueDate, ProductivityReport.OutcomeOf(Task(3, completed: D(9, 1)), From, To, Today));
        Assert.Equal(TaskOutcomes.Overdue, ProductivityReport.OutcomeOf(Task(4, D(9, 12)), From, To, Today));
        // Due in the range, done after it ended: still overdue as far as the range is concerned.
        Assert.Equal(TaskOutcomes.Overdue, ProductivityReport.OutcomeOf(Task(5, D(9, 12), D(10, 3)), From, To, D(10, 5)));
        // Due today or later and not done yet: nothing to say.
        Assert.Null(ProductivityReport.OutcomeOf(Task(6, Today), From, To, Today));
        Assert.Null(ProductivityReport.OutcomeOf(Task(7, D(9, 25)), From, To, Today));
    }

    [Fact]
    public void The_overdue_rate_counts_due_days_that_passed_and_one_done_early_for_a_coming_day()
    {
        var report = Build([
            Task(1, D(9, 10), D(9, 9)),  // done by its day
            Task(2, D(9, 11), D(9, 14)), // done late
            Task(3, D(9, 12)),           // still open
            Task(4, D(9, 25), D(9, 18)), // due later, already done — counts as done by its day
            Task(5, D(9, 26)),           // due later, open — not yet anything
        ]);

        Assert.Equal(4, report.Tasks.DuePassed);
        Assert.Equal(2, report.Tasks.DoneByDue);
        Assert.Equal(2, report.Tasks.Overdue);
        Assert.Equal(50, report.Tasks.OverdueRate);
        Assert.Equal(3, report.Tasks.Completed);
        Assert.Equal(2, report.Tasks.OnTime);
        Assert.Equal(1, report.Tasks.Late);
        Assert.Equal(4, report.TaskItems.Count); // the open one due later isn't listed
    }

    [Fact]
    public void Estimates_compare_with_all_focus_time_of_tasks_done_in_the_range()
    {
        var report = Build([
            Task(1, completed: D(9, 3), estimate: 60, focus: 90),
            Task(2, completed: D(9, 4), estimate: 30, focus: 20),
            Task(3, completed: D(9, 5), focus: 45),        // no estimate: left out
            Task(4, D(9, 2), estimate: 15, focus: 50),     // overdue, not done: left out
        ]);

        Assert.Equal(2, report.Estimates.Tasks);
        Assert.Equal(90, report.Estimates.EstimateMinutes);
        Assert.Equal(110, report.Estimates.ActualMinutes);
        Assert.Equal(1, report.Estimates.Over);
        Assert.Equal(1, report.Estimates.WithinEstimate);
        Assert.Equal(122, report.Estimates.ActualPercent);
    }

    [Fact]
    public void Weeks_count_tasks_done_and_focus_minutes_up_to_today()
    {
        var report = Build(
            [Task(1, completed: D(9, 1)), Task(2, completed: D(9, 8)), Task(3, completed: D(9, 9))],
            focus: [new(D(9, 1), 25, null), new(D(9, 2), 30, 1), new(D(9, 9), 50, null)]);

        // 1 Sep 2026 is a Tuesday: the first week is Mon 31 Aug, its part in the range starts on the 1st.
        Assert.Equal(D(8, 31), report.Weeks[0].WeekStart);
        Assert.Equal(D(9, 1), report.Weeks[0].From);
        Assert.Equal(D(9, 20), report.Weeks[^1].To); // stops at today
        Assert.Equal(3, report.Weeks.Count); // 20 Sep is a Sunday
        Assert.Equal((1, 55), (report.Weeks[0].TasksDone, report.Weeks[0].FocusMinutes));
        Assert.Equal((2, 50), (report.Weeks[1].TasksDone, report.Weeks[1].FocusMinutes));
        Assert.Equal((105, 3), (report.Focus.Minutes, report.Focus.Sessions));
        Assert.Equal(3, report.Focus.Days);
    }

    [Fact]
    public void Planned_time_is_clipped_to_the_range_and_set_against_tracked_time_by_area()
    {
        var blocks = new BlockFact[]
        {
            new(new DateTime(2026, 9, 2, 9, 0, 0, DateTimeKind.Utc), new DateTime(2026, 9, 2, 11, 0, 0, DateTimeKind.Utc), 1),
            // Started the evening before the range: only the part inside counts (1 h).
            new(new DateTime(2026, 8, 31, 23, 0, 0, DateTimeKind.Utc), new DateTime(2026, 9, 1, 1, 0, 0, DateTimeKind.Utc), null),
        };
        var report = Build([], focus: [new(D(9, 2), 100, 1)], blocks: blocks,
            study: [new(D(9, 3), 40, 2)], practice: [new(D(9, 4), 15, null)]);

        Assert.Equal(["Career", "Learning", ProductivityReport.NoAreaName], report.Areas.Select(a => a.LifeAreaName));
        var career = report.Areas[0];
        Assert.Equal((120, 100, 100), (career.PlannedMinutes, career.FocusMinutes, career.TrackedMinutes));
        Assert.Equal((0, 40), (report.Areas[1].PlannedMinutes, report.Areas[1].StudyMinutes));
        Assert.Equal((60, 15), (report.Areas[2].PlannedMinutes, report.Areas[2].PracticeMinutes));
    }
}
