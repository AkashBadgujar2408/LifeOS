using LifeOS.Core.Dashboard.DTOs;
using LifeOS.Core.Dashboard.Services;
using LifeOS.Core.Habits.Services;

namespace LifeOS.Core.Tests.Dashboard;

public class DashboardInsightsTests
{
    // Thursday 15 Oct 2026, 15:00 UTC.
    private static readonly DateOnly Today = new(2026, 10, 15);
    private static readonly DateTime Now = new(2026, 10, 15, 15, 0, 0, DateTimeKind.Utc);

    private const byte MonWedFri = 1 | 4 | 16;

    private static DateOnly D(int day) => new(2026, 10, day);

    private static InsightHabit Habit(byte schedule, params int[] doneDays)
    {
        var done = doneDays.Select(D).ToHashSet();
        var streak = HabitStreaks.Calculate(schedule, D(1), done, Today);
        return new InsightHabit(1, "Stretch", schedule, D(1), done, streak);
    }

    private static List<InsightDto> Evaluate(
        IReadOnlyList<InsightHabit>? habits = null,
        IReadOnlyList<InsightGoal>? goals = null,
        DateOnly? latestJournal = null,
        int overdue = 0) =>
        DashboardInsights.Evaluate(new InsightInputs(Today, Now, habits ?? [], goals ?? [], latestJournal, overdue));

    [Fact]
    public void Nothing_to_say_on_a_quiet_good_day()
    {
        Assert.Empty(Evaluate(latestJournal: Today));
    }

    [Fact]
    public void Daily_habit_missed_yesterday_after_a_done_day_has_just_broken()
    {
        var insight = Assert.Single(Evaluate([Habit(HabitStreaks.EveryDay, 12, 13)]));

        Assert.Equal(InsightKinds.HabitStreakBroken, insight.Kind);
        Assert.Equal(InsightTones.Nudge, insight.Tone);
        Assert.Contains("Wednesday", insight.Message);
        Assert.Equal(("Habit", 1), (insight.EntityType, insight.EntityId));
    }

    [Fact]
    public void Picking_it_back_up_today_clears_the_nudge()
    {
        Assert.Empty(Evaluate([Habit(HabitStreaks.EveryDay, 12, 13, 15)]));
    }

    [Fact]
    public void An_older_miss_is_not_repeated()
    {
        // Missed Tue 13 and Wed 14: the streak broke two days ago, not just now.
        Assert.Empty(Evaluate([Habit(HabitStreaks.EveryDay, 11, 12)]));
    }

    [Fact]
    public void A_habit_never_done_has_no_streak_to_break()
    {
        Assert.Empty(Evaluate([Habit(HabitStreaks.EveryDay)]));
    }

    [Fact]
    public void Unscheduled_days_are_skipped_when_finding_the_miss()
    {
        // Mon/Wed/Fri: Mon 12 done, Wed 14 missed — Tue doesn't count either way.
        var insight = Assert.Single(Evaluate([Habit(MonWedFri, 12)]));
        Assert.Contains("Wednesday", insight.Message);

        // Mon 12 and Wed 14 done: nothing broken.
        Assert.Empty(Evaluate([Habit(MonWedFri, 12, 14)]));
    }

    [Fact]
    public void A_habit_that_only_started_yesterday_cannot_have_broken()
    {
        var habit = new InsightHabit(1, "New", HabitStreaks.EveryDay, D(14), new HashSet<DateOnly>(),
            HabitStreaks.Calculate(HabitStreaks.EveryDay, D(14), [], Today));

        Assert.Empty(Evaluate([habit]));
    }

    [Fact]
    public void Goal_untouched_for_fourteen_days_gets_a_nudge_but_thirteen_does_not()
    {
        var stale = new InsightGoal(7, "Learn Kanji", Now.AddDays(-14));
        var fresh = new InsightGoal(8, "Visit Japan", Now.AddDays(-13).AddHours(-23));

        var insight = Assert.Single(Evaluate(goals: [stale, fresh]));

        Assert.Equal(InsightKinds.GoalUntouched, insight.Kind);
        Assert.Equal(("Goal", 7), (insight.EntityType, insight.EntityId));
        Assert.Contains("14 days", insight.Message);
    }

    [Fact]
    public void Journal_gap_starts_at_five_days_and_needs_an_earlier_entry()
    {
        Assert.Empty(Evaluate(latestJournal: D(11)));
        Assert.Equal(InsightKinds.JournalGap, Assert.Single(Evaluate(latestJournal: D(10))).Kind);
        Assert.Empty(Evaluate(latestJournal: null));
    }

    [Fact]
    public void Three_overdue_tasks_get_a_nudge()
    {
        Assert.Empty(Evaluate(latestJournal: Today, overdue: 2));
        var insight = Assert.Single(Evaluate(latestJournal: Today, overdue: 3));
        Assert.Equal((InsightKinds.OverdueTasks, "Tasks"), (insight.Kind, insight.EntityType));
    }

    [Fact]
    public void A_streak_milestone_reached_today_is_celebrated_after_the_nudges()
    {
        var sevenInARow = Habit(HabitStreaks.EveryDay, 9, 10, 11, 12, 13, 14, 15);

        var insights = Evaluate([sevenInARow], latestJournal: D(1));

        Assert.Equal([InsightKinds.JournalGap, InsightKinds.HabitStreakMilestone], insights.Select(i => i.Kind));
        Assert.Equal(InsightTones.Cheer, insights[1].Tone);
        Assert.StartsWith("7 in a row", insights[1].Message);
    }

    [Fact]
    public void A_milestone_count_not_ticked_today_is_not_celebrated_yet()
    {
        // Six days to yesterday, today still open: current is 6, nothing to celebrate.
        Assert.Empty(Evaluate([Habit(HabitStreaks.EveryDay, 9, 10, 11, 12, 13, 14)], latestJournal: Today));
    }
}
