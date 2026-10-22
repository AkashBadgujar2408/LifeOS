using LifeOS.Core.Habits.DTOs;
using LifeOS.Core.Reports.Services;

namespace LifeOS.Core.Tests.Reports;

public class HabitReportTests
{
    // Mon 5 Oct – Sun 18 Oct 2026; "today" is Wed 14 Oct.
    private static readonly DateOnly From = new(2026, 10, 5);
    private static readonly DateOnly To = new(2026, 10, 18);
    private static readonly DateOnly Today = new(2026, 10, 14);

    private static DateOnly D(int day) => new(2026, 10, day);

    private static HabitFact Habit(int id, string kind = HabitKinds.Build, byte schedule = 127, DateOnly? start = null,
        decimal? target = null, DateOnly? archived = null) =>
        new(id, $"Habit {id}", kind, archived is null ? HabitStatuses.Active : HabitStatuses.Archived, schedule,
            start ?? D(1), target, null, null, archived);

    private static HabitEntryFact E(int habit, int day, decimal? value = null) => new(habit, D(day), value);

    [Fact]
    public void A_build_habit_counts_scheduled_days_to_today_and_an_unfinished_today_is_not_a_miss()
    {
        // Every day; done 5, 6, 7, 9, 10, 11 — misses 8, 12, 13; today (14) not done yet.
        var entries = new[] { E(1, 5), E(1, 6), E(1, 7), E(1, 9), E(1, 10), E(1, 11) };

        var report = HabitReport.Build([Habit(1)], entries, From, To, Today);
        var habit = report.Habits.Single();

        Assert.Equal(9, habit.Total);
        Assert.Equal(6, habit.Good);
        Assert.Equal(67, habit.Percent);
        Assert.Equal(3, habit.BestRun);
    }

    [Fact]
    public void Unscheduled_days_neither_break_nor_extend_a_run_and_a_target_must_be_met()
    {
        // Mon/Wed/Fri (1 + 4 + 16), 30 pages a day: Mon 5 done, Wed 7 only 10 pages, Fri 9 + Mon 12 done, Wed 14 today.
        var entries = new[] { E(1, 5, 30), E(1, 7, 10), E(1, 9, 35), E(1, 12, 30), E(1, 14, 40) };

        var habit = HabitReport.Build([Habit(1, schedule: 21, target: 30)], entries, From, To, Today).Habits.Single();

        Assert.Equal(5, habit.Total); // 5, 7, 9, 12, 14 (today done)
        Assert.Equal(4, habit.Good);
        Assert.Equal(3, habit.BestRun); // 9, 12, 14 — the weekend between doesn't break it
    }

    [Fact]
    public void An_avoid_habit_counts_clean_days_including_today()
    {
        var habit = HabitReport.Build([Habit(1, HabitKinds.Avoid)], [E(1, 8), E(1, 9)], From, To, Today).Habits.Single();

        Assert.Equal(10, habit.Total); // 5–14
        Assert.Equal(8, habit.Good);
        Assert.Equal(2, habit.Slips);
        Assert.Equal(5, habit.BestRun); // 10–14
    }

    [Fact]
    public void Start_and_archive_days_bound_a_habit_and_weeks_add_up_build_habits_only()
    {
        var habits = new[]
        {
            Habit(1, start: D(8)),          // 8–13 counted (today undone): 6 days
            Habit(2, archived: D(6)),       // 5–6: 2 days
            Habit(3, HabitKinds.Avoid),     // not in the weekly line
        };
        var entries = new[] { E(1, 8), E(1, 12), E(2, 5) };

        var report = HabitReport.Build(habits, entries, From, To, Today);

        Assert.Equal(6, report.Habits.Single(h => h.Id == 1).Total);
        Assert.Equal(2, report.Habits.Single(h => h.Id == 2).Total);
        Assert.Equal(8, report.Build.Total);
        Assert.Equal(3, report.Build.Good);
        Assert.Equal(10, report.Avoid.Total);
        Assert.Equal([D(5), D(12)], report.Weeks.Select(w => w.WeekStart));
        Assert.Equal((6, 2), (report.Weeks[0].Total, report.Weeks[0].Good)); // 5, 6 (habit 2) + 8–11 (habit 1)
        Assert.Equal((2, 1), (report.Weeks[1].Total, report.Weeks[1].Good)); // 12, 13
        Assert.Equal(D(14), report.Weeks[1].To);
    }

    [Fact]
    public void A_range_starting_mid_week_clips_the_first_week_and_a_future_range_has_no_weeks()
    {
        var report = HabitReport.Build([Habit(1)], [], D(7), To, Today);
        Assert.Equal(D(5), report.Weeks[0].WeekStart);
        Assert.Equal(D(7), report.Weeks[0].From);

        var lateStart = HabitReport.Build([Habit(1, start: D(12))], [], new DateOnly(2026, 9, 1), To, Today);
        Assert.Equal(D(12), lateStart.Weeks[0].WeekStart); // September and early October had nothing scheduled

        var future = HabitReport.Build([Habit(1)], [], D(20), D(30), Today);
        Assert.Empty(future.Weeks);
        Assert.Null(future.Build.Percent);
    }
}
