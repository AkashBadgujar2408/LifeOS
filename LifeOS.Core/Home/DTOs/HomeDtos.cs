using System.ComponentModel.DataAnnotations;
using LifeOS.Core.Home.Services;
using LifeOS.Core.Shared.DTOs;

namespace LifeOS.Core.Home.DTOs;

/// <summary>Matches the CHECKs in 14_home.sql (never rename a value — rows hold them).</summary>
public static class HomeKinds
{
    public static readonly IReadOnlySet<string> PropertyKinds = new HashSet<string>(
        ["House", "Apartment", "Land", "Office", "Other"], StringComparer.Ordinal);

    public static readonly IReadOnlySet<string> Ownerships = new HashSet<string>(
        ["Owned", "Rented", "Family", "Other"], StringComparer.Ordinal);

    public const string Owned = "Owned";

    public static readonly IReadOnlySet<string> VehicleKinds = new HashSet<string>(
        ["Car", "Motorcycle", "Scooter", "Bicycle", "Other"], StringComparer.Ordinal);

    public static readonly IReadOnlySet<string> WarrantyKinds = new HashSet<string>(
        ["Warranty", "Extended", "AMC"], StringComparer.Ordinal);

    public static readonly IReadOnlySet<string> DisposalKinds = new HashSet<string>(
        ["Sold", "Donated", "Discarded", "Lost"], StringComparer.Ordinal);

    public const string Sold = "Sold";

    /// <summary>Matches CK_Vehicles_FuelUnit: litres, kg (CNG) or kWh (an EV).</summary>
    public static readonly IReadOnlySet<string> FuelUnits = new HashSet<string>(["Litre", "Kg", "kWh"], StringComparer.Ordinal);
}

/// <summary>What a warranty covers or a maintenance task is about (the linkable type strings).</summary>
public static class HomeTargets
{
    public const string Asset = "Asset";
    public const string Vehicle = "Vehicle";
    public const string Property = "Property";

    public static readonly IReadOnlySet<string> All = new HashSet<string>([Asset, Vehicle, Property], StringComparer.Ordinal);
}

/// <summary>Kinds of "coming up at home" items (Agenda, My Day).</summary>
public static class HomeAgendaKinds
{
    public const string Warranty = "Warranty";
    public const string Puc = "Puc";
    public const string Registration = "Registration";
    public const string Maintenance = "Maintenance";
    public const string Bill = "Bill";
}

// ---- Properties ----

public class PropertyDto
{
    public int Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public string Kind { get; init; } = string.Empty;
    public string Ownership { get; init; } = string.Empty;
    public string? Address { get; init; }
    public DateOnly? MovedInOn { get; init; }
    public DateOnly? MovedOutOn { get; init; }
    public DateOnly? PurchasedOn { get; init; }
    public decimal? PurchasePrice { get; init; }
    public string? Currency { get; init; }
    public string? Notes { get; init; }
    /// <summary>Things in the inventory there (not disposed).</summary>
    public int AssetCount { get; init; }
}

public class PropertyRequest
{
    [Required]
    [StringLength(200)]
    public string Name { get; init; } = string.Empty;

    [Required]
    public string Kind { get; init; } = string.Empty;

    [Required]
    public string Ownership { get; init; } = string.Empty;

    [StringLength(500)]
    public string? Address { get; init; }

    public DateOnly? MovedInOn { get; init; }
    public DateOnly? MovedOutOn { get; init; }
    public DateOnly? PurchasedOn { get; init; }
    public decimal? PurchasePrice { get; init; }
    public string? Currency { get; init; }

    [StringLength(2000)]
    public string? Notes { get; init; }
}

// ---- Assets (inventory) ----

