namespace LifeOS.Core.Journal.Services;

/// <summary>
/// ISO weeks (Monday to Sunday) for weekly reflections — the same rule as CK_WeeklyReflections_Monday and the en-gb
/// calendar. Pure date math, unit-tested.
/// </summary>
public static class JournalWeeks
{
    /// <summary>The Monday of the week containing <paramref name="day"/>. .NET's DayOfWeek has Sunday = 0.</summary>
    public static DateOnly WeekStart(DateOnly day) => day.AddDays(-(((int)day.DayOfWeek + 6) % 7));

    /// <summary>Whether <paramref name="day"/> can be a WeekStartDate (a Monday).</summary>
    public static bool IsWeekStart(DateOnly day) => day.DayOfWeek == DayOfWeek.Monday;

    /// <summary>Monday to Sunday of the week starting at <paramref name="weekStart"/>, inclusive.</summary>
    public static (DateOnly First, DateOnly Last) Range(DateOnly weekStart)
    {
        if (!IsWeekStart(weekStart))
        {
            throw new ArgumentException("A week starts on a Monday.", nameof(weekStart));
        }

        return (weekStart, weekStart.AddDays(6));
    }
}
