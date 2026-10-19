using LifeOS.Core.Finance.Services;

namespace LifeOS.Core.Tests.Finance;

public class FinanceProtectionTests
{
    private static readonly DateOnly Today = new(2026, 10, 19);

    [Fact]
    public void Policies_follow_their_constraints()
    {
        Assert.Null(ProtectionRules.CheckPolicy("Health", "INR", 500_000m, 18_000m, "Yearly", new DateOnly(2025, 4, 1), new DateOnly(2027, 4, 1), null, 30));
        Assert.NotNull(ProtectionRules.CheckPolicy("Pet", "INR", null, null, null, null, null, null, null));
        Assert.NotNull(ProtectionRules.CheckPolicy("Life", null, null, null, null, null, null, null, null));
        // Premium and how often come together.
        Assert.NotNull(ProtectionRules.CheckPolicy("Life", "INR", null, 1000m, null, null, null, null, null));
        Assert.NotNull(ProtectionRules.CheckPolicy("Life", "INR", null, null, "Monthly", null, null, null, null));
        Assert.NotNull(ProtectionRules.CheckPolicy("Life", "INR", null, 1000m, "Weekly", null, null, null, null));
        Assert.NotNull(ProtectionRules.CheckPolicy("Life", "INR", 0m, null, null, null, null, null, null));
        // Dates in order: start ≤ renewal ≤ end.
        Assert.NotNull(ProtectionRules.CheckPolicy("Vehicle", "INR", null, null, null, new DateOnly(2026, 5, 1), null, new DateOnly(2026, 4, 1), null));
        Assert.NotNull(ProtectionRules.CheckPolicy("Vehicle", "INR", null, null, null, new DateOnly(2026, 5, 1), new DateOnly(2026, 4, 1), null, null));
        Assert.NotNull(ProtectionRules.CheckPolicy("Vehicle", "INR", null, null, null, null, new DateOnly(2027, 5, 1), new DateOnly(2027, 4, 1), null));
        // A renewal reminder needs a renewal date, and 0–365 days.
        Assert.NotNull(ProtectionRules.CheckPolicy("Home", "INR", null, null, null, null, null, null, 30));
        Assert.NotNull(ProtectionRules.CheckPolicy("Home", "INR", null, null, null, null, Today, null, 400));
    }

    [Fact]
    public void Annual_premium_follows_the_frequency()
    {
        Assert.Equal(12_000m, ProtectionRules.AnnualPremium(1_000m, "Monthly"));
        Assert.Equal(8_000m, ProtectionRules.AnnualPremium(2_000m, "Quarterly"));
        Assert.Equal(18_000m, ProtectionRules.AnnualPremium(18_000m, "Yearly"));
        Assert.Null(ProtectionRules.AnnualPremium(50_000m, "Single"));
        Assert.Null(ProtectionRules.AnnualPremium(null, null));
        Assert.Equal("Car cover renews on 01/Apr/2027", ProtectionRules.RenewalReminderTitle("Car cover", new DateOnly(2027, 4, 1)));
        Assert.Equal(200, ProtectionRules.RenewalReminderTitle(new string('x', 250), new DateOnly(2027, 4, 1)).Length);
    }

    [Fact]
    public void Tax_items_follow_their_constraints()
    {
        Assert.Null(ProtectionRules.CheckTaxItem("Deadline", null, null, null, Today));
        Assert.Null(ProtectionRules.CheckTaxItem("Deduction", 150_000m, "INR", Today, Today));
        Assert.NotNull(ProtectionRules.CheckTaxItem("Refund", null, null, null, Today));
        Assert.NotNull(ProtectionRules.CheckTaxItem("Payment", 100m, null, null, Today));
        Assert.NotNull(ProtectionRules.CheckTaxItem("Payment", null, "INR", null, Today));
        Assert.NotNull(ProtectionRules.CheckTaxItem("Payment", -5m, "INR", null, Today));
        Assert.NotNull(ProtectionRules.CheckTaxItem("Deadline", null, null, Today.AddDays(1), Today));
    }

    [Fact]
    public void The_same_statement_hashes_the_same_and_repeats_stay_apart()
    {
        var day = new DateOnly(2026, 10, 3);
        StatementLine[] lines =
        [
            new(day, -150m, "CAFE COFFEE DAY"),
            new(day, -150m, "  cafe   coffee day "),
            new(day, 52_000m, "SALARY OCT"),
        ];

        var first = StatementImport.Hashes(7, lines);
        var again = StatementImport.Hashes(7, lines);

        Assert.Equal(first, again);
        // Two identical coffees (spacing and case don't matter) are repeats 0 and 1 — both kept, not merged.
        Assert.Equal(3, first.Distinct().Count());
        Assert.All(first, h => Assert.Matches("^[0-9a-f]{64}$", h));
        // An overlapping statement that has only the first coffee recognises it.
        Assert.Equal(first[0], StatementImport.Hashes(7, [new(day, -150m, "Cafe Coffee Day")])[0]);
        // Another account, day or amount is another line.
        Assert.NotEqual(first[0], StatementImport.Hashes(8, [lines[0]])[0]);
        Assert.NotEqual(first[0], StatementImport.Hashes(7, [new(day.AddDays(1), -150m, "CAFE COFFEE DAY")])[0]);
        Assert.NotEqual(first[0], StatementImport.Hashes(7, [new(day, 150m, "CAFE COFFEE DAY")])[0]);
        // 150 and 150.00 are the same amount.
        Assert.Equal(first[0], StatementImport.Hashes(7, [new(day, -150.00m, "CAFE COFFEE DAY")])[0]);
    }

    [Fact]
    public void Imported_text_is_cleaned_and_fitted()
    {
        Assert.Equal("UPI/Swiggy/Bangalore", StatementImport.Clean("  UPI/Swiggy/Bangalore \t"));
        Assert.Null(StatementImport.Fit("   ", 10));
        Assert.Equal("abc", StatementImport.Fit("abc", 10));
        Assert.Equal("abcdefghi…", StatementImport.Fit("abcdefghijklmnop", 10));
    }

    [Fact]
    public void Cash_flow_fills_empty_months_and_works_out_the_savings_rate()
    {
        var months = CashFlowReport.Months(
            [
                new CashFlowRow(new DateOnly(2026, 8, 1), 100_000m, 60_000m, 0),
                new CashFlowRow(new DateOnly(2026, 10, 1), 0m, 5_000m, 1),
            ],
            new DateOnly(2026, 8, 1),
            new DateOnly(2026, 10, 1));

        Assert.Equal(3, months.Count);
        Assert.Equal(40m, months[0].SavingsRate);
        Assert.Equal(40_000m, months[0].Net);
        Assert.Equal(0m, months[1].Income);
        Assert.Null(months[1].SavingsRate);
        Assert.Null(months[2].SavingsRate);
        Assert.Equal(-5_000m, months[2].Net);

        var total = CashFlowReport.Total(months);
        Assert.Equal(100_000m, total.Income);
        Assert.Equal(65_000m, total.Spending);
        Assert.Equal(35m, total.SavingsRate);
        Assert.Equal(1, total.Unconverted);
        // Spending more than earned is a negative rate, not hidden.
        Assert.Equal(-12.5m, CashFlowReport.SavingsRate(80m, 90m));
        Assert.Equal(new DateOnly(2025, 11, 1), CashFlowReport.FirstMonth(Today, 12));
        Assert.Equal(new DateOnly(2026, 10, 1), CashFlowReport.FirstMonth(Today, 1));
    }
}
