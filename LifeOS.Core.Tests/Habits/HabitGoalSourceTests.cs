using LifeOS.Core.Habits.Services;

namespace LifeOS.Core.Tests.Habits;

public class HabitGoalSourceTests
{
    [Fact]
    public void A_measurable_habit_counts_what_was_logged_even_below_its_target()
    {
        Assert.Equal(8000, HabitGoalSource.Amount(8000, 8000));
        Assert.Equal(9000, HabitGoalSource.Amount(8000, 9000));
        // 5,000 steps on an 8,000 day still count: they were walked.
        Assert.Equal(5000, HabitGoalSource.Amount(8000, 5000));
        // Ticked without a figure: the day counts as its target.
        Assert.Equal(8000, HabitGoalSource.Amount(8000, null));
    }

    [Fact]
    public void A_plain_habit_counts_one_day_per_day_done()
    {
        Assert.Equal(1, HabitGoalSource.Amount(null, null));
        Assert.Equal(HabitGoalSource.DaysUnit, HabitGoalSource.UnitOf(null, null));
        Assert.Equal("steps", HabitGoalSource.UnitOf(8000, " steps "));
        Assert.Equal(HabitGoalSource.DaysUnit, HabitGoalSource.UnitOf(8000, " "));
    }
}
