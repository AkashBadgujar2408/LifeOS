using LifeOS.Core.Habits.Services;

namespace LifeOS.Core.Tests.Habits;

public class HabitChallengesTests
{
    private static readonly DateOnly Start = new(2026, 10, 1); // a Thursday
    private const byte EveryDay = HabitStreaks.EveryDay;
    private const byte MonWedFri = 1 | 4 | 16;

    private static HashSet<DateOnly> Days(params int[] offsets) => offsets.Select(o => Start.AddDays(o)).ToHashSet();

    [Fact]
    public void A_seven_day_challenge_finishes_on_its_seventh_day()
    {
        var progress = HabitChallenges.Evaluate(7, Start, false, EveryDay, Start, Days(0, 1, 2, 3, 4, 5, 6), Start.AddDays(6));

        Assert.Equal(ChallengeStates.Completed, progress.State);
        Assert.Equal(7, progress.DaysDone);
        Assert.Equal(Start.AddDays(6), progress.CompletedOn);
    }

    [Fact]
    public void Today_not_done_yet_keeps_it_going_but_a_missed_day_breaks_it()
    {
        var going = HabitChallenges.Evaluate(7, Start, false, EveryDay, Start, Days(0, 1, 2), Start.AddDays(3));
        var broken = HabitChallenges.Evaluate(7, Start, false, EveryDay, Start, Days(0, 2, 3), Start.AddDays(3));

        Assert.Equal((ChallengeStates.Active, 3, 7), (going.State, going.DaysDone, going.DaysTotal));
        Assert.Equal(ChallengeStates.Broken, broken.State);
    }

    [Fact]
    public void Only_scheduled_days_count_and_it_finishes_on_the_last_scheduled_one()
    {
        // 1–7 Oct on Mon/Wed/Fri: Fri 2, Mon 5, Wed 7.
        var progress = HabitChallenges.Evaluate(7, Start, false, MonWedFri, Start, Days(1, 4, 6), Start.AddDays(6));

        Assert.Equal(ChallengeStates.Completed, progress.State);
        Assert.Equal(3, progress.DaysTotal);
        Assert.Equal(Start.AddDays(6), progress.CompletedOn);
    }

    [Fact]
    public void An_avoid_challenge_is_clean_days_and_finishes_when_its_last_day_comes_clean()
    {
        var going = HabitChallenges.Evaluate(7, Start, true, EveryDay, Start, Days(), Start.AddDays(2));
        var done = HabitChallenges.Evaluate(7, Start, true, EveryDay, Start, Days(9), Start.AddDays(9));
        var slipped = HabitChallenges.Evaluate(7, Start, true, EveryDay, Start, Days(4), Start.AddDays(5));

        Assert.Equal((ChallengeStates.Active, 3), (going.State, going.DaysDone));
        Assert.Equal((ChallengeStates.Completed, Start.AddDays(6)), (done.State, done.CompletedOn!.Value));
        Assert.Equal((ChallengeStates.Broken, 4), (slipped.State, slipped.DaysDone));
    }

    [Fact]
    public void Un_ticking_a_day_un_finishes_it()
    {
        var progress = HabitChallenges.Evaluate(7, Start, false, EveryDay, Start, Days(0, 1, 2, 3, 4, 5), Start.AddDays(6));

        Assert.Equal(ChallengeStates.Active, progress.State);
        Assert.Null(progress.CompletedOn);
    }
}
