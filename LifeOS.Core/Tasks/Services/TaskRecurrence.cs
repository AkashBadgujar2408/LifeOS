using LifeOS.Core.Tasks.DTOs;

namespace LifeOS.Core.Tasks.Services;

/// <summary>
/// The one place a repeating task's next due date is worked out. Pure date math (no DB, no clock) so it can be
/// unit-tested; "today" is passed in because it's the user's local date, which only the client knows.
/// </summary>
public static class TaskRecurrence
{
    // A daily series years overdue is still only ~a few thousand steps; this just guards against a bad anchor.
    private const int MaxSteps = 100_000;

    /// <summary>
    /// The k-th occurrence of a series (k = 0 is the anchor itself). Computed from the anchor every time, never
    /// from the previous occurrence, so month-end anchors don't drift: 31 Jan -> 28 Feb -> 31 Mar.
    /// </summary>
    public static DateOnly Occurrence(string frequency, int interval, DateOnly anchor, int k) => frequency switch
    {
        RecurrenceFrequencies.Daily => anchor.AddDays(k * interval),
        RecurrenceFrequencies.Weekly => anchor.AddDays(7 * k * interval),
        RecurrenceFrequencies.Monthly => anchor.AddMonths(k * interval),
        RecurrenceFrequencies.Yearly => anchor.AddYears(k * interval),
        _ => throw new ArgumentOutOfRangeException(nameof(frequency), frequency, "Unknown recurrence frequency."),
    };

    /// <summary>
    /// Due date for the instance that replaces a completed one: the first occurrence after the completed task's
    /// due date that isn't already in the past. Completing early (weekly task due Monday, done Saturday) gives
    /// the following Monday; completing late skips the missed ones rather than spawning a pile of overdue copies,
    /// but if today is itself an occurrence (yesterday's daily task done today), today's instance still appears.
    /// </summary>
    public static DateOnly NextDueDate(string frequency, int interval, DateOnly anchor, DateOnly completedDueDate, DateOnly today)
    {
        if (interval < 1)
        {
            throw new ArgumentOutOfRangeException(nameof(interval), interval, "Interval must be at least 1.");
        }

        for (var k = 1; k <= MaxSteps; k++)
        {
            var occurrence = Occurrence(frequency, interval, anchor, k);
            if (occurrence > completedDueDate && occurrence >= today)
            {
                return occurrence;
            }
        }

        throw new InvalidOperationException("No next occurrence found within range; check the series anchor.");
    }
}
