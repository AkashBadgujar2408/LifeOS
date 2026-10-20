using System.ComponentModel.DataAnnotations;
using LifeOS.Core.Finance.Services;
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
    /// <summary>The balance in the base currency at the exchange-rate master's rate (null: no rate yet; same as Balance in the base currency).</summary>
    public decimal? BalanceInBase { get; set; }
    /// <summary>The latest day money moved in or out (null: never).</summary>
    public DateOnly? LastOn { get; set; }
    /// <summary>Every currency the account holds with its balance — the main one first (one entry for a single-currency account).</summary>
    public List<AccountCurrencyBalanceDto> Balances { get; set; } = [];
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

    /// <summary>The other currencies it holds (PayPal, Wise); replaced as a whole on save. Empty: single-currency.</summary>
    public List<AccountCurrencyRequest> ExtraCurrencies { get; init; } = [];
}

public class AccountCurrencyBalanceDto
{
    public string Currency { get; init; } = string.Empty;
    public decimal OpeningBalance { get; init; }
    public decimal Balance { get; init; }
    /// <summary>In the base currency at the rate master's rate (null: no rate yet).</summary>
    public decimal? BalanceInBase { get; init; }
}

/// <summary>An extra currency a multi-currency account holds, and what it opened with on the account's opening date.</summary>
public class AccountCurrencyRequest
{
    [Required]
    public string Currency { get; init; } = string.Empty;

    public decimal OpeningBalance { get; init; }
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

    /// <summary>On a multi-currency account: the currency it moved in (null = the account's main one).</summary>
    [StringLength(3)]
    public string? Currency { get; init; }

    /// <summary>A transfer into a multi-currency account: the currency that arrived (null = as it left, if held).</summary>
    [StringLength(3)]
    public string? ToCurrency { get; init; }

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

// ---- Repeating transactions ----

public class RecurringTransactionDto
{
    public int Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public string Kind { get; init; } = string.Empty;
    public decimal Amount { get; init; }
    public string Currency { get; init; } = string.Empty;
    public decimal? ExchangeRate { get; init; }
    public decimal? ToAmount { get; init; }
    public int? FromAccountId { get; init; }
    public string? FromAccountName { get; init; }
    public int? ToAccountId { get; init; }
    public string? ToAccountName { get; init; }
    public string? ToCurrency { get; init; }
    public string? Payee { get; init; }
    public string? Note { get; init; }
    public string RecurrenceFrequency { get; init; } = string.Empty;
    public int RecurrenceInterval { get; init; }
    public DateOnly StartDate { get; init; }
    public DateOnly? Until { get; init; }
    /// <summary>The last day already written into the ledger (null: nothing yet).</summary>
    public DateOnly? GeneratedThrough { get; init; }
    public bool IsPaused { get; init; }
    /// <summary>The next day it will write a transaction (null: finished).</summary>
    public DateOnly? NextOn { get; set; }
    public int GeneratedCount { get; init; }
    public List<TagDto> Tags { get; init; } = [];
}

public class RecurringTransactionRequest
{
    [Required]
    [StringLength(200)]
    public string Name { get; init; } = string.Empty;

    [Required]
    public string Kind { get; init; } = string.Empty;

    public decimal Amount { get; init; }

    public decimal? ExchangeRate { get; init; }

    public decimal? ToAmount { get; init; }

    /// <summary>On a multi-currency account: the currency it moves in (null = the account's main one).</summary>
    [StringLength(3)]
    public string? Currency { get; init; }

    /// <summary>A transfer into a multi-currency account: the currency that arrives.</summary>
    [StringLength(3)]
    public string? ToCurrency { get; init; }

    public int? FromAccountId { get; init; }

    public int? ToAccountId { get; init; }

    [StringLength(200)]
    public string? Payee { get; init; }

    [StringLength(1000)]
    public string? Note { get; init; }

    [Required]
    public string RecurrenceFrequency { get; init; } = string.Empty;

    public int RecurrenceInterval { get; init; } = 1;

    public DateOnly StartDate { get; init; }

    public DateOnly? Until { get; init; }

    public bool IsPaused { get; init; }

    [Required]
    public List<int> TagIds { get; init; } = [];

