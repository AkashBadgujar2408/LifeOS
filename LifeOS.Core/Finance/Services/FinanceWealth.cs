namespace LifeOS.Core.Finance.Services;

/// <summary>One instalment of a loan: when it falls due, what it pays, how that splits, and what's left after it.</summary>
public sealed record LoanInstalment(int Number, DateOnly DueOn, decimal Payment, decimal Interest, decimal Principal, decimal Balance);

/// <summary>
/// Loan arithmetic, the way bank EMI calculators do it: a fixed monthly instalment
/// EMI = P·r·(1+r)^n / ((1+r)^n − 1) with r the monthly rate, rounded to the paisa/cent; each month's interest is the
/// balance × r (rounded), the rest of the instalment repays principal, and the last instalment is whatever clears the
/// balance. The first instalment falls due a month after the start. Pure and unit-tested.
/// </summary>
public static class LoanSchedule
{
    /// <summary>The longest schedule built (CK_Loans_TermMonths allows 600; a lender's small EMI can run longer).</summary>
    public const int MaxInstalments = 1200;

    public static decimal MonthlyRate(decimal annualRatePercent) => annualRatePercent / 1200m;

    public static decimal Emi(decimal principal, decimal annualRatePercent, int months)
    {
        if (months < 1)
        {
            throw new ArgumentOutOfRangeException(nameof(months), months, "A loan runs at least a month.");
        }

        var r = MonthlyRate(annualRatePercent);
        if (r == 0)
        {
            return Math.Round(principal / months, 2, MidpointRounding.AwayFromZero);
        }

        var growth = 1m;
        for (var i = 0; i < months; i++)
        {
            growth *= 1 + r;
        }

        return Math.Round(principal * r * growth / (growth - 1), 2, MidpointRounding.AwayFromZero);
    }

    /// <summary>
    /// A lender's own EMI figure has to more than cover the first month's interest, or the loan would never shrink.
    /// </summary>
    public static string? CheckEmi(decimal principal, decimal annualRatePercent, decimal? emi) =>
        emi is { } e && e <= Math.Round(principal * MonthlyRate(annualRatePercent), 2, MidpointRounding.AwayFromZero)
            ? "That instalment doesn't even cover the first month's interest — check the EMI or the rate."
            : null;

    /// <summary>Every instalment until the balance is cleared (with the lender's EMI when given, else the computed one).</summary>
    public static List<LoanInstalment> Build(decimal principal, decimal annualRatePercent, int months, DateOnly start, decimal? lenderEmi = null)
    {
        var r = MonthlyRate(annualRatePercent);
        var emi = lenderEmi ?? Emi(principal, annualRatePercent, months);
        var rows = new List<LoanInstalment>();
        var balance = principal;
        for (var k = 1; balance > 0 && k <= MaxInstalments; k++)
        {
            var interest = Math.Round(balance * r, 2, MidpointRounding.AwayFromZero);
            var repaid = emi - interest;
            // The last one clears whatever is left — also when the computed EMI's rounding leaves a few paise.
            if (repaid >= balance || (lenderEmi is null && k == months))
            {
                repaid = balance;
            }

            if (repaid <= 0)
            {
                break;
            }

            balance -= repaid;
            rows.Add(new LoanInstalment(k, start.AddMonths(k), interest + repaid, interest, repaid, balance));
        }

        return rows;
    }

    /// <summary>
    /// What is still owed at the end of <paramref name="day"/>, assuming every instalment due by then was paid: the
    /// principal until the first falls due, nothing once it's closed (or before it started — it didn't exist).
    /// </summary>
    public static decimal OutstandingOn(IReadOnlyList<LoanInstalment> schedule, decimal principal, DateOnly start, DateOnly? closedOn, DateOnly day)
    {
        if (day < start || closedOn is { } closed && closed <= day)
        {
            return 0;
        }

        var paid = schedule.LastOrDefault(i => i.DueOn <= day);
        return paid?.Balance ?? principal;
    }
}

// ---- Net worth ----