public class AssetDto
{
    public int Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public int? PropertyId { get; init; }
    public string? PropertyName { get; init; }
    public string? Room { get; init; }
    public string? Brand { get; init; }
    public string? Model { get; init; }
    public string? SerialNumber { get; init; }
    public int Quantity { get; init; }
    public DateOnly? PurchasedOn { get; init; }
    public decimal? PurchasePrice { get; init; }
    public string? Currency { get; init; }
    public DateOnly? DisposedOn { get; init; }
    public string? DisposalKind { get; init; }
    public decimal? DisposalAmount { get; init; }
    public string? Notes { get; init; }
    public List<TagDto> Tags { get; init; } = [];
    /// <summary>The latest expiry among its warranties/AMCs (null: none).</summary>
    public DateOnly? CoveredUntil { get; init; }
}

public class AssetRequest
{
    [Required]
    [StringLength(200)]
    public string Name { get; init; } = string.Empty;

    public int? PropertyId { get; init; }

    [StringLength(100)]
    public string? Room { get; init; }

    [StringLength(100)]
    public string? Brand { get; init; }

    [StringLength(100)]
    public string? Model { get; init; }

    [StringLength(100)]
    public string? SerialNumber { get; init; }

    public int Quantity { get; init; } = 1;
    public DateOnly? PurchasedOn { get; init; }
    public decimal? PurchasePrice { get; init; }
    public string? Currency { get; init; }

    [StringLength(2000)]
    public string? Notes { get; init; }

    public List<int> TagIds { get; init; } = [];

    /// <summary>The user's local today: a purchase can't be in the future.</summary>
    public DateOnly Today { get; init; }
}

/// <summary>Selling, giving away, throwing out or losing something (null kind = it's back in the inventory).</summary>
public class DisposalRequest
{
    public string? Kind { get; init; }
    public DateOnly? On { get; init; }
    /// <summary>What it sold for (Sold only), in the item's currency.</summary>
    public decimal? Amount { get; init; }
    public string? Currency { get; init; }
    public DateOnly Today { get; init; }
}

// ---- Vehicles ----

public class VehicleDto
{
    public int Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public string Kind { get; init; } = string.Empty;
    public string? Make { get; init; }
    public string? Model { get; init; }
    public short? ModelYear { get; init; }
    public string? RegistrationNumber { get; init; }
    public DateOnly? PurchasedOn { get; init; }
    public decimal? PurchasePrice { get; init; }
    public string? Currency { get; init; }
    public int? InsurancePolicyId { get; init; }
    public string? InsurancePolicyName { get; init; }
    public DateOnly? InsuranceRenewsOn { get; init; }
    public DateOnly? InsuranceEndsOn { get; init; }
    public DateOnly? PucValidUntil { get; init; }
    public DateOnly? RegistrationValidUntil { get; init; }
    public int? ReminderDays { get; init; }
    public DateOnly? DisposedOn { get; init; }
    public string? DisposalKind { get; init; }
    public decimal? DisposalAmount { get; init; }
    public string? Notes { get; init; }
    /// <summary>The highest odometer reading logged with its maintenance (null: none).</summary>
    public int? OdometerKm { get; set; }
    /// <summary>Its maintenance task due soonest (not paused), with the computed day.</summary>
    public int? NextServiceTaskId { get; set; }
    public string? NextServiceTitle { get; set; }
    public DateOnly? NextServiceOn { get; set; }
    /// <summary>Litre / Kg / kWh.</summary>
    public string FuelUnit { get; init; } = "Litre";
    /// <summary>The overall mileage of the current run of fills (null until two fills; <see cref="FuelEconomy"/>).</summary>
    public FuelAverage? Mileage { get; set; }
    public int FuelFills { get; set; }
}

public class VehicleRequest
{
    [Required]
    [StringLength(200)]
    public string Name { get; init; } = string.Empty;

    [Required]
    public string Kind { get; init; } = string.Empty;

    [StringLength(100)]
    public string? Make { get; init; }

    [StringLength(100)]
    public string? Model { get; init; }

    public short? ModelYear { get; init; }

    [StringLength(20)]
    public string? RegistrationNumber { get; init; }

