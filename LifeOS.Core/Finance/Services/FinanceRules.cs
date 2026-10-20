using System.Globalization;
using LifeOS.Core.Finance.DTOs;

namespace LifeOS.Core.Finance.Services;

/// <summary>
/// What the rules need to know about an account a transaction moves money in or out of. <paramref name="Extra"/> are
/// the other currencies a multi-currency account holds (Session 61); none for a single-currency account.
/// </summary>
public sealed record LedgerAccount(int Id, string Currency, DateOnly OpeningDate, bool IsArchived, IReadOnlyCollection<string>? Extra = null)
{
    public bool Holds(string currency) => currency == Currency || (Extra?.Contains(currency) ?? false);
}

/// <summary>A transaction as typed, before it's checked. Currency / ToCurrency: the currency chosen on a multi-currency account
/// (null = the account's main one; ToCurrency null = whatever the receiving account can take, preferring the one that left).</summary>
public sealed record TransactionInput(
    string Kind,
    DateOnly OccurredOn,
    decimal Amount,
    decimal? ExchangeRate,
    decimal? ToAmount,
    LedgerAccount? From,
    LedgerAccount? To,
    bool HasIncomeSource,
    string? Currency = null,
    string? ToCurrency = null);

/// <summary>What gets stored once a transaction passes: its currency, the rate, and what arrived (both null when nothing changed on the way).</summary>
public sealed record CheckedTransaction(string Currency, decimal? ExchangeRate, decimal? ToAmount, string? ToCurrency = null);

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

    /// <summary>A currency code as typed (trimmed, upper case), or null when none was given.</summary>
    public static string? Code(string? typed) => string.IsNullOrWhiteSpace(typed) ? null : typed.Trim().ToUpperInvariant();

    /// <summary>
    /// Checks a transaction. Income lands in To, an expense leaves From, a transfer needs both (different).
    /// The amount is in the moving account's currency (From, else To) — or, on a multi-currency account, the one of
    /// its currencies chosen. A transfer whose money arrives in another currency (the receiving account's, or the one
    /// chosen there) needs what arrived (ToAmount + ToCurrency); otherwise both are dropped. Anything not in the base
    /// currency needs a rate to it — except when what arrived is in the base currency: the rate is arrived ÷ left.
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

        // The currency it moved in: the one chosen on a multi-currency account, else the account's own.
        var moving = (t.From ?? t.To)!;
        var currency = string.IsNullOrEmpty(t.Currency) ? moving.Currency : t.Currency;
        if (!moving.Holds(currency))
        {
            return (null, $"That account doesn't hold {currency} — add the currency to the account first.");
        }

        decimal? toAmount = null;
        string? toCurrency = null;
        if (t.Kind == TransactionKinds.Transfer)
        {
            // What arrives: the currency chosen, else the one that left if the receiving account holds it, else its own.
            var arrives = !string.IsNullOrEmpty(t.ToCurrency) ? t.ToCurrency : t.To!.Holds(currency) ? currency : t.To!.Currency;
            if (!t.To!.Holds(arrives))
            {
                return (null, $"The receiving account doesn't hold {arrives} — add the currency to it first.");
            }

            if (arrives != currency)
            {
                if (t.ToAmount is not { } arrived || arrived <= 0)
                {
                    return (null, $"Say how much arrived in {arrives}.");
                }

                toAmount = arrived;
                toCurrency = arrives;
            }
        }

        decimal? rate = null;
        if (currency != baseCurrency)
        {
            if (toAmount is { } arrived && toCurrency == baseCurrency)
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

        return (new CheckedTransaction(currency, rate, toAmount, toCurrency), null);
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

    /// <summary>
    /// A loan: an EMI loan needs a term (its instalment is worked out unless the lender's is given) and may say its
    /// instalments up to a day were paid; a flexible (pay-as-you-go) loan has none of those. A rate of 0 = interest-free.
    /// </summary>
    public static string? CheckLoan(
        string kind, string direction, string? currency, decimal principal, decimal rate, string repaymentKind, int? months,
        DateOnly start, decimal? emi, DateOnly? assumedPaidThrough, DateOnly? closed, DateOnly today) =>
        !LoanKinds.All.Contains(kind) ? "Unknown kind of loan."
        : direction is not (LoanKinds.Borrowed or LoanKinds.Lent) ? "Say whether you borrowed or lent it."
        : repaymentKind is not (LoanLedger.Emi or LoanLedger.Flexible) ? "Say whether it's repaid by EMI or as you go."
        : currency is null ? "Choose its currency."
        : principal <= 0 || principal > FinanceRules.MaxAmount ? "The amount has to be more than zero."
        : rate is < 0 or > 100 ? "The interest rate is a % between 0 and 100 (0 for interest-free)."
        : start == default ? "Say when it started."
        : closed is { } c && c < start ? "It can't close before it started."
        : closed is { } c2 && c2 > today ? "It can't be closed in the future."
        : repaymentKind == LoanLedger.Flexible ? null
        : months is not { } m ? "Give the term in months (or make it pay as you go)."
        : m is < 1 or > 600 ? "The term is 1 to 600 months."
        : emi is <= 0 ? "The instalment has to be more than zero (leave it blank to work it out)."
        : assumedPaidThrough is { } a && a < start ? "\"Paid up to\" can't be before it started."
        : assumedPaidThrough is { } a2 && a2 > today ? "\"Paid up to\" can't be in the future."
        : LoanSchedule.CheckEmi(principal, rate, emi);

    /// <summary>A repayment: an amount, on a day from the start to today, not after it was closed.</summary>
    public static string? CheckLoanPayment(DateOnly paidOn, decimal amount, DateOnly start, DateOnly? closed, DateOnly today) =>
        today == default ? "Today's date is required."
        : paidOn == default ? "Say when it was paid."
        : paidOn > today ? "It can't be paid in the future."
        : paidOn < start ? "That's before the loan started."
        : closed is { } c && paidOn > c ? "That's after the loan was closed."
        : amount <= 0 || amount > FinanceRules.MaxAmount ? "The amount has to be more than zero."
        : null;
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

/// <summary>A currency an account holds — its main one or an extra — and what it opened with.</summary>
public sealed record HeldCurrency(string Currency, decimal OpeningBalance);

/// <summary>Money in and out of an account in one currency, as finance.GetAccountBalances sums it (null: no transactions).</summary>
public sealed record CurrencyMoves(string? Currency, decimal MoneyIn, decimal MoneyOut);

/// <summary>Multi-currency accounts (Session 61): one account, a balance per currency. Pure and unit-tested.</summary>
public static class MultiCurrency
{
    /// <summary>Most extra currencies one account holds.</summary>
    public const int MaxExtra = 20;

    /// <summary>
    /// The extra currencies asked for: real 3-letter codes, no repeats, not the main currency, opening balances that
    /// fit — and none dropped while money has moved in it (<paramref name="used"/>: currencies with transactions).
    /// </summary>
    public static string? CheckExtras(string mainCurrency, IReadOnlyList<(string? Currency, decimal OpeningBalance)> extras, IReadOnlySet<string> used)
    {
        if (extras.Count > MaxExtra)
        {
            return $"An account holds at most {MaxExtra + 1} currencies.";
        }

        if (extras.Any(e => e.Currency is null))
        {
            return "Choose each extra currency.";
        }

        if (extras.Any(e => e.Currency == mainCurrency))
        {
            return $"{mainCurrency} is already the account's main currency.";
        }

        if (extras.GroupBy(e => e.Currency).FirstOrDefault(g => g.Count() > 1) is { } twice)
        {
            return $"{twice.Key} is listed twice.";
        }

        if (extras.Any(e => Math.Abs(e.OpeningBalance) > FinanceRules.MaxAmount))
        {
            return "That opening balance is too large.";
        }

        var dropped = used.Where(c => c != mainCurrency && extras.All(e => e.Currency != c)).Order().FirstOrDefault();
        return dropped is null
            ? null
            : $"Money has moved in {dropped} on this account — it can't be taken off (archive the account instead).";
    }

    /// <summary>
    /// Each currency's balance: its opening balance + money in − money out. The main currency first, then the extras
    /// in order; a currency with transactions but no longer held (shouldn't happen) is still shown, last.
    /// </summary>
    public static List<(string Currency, decimal OpeningBalance, decimal Balance)> Balances(
        HeldCurrency main, IReadOnlyList<HeldCurrency> extras, IReadOnlyList<CurrencyMoves> moves)
    {
        var held = new List<HeldCurrency> { main };
        held.AddRange(extras);
        var stray = moves.Where(m => m.Currency is not null && held.All(h => h.Currency != m.Currency))
            .Select(m => new HeldCurrency(m.Currency!, 0)).DistinctBy(h => h.Currency);
        return held.Concat(stray)
            .Select(h => (h.Currency, h.OpeningBalance,
                h.OpeningBalance + moves.Where(m => m.Currency == h.Currency).Sum(m => m.MoneyIn - m.MoneyOut)))
            .ToList();
    }
}
