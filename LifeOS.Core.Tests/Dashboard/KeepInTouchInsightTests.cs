using LifeOS.Core.Dashboard.DTOs;
using LifeOS.Core.Dashboard.Services;

namespace LifeOS.Core.Tests.Dashboard;

public class KeepInTouchInsightTests
{
    private static readonly DateOnly Today = new(2026, 10, 21);

    private static List<InsightDto> Evaluate(params InsightKeepInTouch[] people) =>
        DashboardInsights.Evaluate(new InsightInputs(Today, new DateTime(2026, 10, 21, 9, 0, 0, DateTimeKind.Utc),
            [], [], Today, 0, KeepInTouch: people));

    [Fact]
    public void Someone_past_their_cadence_is_one_gentle_nudge_keyed_by_the_day_it_fell_due()
    {
        var insight = Assert.Single(Evaluate(new InsightKeepInTouch(7, "Asha", new DateOnly(2026, 9, 1), new DateOnly(2026, 10, 1))));

        Assert.Equal(InsightKinds.KeepInTouch, insight.Kind);
        Assert.Equal(InsightTones.Nudge, insight.Tone);
        Assert.Equal("Contact", insight.EntityType);
        Assert.Equal(7, insight.EntityId);
        Assert.Equal("KeepInTouch:7:2026-10-01", insight.Key);
        Assert.Equal("It's been 50 days since you were in touch with Asha. A quick call or message?", insight.Message);
    }

    [Fact]
    public void Due_today_or_later_is_no_nudge_yet()
    {
        Assert.Empty(Evaluate(
            new InsightKeepInTouch(1, "Ravi", new DateOnly(2026, 10, 14), Today),
            new InsightKeepInTouch(2, "Meera", null, Today.AddDays(5))));
    }

    [Fact]
    public void At_most_three_the_longest_past_due_first()
    {
        var insights = Evaluate(
            new InsightKeepInTouch(1, "A", null, Today.AddDays(-2)),
            new InsightKeepInTouch(2, "B", null, Today.AddDays(-30)),
            new InsightKeepInTouch(3, "C", null, Today.AddDays(-10)),
            new InsightKeepInTouch(4, "D", null, Today.AddDays(-1)));

        Assert.Equal([2, 3, 1], insights.Select(i => i.EntityId!.Value));
        Assert.Equal("You wanted to keep in touch with B. A quick call or message?", insights[0].Message);
    }
}
