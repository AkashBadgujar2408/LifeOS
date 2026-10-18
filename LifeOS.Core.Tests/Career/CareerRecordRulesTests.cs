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
}
