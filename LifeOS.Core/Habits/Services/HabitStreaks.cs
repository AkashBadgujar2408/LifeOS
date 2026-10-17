namespace LifeOS.Core.Habits.Services;

/// <summary>
/// A habit's streak figures as of <c>today</c>. Current/Longest count scheduled days done in a row; LastMissed is the
/// most recent scheduled day (before today) that wasn't done — what "streak broken" insights read.
/// </summary>
public record HabitStreak(int Current, int Longest, bool DoneToday, bool DueToday, DateOnly? LastMissed);

/// <summary>
/// An avoid habit's clean runs as of <c>today</c>: days in a row without a slip. Current counts today when there's
/// been no slip today (the day so far is clean); Longest is the best run ever. Nothing about a slip is punitive —
/// the longest run stays, and the next clean day starts a new run.
/// </summary>
public record HabitCleanRun(int Current, int Longest, bool SlippedToday, DateOnly? LastSlip);

/// <summary>
/// The one place streaks are worked out. Pure date math (no DB, no clock) so it can be unit-tested; "today" is passed
/// in because it's the user's local date, which only the client knows. Streaks are never stored — they're always
/// recomputed from the ticked days, so they can't drift from what was actually done.
/// </summary>
public static class HabitStreaks
{
    /// <summary>Every day of the week (Monday = 1 ... Sunday = 64, ISO order), matching CK_Habits_ScheduleDays.</summary>
    public const byte EveryDay = 127;

    /// <summary>
    /// Whether a logged day counts as done: always for a habit without a target, and for a measurable one when the
    /// value reached it. A day logged without a value (ticked before a target was set) still counts. Same rule as
    /// the procedures' "(TargetValue IS NULL OR Value IS NULL OR Value >= TargetValue)".
    /// </summary>
    public static bool IsMet(decimal? value, decimal? target) => target is null || value is null || value >= target;

    /// <summary>
    /// Clean runs of an avoid habit: every day from <paramref name="startDate"/> to <paramref name="today"/> is either
    /// a slip or clean (avoid habits run every day). Slips before the start or after today are ignored.
    /// </summary>
    public static HabitCleanRun CleanRuns(DateOnly startDate, IEnumerable<DateOnly> slipDates, DateOnly today)
    {
        var slips = slipDates.Where(d => d >= startDate && d <= today).ToHashSet();
        if (today < startDate)
        {
            return new HabitCleanRun(0, 0, false, null);
        }

        int run = 0, longest = 0;
        DateOnly? lastSlip = null;
        for (var day = startDate; day <= today; day = day.AddDays(1))
        {
            if (slips.Contains(day))
            {
                run = 0;
                lastSlip = day;
            }
            else
            {
                run++;
                longest = Math.Max(longest, run);
            }
        }

        return new HabitCleanRun(run, longest, slips.Contains(today), lastSlip);
    }

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