    /// <summary>The client's today: resuming a paused schedule carries on from here instead of catching up.</summary>
    public DateOnly Today { get; init; }
}

public class GenerateRequest
{
    public DateOnly Today { get; init; }
}

// ---- Budgets ----

/// <summary>A month's budgets against spending, and the month's totals, in the base currency.</summary>
public class MonthSummaryDto
{
    public DateOnly MonthStart { get; init; }
    /// <summary>The base currency (null: none chosen, so nothing could be compared).</summary>
    public string? Currency { get; init; }
    public decimal Income { get; init; }
    public decimal Spending { get; init; }
    public decimal UntaggedSpending { get; init; }
    public int Unconverted { get; init; }
    /// <summary>Budgeted tags first (fullest first), then tags spent on without a budget (biggest first).</summary>
    public List<BudgetLineDto> Lines { get; init; } = [];
}

public class BudgetLineDto
{
    public int TagId { get; init; }
    public string TagName { get; init; } = string.Empty;
    public decimal? Budget { get; init; }
    public string? BudgetCurrency { get; init; }
    public decimal Spent { get; init; }
    public int TransactionCount { get; init; }
    public int Unconverted { get; init; }
    /// <summary>Budget − spent (negative when over); null without a comparable budget.</summary>
    public decimal? Remaining { get; init; }
    /// <summary>Spent as a whole % of the budget (can pass 100); null without a comparable budget.</summary>
    public int? PercentUsed { get; init; }
    public bool IsOver { get; init; }
}

public class BudgetRequest
{
    /// <summary>The month's budget for the tag; null removes it.</summary>
    public decimal? Amount { get; init; }
}

// ---- Investments ----

/// <summary>Matches CK_Holdings_Kind.</summary>
public static class HoldingKinds
{
    public static readonly IReadOnlySet<string> All = new HashSet<string>(
        ["Stock", "MutualFund", "Gold", "PPF", "FD", "Bond", "Crypto", "Property", "Other"], StringComparer.Ordinal);
}

public class HoldingDto
{
    public int Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public string Kind { get; init; } = string.Empty;
    public string Currency { get; init; } = string.Empty;
    public decimal? Units { get; init; }
    public decimal? InvestedAmount { get; init; }
    public decimal? InterestRate { get; init; }
    public DateOnly? AcquiredOn { get; init; }
    public DateOnly? MaturesOn { get; init; }
    public DateOnly? DisposedOn { get; init; }
    public int? AccountId { get; init; }
    public string? AccountName { get; init; }
    public string? Notes { get; init; }
    /// <summary>Worth at the end of the day asked for: the latest valuation, else what was put in (null once disposed).</summary>
    public decimal? CurrentValue { get; set; }
    /// <summary>Current value − invested (null when either is unknown).</summary>
    public decimal? Gain { get; set; }
    /// <summary>Newest first.</summary>
    public List<HoldingValuationDto> Valuations { get; init; } = [];
}

public class HoldingValuationDto
{
    public int Id { get; init; }
    public DateOnly ValuedOn { get; init; }
    public decimal Value { get; init; }
    public string? Note { get; init; }
}

public class HoldingRequest
{
    [Required]
    [StringLength(200)]
    public string Name { get; init; } = string.Empty;

    [Required]
    public string Kind { get; init; } = string.Empty;

    [Required]
    public string Currency { get; init; } = string.Empty;

    public decimal? Units { get; init; }
    public decimal? InvestedAmount { get; init; }
    public decimal? InterestRate { get; init; }
    public DateOnly? AcquiredOn { get; init; }
    public DateOnly? MaturesOn { get; init; }
    public DateOnly? DisposedOn { get; init; }
    public int? AccountId { get; init; }

    [StringLength(2000)]
    public string? Notes { get; init; }

    public DateOnly Today { get; init; }
}

public class HoldingValuationRequest
{
    public DateOnly ValuedOn { get; init; }
    public decimal Value { get; init; }

    [StringLength(1000)]
    public string? Note { get; init; }

    public DateOnly Today { get; init; }
}

// ---- Loans ----

/// <summary>Matches CK_Loans_Kind / CK_Loans_Direction.</summary>
public static class LoanKinds
{
    public static readonly IReadOnlySet<string> All = new HashSet<string>(
        ["Home", "Vehicle", "Personal", "Education", "Gold", "CreditCard", "Other"], StringComparer.Ordinal);

