using LifeOS.Core.Career.DTOs;
using LifeOS.Core.Career.Services;

namespace LifeOS.Core.Tests.Career;

public class CareerRecordRulesTests
{
    private static readonly DateOnly Today = new(2026, 10, 18);

    [Theory]
    [InlineData(null, true)]
    [InlineData("  ", true)]
    [InlineData("https://example.com/me", true)]
    [InlineData(" http://example.com ", true)]
    [InlineData("javascript:alert(1)", false)]
    [InlineData("example.com", false)]
    [InlineData("ftp://example.com", false)]
    public void Links_are_http_or_https_addresses(string? url, bool ok)
    {
        Assert.Equal(ok, CareerRules.IsWebAddress(url));
    }

    [Fact]
    public void A_side_income_source_ends_only_once_ended()
    {
        Assert.Null(CareerRules.CheckSideIncome(SideIncomeKinds.Teaching, SideIncomeStatuses.Active, Today.AddYears(-1), null, Today));
        Assert.Null(CareerRules.CheckSideIncome(SideIncomeKinds.Content, SideIncomeStatuses.Ended, Today.AddYears(-1), Today, Today));
        Assert.Null(CareerRules.CheckSideIncome(SideIncomeKinds.Content, SideIncomeStatuses.Ended, null, null, Today));
        Assert.NotNull(CareerRules.CheckSideIncome(SideIncomeKinds.Content, SideIncomeStatuses.Paused, null, Today, Today));
    }

    [Fact]
    public void A_side_income_source_has_sensible_days_and_known_values()
    {
        Assert.NotNull(CareerRules.CheckSideIncome(SideIncomeKinds.Freelance, SideIncomeStatuses.Active, Today.AddDays(1), null, Today));
        Assert.NotNull(CareerRules.CheckSideIncome(SideIncomeKinds.Freelance, SideIncomeStatuses.Ended, Today, Today.AddDays(1), Today));
        Assert.NotNull(CareerRules.CheckSideIncome(SideIncomeKinds.Freelance, SideIncomeStatuses.Ended, Today, Today.AddDays(-1), Today));
        Assert.NotNull(CareerRules.CheckSideIncome("Lottery", SideIncomeStatuses.Active, null, null, Today));
        Assert.NotNull(CareerRules.CheckSideIncome(SideIncomeKinds.Freelance, "Dormant", null, null, Today));
    }

    [Fact]
    public void A_mock_interview_is_held_by_a_named_AI_no_later_than_today()
    {
        Assert.Null(CareerRules.CheckMockInterview(Today, "Gemini", 30, Today));
        Assert.Null(CareerRules.CheckMockInterview(Today.AddDays(-40), "ChatGPT", null, Today));
        Assert.NotNull(CareerRules.CheckMockInterview(Today.AddDays(1), "Gemini", 30, Today));
        Assert.NotNull(CareerRules.CheckMockInterview(default, "Gemini", 30, Today));
        Assert.NotNull(CareerRules.CheckMockInterview(Today, "Gemini", 30, default));
        Assert.NotNull(CareerRules.CheckMockInterview(Today, "  ", 30, Today));
    }

    [Theory]
    [InlineData(1, true)]
    [InlineData(600, true)]
    [InlineData(0, false)]
    [InlineData(601, false)]
    public void A_mock_interview_lasts_one_to_600_minutes(int minutes, bool ok)
    {
        Assert.Equal(ok, CareerRules.CheckMockInterview(Today, "Gemini", minutes, Today) is null);
    }

    [Fact]
    public void A_mock_interview_is_titled_by_its_role_then_the_application_role_then_the_AI()
    {
        Assert.Equal("Mock interview · Backend engineer", MockInterviewLinkableProvider.Title("Backend engineer", "SDE II", "Gemini"));
        Assert.Equal("Mock interview · SDE II", MockInterviewLinkableProvider.Title(null, "SDE II", "Gemini"));
        Assert.Equal("Mock interview with Gemini", MockInterviewLinkableProvider.Title(null, null, "Gemini"));
    }
}
