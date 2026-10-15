namespace LifeOS.Core.Habits.Services;

/// <summary>
/// A habit's streak figures as of <c>today</c>. Current/Longest count scheduled days done in a row; LastMissed is the
/// most recent scheduled day (before today) that wasn't done — what "streak broken" insights read.
/// </summary>
public record HabitStreak(int Current, int Longest, bool DoneToday, bool DueToday, DateOnly? LastMissed);

/// <summary>
/// The one place streaks are worked out. Pure date math (no DB, no clock) so it can be unit-tested; "today" is passed
/// in because it's the user's local date, which only the client knows. Streaks are never stored — they're always
/// recomputed from the ticked days, so they can't drift from what was actually done.
/// </summary>
public static class HabitStreaks
{
    /// <summary>Every day of the week (Monday = 1 ... Sunday = 64, ISO order), matching CK_Habits_ScheduleDays.</summary>
    public const byte EveryDay = 127;

    /// <summary>Whether the habit is due on that day. Bit 0 is Monday; .NET's DayOfWeek starts at Sunday = 0.</summary>
    public static bool IsScheduled(byte scheduleDays, DateOnly day)
    {
        EnsureValid(scheduleDays);
        var isoIndex = ((int)day.DayOfWeek + 6) % 7; // Monday -> 0 ... Sunday -> 6
        return (scheduleDays & (1 << isoIndex)) != 0;
    }

    /// <summary>
    /// Only scheduled days from <paramref name="startDate"/> to <paramref name="today"/> count: a tick on an
    /// unscheduled day, before the start or in the future is ignored, and unscheduled days neither break nor extend
    /// a streak. Today being scheduled but not ticked yet doesn't break the current streak — the day isn't over.
    /// </summary>
    public static HabitStreak Calculate(byte scheduleDays, DateOnly startDate, IEnumerable<DateOnly> doneDates, DateOnly today)
    {
        EnsureValid(scheduleDays);
        var done = doneDates.ToHashSet();

        if (today < startDate)
        {
            return new HabitStreak(0, 0, false, false, null);
        }

        // One forward walk: `run` is the streak ending at the latest scheduled day seen so far.
        int run = 0, longest = 0;
        DateOnly? lastMissed = null;
        for (var day = startDate; day <= today; day = day.AddDays(1))
        {
            if (!IsScheduled(scheduleDays, day))
            {
                continue;
            }

            if (done.Contains(day))
            {
                run++;
                longest = Math.Max(longest, run);
            }
            else if (day < today)
            {
                run = 0;
                lastMissed = day;
            }
            // Scheduled today and not done yet: leave the run as it stands.
        }

        return new HabitStreak(run, longest, done.Contains(today), IsScheduled(scheduleDays, today), lastMissed);
    }

    private static void EnsureValid(byte scheduleDays)
    {
        if (scheduleDays is 0 or > EveryDay)
        {
            throw new ArgumentOutOfRangeException(nameof(scheduleDays), scheduleDays, "Schedule must include 1 to 7 weekdays (1-127).");
        }
    }
}