    public const string Borrowed = "Borrowed";
    public const string Lent = "Lent";
}

public class LoanDto
{
    public int Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public string Kind { get; init; } = string.Empty;
    public string Direction { get; init; } = string.Empty;
    public string? Counterparty { get; init; }
    public int? ContactId { get; init; }
    public string? ContactName { get; init; }
    public decimal Principal { get; init; }
    public string Currency { get; init; } = string.Empty;
    public decimal AnnualRate { get; init; }
    public int? TermMonths { get; init; }
    public DateOnly StartDate { get; init; }
    /// <summary>The lender's own instalment, if given (else <see cref="Emi"/> is computed).</summary>
    public decimal? EmiAmount { get; init; }
    public int? AccountId { get; init; }
    public string? AccountName { get; init; }
    public DateOnly? ClosedOn { get; init; }
    public string? Notes { get; init; }
    /// <summary>Emi (a fixed monthly instalment over a term) or Flexible (pay as you go).</summary>
    public string RepaymentKind { get; init; } = LoanLedger.Emi;
    /// <summary>EMI only: instalments due on or before this day count as paid.</summary>
    public DateOnly? AssumedPaidThrough { get; init; }
    /// <summary>The transaction that recorded the money at the start (null: not in Finance).</summary>
    public int? DisbursementTransactionId { get; set; }
    public string? DisbursementAccountName { get; set; }
    /// <summary>Still owed at the end of the day asked for, from the payments actually made (<see cref="LoanLedger"/>).</summary>
    public decimal Outstanding { get; set; }
    /// <summary>Interest charged and not yet paid (part of <see cref="Outstanding"/>).</summary>
    public decimal InterestDue { get; set; }
    /// <summary>Interest charged so far.</summary>
    public decimal InterestCharged { get; set; }
    /// <summary>Paid back so far (recorded payments, plus instalments taken as paid).</summary>
    public decimal Repaid { get; set; }
    public int PaymentCount { get; set; }
    public DateOnly? LastPaidOn { get; set; }
    // ---- EMI loans only (null for a flexible loan) ----
    /// <summary>The monthly instalment the schedule uses.</summary>
    public decimal? Emi { get; set; }
    /// <summary>What the schedule says is owed today if every instalment due was paid on time.</summary>
    public decimal? ScheduledOutstanding { get; set; }
    /// <summary>Outstanding − scheduled: above zero = behind (owed more than planned), below = ahead.</summary>
    public decimal? Behind { get; set; }
    public int? InstalmentsDue { get; set; }
    public int? InstalmentCount { get; set; }
    public DateOnly? NextDueOn { get; set; }
    public DateOnly? LastDueOn { get; set; }
    public decimal? TotalInterest { get; set; }
}

/// <summary>A payment on a loan (a transaction with its LoanId), and how it split.</summary>
public class LoanPaymentDto
{
    public int TransactionId { get; init; }
    public DateOnly PaidOn { get; init; }
    /// <summary>In the loan's currency; negative = more drawn on the loan.</summary>
    public decimal Amount { get; init; }
    public decimal Interest { get; init; }
    public decimal Principal { get; init; }
    public string? AccountName { get; init; }
    public string? Note { get; init; }
    /// <summary>Paid on or before the "paid up to" day — it was already counted by the schedule.</summary>
    public bool CoveredBySchedule { get; init; }
}

/// <summary>Recording money for a loan in Finance: the account, and a rate when the loan isn't in the base currency.</summary>
public class LoanMoneyRequest
{
    public int AccountId { get; init; }
    public decimal? ExchangeRate { get; init; }
    public List<int> TagIds { get; init; } = [];
}

/// <summary>A repayment: the day, how much (in the loan's currency) and the account it left from / arrived in.</summary>
public class LoanPaymentRequest
{
    public DateOnly PaidOn { get; init; }
    public decimal Amount { get; init; }
    public int AccountId { get; init; }
    public decimal? ExchangeRate { get; init; }
    public List<int> TagIds { get; init; } = [];

    [StringLength(500)]
    public string? Note { get; init; }

