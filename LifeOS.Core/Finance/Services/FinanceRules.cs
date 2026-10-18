using System.Globalization;
using LifeOS.Core.Finance.DTOs;

namespace LifeOS.Core.Finance.Services;

/// <summary>What the rules need to know about an account a transaction moves money in or out of.</summary>
public sealed record LedgerAccount(int Id, string Currency, DateOnly OpeningDate, bool IsArchived);

/// <summary>A transaction as typed, before it's checked.</summary>
public sealed record TransactionInput(
    string Kind,
    DateOnly OccurredOn,
    decimal Amount,
    decimal? ExchangeRate,
    decimal? ToAmount,
    LedgerAccount? From,
    LedgerAccount? To,
    bool HasIncomeSource);

/// <summary>What gets stored once a transaction passes: its currency, and the rate/arrived amount cleaned up.</summary>
public sealed record CheckedTransaction(string Currency, decimal? ExchangeRate, decimal? ToAmount);

/// <summary>One income/expense/transfer for the ledger totals.</summary>
public sealed record LedgerLine(string Kind, decimal Amount, string Currency, decimal? ExchangeRate);

/// <summary>
/// Finance's rules, mirroring the CHECKs in 12_finance.sql (so a refusal reads as a sentence) plus the ones the
/// database can't know: currencies, opening dates, archived accounts. Pure and unit-tested.
/// </summary>
public static class FinanceRules
{
    /// <summary>The biggest amount DECIMAL(19,4) holds comfortably (15 digits before the point).</summary>
    public const decimal MaxAmount = 999_999_999_999_999m;

    /// <summary>
    /// Checks a transaction. Income lands in To, an expense leaves From, a transfer needs both (different).
    /// The amount is in the moving account's currency (From, else To); a transfer into an account in another
    /// currency needs what arrived (ToAmount), otherwise ToAmount is dropped. Anything not in the base currency
    /// needs a rate to it — except a transfer into a base-currency account, whose rate is what arrived ÷ what left.
    /// Nothing before an account's opening date; nothing new on an archived account (<paramref name="keptAccountIds"/>
    /// are the accounts the transaction was already on, which may stay archived).
    /// </summary>
    public static (CheckedTransaction? Ok, string? Error) CheckTransaction(
        TransactionInput t, string baseCurrency, IReadOnlySet<int> keptAccountIds)
    {
        if (!TransactionKinds.All.Contains(t.Kind))
        {
            return (null, "Unknown kind of transaction.");
        }

        if (t.OccurredOn == default)
        {
            return (null, "Say which day it happened.");
        }

        if (t.Amount <= 0)
        {
            return (null, "The amount has to be more than zero.");
        }

        if (t.Amount > MaxAmount || t.ToAmount > MaxAmount)
        {
            return (null, "That amount is too large.");
        }

        var accountError = t.Kind switch
        {
            TransactionKinds.Income when t.To is null => "Choose the account the money went into.",
            TransactionKinds.Income when t.From is not null => "Income goes into an account — it doesn't leave one.",
            TransactionKinds.Expense when t.From is null => "Choose the account the money came out of.",
            TransactionKinds.Expense when t.To is not null => "An expense leaves an account — use a transfer to move money between yours.",
            TransactionKinds.Transfer when t.From is null || t.To is null => "A transfer needs the account it left and the one it went into.",
            TransactionKinds.Transfer when t.From!.Id == t.To!.Id => "A transfer has to go to a different account.",
            _ => null,
        };
        if (accountError is not null)
        {
            return (null, accountError);
        }

        if (t.HasIncomeSource && t.Kind != TransactionKinds.Income)
        {
            return (null, "Only income can be salary or side income.");
        }

        foreach (var account in new[] { t.From, t.To }.OfType<LedgerAccount>())
        {
            if (t.OccurredOn < account.OpeningDate)
            {
                return (null, "That's before the account's opening date — move the opening date back first.");
            }

            if (account.IsArchived && !keptAccountIds.Contains(account.Id))
            {
                return (null, "That account is archived — unarchive it to add to it.");
            }
        }

        var currency = (t.From ?? t.To)!.Currency;
        decimal? toAmount = null;
        if (t.Kind == TransactionKinds.Transfer && t.To!.Currency != currency)
        {
            if (t.ToAmount is not { } arrived || arrived <= 0)
            {
                return (null, $"Say how much arrived in {t.To.Currency}.");
            }

            toAmount = arrived;
        }

        decimal? rate = null;
        if (currency != baseCurrency)
        {
            if (toAmount is { } arrived && t.To!.Currency == baseCurrency)
            {
                rate = Math.Round(arrived / t.Amount, 8, MidpointRounding.AwayFromZero);
            }
            else if (t.ExchangeRate is { } given && given > 0)
            {
                rate = given;
            }
            else
            {
                return (null, $"Give the rate from {currency} to {baseCurrency} (how many {baseCurrency} one {currency} was worth).");
            }
        }

        return (new CheckedTransaction(currency, rate, toAmount), null);
    }

    /// <summary>An amount in the base currency, or null when it's in another currency with no rate.</summary>
    public static decimal? InBase(decimal amount, string currency, decimal? rate, string baseCurrency) =>
        currency == baseCurrency ? amount
        : rate is { } r ? Math.Round(amount * r, 4, MidpointRounding.AwayFromZero)
        : null;

