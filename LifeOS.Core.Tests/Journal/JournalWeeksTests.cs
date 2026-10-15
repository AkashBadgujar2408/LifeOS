using LifeOS.Core.Journal.Services;

namespace LifeOS.Core.Tests.Journal;

public class JournalWeeksTests
{
    private static DateOnly D(int year, int month, int day) => new(year, month, day);

    [Theory]
    [InlineData(2026, 10, 12)] // Monday itself
    [InlineData(2026, 10, 15)] // Thursday
    [InlineData(2026, 10, 18)] // Sunday belongs to the week before it, not after
    public void WeekStart_IsThatWeeksMonday(int year, int month, int day)
    {
        Assert.Equal(D(2026, 10, 12), JournalWeeks.WeekStart(D(year, month, day)));
    }

    [Fact]
    public void WeekStart_CrossesMonthAndYearEnds()
    {
        Assert.Equal(D(2026, 9, 28), JournalWeeks.WeekStart(D(2026, 10, 1)));
        Assert.Equal(D(2026, 12, 28), JournalWeeks.WeekStart(D(2027, 1, 3)));
    }

    [Fact]
    public void IsWeekStart_OnlyMondays()
    {
        Assert.True(JournalWeeks.IsWeekStart(D(2026, 10, 12)));
        Assert.False(JournalWeeks.IsWeekStart(D(2026, 10, 13)));
        Assert.False(JournalWeeks.IsWeekStart(D(2026, 10, 18)));
    }

    [Fact]
    public void Range_IsMondayToSunday()
    {
        Assert.Equal((D(2026, 10, 12), D(2026, 10, 18)), JournalWeeks.Range(D(2026, 10, 12)));
    }

    [Fact]
    public void Range_RejectsANonMonday()
    {
        Assert.Throws<ArgumentException>(() => JournalWeeks.Range(D(2026, 10, 14)));
    }
}