    public DateOnly? PurchasedOn { get; init; }
    public decimal? PurchasePrice { get; init; }
    public string? Currency { get; init; }
    public int? InsurancePolicyId { get; init; }
    public DateOnly? PucValidUntil { get; init; }
    public DateOnly? RegistrationValidUntil { get; init; }

    /// <summary>Remind this many days before the PUC / registration run out (null: no reminders).</summary>
    public int? ReminderDays { get; init; }

    /// <summary>Litre / Kg / kWh — what its fuel is measured in.</summary>
    public string FuelUnit { get; init; } = "Litre";

    [StringLength(2000)]
    public string? Notes { get; init; }

    public DateOnly Today { get; init; }

    /// <summary>The browser's IANA zone, for the reminders' 09:00 when Settings has none.</summary>
    [StringLength(100)]
    public string? TimeZone { get; init; }
}

// ---- Fuel ----

public class FuelLogDto
{
    public int Id { get; init; }
    public int VehicleId { get; init; }
    public DateOnly FilledOn { get; init; }
    public int OdometerKm { get; init; }
    public decimal Amount { get; init; }
    public string Currency { get; init; } = string.Empty;
    /// <summary>Given or worked out (whichever wasn't entered is computed — see <see cref="QuantityGiven"/>).</summary>
    public decimal PricePerUnit { get; set; }
    public decimal Quantity { get; set; }
    /// <summary>True: the quantity was entered; false: the price per unit was.</summary>
    public bool QuantityGiven { get; init; }
    public bool MissedFillBefore { get; init; }
    /// <summary>The Finance expense it was paid with (null: not in the ledger).</summary>
    public int? TransactionId { get; init; }
    public string? PaidFromAccountName { get; init; }
    public string? Notes { get; init; }
}

/// <summary>A vehicle's fuel log with everything computed from it.</summary>
public class FuelHistoryDto
{
    public int VehicleId { get; init; }
    public string FuelUnit { get; init; } = "Litre";
    /// <summary>Newest first.</summary>
    public List<FuelLogDto> Fills { get; init; } = [];
    public FuelAverage? Average { get; init; }
    /// <summary>The average after each fill, oldest first.</summary>
    public List<FuelTrendPoint> Trend { get; init; } = [];
    /// <summary>Spent per month and currency, latest first.</summary>
    public List<FuelMonth> Monthly { get; init; } = [];
}

public class FuelLogRequest
{
    public DateOnly FilledOn { get; init; }
    public int OdometerKm { get; init; }
    public decimal Amount { get; init; }

    [Required]
    public string Currency { get; init; } = string.Empty;

    /// <summary>The price per unit <b>or</b> the quantity — the other is worked out.</summary>
    public decimal? PricePerUnit { get; init; }
    public decimal? Quantity { get; init; }

    /// <summary>A fill before this one wasn't logged: the average starts again here.</summary>
    public bool MissedFillBefore { get; init; }

    [StringLength(500)]
    public string? Notes { get; init; }

    /// <summary>On create only: record it in Finance as one expense from this account.</summary>
    public FuelExpenseRequest? Expense { get; init; }

    public DateOnly Today { get; init; }
}

/// <summary>Recording a fill in Finance: the account and (as for any transaction) a rate when it isn't the base currency.</summary>
public class FuelExpenseRequest
{
    public int AccountId { get; init; }
    public decimal? ExchangeRate { get; init; }
    public List<int> TagIds { get; init; } = [];
}

// ---- Warranties ----

public class WarrantyDto
{
    public int Id { get; init; }
    public string Kind { get; init; } = string.Empty;
    /// <summary>Asset / Vehicle / Property.</summary>
    public string CoverType { get; init; } = string.Empty;
    public int CoverId { get; init; }
    public string CoverName { get; init; } = string.Empty;
    /// <summary>The covered asset or vehicle has been sold/given away/thrown out.</summary>
    public bool CoverDisposed { get; init; }
    public string? Provider { get; init; }
    public DateOnly? StartsOn { get; init; }
    public DateOnly ExpiresOn { get; init; }
    public decimal? Cost { get; init; }
    public string? Currency { get; init; }
    public int? ContactId { get; init; }
    public string? ContactName { get; init; }
    public int? ReminderDays { get; init; }
    public string? Notes { get; init; }
}

