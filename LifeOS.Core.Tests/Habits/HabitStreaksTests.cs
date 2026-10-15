using LifeOS.Core.Habits.Services;

namespace LifeOS.Core.Tests.Habits;

public class HabitStreaksTests
{
    private static DateOnly D(int year, int month, int day) => new(year, month, day);

    // ISO-order schedule bits.
    private const byte Monday = 1, Wednesday = 4, Friday = 16, Sunday = 64;
    private const byte MonWedFri = Monday | Wednesday | Friday;

    /// <summary>Every day from first to last, inclusive.</summary>
    private static IEnumerable<DateOnly> Days(DateOnly first, DateOnly last)
    {
        for (var day = first; day <= last; day = day.AddDays(1))
        {
            yield return day;
        }
    }

    [Fact]
    public void Daily_habit_done_every_day_counts_every_day()
    {
        // Started Mon 5 Oct 2026, ticked through today, Thu 15 Oct: 11 days.
        var streak = HabitStreaks.Calculate(HabitStreaks.EveryDay, D(2026, 10, 5), Days(D(2026, 10, 5), D(2026, 10, 15)), D(2026, 10, 15));

        Assert.Equal(new HabitStreak(11, 11, DoneToday: true, DueToday: true, LastMissed: null), streak);
    }

    [Fact]
    public void Today_not_ticked_yet_does_not_break_the_streak()
    {
        var streak = HabitStreaks.Calculate(HabitStreaks.EveryDay, D(2026, 10, 5), Days(D(2026, 10, 5), D(2026, 10, 14)), D(2026, 10, 15));

        Assert.Equal(10, streak.Current);
        Assert.False(streak.DoneToday);
        Assert.True(streak.DueToday);
        Assert.Null(streak.LastMissed);
    }

    [Fact]
    public void Missing_yesterday_breaks_the_current_streak_but_longest_keeps_the_old_run()
    {
        // Done 5-13 Oct (9 days), missed 14 Oct, not yet today.
        var streak = HabitStreaks.Calculate(HabitStreaks.EveryDay, D(2026, 10, 5), Days(D(2026, 10, 5), D(2026, 10, 13)), D(2026, 10, 15));

        Assert.Equal(0, streak.Current);
        Assert.Equal(9, streak.Longest);
        Assert.Equal(D(2026, 10, 14), streak.LastMissed);
    }

    [Fact]
    public void A_new_run_after_a_miss_counts_from_the_miss()
    {
        DateOnly[] done = [.. Days(D(2026, 10, 5), D(2026, 10, 10)), D(2026, 10, 12), D(2026, 10, 13), D(2026, 10, 14), D(2026, 10, 15)];

        var streak = HabitStreaks.Calculate(HabitStreaks.EveryDay, D(2026, 10, 5), done, D(2026, 10, 15));

        Assert.Equal(4, streak.Current);
        Assert.Equal(6, streak.Longest);
        Assert.Equal(D(2026, 10, 11), streak.LastMissed);
    }

    [Fact]
    public void Unscheduled_days_neither_break_nor_extend_the_streak()
    {
        // Mon/Wed/Fri from Mon 5 Oct: 5, 7, 9, 12, 14 done; today Thu 15 isn't scheduled.
        DateOnly[] done = [D(2026, 10, 5), D(2026, 10, 7), D(2026, 10, 9), D(2026, 10, 12), D(2026, 10, 14)];

        var streak = HabitStreaks.Calculate(MonWedFri, D(2026, 10, 5), done, D(2026, 10, 15));

        Assert.Equal(new HabitStreak(5, 5, DoneToday: false, DueToday: false, LastMissed: null), streak);
    }

    [Fact]
    public void A_tick_on_an_unscheduled_day_is_ignored_for_the_streak_but_still_shows_as_done_today()
    {
        // Mon/Wed/Fri: missed Wed 14, ticked Tue 13 and Thu 15 (today) instead — neither repairs the break.
        DateOnly[] done = [D(2026, 10, 12), D(2026, 10, 13), D(2026, 10, 15)];

        var streak = HabitStreaks.Calculate(MonWedFri, D(2026, 10, 12), done, D(2026, 10, 15));

        Assert.Equal(0, streak.Current);
        Assert.Equal(1, streak.Longest);
        Assert.True(streak.DoneToday);
        Assert.False(streak.DueToday);
        Assert.Equal(D(2026, 10, 14), streak.LastMissed);
    }

