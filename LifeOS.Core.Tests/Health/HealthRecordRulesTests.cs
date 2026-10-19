using LifeOS.Core.Health.DTOs;
using LifeOS.Core.Health.Services;

namespace LifeOS.Core.Tests.Health;

public class HealthRecordRulesTests
{
    private static readonly DateOnly Today = new(2026, 10, 19);

    [Theory]
    [InlineData(5.9, 4.0, 5.6, "High")]
    [InlineData(3.1, 4.0, 5.6, "Low")]
    [InlineData(5.6, 4.0, 5.6, "Normal")] // the ends are inside
    [InlineData(4.0, 4.0, 5.6, "Normal")]
    [InlineData(250.0, null, 200.0, "High")] // "below 200"
    [InlineData(45.0, 40.0, null, "Normal")] // "above 40"
    [InlineData(38.0, 40.0, null, "Low")]
    public void A_result_is_flagged_against_its_range(double value, double? low, double? high, string flag) =>
        Assert.Equal(flag, HealthRecordRules.Flag((decimal)value, (decimal?)low, (decimal?)high));

    [Fact]
    public void No_number_or_no_range_means_no_flag()
    {
        Assert.Null(HealthRecordRules.Flag(null, 0, 1));
        Assert.Null(HealthRecordRules.Flag(5.9m, null, null));
    }

    [Fact]
    public void A_result_is_a_number_or_a_word_and_ranges_need_numbers()
    {
        LabResultRequest R(decimal? value = null, string? text = null, decimal? low = null, decimal? high = null) =>
            new() { TestName = "HbA1c", TakenOn = Today, Value = value, ValueText = text, RangeLow = low, RangeHigh = high, Today = Today };

        Assert.Null(HealthRecordRules.CheckLab(R(5.9m, low: 4, high: 5.6m)));
        Assert.Null(HealthRecordRules.CheckLab(R(text: "Negative")));
        Assert.NotNull(HealthRecordRules.CheckLab(R()));
        Assert.NotNull(HealthRecordRules.CheckLab(R(5.9m, "High")));
        Assert.NotNull(HealthRecordRules.CheckLab(R(text: "Negative", low: 0)));
        Assert.NotNull(HealthRecordRules.CheckLab(R(5.9m, low: 6, high: 4)));
        Assert.NotNull(HealthRecordRules.CheckLab(new LabResultRequest { TestName = "X", TakenOn = Today.AddDays(1), Value = 1, Today = Today }));
        Assert.Equal(HealthRecordRules.TestKey(" hba1c "), HealthRecordRules.TestKey("HbA1c"));
    }

    [Theory]
    [InlineData(82, 75, 82, 0)] // just started
    [InlineData(82, 75, 78.5, 50)]
    [InlineData(82, 75, 75, 100)]
    [InlineData(82, 75, 73, 100)] // past the target
    [InlineData(82, 75, 84, 0)] // the wrong way
    [InlineData(55, 60, 57, 40)] // going up
    public void Goal_progress_follows_the_latest_reading(double start, double target, double latest, int percent) =>
        Assert.Equal(percent, HealthRecordRules.GoalPercent((decimal)start, (decimal)target, (decimal)latest));

    [Fact]
    public void No_reading_yet_is_no_progress_and_targets_are_checked()
    {
        Assert.Equal(0, HealthRecordRules.GoalPercent(82, 75, null));
        Assert.Null(HealthRecordRules.CheckGoalTarget("Weight", 82, 75));
        Assert.NotNull(HealthRecordRules.CheckGoalTarget("Weight", 82, 82));
        Assert.NotNull(HealthRecordRules.CheckGoalTarget("BloodPressure", 130, 120));
        Assert.NotNull(HealthRecordRules.CheckGoalTarget("Weight", 82, 750));
    }

    [Fact]
    public void Check_ins_are_one_to_five_and_not_ahead()
    {
        Assert.Null(HealthRecordRules.CheckCheckIn(new WellnessCheckInRequest { StressLevel = 3, Today = Today }, Today));
        Assert.NotNull(HealthRecordRules.CheckCheckIn(new WellnessCheckInRequest { StressLevel = 6, Today = Today }, Today));
        Assert.NotNull(HealthRecordRules.CheckCheckIn(new WellnessCheckInRequest { StressLevel = 3, Today = Today }, Today.AddDays(1)));
        Assert.True(HealthRecordRules.IsBlank(new WellnessCheckInRequest { Notes = "  ", Today = Today }));
        Assert.False(HealthRecordRules.IsBlank(new WellnessCheckInRequest { EnergyLevel = 2, Today = Today }));
    }
}
