using LifeOS.Core.Home.Services;

namespace LifeOS.Core.Tests.Home;

public class HomeRulesTests
{
    private static readonly DateOnly Today = new(2026, 10, 20);

    [Fact]
    public void Maintenance_is_first_due_on_its_first_day_then_counts_from_the_last_time_done()
    {
        var first = new DateOnly(2026, 11, 1);
        Assert.Equal(first, HomeRules.NextDue("Monthly", 6, first, null));
        // Serviced early (20 Oct) → six months from then, not from the first due day.
        Assert.Equal(new DateOnly(2027, 4, 20), HomeRules.NextDue("Monthly", 6, first, new DateOnly(2026, 10, 20)));
        Assert.Equal(new DateOnly(2026, 11, 3), HomeRules.NextDue("Weekly", 2, first, new DateOnly(2026, 10, 20)));
        Assert.Equal(new DateOnly(2027, 10, 20), HomeRules.NextDue("Yearly", 1, first, new DateOnly(2026, 10, 20)));
        Assert.Equal(new DateOnly(2026, 10, 30), HomeRules.NextDue("Daily", 10, first, new DateOnly(2026, 10, 20)));
    }

    [Fact]
    public void Month_ends_clamp_like_tasks()
    {
        Assert.Equal(new DateOnly(2027, 2, 28), HomeRules.NextDue("Monthly", 1, new DateOnly(2026, 1, 1), new DateOnly(2027, 1, 31)));
        Assert.Equal(new DateOnly(2029, 2, 28), HomeRules.NextDue("Yearly", 1, new DateOnly(2026, 1, 1), new DateOnly(2028, 2, 29)));
    }

    [Fact]
    public void Expiries_show_from_60_days_ahead_until_30_days_gone_and_maintenance_until_done()
    {
        Assert.True(HomeRules.ExpiryInWindow(Today.AddDays(60), Today));
        Assert.False(HomeRules.ExpiryInWindow(Today.AddDays(61), Today));
        Assert.True(HomeRules.ExpiryInWindow(Today.AddDays(-30), Today));
        Assert.False(HomeRules.ExpiryInWindow(Today.AddDays(-31), Today));

        Assert.True(HomeRules.MaintenanceInWindow(Today.AddDays(14), Today));
        Assert.False(HomeRules.MaintenanceInWindow(Today.AddDays(15), Today));
        Assert.True(HomeRules.MaintenanceInWindow(Today.AddDays(-400), Today)); // overdue stays
    }

    [Fact]
    public void A_property_only_has_a_purchase_when_owned()
    {
        Assert.Null(HomeRules.CheckProperty("Apartment", "Owned", null, null, new DateOnly(2020, 1, 1), 5_000_000, "INR"));
        Assert.Null(HomeRules.CheckProperty("Apartment", "Rented", new DateOnly(2024, 1, 1), new DateOnly(2025, 1, 1), null, null, null));
        Assert.NotNull(HomeRules.CheckProperty("Apartment", "Rented", null, null, null, 10, "INR"));
        Assert.NotNull(HomeRules.CheckProperty("Apartment", "Owned", null, null, null, 10, null));
        Assert.NotNull(HomeRules.CheckProperty("Apartment", "Rented", new DateOnly(2025, 1, 2), new DateOnly(2025, 1, 1), null, null, null));
        Assert.NotNull(HomeRules.CheckProperty("Castle", "Owned", null, null, null, null, null));
        Assert.NotNull(HomeRules.CheckProperty("House", "Borrowed", null, null, null, null, null));
    }

    [Fact]
    public void Letting_something_go_needs_a_kind_and_a_past_day_and_only_a_sale_has_an_amount()
    {
        var bought = new DateOnly(2022, 5, 1);
        Assert.Null(HomeRules.CheckDisposal("Sold", Today, 3000, "INR", bought, Today));
        Assert.Null(HomeRules.CheckDisposal("Donated", Today, null, null, bought, Today));
        Assert.Null(HomeRules.CheckDisposal(null, null, null, null, bought, Today)); // back in the inventory
        Assert.NotNull(HomeRules.CheckDisposal(null, Today, null, null, bought, Today));
        Assert.NotNull(HomeRules.CheckDisposal("Sold", null, null, null, bought, Today));
        Assert.NotNull(HomeRules.CheckDisposal("Sold", Today.AddDays(1), null, null, bought, Today));
        Assert.NotNull(HomeRules.CheckDisposal("Sold", new DateOnly(2022, 4, 30), null, null, bought, Today));
        Assert.NotNull(HomeRules.CheckDisposal("Donated", Today, 10, "INR", bought, Today));
        Assert.NotNull(HomeRules.CheckDisposal("Sold", Today, 10, null, bought, Today));
        Assert.NotNull(HomeRules.CheckDisposal("Burnt", Today, null, null, bought, Today));
    }

