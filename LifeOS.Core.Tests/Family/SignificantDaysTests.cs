using LifeOS.Core.Family.DTOs;
using LifeOS.Core.Family.Services;

namespace LifeOS.Core.Tests.Family;

public class SignificantDaysTests
{
    private static readonly DateOnly Today = new(2026, 10, 21);

    [Theory]
    [InlineData(10, 21, "2026-10-21")] // today counts
    [InlineData(10, 20, "2027-10-20")] // yesterday comes round next year
    [InlineData(12, 31, "2026-12-31")]
    [InlineData(2, 29, "2027-02-28")]  // no 29 Feb in 2027
    public void The_next_time_it_comes_round(int month, int day, string expected)
    {
        Assert.Equal(DateOnly.Parse(expected), SignificantDays.Next(month, day, Today));
    }

    [Fact]
    public void A_leap_day_lands_on_the_29th_in_leap_years()
    {
        Assert.Equal(new DateOnly(2028, 2, 29), SignificantDays.Next(2, 29, new DateOnly(2028, 1, 1)));
        Assert.Equal(new DateOnly(2027, 2, 28), SignificantDays.On(2, 29, 2027));
    }

    [Fact]
    public void Years_need_a_start_year_and_start_after_it()
    {
        Assert.Equal(60, SignificantDays.YearsOn(1966, 2026));
        Assert.Null(SignificantDays.YearsOn(null, 2026));
        Assert.Null(SignificantDays.YearsOn(2026, 2026)); // the day itself, not an anniversary of it
    }

    [Fact]
    public void Occurrences_in_a_range_skip_years_before_it_began()
    {
        var days = SignificantDays.Between(1, 5, 2026, new DateOnly(2025, 12, 1), new DateOnly(2027, 1, 31)).ToList();

        Assert.Equal([new DateOnly(2026, 1, 5), new DateOnly(2027, 1, 5)], days);
        Assert.Equal([new DateOnly(2026, 12, 31)],
            SignificantDays.Between(12, 31, null, new DateOnly(2026, 12, 1), new DateOnly(2027, 1, 31)));
    }

    [Theory]
    [InlineData(2, 30, null, "That month has 29 days.")]
    [InlineData(4, 31, null, "That month has 30 days.")]
    [InlineData(13, 1, null, "Choose the month.")]
    [InlineData(2, 29, 2023, "2023 wasn't a leap year — there was no 29 Feb.")]
    [InlineData(12, 1, 2026, "That day hasn't come yet — leave the year out if you're not sure.")]
    [InlineData(1, 1, 1700, "Give a year between 1850 and this year, or leave it out.")]
    [InlineData(2, 29, 2000, null)]
    [InlineData(2, 29, null, null)]
    public void Impossible_days_are_refused_in_words(int month, int day, int? year, string? expected)
    {
        Assert.Equal(expected, SignificantDays.Check(month, day, year, Today));
    }

    [Theory]
    [InlineData(SignificantDateKinds.Birthday, null, "Asha", null, 60, "Asha turns 60")]
    [InlineData(SignificantDateKinds.Birthday, null, "Asha", null, null, "Asha's birthday")]
    [InlineData(SignificantDateKinds.Anniversary, null, "Meera", null, 1, "Anniversary with Meera — 1 year")]
    [InlineData(SignificantDateKinds.Anniversary, null, "Asha", "Ravi", 41, "Asha & Ravi's anniversary — 41 years")]
    [InlineData(SignificantDateKinds.Other, "Name day", "Asha", null, null, "Asha — Name day")]
    public void Titles_read_plainly(string kind, string? label, string name, string? other, int? years, string expected)
    {
        Assert.Equal(expected, SignificantDays.Title(kind, label, name, other, years));
    }
}