    public DateOnly Today { get; init; }
}

public class LoanInstalmentDto
{
    public int Number { get; init; }
    public DateOnly DueOn { get; init; }
    public decimal Payment { get; init; }
    public decimal Interest { get; init; }
    public decimal Principal { get; init; }
    public decimal Balance { get; init; }
}

public class LoanDetailDto
{
    public LoanDto Loan { get; init; } = new();
    /// <summary>EMI loans only (empty for a flexible loan).</summary>
    public List<LoanInstalmentDto> Schedule { get; init; } = [];
    /// <summary>Newest first.</summary>
    public List<LoanPaymentDto> Payments { get; init; } = [];
}

public class LoanRequest
{
    [Required]
    [StringLength(200)]
    public string Name { get; init; } = string.Empty;

    [Required]
    public string Kind { get; init; } = string.Empty;

    [Required]
    public string Direction { get; init; } = string.Empty;

    [StringLength(200)]
    public string? Counterparty { get; init; }

    public int? ContactId { get; init; }
    public decimal Principal { get; init; }

    [Required]
    public string Currency { get; init; } = string.Empty;

    public decimal AnnualRate { get; init; }
    /// <summary>EMI only: the term (null for a flexible loan).</summary>
    public int? TermMonths { get; init; }
    public DateOnly StartDate { get; init; }
    public decimal? EmiAmount { get; init; }
    public int? AccountId { get; init; }
    public DateOnly? ClosedOn { get; init; }

    /// <summary>Emi / Flexible.</summary>
    public string RepaymentKind { get; init; } = LoanLedger.Emi;

    /// <summary>EMI only: instalments due on or before this day were paid (an older loan you don't want to type in).</summary>
    public DateOnly? AssumedPaidThrough { get; init; }

    /// <summary>On create only: record the money that changed hands at the start (borrowed: in, lent: out).</summary>
    public LoanMoneyRequest? Disbursement { get; init; }

    [StringLength(2000)]
    public string? Notes { get; init; }

    public DateOnly Today { get; init; }
}

// ---- Net worth + savings goals ----

public class WealthItemDto
{
    /// <summary>FinanceAccount / Holding / Loan.</summary>
    public string Type { get; init; } = string.Empty;
    public int Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public string Currency { get; init; } = string.Empty;
    /// <summary>In its own currency: positive = an asset, negative = owed.</summary>
    public decimal Amount { get; init; }
    /// <summary>In the base currency (null: no rate for its currency yet, so not counted).</summary>
    public decimal? InBase { get; init; }
}

public class NetWorthPointDto
{
    public DateOnly Day { get; init; }
    public decimal Assets { get; init; }
    public decimal Liabilities { get; init; }
    public decimal Net { get; init; }
}

public class NetWorthDto
{
    /// <summary>The base currency (null: none chosen — nothing else is filled).</summary>
    public string? Currency { get; init; }
    public DateOnly Day { get; init; }
    public decimal Assets { get; init; }
    public decimal Liabilities { get; init; }
    public decimal Net { get; init; }
    public List<WealthItemDto> Items { get; init; } = [];
    /// <summary>Month ends, oldest first, then today.</summary>
    public List<NetWorthPointDto> History { get; init; } = [];
}

/// <summary>A savings goal's progress: the accounts and investments linked to it, against its target.</summary>
public class SavingsProgressDto
{
    public decimal TargetAmount { get; init; }
    public string TargetCurrency { get; init; } = string.Empty;
    public decimal Saved { get; init; }
    /// <summary>Whole %, capped at 100.</summary>
    public int Percent { get; init; }
    public List<WealthItemDto> Items { get; init; } = [];
}

// ---- Exchange-rate master ----

/// <summary>"1 Currency = Rate BaseCurrency from EffectiveOn".</summary>
public class ExchangeRateDto
{
    public int Id { get; init; }
    public string Currency { get; init; } = string.Empty;
    public string BaseCurrency { get; init; } = string.Empty;
    public decimal Rate { get; init; }
    public DateOnly EffectiveOn { get; init; }
}

public class ExchangeRateRequest
{
    [Required]
    public string Currency { get; init; } = string.Empty;

    public decimal Rate { get; init; }

    public DateOnly EffectiveOn { get; init; }

    public DateOnly Today { get; init; }
}
