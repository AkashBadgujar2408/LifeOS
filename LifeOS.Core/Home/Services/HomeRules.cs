using System.Globalization;
using LifeOS.Core.Finance.Services;
using LifeOS.Core.Home.DTOs;
using LifeOS.Core.Tasks.DTOs;
using LifeOS.Core.Tasks.Services;

namespace LifeOS.Core.Home.Services;

/// <summary>
/// Home's rules, mirroring the CHECKs in 14_home.sql so a refusal reads as a sentence, plus what's computed and never
/// stored (a maintenance task's next due day, what's coming up). Pure and unit-tested.
/// </summary>
public static class HomeRules
{
    /// <summary>How far ahead a warranty, PUC or registration counts as "coming up" (same 60 days as documents).</summary>
    public const int ExpirySoonDays = 60;

    /// <summary>How long after running out it still shows (so a lapse noticed late is still seen, but not forever).</summary>
    public const int ExpiredShownDays = 30;

    /// <summary>How far ahead maintenance counts as "coming up" (overdue maintenance stays until it's done).</summary>
    public const int MaintenanceSoonDays = 14;

    private static readonly HashSet<string> Frequencies =
        [RecurrenceFrequencies.Daily, RecurrenceFrequencies.Weekly, RecurrenceFrequencies.Monthly, RecurrenceFrequencies.Yearly];

    public static string? CheckProperty(
        string kind, string ownership, DateOnly? movedIn, DateOnly? movedOut, DateOnly? purchasedOn, decimal? price, string? currency) =>
        !HomeKinds.PropertyKinds.Contains(kind) ? "Unknown kind of property."
        : !HomeKinds.Ownerships.Contains(ownership) ? "Say whether you own it, rent it or something else."
        : movedIn is { } i && movedOut is { } o && o < i ? "You can't move out before you moved in."
        : (purchasedOn is not null || price is not null) && ownership != HomeKinds.Owned ? "Only a property you own has a purchase."
        : price is <= 0 || price > FinanceRules.MaxAmount ? "The price has to be more than zero (leave it blank if you don't know)."
        : price is not null && currency is null ? "Choose the price's currency."
        : null;

    public static string? CheckAsset(int quantity, DateOnly? purchasedOn, decimal? price, string? currency, DateOnly today) =>
        quantity is < 1 or > 10000 ? "The quantity has to be 1 to 10,000."
        : purchasedOn is { } p && p > today ? "It can't have been bought in the future."
        : price is < 0 || price > FinanceRules.MaxAmount ? "The price can't be negative."
        : price is not null && currency is null ? "Choose the price's currency."
        : null;

    /// <summary>
    /// A disposal: a kind and a day (not in the future, not before it was bought), an amount only when sold. A null
    /// kind takes it back into the inventory (then nothing else may be given).
    /// </summary>
    public static string? CheckDisposal(
        string? kind, DateOnly? on, decimal? amount, string? currency, DateOnly? purchasedOn, DateOnly today) =>
        kind is null ? (on is not null || amount is not null ? "Say what happened to it, or leave everything blank." : null)
        : !HomeKinds.DisposalKinds.Contains(kind) ? "Unknown way of letting it go."
        : on is not { } day ? "Say when."
        : day > today ? "That can't be in the future."
        : purchasedOn is { } p && day < p ? "That's before it was bought."
        : amount is not null && kind != HomeKinds.Sold ? "Only something sold has an amount."
        : amount is < 0 || amount > FinanceRules.MaxAmount ? "The amount can't be negative."
        : amount is not null && currency is null ? "Choose the amount's currency."
        : null;

    public static string? CheckVehicle(
        string kind, short? modelYear, DateOnly? purchasedOn, decimal? price, string? currency,
        DateOnly? pucValidUntil, DateOnly? registrationValidUntil, int? reminderDays, DateOnly today) =>
        !HomeKinds.VehicleKinds.Contains(kind) ? "Unknown kind of vehicle."
        : modelYear is < 1885 or > 2200 ? "That isn't a model year."
        : purchasedOn is { } p && p > today ? "It can't have been bought in the future."
        : price is < 0 || price > FinanceRules.MaxAmount ? "The price can't be negative."
        : price is not null && currency is null ? "Choose the price's currency."
        : reminderDays is < 0 or > 365 ? "Remind 0 to 365 days before."
        : reminderDays is not null && pucValidUntil is null && registrationValidUntil is null
            ? "Reminders need a PUC or registration valid-until day."
        : null;