public sealed record WealthAccount(int Id, string Name, string Currency, decimal OpeningBalance, DateOnly OpeningDate);

/// <summary>Money into (+) or out of (−) an account on a day, as finance.GetNetWorthFacts sums it.</summary>
public sealed record AccountFlow(int AccountId, DateOnly Day, decimal Net);

public sealed record WealthHolding(
    int Id, string Name, string Currency, decimal? InvestedAmount, DateOnly? AcquiredOn, DateOnly? DisposedOn,
    IReadOnlyList<(DateOnly Day, decimal Value)> Valuations);

public sealed record WealthLoan(
    int Id, string Name, bool IsLent, string Currency, decimal Principal, decimal AnnualRate, int TermMonths,
    DateOnly StartDate, decimal? EmiAmount, DateOnly? ClosedOn);

/// <summary>A manual rate to the base currency, as typed on a transaction that day.</summary>
public sealed record CurrencyRate(string Currency, DateOnly Day, decimal Rate);

public sealed record WealthInputs(
    IReadOnlyList<WealthAccount> Accounts,
    IReadOnlyList<AccountFlow> Flows,
    IReadOnlyList<WealthHolding> Holdings,
    IReadOnlyList<WealthLoan> Loans,
    IReadOnlyList<CurrencyRate> Rates,
    IReadOnlyList<CurrencyRate>? MasterRates = null);

/// <summary>One thing counted in net worth: positive = an asset, negative = a liability, in its own currency and the base one.</summary>
public sealed record WealthItem(string Type, int Id, string Name, string Currency, decimal Amount, decimal? InBase);

public sealed record WealthSnapshot(DateOnly Day, decimal Assets, decimal Liabilities, IReadOnlyList<WealthItem> Items)
{
    public decimal Net => Assets - Liabilities;

    /// <summary>Items in another currency with no rate known by that day — left out of the totals.</summary>
    public IEnumerable<WealthItem> Unconverted => Items.Where(i => i.InBase is null);
}

/// <summary>
/// Net worth on a day = what accounts hold + what investments are worth + money lent − money borrowed still owed
/// (a card's negative balance is a liability). All in the base currency: anything else counts at the latest manual
/// rate typed for its currency on or before that day (no live rates); without one it's shown but left out. Computed
/// per request from the ledger, valuations and loan schedules — never stored. Pure and unit-tested.
/// </summary>
public static class NetWorth
{
    public const string AccountType = "FinanceAccount";
    public const string HoldingType = "Holding";
    public const string LoanType = "Loan";

    public static WealthSnapshot At(DateOnly day, WealthInputs inputs, string baseCurrency)
    {
        var items = new List<WealthItem>();
        var flowsByAccount = inputs.Flows.ToLookup(f => f.AccountId);
        foreach (var account in inputs.Accounts.Where(a => a.OpeningDate <= day))
        {
            var balance = account.OpeningBalance
                + flowsByAccount[account.Id].Where(f => f.Day >= account.OpeningDate && f.Day <= day).Sum(f => f.Net);
            items.Add(Item(AccountType, account.Id, account.Name, account.Currency, balance, day, inputs, baseCurrency));
        }

        foreach (var holding in inputs.Holdings)
        {
            if (HoldingValue(holding, day) is { } value)
            {
                items.Add(Item(HoldingType, holding.Id, holding.Name, holding.Currency, value, day, inputs, baseCurrency));
            }
        }

        foreach (var loan in inputs.Loans.Where(l => l.StartDate <= day))
        {
            var schedule = LoanSchedule.Build(loan.Principal, loan.AnnualRate, loan.TermMonths, loan.StartDate, loan.EmiAmount);
            var owed = LoanSchedule.OutstandingOn(schedule, loan.Principal, loan.StartDate, loan.ClosedOn, day);
            if (owed != 0)
            {
                items.Add(Item(LoanType, loan.Id, loan.Name, loan.Currency, loan.IsLent ? owed : -owed, day, inputs, baseCurrency));
            }
        }

        var counted = items.Where(i => i.InBase is not null).Select(i => i.InBase!.Value).ToList();
        return new WealthSnapshot(day, counted.Where(v => v > 0).Sum(), -counted.Where(v => v < 0).Sum(), items);
    }

