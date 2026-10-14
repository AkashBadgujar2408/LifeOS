using LifeOS.Core.Tasks.DTOs;
using LifeOS.Core.Tasks.Services;

namespace LifeOS.Core.Tests.Tasks;

public class TaskRecurrenceTests
{
    private static DateOnly D(int year, int month, int day) => new(year, month, day);

    [Theory]
    [InlineData(RecurrenceFrequencies.Daily, 1, 2026, 10, 15)]
    [InlineData(RecurrenceFrequencies.Daily, 3, 2026, 10, 17)]
    [InlineData(RecurrenceFrequencies.Weekly, 1, 2026, 10, 21)]
    [InlineData(RecurrenceFrequencies.Weekly, 2, 2026, 10, 28)]
    [InlineData(RecurrenceFrequencies.Monthly, 1, 2026, 11, 14)]
    [InlineData(RecurrenceFrequencies.Yearly, 1, 2027, 10, 14)]
    public void Completed_on_time_gives_the_next_occurrence(string frequency, int interval, int year, int month, int day)
    {
        var due = D(2026, 10, 14);

        var next = TaskRecurrence.NextDueDate(frequency, interval, anchor: due, completedDueDate: due, today: due);

        Assert.Equal(D(year, month, day), next);
    }

    [Fact]
    public void Completed_early_still_moves_past_the_completed_due_date()
    {
        // Weekly, due Monday 19 Oct, ticked off on Saturday 17 Oct: next is Monday 26 Oct, not 19 Oct again.
        var next = TaskRecurrence.NextDueDate(RecurrenceFrequencies.Weekly, 1, D(2026, 10, 19), D(2026, 10, 19), today: D(2026, 10, 17));

        Assert.Equal(D(2026, 10, 26), next);
    }

    [Fact]
    public void Completed_late_skips_missed_occurrences_instead_of_spawning_overdue_ones()
    {
        // Weekly from Monday 5 Oct, that instance done on Wednesday 21 Oct: the 12th and 19th are gone, next is the 26th.
        var next = TaskRecurrence.NextDueDate(RecurrenceFrequencies.Weekly, 1, D(2026, 10, 5), D(2026, 10, 5), today: D(2026, 10, 21));

        Assert.Equal(D(2026, 10, 26), next);
    }

    [Fact]
    public void Completed_late_lands_on_today_when_today_is_an_occurrence()
    {
        // Daily task due yesterday, done today: today's instance should still show up.
        var next = TaskRecurrence.NextDueDate(RecurrenceFrequencies.Daily, 1, D(2026, 10, 1), D(2026, 10, 13), today: D(2026, 10, 14));

        Assert.Equal(D(2026, 10, 14), next);
    }

    [Fact]
    public void Monthly_from_the_31st_clamps_short_months_without_drifting()
    {
        var anchor = D(2026, 1, 31);

        var feb = TaskRecurrence.NextDueDate(RecurrenceFrequencies.Monthly, 1, anchor, anchor, today: anchor);
        var mar = TaskRecurrence.NextDueDate(RecurrenceFrequencies.Monthly, 1, anchor, feb, today: feb);
        var apr = TaskRecurrence.NextDueDate(RecurrenceFrequencies.Monthly, 1, anchor, mar, today: mar);

        Assert.Equal(D(2026, 2, 28), feb);
        Assert.Equal(D(2026, 3, 31), mar); // computed from the anchor, so it's back to the 31st, not stuck on the 28th
        Assert.Equal(D(2026, 4, 30), apr);
    }

    [Fact]
    public void Yearly_from_29_February_clamps_in_non_leap_years()
    {
        var anchor = D(2028, 2, 29);

        var next = TaskRecurrence.NextDueDate(RecurrenceFrequencies.Yearly, 1, anchor, anchor, today: anchor);
        var leap = TaskRecurrence.NextDueDate(RecurrenceFrequencies.Yearly, 4, anchor, anchor, today: anchor);

        Assert.Equal(D(2029, 2, 28), next);
        Assert.Equal(D(2032, 2, 29), leap);
    }

    [Fact]
    public void Moving_the_due_date_within_a_series_keeps_counting_from_the_anchor()
    {
        // Every 2 weeks from Mon 5 Oct; this instance was due Mon 19 Oct and done that day: next is Mon 2 Nov.
        var next = TaskRecurrence.NextDueDate(RecurrenceFrequencies.Weekly, 2, D(2026, 10, 5), D(2026, 10, 19), today: D(2026, 10, 19));

        Assert.Equal(D(2026, 11, 2), next);
    }

    [Fact]
    public void Rejects_an_interval_below_one()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            TaskRecurrence.NextDueDate(RecurrenceFrequencies.Daily, 0, D(2026, 1, 1), D(2026, 1, 1), D(2026, 1, 1)));
    }

    [Fact]
    public void Rejects_an_unknown_frequency()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            TaskRecurrence.NextDueDate("Fortnightly", 1, D(2026, 1, 1), D(2026, 1, 1), D(2026, 1, 1)));
    }
}
