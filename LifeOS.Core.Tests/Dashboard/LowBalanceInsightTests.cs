using LifeOS.Core.Dashboard.DTOs;
using LifeOS.Core.Dashboard.Services;

namespace LifeOS.Core.Tests.Dashboard;

public class LowBalanceInsightTests
{
    private static readonly DateOnly Today = new(2026, 10, 20);

    private static List<InsightDto> Evaluate(params InsightLowBalance[] lows) =>
        DashboardInsights.Evaluate(new InsightInputs(Today, new DateTime(2026, 10, 20, 9, 0, 0, DateTimeKind.Utc),
            [], [], Today, 0, LowBalances: lows));

    [Fact]
    public void An_account_going_below_zero_ahead_is_one_nudge_keyed_by_account_and_day()
    {
        var insight = Assert.Single(Evaluate(new InsightLowBalance(1045, "HDFC Savings", "INR", new DateOnly(2026, 11, 15), -2_300.5m)));

        Assert.Equal(InsightKinds.LowBalanceAhead, insight.Kind);
        Assert.Equal(InsightTones.Nudge, insight.Tone);
        Assert.Equal("Forecast", insight.EntityType);
        Assert.Equal("LowBalanceAhead:1045:2026-11-15", insight.Key);
        Assert.Equal(
            "HDFC Savings could go below zero around 15/Nov/2026 (−2,300.50 INR then), with what's already planned to go out. A transfer in time would cover it.",
            insight.Message);
    }

    [Fact]
    public void Nothing_low_ahead_means_no_nudge()
    {
        Assert.Empty(Evaluate());
    }
}