public class WarrantyRequest
{
    [Required]
    public string Kind { get; init; } = string.Empty;

    [Required]
    public string CoverType { get; init; } = string.Empty;

    public int CoverId { get; init; }

    [StringLength(200)]
    public string? Provider { get; init; }

    public DateOnly? StartsOn { get; init; }
    public DateOnly ExpiresOn { get; init; }
    public decimal? Cost { get; init; }
    public string? Currency { get; init; }
    public int? ContactId { get; init; }
    public int? ReminderDays { get; init; }

    [StringLength(2000)]
    public string? Notes { get; init; }

    [StringLength(100)]
    public string? TimeZone { get; init; }
}

// ---- Maintenance ----

public class MaintenanceTaskDto
{
    public int Id { get; init; }
    public string Title { get; init; } = string.Empty;
    /// <summary>Asset / Vehicle / Property, or null when it isn't about one thing.</summary>
    public string? TargetType { get; init; }
    public int? TargetId { get; init; }
    public string? TargetName { get; init; }
    public string RecurrenceFrequency { get; init; } = string.Empty;
    public int RecurrenceInterval { get; init; }
    public DateOnly FirstDueOn { get; init; }
    public bool IsPaused { get; init; }
    public int? ContactId { get; init; }
    public string? ContactName { get; init; }
    public int? ReminderDays { get; init; }
    public string? Notes { get; init; }
    public DateOnly? LastDoneOn { get; init; }
    public int TimesDone { get; init; }
    /// <summary>Computed: FirstDueOn until first done, then the last time + the interval.</summary>
    public DateOnly NextDueOn { get; set; }
}

public class MaintenanceTaskRequest
{
    [Required]
    [StringLength(200)]
    public string Title { get; init; } = string.Empty;

    public string? TargetType { get; init; }
    public int? TargetId { get; init; }

    [Required]
    public string RecurrenceFrequency { get; init; } = string.Empty;

    public int RecurrenceInterval { get; init; }
    public DateOnly FirstDueOn { get; init; }
    public bool IsPaused { get; init; }
    public int? ContactId { get; init; }
    public int? ReminderDays { get; init; }

    [StringLength(2000)]
    public string? Notes { get; init; }

    [StringLength(100)]
    public string? TimeZone { get; init; }
}

public class MaintenanceLogDto
{
    public int Id { get; init; }
    public int MaintenanceTaskId { get; init; }
    public DateOnly DoneOn { get; init; }
    public decimal? Cost { get; init; }
    public string? Currency { get; init; }
    public int? OdometerKm { get; init; }
    public int? TransactionId { get; init; }
    public string? Notes { get; init; }
}

/// <summary>"Done" on a maintenance task: one log, after which the next due day moves on.</summary>
public class MaintenanceDoneRequest
{
    public DateOnly DoneOn { get; init; }
    public decimal? Cost { get; init; }
    public string? Currency { get; init; }
    public int? OdometerKm { get; init; }

    [StringLength(2000)]
    public string? Notes { get; init; }

    public DateOnly Today { get; init; }

    [StringLength(100)]
    public string? TimeZone { get; init; }
}

// ---- Coming up ----

/// <summary>Something at home that needs attention soon: a warranty/PUC/registration running out, maintenance due.</summary>
public class HomeAgendaItemDto
{
    /// <summary>HomeAgendaKinds.</summary>
    public string Kind { get; init; } = string.Empty;
    /// <summary>What opening it opens (Warranty / Vehicle / MaintenanceTask).</summary>
    public string EntityType { get; init; } = string.Empty;
    public int EntityId { get; init; }
    /// <summary>The item's own name ("Fridge", "Swift", "Service the car").</summary>
    public string Title { get; init; } = string.Empty;
    /// <summary>When it runs out / is due.</summary>
    public DateOnly On { get; init; }
}