    public static string? CheckWarranty(
        string kind, string coverType, DateOnly? startsOn, DateOnly expiresOn, decimal? cost, string? currency, int? reminderDays) =>
        !HomeKinds.WarrantyKinds.Contains(kind) ? "Unknown kind of cover."
        : !HomeTargets.All.Contains(coverType) ? "Choose what it covers."
        : expiresOn == default ? "Say when it runs out."
        : startsOn is { } s && expiresOn < s ? "It can't run out before it starts."
        : cost is < 0 || cost > FinanceRules.MaxAmount ? "The cost can't be negative."
        : cost is not null && currency is null ? "Choose the cost's currency."
        : reminderDays is < 0 or > 365 ? "Remind 0 to 365 days before."
        : null;

    public static string? CheckMaintenance(string? targetType, int? targetId, string frequency, int interval, DateOnly firstDueOn, int? reminderDays) =>
        (targetType is null) != (targetId is null) ? "Choose what it's for, or nothing."
        : targetType is not null && !HomeTargets.All.Contains(targetType) ? "Unknown kind of item."
        : !Frequencies.Contains(frequency) ? "Unknown repeat."
        : interval is < 1 or > 999 ? "Repeat every 1 to 999."
        : firstDueOn == default ? "Say when it's first due."
        : reminderDays is < 0 or > 365 ? "Remind 0 to 365 days before."
        : null;

    public static string? CheckDone(DateOnly doneOn, decimal? cost, string? currency, int? odometerKm, DateOnly today) =>
        doneOn == default ? "Say when it was done."
        : doneOn > today ? "It can't be done in the future."
        : cost is < 0 || cost > FinanceRules.MaxAmount ? "The cost can't be negative."
        : cost is not null && currency is null ? "Choose the cost's currency."
        : odometerKm is < 0 or > 10_000_000 ? "That isn't an odometer reading."
        : null;

    /// <summary>
    /// When a maintenance task is next due: its first due day until it's first done, then the last time it was done
    /// moved on by the interval (month ends clamp, as tasks: 31 Jan + 1 month = 28/29 Feb).
    /// </summary>
    public static DateOnly NextDue(string frequency, int interval, DateOnly firstDueOn, DateOnly? lastDoneOn) =>
        lastDoneOn is { } done ? TaskRecurrence.Occurrence(frequency, interval, done, 1) : firstDueOn;

    /// <summary>A warranty / PUC / registration day worth showing as coming up: 60 days ahead to 30 days gone.</summary>
    public static bool ExpiryInWindow(DateOnly on, DateOnly today) =>
        on >= today.AddDays(-ExpiredShownDays) && on <= today.AddDays(ExpirySoonDays);

    /// <summary>Maintenance worth showing: due within 14 days, or overdue (however long).</summary>
    public static bool MaintenanceInWindow(DateOnly nextDue, DateOnly today) => nextDue <= today.AddDays(MaintenanceSoonDays);

    /// <summary>"Fridge warranty runs out on 14/Oct/2027" (at most 200 characters, like every reminder title).</summary>
    public static string WarrantyReminderTitle(string kind, string coverName, DateOnly expiresOn) =>
        Title(coverName, $" {(kind == "AMC" ? "AMC" : "warranty")} runs out on {Day(expiresOn)}");

    public static string PucReminderTitle(string vehicleName, DateOnly validUntil) =>
        Title(vehicleName, $" PUC runs out on {Day(validUntil)}");

    public static string RegistrationReminderTitle(string vehicleName, DateOnly validUntil) =>
        Title(vehicleName, $" registration runs out on {Day(validUntil)}");

    /// <summary>"Service the car — due 01/Nov/2026".</summary>
    public static string MaintenanceReminderTitle(string title, DateOnly dueOn) => Title(title, $" — due {Day(dueOn)}");

    private static string Title(string name, string suffix) =>
        (name.Length + suffix.Length > 200 ? name[..(200 - suffix.Length - 1)] + "…" : name) + suffix;

    private static string Day(DateOnly day) => day.ToString("dd'/'MMM'/'yyyy", CultureInfo.InvariantCulture);
}