    /// <summary>
    /// What a set of transactions adds up to in the base currency: income, spending, net. Transfers move money
    /// between your own accounts, so they count in neither; lines that can't be converted are counted apart.
    /// </summary>
    public static LedgerTotalsDto Totals(IEnumerable<LedgerLine> lines, string? baseCurrency)
    {
        decimal income = 0, spending = 0;
        var unconverted = 0;
        foreach (var line in lines.Where(l => l.Kind != TransactionKinds.Transfer))
        {
            if (baseCurrency is null || InBase(line.Amount, line.Currency, line.ExchangeRate, baseCurrency) is not { } amount)
            {
                unconverted++;
            }
            else if (line.Kind == TransactionKinds.Income)
            {
                income += amount;
            }
            else
            {
                spending += amount;
            }
        }

        return new LedgerTotalsDto
        {
            Currency = baseCurrency,
            Income = income,
            Spending = spending,
            Net = income - spending,
            Unconverted = unconverted,
        };
    }

    /// <summary>
    /// An account's own details: a known kind, a 3-letter currency, an opening balance that fits. Changing the
    /// currency or moving the opening date past the first transaction would rewrite history, so neither is allowed
    /// once money has moved (<paramref name="firstOn"/> is its earliest transaction, if any).
    /// </summary>
    public static string? CheckAccount(
        string kind, string? currency, decimal openingBalance, DateOnly openingDate, string? storedCurrency, DateOnly? firstOn) =>
        !AccountKinds.All.Contains(kind) ? "Unknown kind of account."
        : currency is null ? "Choose the account's currency."
        : openingDate == default ? "Say when the opening balance was."
        : Math.Abs(openingBalance) > MaxAmount ? "That opening balance is too large."
        : firstOn is not null && storedCurrency is not null && storedCurrency != currency
            ? "Money has already moved in this account's currency — it can't change now."
        : firstOn is { } first && openingDate > first
            ? $"There are transactions before that day — the opening date can be {first.ToString("dd'/'MMM'/'yyyy", CultureInfo.InvariantCulture)} at the latest."
        : null;
}

/// <summary>Investments and loans, mirroring CK_Holdings_* / CK_Loans_* (pure, unit-tested).</summary>
public static class WealthRules
{
    public static string? CheckHolding(
        string kind, string? currency, decimal? units, decimal? invested, decimal? rate, DateOnly? acquired, DateOnly? matures, DateOnly? disposed, DateOnly today) =>
        !HoldingKinds.All.Contains(kind) ? "Unknown kind of investment."
        : currency is null ? "Choose its currency."
        : units is <= 0 ? "Units have to be more than zero (leave it blank if it has none)."
        : invested is < 0 || invested > FinanceRules.MaxAmount ? "What was put in can't be negative or that large."
        : rate is < 0 or > 100 ? "The interest rate is a % between 0 and 100."
        : acquired is { } a && a > today ? "It can't be bought in the future."
        : acquired is { } a2 && matures is { } m && m < a2 ? "It can't mature before it was bought."
        : disposed is { } d && d > today ? "It can't be sold or closed in the future."
        : acquired is { } a3 && disposed is { } d2 && d2 < a3 ? "It can't be sold before it was bought."
        : null;

    public static string? CheckValuation(DateOnly valuedOn, decimal value, DateOnly? acquired, DateOnly today) =>
        valuedOn == default ? "Say which day it was worth that."
        : valuedOn > today ? "A valuation can't be in the future."
        : acquired is { } a && valuedOn < a ? "That's before it was bought."
        : value < 0 || value > FinanceRules.MaxAmount ? "The value can't be negative or that large."
        : null;

    public static string? CheckLoan(
        string kind, string direction, string? currency, decimal principal, decimal rate, int months, DateOnly start, decimal? emi, DateOnly? closed, DateOnly today) =>
        !LoanKinds.All.Contains(kind) ? "Unknown kind of loan."
        : direction is not (LoanKinds.Borrowed or LoanKinds.Lent) ? "Say whether you borrowed or lent it."
        : currency is null ? "Choose its currency."
        : principal <= 0 || principal > FinanceRules.MaxAmount ? "The amount has to be more than zero."
        : rate is < 0 or > 100 ? "The interest rate is a % between 0 and 100."
        : months is < 1 or > 600 ? "The term is 1 to 600 months."
        : start == default ? "Say when it started."
        : emi is <= 0 ? "The instalment has to be more than zero (leave it blank to work it out)."
        : closed is { } c && c < start ? "It can't close before it started."
        : closed is { } c2 && c2 > today ? "It can't be closed in the future."
        : LoanSchedule.CheckEmi(principal, rate, emi);
}

/// <summary>The exchange-rate master's rules (pure, unit-tested).</summary>
public static class RateRules
{
    /// <summary>Most base-currency units one unit of another currency can be worth here (matches DECIMAL(19,8)).</summary>
    public const decimal MaxRate = 99_999_999_999m;

    public static string? Check(string? currency, string? baseCurrency, decimal rate, DateOnly effectiveOn, DateOnly today) =>
        baseCurrency is null ? "Choose your base currency first — rates convert into it."
        : currency is null ? "Choose a currency."
        : currency == baseCurrency ? $"{currency} is your base currency — it needs no rate."
        : rate <= 0 || rate > MaxRate ? $"Give how many {baseCurrency} one {currency} is worth (more than zero)."
        : effectiveOn == default ? "Say from which day the rate applies."
        : effectiveOn > today ? "A rate can't start in the future — add it on the day."
        : null;
}
