using LifeOS.Core.Dashboard.Services;

namespace LifeOS.Core.Tests.Dashboard;

public class LifeBalanceTests
{
    [Fact]
    public void Finishing_weighs_more_than_ticking()
    {
        Assert.Equal(1, LifeBalance.Points(activeGoals: 1, 0, 0, 0, 0));
        Assert.Equal(5, LifeBalance.Points(0, goalsCompleted: 1, 0, 0, 0));
        Assert.Equal(3, LifeBalance.Points(0, 0, milestonesCompleted: 1, 0, 0));
        Assert.Equal(1, LifeBalance.Points(0, 0, 0, habitTicks: 1, 0));
        Assert.Equal(1, LifeBalance.Points(0, 0, 0, 0, journalEntries: 1));
        Assert.Equal(1 + 5 + 6 + 20 + 4, LifeBalance.Points(1, 1, 2, 20, 4));
    }

    [Fact]
    public void Busiest_area_scores_ten_and_the_rest_in_proportion()
    {
        Assert.Equal([10m, 5m, 0m, 3.3m], LifeBalance.Scores([30, 15, 0, 10]));
    }

    [Fact]
    public void Nothing_happened_means_all_zero_not_a_division_by_zero()
    {
        Assert.Equal([0m, 0m, 0m], LifeBalance.Scores([0, 0, 0]));
        Assert.Empty(LifeBalance.Scores([]));
    }

    [Fact]
    public void Rounds_to_one_decimal_half_away_from_zero()
    {
        // 1/8 of 10 = 1.25 -> 1.3
        Assert.Equal([10m, 1.3m], LifeBalance.Scores([8, 1]));
    }
}
