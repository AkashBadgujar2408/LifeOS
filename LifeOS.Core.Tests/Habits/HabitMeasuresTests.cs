using LifeOS.Core.Habits.Services;

namespace LifeOS.Core.Tests.Habits;

/// <summary>Session 43: measurable habits (a day counts once it meets the target) and avoid habits (clean runs).</summary>
public class HabitMeasuresTests
{
    private static readonly DateOnly Start = new(2026, 10, 1);

    [Theory]
    [InlineData(null, null, true)]   // plain habit: logged = done
    [InlineData(5.0, null, true)]    // plain habit ignores any value
    [InlineData(20.0, 20.0, true)]   // exactly the target
    [InlineData(25.0, 20.0, true)]
    [InlineData(19.5, 20.0, false)]  // short of it
    [InlineData(0.0, 20.0, false)]
    [InlineData(null, 20.0, true)]   // ticked before a target was set still counts
    public void A_day_counts_when_its_value_meets_the_target(double? value, double? target, bool met)
    {
        Assert.Equal(met, HabitStreaks.IsMet((decimal?)value, (decimal?)target));
    }

    [Fact]
    public void A_measurable_streak_counts_only_days_that_met_the_target()
    {
        // Pages read on 1–5 Oct with a target of 20: the 3rd fell short, so the streak restarts after it.
        var values = new Dictionary<DateOnly, decimal>
        {
            [Start] = 20, [Start.AddDays(1)] = 30, [Start.AddDays(2)] = 12, [Start.AddDays(3)] = 20, [Start.AddDays(4)] = 22,
        };
        var met = values.Where(v => HabitStreaks.IsMet(v.Value, 20)).Select(v => v.Key);

        var streak = HabitStreaks.Calculate(HabitStreaks.EveryDay, Start, met, Start.AddDays(4));

        Assert.Equal(2, streak.Current);
        Assert.Equal(2, streak.Longest);
        Assert.Equal(Start.AddDays(2), streak.LastMissed);
    }

    [Fact]
    public void A_clean_run_counts_every_day_since_the_last_slip_including_today()
    {
        var run = HabitStreaks.CleanRuns(Start, [Start.AddDays(3)], Start.AddDays(9));

        // 1–3 Oct clean (3), slip on the 4th, 5–10 Oct clean (6).
        Assert.Equal(6, run.Current);
        Assert.Equal(6, run.Longest);
        Assert.False(run.SlippedToday);
        Assert.Equal(Start.AddDays(3), run.LastSlip);
    }

    [Fact]
    public void A_slip_today_resets_the_current_run_but_keeps_the_longest()
    {
        var run = HabitStreaks.CleanRuns(Start, [Start.AddDays(9)], Start.AddDays(9));

        Assert.Equal(0, run.Current);
        Assert.Equal(9, run.Longest);
        Assert.True(run.SlippedToday);
    }

    [Fact]
    public void Slips_before_the_start_or_after_today_are_ignored_and_nothing_counts_before_the_start()
    {
        var run = HabitStreaks.CleanRuns(Start, [Start.AddDays(-2), Start.AddDays(5)], Start.AddDays(2));

        Assert.Equal(3, run.Current);
        Assert.Null(run.LastSlip);
        Assert.Equal(new HabitCleanRun(0, 0, false, null), HabitStreaks.CleanRuns(Start, [], Start.AddDays(-1)));
    }
}
