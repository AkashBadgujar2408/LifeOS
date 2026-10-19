using System.ComponentModel.DataAnnotations;

namespace LifeOS.Core.Finance.DTOs;

/// <summary>Matches CK_InsurancePolicies_Kind / CK_InsurancePolicies_PremiumFrequency.</summary>
public static class PolicyKinds
{
    public static readonly IReadOnlySet<string> All = new HashSet<string>(
        ["Life", "Health", "Vehicle", "Home", "Travel", "Other"], StringComparer.Ordinal);

    public const string Single = "Single";

    /// <summary>Premiums a year for each frequency (Single = paid once, so none a year).</summary>
    public static readonly IReadOnlyDictionary<string, int> PerYear = new Dictionary<string, int>(StringComparer.Ordinal)
    {
        ["Monthly"] = 12, ["Quarterly"] = 4, ["HalfYearly"] = 2, ["Yearly"] = 1, [Single] = 0,
    };
}

/// <summary>Matches CK_TaxItems_Kind.</summary>
public static class TaxItemKinds
{
    public static readonly IReadOnlySet<string> All = new HashSet<string>(
        ["Deadline", "Deduction", "Payment", "Document", "Other"], StringComparer.Ordinal);
}

// ---- Insurance ----

public class InsurancePolicyDto
{
    public int Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public string Kind { get; init; } = string.Empty;
    public string? Insurer { get; init; }
    public string? PolicyNumberLast4 { get; init; }
    public string Currency { get; init; } = string.Empty;
    public decimal? SumAssured { get; init; }
    public decimal? Premium { get; init; }
    public string? PremiumFrequency { get; init; }
    public DateOnly? StartDate { get; init; }
    public DateOnly? RenewsOn { get; init; }
    public DateOnly? EndsOn { get; init; }
    public int? ContactId { get; init; }
    public string? ContactName { get; init; }
    public string? Notes { get; init; }
    public int? RenewalReminderDays { get; init; }
    /// <summary>The premium over a year (null: no premium, or paid once).</summary>
    public decimal? AnnualPremium { get; set; }
}

public class InsurancePolicyRequest
{
    [Required]
    [StringLength(200)]
    public string Name { get; init; } = string.Empty;

    [Required]
    public string Kind { get; init; } = string.Empty;

    [StringLength(200)]
    public string? Insurer { get; init; }

    /// <summary>Whatever was typed; only the last 4 letters/digits are kept.</summary>
    [StringLength(100)]
    public string? Number { get; init; }

    [Required]
    public string Currency { get; init; } = string.Empty;

    public decimal? SumAssured { get; init; }
    public decimal? Premium { get; init; }
    public string? PremiumFrequency { get; init; }
    public DateOnly? StartDate { get; init; }
    public DateOnly? RenewsOn { get; init; }
    public DateOnly? EndsOn { get; init; }
    public int? ContactId { get; init; }

    [StringLength(2000)]
    public string? Notes { get; init; }

    /// <summary>Remind this many days before RenewsOn (null: no reminder).</summary>
    public int? RenewalReminderDays { get; init; }

    /// <summary>The browser's IANA zone, used for the reminder's 09:00 when Settings has none.</summary>
    [StringLength(100)]
    public string? TimeZone { get; init; }
}

// ---- Tax ----

public class TaxItemDto
{
    public int Id { get; init; }
    public string Title { get; init; } = string.Empty;
    public string Kind { get; init; } = string.Empty;
    public string? TaxYear { get; init; }
    public DateOnly? DueOn { get; init; }
    public decimal? Amount { get; init; }
    public string? Currency { get; init; }
    public bool IsDeductible { get; init; }
    public int? TransactionId { get; init; }
    /// <summary>"14/Oct/2026 · LIC · 25,000.00 INR"-style parts of the transaction it's about.</summary>
    public DateOnly? TransactionOn { get; init; }
    public string? TransactionPayee { get; init; }
    public decimal? TransactionAmount { get; init; }
    public string? TransactionCurrency { get; init; }
    public DateOnly? DoneOn { get; init; }
    public string? Notes { get; init; }
}

public class TaxItemRequest
{
    [Required]
    [StringLength(200)]
    public string Title { get; init; } = string.Empty;

    [Required]
    public string Kind { get; init; } = string.Empty;

    [StringLength(20)]
    public string? TaxYear { get; init; }

    public DateOnly? DueOn { get; init; }
    public decimal? Amount { get; init; }
    public string? Currency { get; init; }
    public bool IsDeductible { get; init; }
    public int? TransactionId { get; init; }
    public DateOnly? DoneOn { get; init; }

    [StringLength(2000)]
    public string? Notes { get; init; }

    public DateOnly Today { get; init; }
}

public class TaxItemDoneRequest
{
    /// <summary>The day it was handled; null reopens it.</summary>
    public DateOnly? DoneOn { get; init; }

    public DateOnly Today { get; init; }
}

// ---- Statement import ----

/// <summary>One line of a bank statement as the client read it: + money in, − money out.</summary>
public class ImportLineRequest
{
    public DateOnly OccurredOn { get; init; }
    public decimal Amount { get; init; }

    [StringLength(1000)]
    public string? Description { get; init; }

    [StringLength(1000)]
    public string? Reference { get; init; }
}

public class ImportRequest
{
    public int AccountId { get; init; }

    [Required]
    public List<ImportLineRequest> Lines { get; init; } = [];

    /// <summary>Tags given to every imported transaction (e.g. "Imported Oct 2026").</summary>
    public List<int> TagIds { get; init; } = [];
}

/// <summary>Matches what <see cref="ImportLineResultDto.Status"/> can be.</summary>
public static class ImportLineStatuses
{
    public const string New = "New";
    public const string Duplicate = "Duplicate";
    public const string Error = "Error";
}

public class ImportLineResultDto
{
    /// <summary>The line's position in the request (0-based).</summary>
    public int Index { get; init; }
    public string Status { get; init; } = string.Empty;
    public string? Error { get; init; }
}

public class ImportResultDto
{
    /// <summary>How many were written (0 for a preview, or when any line had an error — an import is all or nothing).</summary>
    public int Added { get; init; }
    public int New { get; init; }
    public int Duplicates { get; init; }
    public int Errors { get; init; }
    public List<ImportLineResultDto> Lines { get; init; } = [];
}

// ---- Reports ----

public class CashFlowMonthDto
{
    public DateOnly MonthStart { get; init; }
    public decimal Income { get; init; }
    public decimal Spending { get; init; }
    public decimal Net { get; init; }
    /// <summary>(income − spending) ÷ income as a %, one decimal; null without income.</summary>
    public decimal? SavingsRate { get; init; }
    public int Unconverted { get; init; }
}

public class CashFlowTagDto
{
    public int TagId { get; init; }
    public string TagName { get; init; } = string.Empty;
    public decimal Spent { get; init; }
    public int TransactionCount { get; init; }
}

public class CashFlowReportDto
{
    /// <summary>The base currency everything is in (null: none chosen yet — the report is empty).</summary>
    public string? Currency { get; init; }
    public List<CashFlowMonthDto> Months { get; init; } = [];
    public CashFlowMonthDto Total { get; init; } = new();
    public List<CashFlowTagDto> Tags { get; init; } = [];
    public decimal UntaggedSpending { get; init; }
}
