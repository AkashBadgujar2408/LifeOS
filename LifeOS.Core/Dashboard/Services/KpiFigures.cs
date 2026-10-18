using LifeOS.Core.Dashboard.DTOs;
using LifeOS.Core.Habits.Services;
using LifeOS.Core.Journal.Services;
using LifeOS.Core.Shared.DTOs;

namespace LifeOS.Core.Dashboard.Services;

/// <summary>The local days a KPI looks at, all worked out from the user's today.</summary>
public record KpiWindows(DateOnly Today, DateOnly WeekStart, DateOnly LastWeekStart, DateOnly Last30Start, DateOnly Prev30Start, DateOnly YearStart)
{
    public static KpiWindows For(DateOnly today)
    {
        var weekStart = JournalWeeks.WeekStart(today);
        return new KpiWindows(today, weekStart, weekStart.AddDays(-7), today.AddDays(-29), today.AddDays(-59), new DateOnly(today.Year, 1, 1));
    }
}

public record KpiHabit(int Id, byte ScheduleDays, DateOnly StartDate);

/// <summary>
/// The personal KPI catalogue and the one figure that needs more than a count (habit consistency). Pure, so tested;
/// nothing here is stored — tiles are worked out on every request.
/// </summary>
public static class KpiFigures
{
    public const int MaxTiles = 6;

    public static readonly IReadOnlyList<KpiDefinition> All =
    [
        new(KpiKeys.TasksDoneWeek, "Tasks done this week", ModuleKeys.Tasks, KpiUnits.Count, "last week"),
        new(KpiKeys.FocusWeek, "Focus time this week", ModuleKeys.Tasks, KpiUnits.Minutes, "last week"),
        new(KpiKeys.HabitConsistency30, "Habit consistency, 30 days", ModuleKeys.Habits, KpiUnits.Percent, "the 30 days before"),
        new(KpiKeys.JournalDays30, "Days journaled, 30 days", ModuleKeys.Journal, KpiUnits.Count, "the 30 days before"),
        new(KpiKeys.ObjectivesDone30, "Milestones done, 30 days", ModuleKeys.Goals, KpiUnits.Count, "the 30 days before"),
        new(KpiKeys.GoalsPassedYear, "Goals completed this year", ModuleKeys.Goals, KpiUnits.Count, null),
        new(KpiKeys.GoalsActive, "Goals in motion", ModuleKeys.Goals, KpiUnits.Count, null),
    ];

    public static bool IsKnown(string key) => All.Any(k => k.Key == key);

    /// <summary>
    /// Share of scheduled habit days in <paramref name="from"/>..<paramref name="to"/> that were met, as a whole
    /// percent (rounded down, so 99.9% never reads 100). Follows the streak rules: only scheduled days on/after a
    /// habit's start count, and today counts only once it's done (it isn't over yet). Null when nothing was due.
    /// </summary>
    public static int? HabitConsistency(
        IReadOnlyCollection<KpiHabit> habits,
        IReadOnlyDictionary<int, HashSet<DateOnly>> metDays,
        DateOnly from,
        DateOnly to,
        DateOnly today)
    {
        int due = 0, met = 0;
        foreach (var habit in habits)
        {
            var done = metDays.GetValueOrDefault(habit.Id) ?? [];
            var first = habit.StartDate > from ? habit.StartDate : from;
            for (var day = first; day <= to && day <= today; day = day.AddDays(1))
            {
                if (!HabitStreaks.IsScheduled(habit.ScheduleDays, day))
                {
                    continue;
                }

                var isDone = done.Contains(day);
                if (day == today && !isDone)
                {
                    continue;
                }

                due++;
                if (isDone)
                {
                    met++;
                }
            }
        }

        return due == 0 ? null : met * 100 / due;
    }
}
