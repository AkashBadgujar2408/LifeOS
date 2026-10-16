namespace LifeOS.Core.Calendar.Services;

/// <summary>
/// When a repeating reminder fires next, and which occurrence of a recurring event is due a "N minutes before"
/// reminder. Pure (the clock is passed in) and xUnit-tested; both lean on <see cref="EventRecurrence"/>, so reminders
/// follow exactly the same wall-clock and DST rules as events.
/// </summary>
public static class ReminderRecurrence
{
    /// <summary>
    /// The next time a repeating reminder fires after it's been dealt with: the first occurrence after both now and
    /// its current time. Dismissing late skips the missed ones instead of firing a backlog; a reminder snoozed past
    /// its slot moves on from the snoozed time. Null when the series has run out (dismiss it for good).
    /// </summary>
    public static DateTime? NextAfter(
        DateTime anchorUtc, string frequency, int interval, DateOnly? until, string timeZone,
        DateTime currentUtc, DateTime nowUtc)
    {
        var series = new EventSeries(false, null, null, anchorUtc, anchorUtc, frequency, interval, until, timeZone);
        var after = currentUtc > nowUtc ? currentUtc : nowUtc;
        return EventRecurrence.FirstStartingAfter(series, after)?.StartsAt;
    }

    /// <summary>
    /// The occurrence of a timed series whose "minutes before" reminder is due now: its reminder moment has come and
    /// it hasn't finished yet (a reminder about something already over helps nobody). When several qualify — the app
    /// was closed for a while — only the latest. Skipped occurrences never remind. Null when none is due.
    /// </summary>
    public static EventOccurrence? DueOccurrence(
        EventSeries series, int minutesBefore, IReadOnlySet<DateOnly> skipped, DateTime nowUtc)
    {
        var lead = TimeSpan.FromMinutes(minutesBefore);
        var from = DateOnly.FromDateTime(nowUtc);
        var to = DateOnly.FromDateTime(nowUtc + lead);
        // Overlap [now, now + lead] in UTC: occurrences still running now, or starting within the lead time.
        return EventRecurrence.Expand(series, skipped, from, to, nowUtc, nowUtc + lead + TimeSpan.FromTicks(1))
            .Where(o => o.StartsAt - lead <= nowUtc)
            .MaxBy(o => o.StartsAt);
    }
}
