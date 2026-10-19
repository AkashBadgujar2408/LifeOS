using LifeOS.Core.Dashboard.DTOs;
using LifeOS.Core.Dashboard.Services;
using LifeOS.Core.Habits.Services;

namespace LifeOS.Core.Tests.Dashboard;

public class KpiFiguresTests
{
    // Sunday 18 Oct 2026.
    private static readonly DateOnly Today = new(2026, 10, 18);

    private static DateOnly D(int day) => new(2026, 10, day);

    private static Dictionary<int, HashSet<DateOnly>> Met(int habitId, params int[] days) =>
        new() { [habitId] = days.Select(D).ToHashSet() };

    [Fact]
    public void Windows_follow_the_local_week_and_the_last_30_days()
    {
        var windows = KpiWindows.For(Today);

        Assert.Equal(D(12), windows.WeekStart);      // Monday
        Assert.Equal(D(5), windows.LastWeekStart);
        Assert.Equal(new DateOnly(2026, 9, 19), windows.Last30Start);
        Assert.Equal(new DateOnly(2026, 8, 20), windows.Prev30Start);
        Assert.Equal(new DateOnly(2026, 1, 1), windows.YearStart);
    }

    [Fact]
    public void Consistency_counts_scheduled_days_only_and_today_once_done()
    {
        const byte monWedFri = 1 | 4 | 16;
        var habit = new KpiHabit(1, monWedFri, D(1));

        // 12-18 Oct: Mon 12, Wed 14, Fri 16 scheduled; two of three done.
        Assert.Equal(66, KpiFigures.HabitConsistency([habit], Met(1, 12, 16), D(12), Today, Today));
    }

    [Fact]
    public void Today_not_done_yet_is_not_a_miss()
    {
        var habit = new KpiHabit(1, HabitStreaks.EveryDay, D(16));

        Assert.Equal(100, KpiFigures.HabitConsistency([habit], Met(1, 16, 17), D(12), Today, Today));
        Assert.Equal(100, KpiFigures.HabitConsistency([habit], Met(1, 16, 17, 18), D(12), Today, Today));
    }

    [Fact]
    public void Days_before_a_habit_started_dont_count_and_nothing_due_is_null()
    {
        var habit = new KpiHabit(1, HabitStreaks.EveryDay, D(20));

        Assert.Null(KpiFigures.HabitConsistency([habit], Met(1), D(12), Today, Today));
        Assert.Null(KpiFigures.HabitConsistency([], Met(1), D(12), Today, Today));
    }

    [Fact]
    public void Several_habits_pool_their_days()
    {
        var daily = new KpiHabit(1, HabitStreaks.EveryDay, D(1));
        var weekends = new KpiHabit(2, 32 | 64, D(1));
        var met = new Dictionary<int, HashSet<DateOnly>>
        {
            [1] = [D(14), D(15), D(16), D(17)],
            [2] = [D(17)],
        };

        // 14-17 Oct: daily 4 of 4, weekends Sat 17 done (Sun 18 is today, not done) → 5 of 5.
        Assert.Equal(100, KpiFigures.HabitConsistency([daily, weekends], met, D(14), Today, Today));
        // From 13 Oct the daily habit missed the 13th → 5 of 6.
        Assert.Equal(83, KpiFigures.HabitConsistency([daily, weekends], met, D(13), Today, Today));
    }

    [Fact]
    public void Every_definition_has_a_unique_stable_key()
    {
        Assert.Equal(KpiFigures.All.Count, KpiFigures.All.Select(k => k.Key).Distinct().Count());
        Assert.True(KpiFigures.IsKnown(KpiKeys.TasksDoneWeek));
        Assert.True(KpiFigures.IsKnown(KpiKeys.NetWorth));
        Assert.False(KpiFigures.IsKnown("no-such-figure"));
    }
}
