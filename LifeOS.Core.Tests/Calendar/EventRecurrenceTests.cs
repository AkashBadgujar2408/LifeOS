using LifeOS.Core.Calendar.Services;
using LifeOS.Core.Tasks.DTOs;

namespace LifeOS.Core.Tests.Calendar;

public class EventRecurrenceTests
{
    private static readonly IReadOnlySet<DateOnly> NoneSkipped = new HashSet<DateOnly>();

    private static DateOnly D(int year, int month, int day) => new(year, month, day);

    private static DateTime Utc(int year, int month, int day, int hour, int minute = 0) =>
        new(year, month, day, hour, minute, 0, DateTimeKind.Utc);

    private static EventSeries AllDay(DateOnly start, DateOnly end, string frequency, int interval = 1, DateOnly? until = null) =>
        new(true, start, end, null, null, frequency, interval, until, null);

    private static EventSeries Timed(DateTime startsAt, DateTime endsAt, string zone, string frequency, int interval = 1, DateOnly? until = null) =>
        new(false, null, null, startsAt, endsAt, frequency, interval, until, zone);

    // A local day range with its UTC span computed the way the client does (UTC here, so the two agree).
    private static List<EventOccurrence> ExpandUtcDays(EventSeries series, DateOnly from, DateOnly to, IReadOnlySet<DateOnly>? skipped = null) =>
        EventRecurrence.Expand(series, skipped ?? NoneSkipped, from, to,
            from.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc), to.AddDays(1).ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc));

    [Fact]
    public void Weekly_all_day_series_lands_on_the_same_weekday_inside_the_range()
    {
        // Tuesdays from 6 Oct; October's view.
        var series = AllDay(D(2026, 10, 6), D(2026, 10, 6), RecurrenceFrequencies.Weekly);

        var dates = ExpandUtcDays(series, D(2026, 10, 1), D(2026, 10, 31)).Select(o => o.StartDate).ToList();

        Assert.Equal([D(2026, 10, 6), D(2026, 10, 13), D(2026, 10, 20), D(2026, 10, 27)], dates);
    }

    [Fact]
    public void Nothing_before_the_series_begins_and_nothing_after_it_ends()
    {
        var series = AllDay(D(2026, 10, 14), D(2026, 10, 14), RecurrenceFrequencies.Daily, until: D(2026, 10, 17));

        var dates = ExpandUtcDays(series, D(2026, 10, 1), D(2026, 10, 31)).Select(o => o.OccurrenceDate).ToList();

        Assert.Equal([D(2026, 10, 14), D(2026, 10, 15), D(2026, 10, 16), D(2026, 10, 17)], dates);
    }

    [Fact]
    public void Skipped_dates_are_left_out()
    {
        var series = AllDay(D(2026, 10, 5), D(2026, 10, 5), RecurrenceFrequencies.Weekly);

        var dates = ExpandUtcDays(series, D(2026, 10, 1), D(2026, 10, 31), new HashSet<DateOnly> { D(2026, 10, 12) })
            .Select(o => o.OccurrenceDate).ToList();

        Assert.Equal([D(2026, 10, 5), D(2026, 10, 19), D(2026, 10, 26)], dates);
    }

    [Fact]
    public void A_multi_day_occurrence_that_began_before_the_range_still_shows()
    {
        // Monthly 3-day trip starting the 30th: the 30 Sep – 2 Oct one overlaps an October view.
        var series = AllDay(D(2026, 8, 30), D(2026, 9, 1), RecurrenceFrequencies.Monthly);

        var occurrences = ExpandUtcDays(series, D(2026, 10, 1), D(2026, 10, 31));

        Assert.Equal(D(2026, 9, 30), occurrences[0].StartDate);
        Assert.Equal(D(2026, 10, 2), occurrences[0].EndDate);
        Assert.Equal(D(2026, 10, 30), occurrences[1].StartDate);
        Assert.Equal(2, occurrences.Count);
    }

    [Fact]
    public void Monthly_from_the_31st_clamps_to_short_months_without_drifting()
    {
        var series = AllDay(D(2027, 1, 31), D(2027, 1, 31), RecurrenceFrequencies.Monthly);

        var dates = ExpandUtcDays(series, D(2027, 1, 1), D(2027, 4, 30)).Select(o => o.StartDate).ToList();

        Assert.Equal([D(2027, 1, 31), D(2027, 2, 28), D(2027, 3, 31), D(2027, 4, 30)], dates);
    }

    [Fact]
    public void A_series_years_old_still_expands_only_the_range()
    {
        // Yearly birthday since 1990, every other day since 2000.
        var birthday = AllDay(D(1990, 3, 12), D(1990, 3, 12), RecurrenceFrequencies.Yearly);
        var everyOtherDay = AllDay(D(2000, 1, 1), D(2000, 1, 1), RecurrenceFrequencies.Daily, interval: 2);

        Assert.Equal([D(2027, 3, 12)], ExpandUtcDays(birthday, D(2027, 3, 1), D(2027, 3, 31)).Select(o => o.StartDate));
        // 2000-01-01 + 2k: 2026-10-16 is day 9785 from the start, odd, so the 15th and 17th.
        Assert.Equal([D(2026, 10, 15), D(2026, 10, 17)], ExpandUtcDays(everyOtherDay, D(2026, 10, 15), D(2026, 10, 18)).Select(o => o.StartDate));
    }

    [Fact]
    public void Timed_series_keeps_its_local_time_across_a_dst_change()
    {
        // Mondays 09:00–10:00 in New York, from 26 Oct 2026 (EDT, UTC−4). Clocks go back on 1 Nov, so from 2 Nov
        // 09:00 local is 14:00Z, not 13:00Z.
        var series = Timed(Utc(2026, 10, 26, 13), Utc(2026, 10, 26, 14), "America/New_York", RecurrenceFrequencies.Weekly);

        var occurrences = EventRecurrence.Expand(series, NoneSkipped, D(2026, 10, 25), D(2026, 11, 8),
            Utc(2026, 10, 25, 4), Utc(2026, 11, 9, 5));

        Assert.Equal([Utc(2026, 10, 26, 13), Utc(2026, 11, 2, 14)], occurrences.Select(o => o.StartsAt));
        Assert.All(occurrences, o => Assert.Equal(TimeSpan.FromHours(1), o.EndsAt - o.StartsAt));
        Assert.Equal([D(2026, 10, 26), D(2026, 11, 2)], occurrences.Select(o => o.OccurrenceDate));
    }

    [Fact]
    public void Timed_occurrence_date_is_the_series_local_day_not_the_utc_day()
    {
        // Daily 07:00 in Kiritimati (UTC+14) is 17:00Z the previous UTC day.
        var series = Timed(Utc(2026, 10, 14, 17), Utc(2026, 10, 14, 18), "Pacific/Kiritimati", RecurrenceFrequencies.Daily);

        var occurrence = EventRecurrence.OccurrenceOn(series, D(2026, 10, 20));

        Assert.NotNull(occurrence);
        Assert.Equal(Utc(2026, 10, 19, 17), occurrence.StartsAt);
        Assert.Equal(D(2026, 10, 15), EventRecurrence.FirstDate(series));
    }

    [Fact]
    public void Timed_range_uses_utc_overlap_like_one_off_events()
    {
        // Daily 23:30–00:30 London (BST in October): 22:30Z–23:30Z. A UTC day view of the 20th catches only the 20th's.
        var series = Timed(Utc(2026, 10, 14, 22, 30), Utc(2026, 10, 14, 23, 30), "Europe/London", RecurrenceFrequencies.Daily);

        var occurrences = ExpandUtcDays(series, D(2026, 10, 20), D(2026, 10, 20));

        Assert.Equal([Utc(2026, 10, 20, 22, 30)], occurrences.Select(o => o.StartsAt));
    }

    [Fact]
    public void Local_time_skipped_by_clocks_going_forward_moves_forward_by_the_gap()
    {
        var newYork = TimeZoneInfo.FindSystemTimeZoneById("America/New_York");

        // 8 Mar 2026: 02:00 jumps to 03:00. 02:30 doesn't exist → 03:30 EDT = 07:30Z.
        Assert.Equal(Utc(2026, 3, 8, 7, 30), EventRecurrence.LocalToUtc(new DateTime(2026, 3, 8, 2, 30, 0), newYork));
        // 1 Nov 2026: 01:30 happens twice → the first (EDT) = 05:30Z.
        Assert.Equal(Utc(2026, 11, 1, 5, 30), EventRecurrence.LocalToUtc(new DateTime(2026, 11, 1, 1, 30, 0), newYork));
    }

    [Fact]
    public void Occurrence_on_knows_real_dates_from_the_rest()
    {
        var series = AllDay(D(2026, 10, 6), D(2026, 10, 7), RecurrenceFrequencies.Weekly, interval: 2, until: D(2026, 11, 30));

        Assert.Equal(D(2026, 10, 21), EventRecurrence.OccurrenceOn(series, D(2026, 10, 20))!.EndDate);
        Assert.Null(EventRecurrence.OccurrenceOn(series, D(2026, 10, 13)));  // the off week
        Assert.Null(EventRecurrence.OccurrenceOn(series, D(2026, 9, 22)));   // before it began
        Assert.Null(EventRecurrence.OccurrenceOn(series, D(2026, 12, 1)));   // after it ended
        Assert.NotNull(EventRecurrence.OccurrenceOn(series, D(2026, 10, 6))); // the first one
    }

    [Theory]
    [InlineData(RecurrenceFrequencies.Daily, 1, 24, true)]
    [InlineData(RecurrenceFrequencies.Daily, 1, 25, false)]
    [InlineData(RecurrenceFrequencies.Weekly, 1, 7 * 24, true)]
    [InlineData(RecurrenceFrequencies.Weekly, 1, 8 * 24, false)]
    [InlineData(RecurrenceFrequencies.Monthly, 1, 28 * 24, true)]
    [InlineData(RecurrenceFrequencies.Monthly, 1, 29 * 24, false)]
    [InlineData(RecurrenceFrequencies.Daily, 3, 72, true)]
    public void An_occurrence_cannot_outlast_the_gap_to_the_next(string frequency, int interval, int hours, bool fits)
    {
        Assert.Equal(fits, EventRecurrence.LengthError(frequency, interval, TimeSpan.FromHours(hours)) is null);
    }
}