    [Fact]
    public void Ticks_before_the_start_date_are_ignored()
    {
        DateOnly[] done = [.. Days(D(2026, 10, 1), D(2026, 10, 15))];

        var streak = HabitStreaks.Calculate(HabitStreaks.EveryDay, D(2026, 10, 13), done, D(2026, 10, 15));

        Assert.Equal(3, streak.Current);
        Assert.Equal(3, streak.Longest);
    }

    [Fact]
    public void Days_before_the_start_date_are_never_missed()
    {
        var streak = HabitStreaks.Calculate(HabitStreaks.EveryDay, D(2026, 10, 15), [], D(2026, 10, 15));

        Assert.Equal(new HabitStreak(0, 0, DoneToday: false, DueToday: true, LastMissed: null), streak);
    }

    [Fact]
    public void Future_ticks_are_ignored()
    {
        DateOnly[] done = [D(2026, 10, 14), D(2026, 10, 16), D(2026, 10, 17)];

        var streak = HabitStreaks.Calculate(HabitStreaks.EveryDay, D(2026, 10, 14), done, D(2026, 10, 15));

        Assert.Equal(1, streak.Current);
        Assert.Equal(1, streak.Longest);
        Assert.False(streak.DoneToday);
    }

    [Fact]
    public void Today_before_the_start_date_gives_nothing()
    {
        var streak = HabitStreaks.Calculate(HabitStreaks.EveryDay, D(2026, 10, 20), [D(2026, 10, 15)], D(2026, 10, 15));

        Assert.Equal(new HabitStreak(0, 0, DoneToday: false, DueToday: false, LastMissed: null), streak);
    }

    [Fact]
    public void Last_missed_is_the_most_recent_missed_scheduled_day()
    {
        // Mon/Wed/Fri from 28 Sep: missed Wed 30 Sep and Fri 9 Oct, everything else done.
        DateOnly[] done = [D(2026, 9, 28), D(2026, 10, 2), D(2026, 10, 5), D(2026, 10, 7), D(2026, 10, 12), D(2026, 10, 14)];

        var streak = HabitStreaks.Calculate(MonWedFri, D(2026, 9, 28), done, D(2026, 10, 15));

        Assert.Equal(D(2026, 10, 9), streak.LastMissed);
        Assert.Equal(2, streak.Current);
        Assert.Equal(3, streak.Longest);
    }

    [Fact]
    public void A_run_carries_across_a_month_and_year_boundary()
    {
        var streak = HabitStreaks.Calculate(HabitStreaks.EveryDay, D(2026, 12, 28), Days(D(2026, 12, 28), D(2027, 1, 3)), D(2027, 1, 3));

        Assert.Equal(7, streak.Current);
    }

    [Theory]
    [InlineData(Monday, 2026, 10, 12, true)] // Monday
    [InlineData(Monday, 2026, 10, 18, false)] // Sunday
    [InlineData(Sunday, 2026, 10, 18, true)] // Sunday
    [InlineData(Sunday, 2026, 10, 17, false)] // Saturday
    [InlineData(MonWedFri, 2026, 10, 16, true)] // Friday
    [InlineData(MonWedFri, 2026, 10, 15, false)] // Thursday
    public void IsScheduled_reads_ISO_weekday_bits(byte scheduleDays, int year, int month, int day, bool expected)
    {
        Assert.Equal(expected, HabitStreaks.IsScheduled(scheduleDays, D(year, month, day)));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(128)]
    [InlineData(255)]
    public void An_invalid_schedule_throws(byte scheduleDays)
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => HabitStreaks.Calculate(scheduleDays, D(2026, 10, 1), [], D(2026, 10, 15)));
    }
}
