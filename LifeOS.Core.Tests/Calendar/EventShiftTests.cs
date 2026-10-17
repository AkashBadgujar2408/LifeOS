using LifeOS.Core.Calendar.Services;
using LifeOS.Core.Tasks.DTOs;

namespace LifeOS.Core.Tests.Calendar;

/// <summary>Dragging an occurrence with "move every one": EventRecurrence.Shift.</summary>
public class EventShiftTests
{
    private static DateOnly D(int year, int month, int day) => new(year, month, day);

    private static DateTime Utc(int year, int month, int day, int hour, int minute = 0) =>
        new(year, month, day, hour, minute, 0, DateTimeKind.Utc);

    [Fact]
    public void All_day_series_moves_by_the_days_the_occurrence_moved_and_until_follows()
    {
        // Weekly Tuesdays from 6 Oct until 27 Oct; the 20 Oct one dragged to Thursday 22nd and made two days long.
        var series = new EventSeries(true, D(2026, 10, 6), D(2026, 10, 6), null, null,
            RecurrenceFrequencies.Weekly, 1, D(2026, 10, 27), null);

        var shifted = EventRecurrence.Shift(series, D(2026, 10, 20), D(2026, 10, 22), D(2026, 10, 23), null, null);

        Assert.Equal(D(2026, 10, 8), shifted.StartDate);
        Assert.Equal(D(2026, 10, 9), shifted.EndDate);
        Assert.Equal(D(2026, 10, 29), shifted.Until);
        Assert.Equal(RecurrenceFrequencies.Weekly, shifted.Frequency);
    }

    [Fact]
    public void Timed_series_keeps_the_new_wall_clock_time_across_a_clock_change()
    {
        // Weekly Mondays 09:00 London from 5 Oct (BST, 08:00Z). The 2 Nov one (GMT, 09:00Z) dragged to 10:30–11:00.
        var series = new EventSeries(false, null, null, Utc(2026, 10, 5, 8), Utc(2026, 10, 5, 9),
            RecurrenceFrequencies.Weekly, 1, null, "Europe/London");

        var shifted = EventRecurrence.Shift(series, D(2026, 11, 2), null, null, Utc(2026, 11, 2, 10, 30), Utc(2026, 11, 2, 11));

        // The first occurrence is now 10:30 BST = 09:30Z, half an hour long.
        Assert.Equal(Utc(2026, 10, 5, 9, 30), shifted.StartsAt);
        Assert.Equal(Utc(2026, 10, 5, 10), shifted.EndsAt);
        Assert.Null(shifted.Until);
        // And the 2 Nov occurrence really is where it was dropped.
        Assert.Equal(Utc(2026, 11, 2, 10, 30), EventRecurrence.OccurrenceOn(shifted, D(2026, 11, 2))!.StartsAt);
    }

    [Fact]
    public void Timed_series_dragged_to_the_next_day_moves_until_by_a_day()
    {
        // Daily 23:00 New York (03:00Z next day in EDT), until 20 Oct; the 15th dragged to 16 Oct 08:00 local.
        var series = new EventSeries(false, null, null, Utc(2026, 10, 13, 3), Utc(2026, 10, 13, 4),
            RecurrenceFrequencies.Daily, 1, D(2026, 10, 20), "America/New_York");

        var shifted = EventRecurrence.Shift(series, D(2026, 10, 15), null, null, Utc(2026, 10, 16, 12), Utc(2026, 10, 16, 13));

        Assert.Equal(D(2026, 10, 13), EventRecurrence.FirstDate(shifted));
        Assert.Equal(Utc(2026, 10, 13, 12), shifted.StartsAt);
        Assert.Equal(D(2026, 10, 21), shifted.Until);
    }

    [Fact]
    public void A_day_without_an_occurrence_is_refused()
    {
        var series = new EventSeries(true, D(2026, 10, 6), D(2026, 10, 6), null, null,
            RecurrenceFrequencies.Weekly, 1, null, null);

        Assert.Throws<ArgumentException>(() =>
            EventRecurrence.Shift(series, D(2026, 10, 7), D(2026, 10, 8), D(2026, 10, 8), null, null));
    }
}
