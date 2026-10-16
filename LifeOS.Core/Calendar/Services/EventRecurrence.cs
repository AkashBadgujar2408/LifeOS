using LifeOS.Core.Tasks.DTOs;
using LifeOS.Core.Tasks.Services;

namespace LifeOS.Core.Calendar.Services;

/// <summary>
/// A recurring event as stored: its own dates/times are the first occurrence. All-day series use StartDate/EndDate
/// (inclusive); timed series use StartsAt/EndsAt (UTC) plus the IANA TimeZone whose wall clock the series follows.
/// </summary>
public sealed record EventSeries(
    bool IsAllDay,
    DateOnly? StartDate,
    DateOnly? EndDate,
    DateTime? StartsAt,
    DateTime? EndsAt,
    string Frequency,
    int Interval,
    DateOnly? Until,
    string? TimeZone);

/// <summary>
/// One occurrence of a series. OccurrenceDate is the day it starts (in the series' zone for a timed series) — the key
/// a skipped date is stored under. All-day occurrences have StartDate/EndDate, timed ones StartsAt/EndsAt (UTC).
/// </summary>
public sealed record EventOccurrence(
    DateOnly OccurrenceDate,
    DateOnly? StartDate,
    DateOnly? EndDate,
    DateTime? StartsAt,
    DateTime? EndsAt);

/// <summary>
/// Expands recurring events into occurrences. Pure (no DB, no clock) and xUnit-tested; occurrences are never stored.
/// Dates step exactly like recurring tasks (<see cref="TaskRecurrence.Occurrence"/>: counted from the first
/// occurrence, month ends clamp). A timed occurrence keeps the series' local wall-clock time in its own zone, so
/// "Mondays 09:00" stays 09:00 across DST; it keeps the series' length in real time.
/// </summary>
public static class EventRecurrence
{
    // Slack for comparing a series' local days with the viewer's local days: zones are at most 26 hours apart.
    private const int ZoneSlackDays = 2;

    /// <summary>Occurrences that overlap the range (same overlap rules as one-off events in the feed), oldest first.</summary>
    public static List<EventOccurrence> Expand(
        EventSeries series, IReadOnlySet<DateOnly> skipped, DateOnly from, DateOnly to, DateTime fromUtc, DateTime toUtc)
    {
        var result = new List<EventOccurrence>();
        var shape = Shape.Of(series);
        var spanDays = shape.SpanDays + (series.IsAllDay ? 0 : ZoneSlackDays);
        var lastDate = series.IsAllDay ? to : to.AddDays(ZoneSlackDays);
        if (series.Until is { } until && until < lastDate)
        {
            lastDate = until;
        }

        for (var k = FirstStepNear(series.Frequency, series.Interval, shape.FirstDate, from.AddDays(-spanDays)); ; k++)
        {
            var date = TaskRecurrence.Occurrence(series.Frequency, series.Interval, shape.FirstDate, k);
            if (date > lastDate)
            {
                break;
            }

            if (skipped.Contains(date))
            {
                continue;
            }

            var occurrence = shape.On(date);
            var overlaps = series.IsAllDay
                ? occurrence.StartDate <= to && occurrence.EndDate >= from
                : occurrence.StartsAt < toUtc && occurrence.EndsAt >= fromUtc;
            if (overlaps)
            {
                result.Add(occurrence);
            }
        }

        return result;
    }

    /// <summary>The occurrence starting on that day, or null if the series has none there (skips aside).</summary>
    public static EventOccurrence? OccurrenceOn(EventSeries series, DateOnly date)
    {
        var shape = Shape.Of(series);
        if (date < shape.FirstDate || (series.Until is { } until && date > until))
        {
            return null;
        }

        for (var k = FirstStepNear(series.Frequency, series.Interval, shape.FirstDate, date); ; k++)
        {
            var occurrence = TaskRecurrence.Occurrence(series.Frequency, series.Interval, shape.FirstDate, k);
            if (occurrence == date)
            {
                return shape.On(date);
            }

            if (occurrence > date)
            {
                return null;
            }
        }
    }

    /// <summary>The day the first occurrence starts — for a timed series, in its own zone.</summary>
    public static DateOnly FirstDate(EventSeries series) => Shape.Of(series).FirstDate;

