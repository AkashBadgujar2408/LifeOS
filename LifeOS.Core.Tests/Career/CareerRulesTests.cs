using LifeOS.Core.Career.DTOs;
using LifeOS.Core.Career.Services;

namespace LifeOS.Core.Tests.Career;

public class CareerRulesTests
{
    private static readonly DateOnly Start = new(2022, 1, 10);

    [Theory]
    [InlineData(" inr ", "INR")]
    [InlineData("eur", "EUR")]
    [InlineData("RUPEES", null)]
    [InlineData("I1R", null)]
    [InlineData("", null)]
    public void Currency_codes_are_three_letters_upper_cased(string input, string? expected)
    {
        Assert.Equal(expected, CareerRules.Currency(input));
    }

    [Fact]
    public void A_role_ends_on_or_after_it_starts()
    {
        Assert.Null(CareerRules.CheckRole(EmploymentTypes.FullTime, Start, null));
        Assert.Null(CareerRules.CheckRole(EmploymentTypes.Contract, Start, Start));
        Assert.NotNull(CareerRules.CheckRole(EmploymentTypes.FullTime, Start, Start.AddDays(-1)));
        Assert.NotNull(CareerRules.CheckRole("Gig", Start, null));
    }

    [Fact]
    public void Only_a_current_role_can_be_promoted_from_and_only_after_it_started()
    {
        Assert.Null(CareerRules.CheckPromotion(Start, null, Start.AddDays(1)));
        Assert.NotNull(CareerRules.CheckPromotion(Start, null, Start));
        Assert.NotNull(CareerRules.CheckPromotion(Start, Start.AddYears(1), Start.AddMonths(6)));
    }

    [Fact]
    public void Pay_for_a_role_falls_inside_its_dates()
    {
        Assert.Null(CareerRules.CheckDayInRole(Start, Start, null));
        Assert.NotNull(CareerRules.CheckDayInRole(Start.AddDays(-1), Start, null));
        Assert.NotNull(CareerRules.CheckDayInRole(Start.AddDays(31), Start, Start.AddDays(30)));
        Assert.Null(CareerRules.CheckDayInRole(Start, null, null));
    }

    [Fact]
    public void Change_is_against_the_latest_earlier_record_in_the_same_currency_and_period()
    {
        SalaryRecordDto Record(int id, string day, decimal amount, string currency = "INR", string period = SalaryPeriods.Year) =>
            new() { Id = id, EffectiveOn = DateOnly.Parse(day), Amount = amount, Currency = currency, Period = period };

        var records = new[]
        {
            Record(4, "2025-04-01", 1_500_000),
            Record(1, "2022-01-10", 1_200_000),
            Record(2, "2023-04-01", 1_320_000),
            Record(3, "2024-06-01", 60, "EUR", SalaryPeriods.Hour),
            Record(5, "2026-01-01", 70, "EUR", SalaryPeriods.Hour),
            Record(6, "2026-02-01", 1_400_000),
        };
        SalaryHistory.FillChanges(records);

        var change = records.ToDictionary(r => r.Id, r => r.ChangePercent);
        Assert.Null(change[1]);
        Assert.Equal(10.0m, change[2]);
        Assert.Equal(13.6m, change[4]);
        // A cut reads as a negative change.
        Assert.Equal(-6.7m, change[6]);
        // A different currency/period is its own series.
        Assert.Null(change[3]);
        Assert.Equal(16.7m, change[5]);
    }
}
