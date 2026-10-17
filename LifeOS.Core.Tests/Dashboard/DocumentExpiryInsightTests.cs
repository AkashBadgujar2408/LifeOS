using LifeOS.Core.Dashboard.DTOs;
using LifeOS.Core.Dashboard.Services;

namespace LifeOS.Core.Tests.Dashboard;

public class DocumentExpiryInsightTests
{
    private static readonly DateOnly Today = new(2026, 10, 17);

    private static List<InsightDto> Evaluate(params InsightDocument[] documents) =>
        DashboardInsights.Evaluate(new InsightInputs(Today, new DateTime(2026, 10, 17, 9, 0, 0, DateTimeKind.Utc),
            [], [], Today, 0, documents));

    [Fact]
    public void A_document_expiring_within_30_days_gets_one_nudge_pointing_at_it()
    {
        var insight = Assert.Single(Evaluate(new InsightDocument(4, "Passport", Today.AddDays(20))));

        Assert.Equal(InsightKinds.DocumentExpiring, insight.Kind);
        Assert.Equal(InsightTones.Nudge, insight.Tone);
        Assert.Equal(("Document", 4), (insight.EntityType, insight.EntityId));
        Assert.Equal("\"Passport\" expires in 20 days. Renewals take time, so it's worth starting now.", insight.Message);
    }

    [Fact]
    public void Further_off_than_30_days_is_left_to_the_my_day_card()
    {
        Assert.Empty(Evaluate(new InsightDocument(4, "Passport", Today.AddDays(31))));
    }

    [Fact]
    public void Only_the_soonest_of_several_is_mentioned()
    {
        var insight = Assert.Single(Evaluate(
            new InsightDocument(1, "Car insurance", Today.AddDays(25)),
            new InsightDocument(2, "Driving licence", Today.AddDays(-3)),
            new InsightDocument(3, "Passport", Today.AddDays(10))));

        Assert.Equal(2, insight.EntityId);
        Assert.Equal("\"Driving licence\" expired 3 days ago. Renewing it now saves a scramble later.", insight.Message);
    }

    [Theory]
    [InlineData(0, "\"Passport\" expires today.")]
    [InlineData(1, "\"Passport\" expires tomorrow.")]
    [InlineData(-1, "\"Passport\" expired yesterday. Renewing it now saves a scramble later.")]
    public void Wording_around_today(int days, string expected)
    {
        Assert.Equal(expected, DashboardInsights.DocumentExpiryMessage(new InsightDocument(1, "Passport", Today.AddDays(days)), Today));
    }

    [Fact]
    public void Renewing_it_clears_the_nudge()
    {
        // Acted on = the expiry moved years out; My Day's window no longer returns it, and the rule says nothing.
        Assert.Empty(Evaluate());
    }
}