    /// <summary>
    /// What a holding was worth on a day: its latest valuation on or before it, else what was put in (from when it was
    /// acquired). Nothing before it was acquired or from the day it was sold/matured.
    /// </summary>
    public static decimal? HoldingValue(WealthHolding holding, DateOnly day)
    {
        if (holding.DisposedOn is { } disposed && disposed <= day || holding.AcquiredOn is { } acquired && acquired > day)
        {
            return null;
        }

        var valued = holding.Valuations.Where(v => v.Day <= day).OrderBy(v => v.Day).LastOrDefault();
        return valued != default ? valued.Value : holding.InvestedAmount;
    }

    /// <summary>
    /// The rate a currency converts at on a day: the exchange-rate master's latest on or before it (what you set in
    /// Settings) — else the latest rate typed on a transaction by then — else none.
    /// </summary>
    public static decimal? RateFor(string currency, DateOnly day, IReadOnlyList<CurrencyRate> master, IReadOnlyList<CurrencyRate> typed) =>
        RateOn(master, currency, day) ?? RateOn(typed, currency, day);

    /// <summary>An amount in the base currency on a day (null: another currency with no rate known by then).</summary>
    public static decimal? ToBase(
        decimal amount, string currency, string baseCurrency, DateOnly day, IReadOnlyList<CurrencyRate> master, IReadOnlyList<CurrencyRate> typed) =>
        currency == baseCurrency ? amount
        : RateFor(currency, day, master, typed) is { } rate ? Math.Round(amount * rate, 4, MidpointRounding.AwayFromZero)
        : null;

    /// <summary>The latest rate for a currency on or before the day (null: none yet).</summary>
    public static decimal? RateOn(IReadOnlyList<CurrencyRate> rates, string currency, DateOnly day) =>
        rates.Where(r => r.Currency == currency && r.Day <= day).OrderBy(r => r.Day).LastOrDefault()?.Rate;

    /// <summary>The last day of each of the <paramref name="months"/> months before today's, oldest first, then today.</summary>
    public static List<DateOnly> HistoryDays(DateOnly today, int months)
    {
        var thisMonth = new DateOnly(today.Year, today.Month, 1);
        var days = Enumerable.Range(1, months).Reverse().Select(k => thisMonth.AddMonths(-k + 1).AddDays(-1)).ToList();
        days.Add(today);
        return days;
    }

    private static WealthItem Item(
        string type, int id, string name, string currency, decimal amount, DateOnly day, WealthInputs inputs, string baseCurrency)
    {
        decimal? inBase = currency == baseCurrency ? amount
            : RateFor(currency, day, inputs.MasterRates ?? [], inputs.Rates) is { } rate ? Math.Round(amount * rate, 4, MidpointRounding.AwayFromZero)
            : null;
        return new WealthItem(type, id, name, currency, amount, inBase);
    }
}

/// <summary>
/// A savings goal's progress: what the accounts and investments linked to it hold, in the goal's currency (same
/// currency as is; the base currency through the item's base value; anything else can't be compared and isn't
/// counted). Money owed on a linked card doesn't reduce it below zero. Pure and unit-tested.
/// </summary>
public static class SavingsProgress
{
    public static (decimal Saved, int Percent, List<(WealthItem Item, decimal? Counted)> Items) Of(
        decimal target, string targetCurrency, string? baseCurrency, IEnumerable<WealthItem> linked)
    {
        var items = linked
            .Select(i => (Item: i, Counted: i.Currency == targetCurrency ? i.Amount
                : targetCurrency == baseCurrency ? i.InBase
                : (decimal?)null))
            .ToList();
        var saved = Math.Max(0, items.Sum(i => i.Counted ?? 0));
        var percent = target <= 0 ? 0 : (int)Math.Min(100, Math.Floor(saved * 100 / target));
        return (saved, percent, items);
    }
}
