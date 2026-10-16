using LifeOS.Core.Calendar.Services;
using LifeOS.Core.Tasks.DTOs;

namespace LifeOS.Core.Tests.Calendar;

public class ReminderRecurrenceTests
{
    private static readonly IReadOnlySet<DateOnly> NoneSkipped = new HashSet<DateOnly>();

    private static DateOnly D(int year, int month, int day) => new(year, month, day);

    private static DateTime Utc(int year, int month, int day, int hour, int minute = 0) =>
        new(year, month, day, hour, minute, 0, DateTimeKind.Utc);

    [Fact]
    public void Weekly_reminder_dismissed_on_time_moves_a_week_on_the_same_local_time_across_dst()
    {
        // Mondays 09:00 New York from 26 Oct 2026 (13:00Z, EDT). Clocks go back 1 Nov: next is 14:00Z.
        var next = ReminderRecurrence.NextAfter(Utc(2026, 10, 26, 13), RecurrenceFrequencies.Weekly, 1, null,
            "America/New_York", currentUtc: Utc(2026, 10, 26, 13), nowUtc: Utc(2026, 10, 26, 13, 5));

        Assert.Equal(Utc(2026, 11, 2, 14), next);
    }

    [Fact]
    public void Dismissed_late_skips_the_missed_ones()
    {
        // Daily 08:00 UTC, the 14th's dismissed on the 17th at 10:00 → the 18th, not the 15th.
        var next = ReminderRecurrence.NextAfter(Utc(2026, 10, 14, 8), RecurrenceFrequencies.Daily, 1, null,
            "Etc/UTC", currentUtc: Utc(2026, 10, 14, 8), nowUtc: Utc(2026, 10, 17, 10));

        Assert.Equal(Utc(2026, 10, 18, 8), next);
    }

    [Fact]
    public void Dismissed_early_still_moves_past_the_current_one()
    {
        // Monthly on the 31st, the 31 Jan one dealt with before it fired → 28 Feb.
        var next = ReminderRecurrence.NextAfter(Utc(2027, 1, 31, 9), RecurrenceFrequencies.Monthly, 1, null,
            "Etc/UTC", currentUtc: Utc(2027, 1, 31, 9), nowUtc: Utc(2027, 1, 30, 12));

        Assert.Equal(Utc(2027, 2, 28, 9), next);
    }

    [Fact]
    public void Snoozed_past_its_slot_moves_on_from_the_snoozed_time()
    {
        // Daily 09:00, snoozed to the next morning 09:00, dismissed then → the day after.
        var next = ReminderRecurrence.NextAfter(Utc(2026, 10, 14, 9), RecurrenceFrequencies.Daily, 1, null,
            "Etc/UTC", currentUtc: Utc(2026, 10, 15, 9), nowUtc: Utc(2026, 10, 15, 9, 1));

        Assert.Equal(Utc(2026, 10, 16, 9), next);
    }

    [Fact]
    public void A_series_past_its_end_has_no_next()
    {
        var next = ReminderRecurrence.NextAfter(Utc(2026, 10, 14, 9), RecurrenceFrequencies.Weekly, 1, D(2026, 10, 27),
            "Etc/UTC", currentUtc: Utc(2026, 10, 21, 9), nowUtc: Utc(2026, 10, 21, 9));

        Assert.Null(next);
    }

    private static EventSeries Standup() =>
        // Daily 09:00–09:15 UTC from 12 Oct.
        new(false, null, null, Utc(2026, 10, 12, 9), Utc(2026, 10, 12, 9, 15), RecurrenceFrequencies.Daily, 1, null, "Etc/UTC");

    [Theory]
    [InlineData(8, 40, false)] // before the 15-minute window
    [InlineData(8, 45, true)]  // window opens
    [InlineData(9, 10, true)]  // under way
    [InlineData(9, 16, false)] // over
    public void Occurrence_reminder_is_due_from_the_lead_time_until_the_occurrence_ends(int hour, int minute, bool due)
    {
        var occurrence = ReminderRecurrence.DueOccurrence(Standup(), 15, NoneSkipped, Utc(2026, 10, 16, hour, minute));

        Assert.Equal(due, occurrence is not null);
        if (due)
        {
            Assert.Equal(D(2026, 10, 16), occurrence!.OccurrenceDate);
        }
    }

    [Fact]
    public void A_skipped_occurrence_never_reminds()
    {
        var occurrence = ReminderRecurrence.DueOccurrence(Standup(), 15, new HashSet<DateOnly> { D(2026, 10, 16) },
            Utc(2026, 10, 16, 8, 50));

        Assert.Null(occurrence);
    }

    [Fact]
    public void A_long_lead_time_reaches_the_next_days_occurrence()
    {
        // A day ahead: on the 15th at 10:00, the 16th's standup (09:00) is within 24 hours.
        var occurrence = ReminderRecurrence.DueOccurrence(Standup(), 24 * 60, NoneSkipped, Utc(2026, 10, 15, 10));

        Assert.Equal(D(2026, 10, 16), occurrence!.OccurrenceDate);
    }
}