// ---- Utility bills ----

/// <summary>Matches CK_UtilityBills_Kind.</summary>
public static class BillKinds
{
    public static readonly IReadOnlySet<string> All = new HashSet<string>(
        ["Electricity", "Water", "Gas", "Internet", "Phone", "Maintenance", "Rent", "Other"], StringComparer.Ordinal);
}

public class UtilityBillDto
{
    public int Id { get; init; }
    public int? PropertyId { get; init; }
    public string? PropertyName { get; init; }
    public string Kind { get; init; } = string.Empty;
    public string? Provider { get; init; }
    public DateOnly? PeriodStart { get; init; }
    public DateOnly? PeriodEnd { get; init; }
    public DateOnly DueOn { get; init; }
    public decimal Amount { get; init; }
    public string Currency { get; init; } = string.Empty;
    public decimal? UnitsUsed { get; init; }
    public DateOnly? PaidOn { get; init; }
    /// <summary>The Finance expense it was paid with (null: paid outside the ledger, or not paid).</summary>
    public int? TransactionId { get; init; }
    public string? PaidFromAccountName { get; init; }
    public string? Notes { get; init; }
}

public class UtilityBillRequest
{
    public int? PropertyId { get; init; }

    [Required]
    public string Kind { get; init; } = string.Empty;

    [StringLength(200)]
    public string? Provider { get; init; }

    public DateOnly? PeriodStart { get; init; }
    public DateOnly? PeriodEnd { get; init; }
    public DateOnly DueOn { get; init; }
    public decimal Amount { get; init; }

    [Required]
    public string Currency { get; init; } = string.Empty;

    public decimal? UnitsUsed { get; init; }

    [StringLength(2000)]
    public string? Notes { get; init; }
}

/// <summary>Paying a bill: the day and, to record it in Finance, the account it was paid from.</summary>
public class BillPaidRequest
{
    public DateOnly PaidOn { get; init; }

    /// <summary>Null: paid, but not recorded in Finance.</summary>
    public int? AccountId { get; init; }

    /// <summary>Only when the bill's currency isn't the base currency (as for any transaction).</summary>
    public decimal? ExchangeRate { get; init; }

    /// <summary>Categories for the expense.</summary>
    public List<int> TagIds { get; init; } = [];

    public DateOnly Today { get; init; }
}

// ---- Household projects ----

/// <summary>Money in one currency.</summary>
public class MoneyDto
{
    public string Currency { get; init; } = string.Empty;
    public decimal Amount { get; init; }
}

public class HouseholdProjectDto
{
    public int Id { get; init; }
    public int ProjectId { get; init; }
    public string Name { get; init; } = string.Empty;
    /// <summary>The tasks project's status (Active / Completed / Archived).</summary>
    public string Status { get; init; } = string.Empty;
    public string? Description { get; init; }
    public int? PropertyId { get; init; }
    public string? PropertyName { get; init; }
    public decimal? Budget { get; init; }
    public string? Currency { get; init; }
    public int OpenTasks { get; init; }
    public int DoneTasks { get; init; }
    /// <summary>Expenses linked to the project, per currency (computed).</summary>
    public List<MoneyDto> Spent { get; set; } = [];
    /// <summary>Spent in the budget's currency as a % of the budget (null without a budget); may pass 100.</summary>
    public int? BudgetPercent { get; set; }
}

public class HouseholdProjectRequest
{
    [Required]
    [StringLength(200)]
    public string Name { get; init; } = string.Empty;

    [StringLength(4000)]
    public string? Description { get; init; }

    /// <summary>Active / Completed / Archived (the tasks project's status).</summary>
    public string Status { get; init; } = "Active";

    public int? PropertyId { get; init; }
    public decimal? Budget { get; init; }
    public string? Currency { get; init; }
}
