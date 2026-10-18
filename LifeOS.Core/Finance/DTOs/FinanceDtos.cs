using System.ComponentModel.DataAnnotations;
using LifeOS.Core.Shared.DTOs;

namespace LifeOS.Core.Finance.DTOs;

/// <summary>Matches CK_Accounts_Kind.</summary>
public static class AccountKinds
{
    public const string Bank = "Bank";
    public const string Cash = "Cash";
    public const string Wallet = "Wallet";
    public const string Card = "Card";

    public static readonly IReadOnlySet<string> All = new HashSet<string>([Bank, Cash, Wallet, Card], StringComparer.Ordinal);
}

/// <summary>Matches CK_Transactions_Kind (and CK_RecurringTransactions_Kind).</summary>
public static class TransactionKinds
{
    public const string Income = "Income";
    public const string Expense = "Expense";
    public const string Transfer = "Transfer";

    public static readonly IReadOnlySet<string> All = new HashSet<string>([Income, Expense, Transfer], StringComparer.Ordinal);
}

// ---- Accounts ----

public class AccountDto
{
    public int Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public string Kind { get; init; } = string.Empty;
    public string? Institution { get; init; }
    public string? NumberLast4 { get; init; }
    public string Currency { get; init; } = string.Empty;
    public decimal OpeningBalance { get; init; }
    public DateOnly OpeningDate { get; init; }
    public bool IsArchived { get; init; }
    public string? Notes { get; init; }
    /// <summary>What it held at the end of the day asked for (opening balance + money in − money out), never stored.</summary>
    public decimal Balance { get; set; }
    public int TransactionCount { get; set; }
    /// <summary>The latest day money moved in or out (null: never).</summary>
    public DateOnly? LastOn { get; set; }
}

public class AccountRequest
{
    [Required]
    [StringLength(200)]
    public string Name { get; init; } = string.Empty;

    [Required]
    public string Kind { get; init; } = string.Empty;

    [StringLength(200)]
    public string? Institution { get; init; }

    /// <summary>Whatever was typed; only its last 4 letters/digits are kept.</summary>
    [StringLength(100)]
    public string? Number { get; init; }

    [Required]
    public string Currency { get; init; } = string.Empty;

    public decimal OpeningBalance { get; init; }

    public DateOnly OpeningDate { get; init; }

    public bool IsArchived { get; init; }

    [StringLength(2000)]
    public string? Notes { get; init; }
}

// ---- Transactions ----

public class TransactionDto
{
    public int Id { get; init; }
    public string Kind { get; init; } = string.Empty;
    public DateOnly OccurredOn { get; init; }
    /// <summary>In <see cref="Currency"/>, the moving account's currency (From for expense/transfer, To for income).</summary>
    public decimal Amount { get; init; }
    public string Currency { get; init; } = string.Empty;
    /// <summary>Base-currency units per 1 <see cref="Currency"/>; null when it is the base currency.</summary>
    public decimal? ExchangeRate { get; init; }
    /// <summary>A cross-currency transfer: what arrived, in <see cref="ToCurrency"/>.</summary>
    public decimal? ToAmount { get; init; }
    public int? FromAccountId { get; init; }
    public string? FromAccountName { get; init; }
    public int? ToAccountId { get; init; }
    public string? ToAccountName { get; init; }
    public string? ToCurrency { get; init; }
    public string? Payee { get; init; }
    public string? Note { get; init; }
    public string? Reference { get; init; }
    public int? EmploymentId { get; init; }
    /// <summary>"Senior Developer at Acme".</summary>
    public string? EmploymentTitle { get; init; }
    public int? SideIncomeSourceId { get; init; }
    public string? SideIncomeName { get; init; }
    public int? RecurringTransactionId { get; init; }
    public string? RecurringName { get; init; }
    public List<TagDto> Tags { get; init; } = [];
}

public class TransactionRequest
{
    [Required]
    public string Kind { get; init; } = string.Empty;

    public DateOnly OccurredOn { get; init; }

    public decimal Amount { get; init; }

    public decimal? ExchangeRate { get; init; }

    public decimal? ToAmount { get; init; }

    public int? FromAccountId { get; init; }

    public int? ToAccountId { get; init; }

    [StringLength(200)]
    public string? Payee { get; init; }

    [StringLength(1000)]
    public string? Note { get; init; }

    [StringLength(100)]
    public string? Reference { get; init; }

    public int? EmploymentId { get; init; }

    public int? SideIncomeSourceId { get; init; }

    /// <summary>Replaces the transaction's tags as a whole.</summary>
    [Required]
    public List<int> TagIds { get; init; } = [];
}

/// <summary>A filtered ledger: the transactions (newest first) and what they add up to in the base currency.</summary>
public class LedgerDto
{
    public List<TransactionDto> Transactions { get; init; } = [];
    public LedgerTotalsDto Totals { get; init; } = new();
}

public class LedgerTotalsDto
{
    /// <summary>The currency the totals are in (the user's base currency; null when none is chosen).</summary>
    public string? Currency { get; init; }
    public decimal Income { get; init; }
    public decimal Spending { get; init; }
    /// <summary>Income − spending. Transfers move money between your own accounts, so they count in neither.</summary>
    public decimal Net { get; init; }
    /// <summary>Incomes/expenses left out because they're in another currency with no rate (e.g. after the base changed).</summary>
    public int Unconverted { get; init; }
}