    [Fact]
    public void Vehicles_warranties_and_maintenance_mirror_their_checks()
    {
        Assert.Null(HomeRules.CheckVehicle("Car", 2021, null, null, null, Today.AddDays(90), null, 7, Today));
        Assert.NotNull(HomeRules.CheckVehicle("Truck", null, null, null, null, null, null, null, Today));
        Assert.NotNull(HomeRules.CheckVehicle("Car", 1800, null, null, null, null, null, null, Today));
        Assert.NotNull(HomeRules.CheckVehicle("Car", null, null, null, null, null, null, 7, Today)); // reminders without a day
        Assert.NotNull(HomeRules.CheckVehicle("Car", null, Today.AddDays(1), null, null, null, null, null, Today));

        Assert.Null(HomeRules.CheckWarranty("AMC", "Asset", Today, Today.AddYears(1), 2500, "INR", 30));
        Assert.NotNull(HomeRules.CheckWarranty("AMC", "Asset", Today, Today.AddDays(-1), null, null, null));
        Assert.NotNull(HomeRules.CheckWarranty("AMC", "Room", null, Today, null, null, null));
        Assert.NotNull(HomeRules.CheckWarranty("AMC", "Asset", null, default, null, null, null));
        Assert.NotNull(HomeRules.CheckWarranty("AMC", "Asset", null, Today, null, null, 400));

        Assert.Null(HomeRules.CheckMaintenance("Vehicle", 4, "Monthly", 6, Today, 7));
        Assert.Null(HomeRules.CheckMaintenance(null, null, "Monthly", 3, Today, null));
        Assert.NotNull(HomeRules.CheckMaintenance("Vehicle", null, "Monthly", 6, Today, null));
        Assert.NotNull(HomeRules.CheckMaintenance(null, null, "Hourly", 6, Today, null));
        Assert.NotNull(HomeRules.CheckMaintenance(null, null, "Monthly", 0, Today, null));

        Assert.Null(HomeRules.CheckDone(Today, 4500, "INR", 32000, Today));
        Assert.NotNull(HomeRules.CheckDone(Today.AddDays(1), null, null, null, Today));
        Assert.NotNull(HomeRules.CheckDone(Today, 4500, null, null, Today));
        Assert.NotNull(HomeRules.CheckDone(Today, null, null, -1, Today));
    }

    [Fact]
    public void Reminder_titles_name_the_item_and_the_day_within_200_characters()
    {
        Assert.Equal("Fridge warranty runs out on 01/May/2027", HomeRules.WarrantyReminderTitle("Warranty", "Fridge", new DateOnly(2027, 5, 1)));
        Assert.Equal("RO purifier AMC runs out on 01/May/2027", HomeRules.WarrantyReminderTitle("AMC", "RO purifier", new DateOnly(2027, 5, 1)));
        Assert.Equal("Swift PUC runs out on 01/Jan/2027", HomeRules.PucReminderTitle("Swift", new DateOnly(2027, 1, 1)));
        Assert.Equal("Service the car — due 01/Nov/2026", HomeRules.MaintenanceReminderTitle("Service the car", new DateOnly(2026, 11, 1)));
        Assert.Equal(200, HomeRules.RegistrationReminderTitle(new string('x', 200), Today).Length);
    }
}

public class HomeMoneyRulesTests
{
    private static readonly DateOnly Today = new(2026, 10, 20);

    [Fact]
    public void A_bill_needs_a_kind_a_due_day_an_amount_and_a_currency()
    {
        Assert.Null(HomeRules.CheckBill("Electricity", new DateOnly(2026, 9, 1), new DateOnly(2026, 9, 30), Today, 1800, "INR", 212));
        Assert.NotNull(HomeRules.CheckBill("Cable", null, null, Today, 1800, "INR", null));
        Assert.NotNull(HomeRules.CheckBill("Water", null, null, default, 1800, "INR", null));
        Assert.NotNull(HomeRules.CheckBill("Water", new DateOnly(2026, 9, 30), new DateOnly(2026, 9, 1), Today, 1800, "INR", null));
        Assert.NotNull(HomeRules.CheckBill("Water", null, null, Today, 0, "INR", null));
        Assert.NotNull(HomeRules.CheckBill("Water", null, null, Today, 10, null, null));
        Assert.NotNull(HomeRules.CheckBill("Water", null, null, Today, 10, "INR", -1));

        Assert.Null(HomeRules.CheckPaid(Today, Today));
        Assert.NotNull(HomeRules.CheckPaid(Today.AddDays(1), Today));
    }

    [Fact]
    public void Budget_share_counts_only_the_budget_currency_and_can_pass_100()
    {
        (string, decimal)[] spent = [("INR", 30000), ("USD", 100), ("INR", 15500)];
        Assert.Equal(56, HomeRules.BudgetPercent(80000, "INR", spent)); // 45,500 of 80,000 = 56.9 → 56
        Assert.Equal(125, HomeRules.BudgetPercent(36400, "INR", spent));
        Assert.Equal(0, HomeRules.BudgetPercent(80000, "EUR", spent));
        Assert.Null(HomeRules.BudgetPercent(null, null, spent));
    }

    [Fact]
    public void Unpaid_bills_come_up_two_weeks_ahead_and_stay_while_overdue()
    {
        Assert.True(HomeRules.BillInWindow(Today.AddDays(14), Today));
        Assert.False(HomeRules.BillInWindow(Today.AddDays(15), Today));
        Assert.True(HomeRules.BillInWindow(Today.AddDays(-60), Today));
    }

    [Fact]
    public void A_paid_bill_expense_says_what_it_was_for()
    {
        var bill = new LifeOS.Core.Models.UtilityBill
        {
            Kind = "Electricity",
            PeriodStart = new DateOnly(2026, 9, 1),
            PeriodEnd = new DateOnly(2026, 9, 30),
            Property = new LifeOS.Core.Models.Property { Name = "Flat 4B" },
        };
        Assert.Equal("Electricity bill, Flat 4B, 01/Sep/2026 – 30/Sep/2026", UtilityBillsService.BillNote(bill));
        Assert.Equal("Bill", UtilityBillsService.BillPayee("Other"));
    }
}