    /// <summary>
    /// An occurrence may not outlast the gap to the next one (a 3-day event can't repeat daily). Months count as 28
    /// days and years as 365, the shortest they get. Returns an error message, or null when it fits.
    /// </summary>
    public static string? LengthError(string frequency, int interval, TimeSpan length)
    {
        var stepDays = frequency switch
        {
            RecurrenceFrequencies.Daily => 1,
            RecurrenceFrequencies.Weekly => 7,
            RecurrenceFrequencies.Monthly => 28,
            RecurrenceFrequencies.Yearly => 365,
            _ => throw new ArgumentOutOfRangeException(nameof(frequency), frequency, "Unknown recurrence frequency."),
        } * (long)interval;

        return length > TimeSpan.FromDays(stepDays)
            ? "The event is longer than the gap between repeats, so they'd overlap. Shorten it or repeat less often."
            : null;
    }

    /// <summary>
    /// A local wall-clock time in a zone → UTC. Times that don't exist (the hour skipped when clocks go forward) move
    /// forward by the gap, as calendar apps do (02:30 → 03:30); times that happen twice (clocks go back) take the
    /// first of the two.
    /// </summary>
    public static DateTime LocalToUtc(DateTime local, TimeZoneInfo zone)
    {
        local = DateTime.SpecifyKind(local, DateTimeKind.Unspecified);
        TimeSpan offset;
        if (zone.IsInvalidTime(local))
        {
            offset = zone.GetUtcOffset(local.AddDays(-1));
        }
        else if (zone.IsAmbiguousTime(local))
        {
            offset = zone.GetAmbiguousTimeOffsets(local).Max();
        }
        else
        {
            offset = zone.GetUtcOffset(local);
        }

        return DateTime.SpecifyKind(local - offset, DateTimeKind.Utc);
    }

    /// <summary>
    /// A step k whose occurrence is on or before <paramref name="date"/> (or 0), close enough that walking forward
    /// from it is short even for a series that began years ago.
    /// </summary>
    private static int FirstStepNear(string frequency, int interval, DateOnly first, DateOnly date)
    {
        if (date <= first)
        {
            return 0;
        }

        var steps = frequency switch
        {
            RecurrenceFrequencies.Daily => (date.DayNumber - first.DayNumber) / interval,
            RecurrenceFrequencies.Weekly => (date.DayNumber - first.DayNumber) / (7 * interval),
            // One period short: month/year lengths vary and a clamped month end lands earlier, never later.
            RecurrenceFrequencies.Monthly => ((date.Year - first.Year) * 12 + date.Month - first.Month - 1) / interval,
            RecurrenceFrequencies.Yearly => (date.Year - first.Year - 1) / interval,
            _ => throw new ArgumentOutOfRangeException(nameof(frequency), frequency, "Unknown recurrence frequency."),
        };
        return Math.Max(0, steps);
    }

    /// <summary>The series' first occurrence taken apart, so each later one can be built on another day.</summary>
    private sealed class Shape
    {
        private readonly EventSeries series;
        private readonly TimeZoneInfo? zone;
        private readonly TimeOnly wallTime;
        private readonly TimeSpan length;

        public DateOnly FirstDate { get; }

        /// <summary>Whole days an occurrence can reach past its start day.</summary>
        public int SpanDays { get; }

        private Shape(EventSeries series)
        {
            this.series = series;
            if (series.IsAllDay)
            {
                FirstDate = series.StartDate!.Value;
                SpanDays = series.EndDate!.Value.DayNumber - FirstDate.DayNumber;
                return;
            }

            zone = TimeZoneInfo.FindSystemTimeZoneById(series.TimeZone!);
            var localStart = TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(series.StartsAt!.Value, DateTimeKind.Utc), zone);
            FirstDate = DateOnly.FromDateTime(localStart);
            wallTime = TimeOnly.FromDateTime(localStart);
            length = series.EndsAt!.Value - series.StartsAt!.Value;
            SpanDays = (int)Math.Ceiling(length.TotalDays);
        }

        public static Shape Of(EventSeries series) => new(series);

        public EventOccurrence On(DateOnly date)
        {
            if (series.IsAllDay)
            {
                return new EventOccurrence(date, date, date.AddDays(SpanDays), null, null);
            }

            var startsAt = LocalToUtc(date.ToDateTime(wallTime), zone!);
            return new EventOccurrence(date, null, null, startsAt, startsAt + length);
        }
    }
}
