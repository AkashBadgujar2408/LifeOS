using LifeOS.Core.Finance.DTOs;
using LifeOS.Core.Finance.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Purchases.Services;
using LifeOS.Core.Tasks.Services;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Finance.Services;

/// <summary>
/// The cash-flow forecast (Session 71a): today's balances (<see cref="IAccountsService"/>) carried forward with money
/// already known to be coming, gathered from every module and handed to the pure <see cref="CashForecast"/> — never
/// stored. Sources: repeating transactions still to be written (subscriptions charged to an account included), unpaid
/// bills and the bills expected after them, loan instalments, subscriptions not charged to an account, insurance
/// premiums, tax payments with an amount, and cashback still to come. Other currencies go into the overall line at the
/// rate master's / typed rates (<see cref="NetWorth.RateFor"/>).
/// </summary>
public class ForecastService(AppDbContext db, IAccountsService accountsService, IRecurringTransactionsService recurringService)
    : IForecastService
{
    /// <summary>Account kinds whose balance shouldn't go below zero (a card's normally does).</summary>
    private static readonly HashSet<string> MustStayPositive = ["Bank", "Cash", "Wallet"];

    public async Task<ForecastDto?> GetAsync(DateOnly today, int months)
    {
        var built = await BuildAsync(today, today.AddMonths(months));
        if (built is null)
        {
            return null;
        }

        var (result, baseCurrency, until, accountNames) = built.Value;
        return new ForecastDto
        {
            From = today,
            Until = until,
            BaseCurrency = baseCurrency,
            Overall = ToDto(result.Overall),
            Accounts = result.Accounts.Select(ToDto).ToList(),
            Items = result.Flows.Select(f => new ForecastItemDto
            {
                Day = f.Flow.Day,
                Source = f.Flow.Source,
                Title = f.Flow.Title,
                AccountId = f.Flow.AccountId,
                AccountName = f.Flow.AccountId is { } id ? accountNames.GetValueOrDefault(id) : null,
                Amount = f.Flow.Amount,
                Currency = f.Flow.Currency,
                AmountInBase = f.InBase,
                IsEstimate = f.Flow.IsEstimate,
            }).ToList(),
            Unconverted = result.Unconverted.ToList(),
        };
    }

    public async Task<List<(int AccountId, string Name, string Currency, DateOnly Day, decimal Balance)>> LowAheadAsync(DateOnly today, int days)
    {
        var built = await BuildAsync(today, today.AddDays(days));
        return built is null
            ? []
            : CashForecast.GoesNegative(built.Value.Result, today.AddDays(days))
                .Select(x => (x.Line.AccountId!.Value, x.Line.Name, x.Line.Currency, x.Below.Day, x.Below.Balance))
                .ToList();
    }

    public async Task<ForecastResult?> ResultAsync(DateOnly today, DateOnly until, IReadOnlyCollection<ForecastFlow>? extra) =>
        (await BuildAsync(today, until, extra))?.Result;

    private async Task<(ForecastResult Result, string BaseCurrency, DateOnly Until, Dictionary<int, string> AccountNames)?> BuildAsync(DateOnly today, DateOnly until, IReadOnlyCollection<ForecastFlow>? extra = null)
    {
        var baseCurrency = await db.Users.Where(u => u.Id == db.CurrentUserId).Select(u => u.BaseCurrency).FirstOrDefaultAsync();
        if (baseCurrency is null)
        {
            return null;
        }

        // Anything due by today is written first, so the forecast starts from the real balance.
        await recurringService.GenerateDueAsync(today);
        var accounts = (await accountsService.GetAllAsync(today)).Where(a => !a.IsArchived).ToList();
        var pockets = accounts
            .SelectMany(a => (a.Balances.Count > 0 ? a.Balances.Select(b => (b.Currency, b.Balance)) : [(a.Currency, a.Balance)])
                .Select(b => new ForecastPocket(a.Id, b.Currency == a.Currency ? a.Name : $"{a.Name} ({b.Currency})", b.Currency, b.Balance,
                    !MustStayPositive.Contains(a.Kind))))
            .ToList();
        var flows = new List<ForecastFlow>();
        await AddRepeatingAsync(flows, today, until);
        await AddBillsAsync(flows, today, until);
        await AddLoansAsync(flows, today, until);
        await AddSubscriptionsAsync(flows, today, until);
        await AddPremiumsAsync(flows, today, until);
        await AddTaxAndCashbackAsync(flows, today);
        // What-ifs (Session 71c scenarios) ride on top, in memory only.
        flows.AddRange(extra ?? []);

        var master = await FinanceRates.MasterAsync(db, baseCurrency);
        var typed = await FinanceRates.TypedAsync(db);
        var result = CashForecast.Build(pockets, flows, today, until, baseCurrency, (currency, day) => NetWorth.RateFor(currency, day, master, typed));
        return (result, baseCurrency, until, accounts.ToDictionary(a => a.Id, a => a.Name));
    }

    /// <summary>Repeating transactions: every occurrence after today they haven't written yet (not paused, before Until).</summary>
    private async Task AddRepeatingAsync(List<ForecastFlow> flows, DateOnly today, DateOnly until)
    {
        var schedules = await db.RecurringTransactions.Where(r => !r.IsPaused).ToListAsync();
        foreach (var s in schedules)
        {
            for (var k = 0; k < 100_000; k++)
            {
                var day = TaskRecurrence.Occurrence(s.RecurrenceFrequency, s.RecurrenceInterval, s.StartDate, k);
                if (day > until || (s.Until is { } end && day > end))
                {
                    break;
                }

                if (day <= today || (s.GeneratedThrough is { } written && day <= written))
                {
                    continue;
                }

                switch (s.Kind)
                {
                    case TransactionKinds.Income:
                        flows.Add(new ForecastFlow(day, s.ToAccountId, s.Currency, s.Amount, "Repeating", s.Name));
                        break;
                    case TransactionKinds.Expense:
                        flows.Add(new ForecastFlow(day, s.FromAccountId, s.Currency, -s.Amount, "Repeating", s.Name));
                        break;
                    default:
                        flows.Add(new ForecastFlow(day, s.FromAccountId, s.Currency, -s.Amount, "Repeating", s.Name));
                        flows.Add(new ForecastFlow(day, s.ToAccountId, s.ToCurrency ?? s.Currency, s.ToAmount ?? s.Amount, "Repeating", s.Name));
                        break;
                }
            }
        }
    }

    /// <summary>Unpaid bills (overdue ones tomorrow, still to pay), then the bills expected after each provider's latest.</summary>
    private async Task AddBillsAsync(List<ForecastFlow> flows, DateOnly today, DateOnly until)
    {
        var bills = await db.UtilityBills.Select(b => new { b.Kind, b.Provider, b.DueOn, b.Amount, b.Currency, b.PaidOn }).ToListAsync();
        foreach (var bill in bills.Where(b => b.PaidOn is null))
        {
            flows.Add(new ForecastFlow(bill.DueOn > today ? bill.DueOn : today.AddDays(1), null, bill.Currency, -bill.Amount, "Bill",
                $"{bill.Provider ?? bill.Kind} bill"));
        }

        foreach (var group in bills.GroupBy(b => (b.Kind, b.Provider)))
        {
            foreach (var (day, amount, currency) in CashForecast.ExpectedBills(group.Select(b => (b.DueOn, b.Amount, b.Currency)).ToList(), today, until))
            {
                flows.Add(new ForecastFlow(day, null, currency, -amount, "ExpectedBill", $"{group.Key.Provider ?? group.Key.Kind} bill (expected)", IsEstimate: true));
            }
        }
    }

    /// <summary>EMI loans still running: each instalment after today, out of (borrowed) or into (lent) the loan's account.</summary>
    private async Task AddLoansAsync(List<ForecastFlow> flows, DateOnly today, DateOnly until)
    {
        var loans = await db.Loans.Where(l => l.RepaymentKind == LoanLedger.Emi && l.ClosedOn == null && l.TermMonths != null).ToListAsync();
        foreach (var loan in loans)
        {
            var sign = loan.Direction == LoanKinds.Lent ? 1 : -1;
            foreach (var instalment in LoanSchedule.Build(loan.Principal, loan.AnnualRate, loan.TermMonths!.Value, loan.StartDate, loan.EmiAmount)
                         .Where(i => i.DueOn > today && i.DueOn <= until))
            {
                flows.Add(new ForecastFlow(instalment.DueOn, loan.AccountId, loan.Currency, sign * instalment.Payment, "Loan", $"{loan.Name} instalment"));
            }
        }
    }

    /// <summary>Subscriptions not charged to an account (those that are, come through their repeating transaction).</summary>
    private async Task AddSubscriptionsAsync(List<ForecastFlow> flows, DateOnly today, DateOnly until)
    {
        var subscriptions = await db.Subscriptions.Where(s => s.RecurringTransactionId == null && s.Status == SubscriptionStatuses.Active).ToListAsync();
        foreach (var s in subscriptions)
        {
            foreach (var day in SubscriptionRules.ChargesBetween(s.RecurrenceFrequency, s.RecurrenceInterval, s.StartedOn, s.Status, s.CancelledOn, today.AddDays(1), until))
            {
                flows.Add(new ForecastFlow(day, null, s.Currency, -s.Amount, "Subscription", s.Name));
            }
        }
    }

    private async Task AddPremiumsAsync(List<ForecastFlow> flows, DateOnly today, DateOnly until)
    {
        var policies = await db.InsurancePolicies.Where(p => p.Premium != null && p.PremiumFrequency != null && (p.StartDate != null || p.RenewsOn != null))
            .ToListAsync();
        foreach (var p in policies)
        {
            foreach (var day in CashForecast.PremiumDays(p.PremiumFrequency!, (p.StartDate ?? p.RenewsOn)!.Value, p.EndsOn, today, until))
            {
                flows.Add(new ForecastFlow(day, null, p.Currency, -p.Premium!.Value, "Insurance", $"{p.Name} premium"));
            }
        }
    }

    /// <summary>Tax payments with an amount not paid yet (overdue: tomorrow), and cashback still to come (overdue: tomorrow).</summary>
    private async Task AddTaxAndCashbackAsync(List<ForecastFlow> flows, DateOnly today)
    {
        var taxes = await db.TaxItems
            .Where(t => t.Kind == "Payment" && t.Amount != null && t.Currency != null && t.DueOn != null && t.DoneOn == null && t.TransactionId == null)
            .ToListAsync();
        foreach (var t in taxes)
        {
            flows.Add(new ForecastFlow(t.DueOn > today ? t.DueOn!.Value : today.AddDays(1), null, t.Currency!, -t.Amount!.Value, "Tax", t.Title));
        }

        var cashback = await db.Benefits.Where(b => b.Kind == BenefitKinds.Cashback && b.ReceivedOn == null && b.Value != null).ToListAsync();
        foreach (var b in cashback)
        {
            flows.Add(new ForecastFlow(b.ExpectedBy is { } by && by > today ? by : today.AddDays(1), null, b.Currency!, b.Value!.Value, "Cashback", b.Name));
        }
    }

    private static ForecastLineDto ToDto(ForecastLine line) => new()
    {
        AccountId = line.AccountId,
        Name = line.Name,
        Currency = line.Currency,
        Start = line.Start,
        End = line.End,
        Lowest = new ForecastPointDto { Day = line.Lowest.Day, Balance = line.Lowest.Balance },
        Points = line.Points.Select(p => new ForecastPointDto { Day = p.Day, Balance = p.Balance }).ToList(),
    };
}
