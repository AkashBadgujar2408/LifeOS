using System.Data;
using Dapper;
using LifeOS.Core.Finance.DTOs;
using LifeOS.Core.Finance.ServiceContracts;
using LifeOS.Core.Goals.Services;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Finance.Services;

/// <summary>
/// Net worth and savings goals, both from the same picture of everything you own and owe on a day
/// (<see cref="NetWorth.At"/>): account balances rebuilt from the ledger (finance.GetNetWorthFacts), investments at
/// their latest valuation, loans at what's still owed. Nothing is stored; the history is rebuilt for each month end.
/// </summary>
public class WealthService(AppDbContext db) : IWealthService
{
    public const int HistoryMonths = 12;

    public async Task<NetWorthDto> GetNetWorthAsync(DateOnly today)
    {
        var baseCurrency = await BaseCurrencyAsync();
        if (baseCurrency is null)
        {
            return new NetWorthDto { Day = today };
        }

        var inputs = await LoadAsync(baseCurrency);
        var now = NetWorth.At(today, inputs, baseCurrency);
        return new NetWorthDto
        {
            Currency = baseCurrency,
            Day = today,
            Assets = now.Assets,
            Liabilities = now.Liabilities,
            Net = now.Net,
            Items = now.Items.Select(ToDto).OrderBy(i => i.Type).ThenByDescending(i => Math.Abs(i.InBase ?? 0)).ToList(),
            History = NetWorth.HistoryDays(today, HistoryMonths)
                .Select(day => NetWorth.At(day, inputs, baseCurrency))
                .Select(s => new NetWorthPointDto { Day = s.Day, Assets = s.Assets, Liabilities = s.Liabilities, Net = s.Net })
                .ToList(),
        };
    }

    public async Task<NetWorthPointsDto> GetNetWorthOnAsync(IReadOnlyList<DateOnly> days)
    {
        var baseCurrency = await BaseCurrencyAsync();
        if (baseCurrency is null)
        {
            return new NetWorthPointsDto();
        }

        var inputs = await LoadAsync(baseCurrency);
        return new NetWorthPointsDto
        {
            Currency = baseCurrency,
            Points = days
                .Select(day => NetWorth.At(day, inputs, baseCurrency))
                .Select(s => new NetWorthPointDto { Day = s.Day, Assets = s.Assets, Liabilities = s.Liabilities, Net = s.Net, Cash = s.Cash })
                .ToList(),
        };
    }

    public async Task<decimal?> RateToBaseAsync(string currency, DateOnly day)
    {
        var baseCurrency = await BaseCurrencyAsync();
        return baseCurrency is null ? null
            : currency == baseCurrency ? 1
            : NetWorth.RateFor(currency, day, await FinanceRates.MasterAsync(db, baseCurrency), await FinanceRates.TypedAsync(db));
    }

    public async Task<OperationResult<SavingsProgressDto?>> GetSavingsAsync(int goalId, DateOnly today)
    {
        if (!await db.Goals.AnyAsync(g => g.Id == goalId))
        {
            return OperationResult<SavingsProgressDto?>.Fail("Goal not found.");
        }

        var all = await GetSavingsForGoalsAsync([goalId], today);
        return OperationResult<SavingsProgressDto?>.Ok(all.GetValueOrDefault(goalId));
    }

    public async Task<Dictionary<int, SavingsProgressDto>> GetSavingsForGoalsAsync(IReadOnlyCollection<int> goalIds, DateOnly today)
    {
        var goals = await db.Goals
            .Where(g => goalIds.Contains(g.Id) && g.TargetAmount != null && g.TargetCurrency != null)
            .Select(g => new { g.Id, Target = g.TargetAmount!.Value, Currency = g.TargetCurrency! })
            .ToListAsync();
        if (goals.Count == 0)
        {
            return [];
        }

        // Links are stored with the ordinally smaller type first, so look both ways.
        var goalType = GoalLinkableProvider.Type;
        var ids = goals.Select(g => g.Id).ToList();
        var linked = await db.EntityLinks
            .Where(l => (l.SourceEntityType == goalType && ids.Contains(l.SourceEntityId))
                || (l.TargetEntityType == goalType && ids.Contains(l.TargetEntityId)))
            .Select(l => l.SourceEntityType == goalType && ids.Contains(l.SourceEntityId)
                ? new { GoalId = l.SourceEntityId, Type = l.TargetEntityType, Id = l.TargetEntityId }
                : new { GoalId = l.TargetEntityId, Type = l.SourceEntityType, Id = l.SourceEntityId })
            .ToListAsync();
        var wantedByGoal = linked
            .Where(l => l.Type is NetWorth.AccountType or NetWorth.HoldingType)
            .GroupBy(l => l.GoalId)
            .ToDictionary(g => g.Key, g => g.Select(l => (l.Type, l.Id)).ToHashSet());

        var baseCurrency = await BaseCurrencyAsync();
        // One picture of what you own per currency it's valued in (only the base, once a base currency is set).
        var pictures = new Dictionary<string, List<WealthItem>>();
        var result = new Dictionary<int, SavingsProgressDto>();
        foreach (var goal in goals)
        {
            var wanted = wantedByGoal.GetValueOrDefault(goal.Id) ?? [];
            var valuedIn = baseCurrency ?? goal.Currency;
            List<WealthItem> items = [];
            if (wanted.Count > 0)
            {
                if (!pictures.TryGetValue(valuedIn, out var picture))
                {
                    picture = NetWorth.At(today, await LoadAsync(valuedIn), valuedIn).Items.ToList();
                    pictures[valuedIn] = picture;
                }

                items = picture.Where(i => wanted.Contains((i.Type, i.Id))).ToList();
            }

            var (saved, percent, counted) = SavingsProgress.Of(goal.Target, goal.Currency, baseCurrency, items);
            result[goal.Id] = new SavingsProgressDto
            {
                TargetAmount = goal.Target,
                TargetCurrency = goal.Currency,
                Saved = saved,
                Percent = percent,
                Items = counted.Select(c => new WealthItemDto
                {
                    Type = c.Item.Type, Id = c.Item.Id, Name = c.Item.Name, Currency = c.Item.Currency, Amount = c.Item.Amount, InBase = c.Counted,
                }).ToList(),
            };
        }

        return result;
    }

    private async Task<string?> BaseCurrencyAsync() =>
        await db.Users.Where(u => u.Id == db.CurrentUserId).Select(u => u.BaseCurrency).FirstOrDefaultAsync();

    private async Task<WealthInputs> LoadAsync(string baseCurrency)
    {
        var parameters = new DynamicParameters();
        parameters.Add("UserId", db.CurrentUserId!.Value, DbType.Int32);
        List<AccountFlow> flows;
        List<CurrencyRate> rates;
        await using (var reader = await db.Database.GetDbConnection().QueryMultipleAsync(
            "finance.GetNetWorthFacts", parameters, commandType: CommandType.StoredProcedure))
        {
            // Read in exactly the order the procedure returns them.
            flows = (await reader.ReadAsync<FlowRow>()).Select(f => new AccountFlow(f.AccountId, DateOnly.FromDateTime(f.Day), f.Net, f.Currency)).ToList();
            rates = (await reader.ReadAsync<RateRow>()).Select(r => new CurrencyRate(r.Currency, DateOnly.FromDateTime(r.Day), r.Rate)).ToList();
        }

        var accounts = (await db.Accounts
                .Select(a => new
                {
                    a.Id, a.Name, a.Currency, a.OpeningBalance, a.OpeningDate,
                    Extra = a.AccountCurrencies.OrderBy(c => c.Currency).Select(c => new { c.Currency, c.OpeningBalance }).ToList(),
                })
                .AsSplitQuery()
                .ToListAsync())
            .Select(a => new WealthAccount(a.Id, a.Name, a.Currency, a.OpeningBalance, a.OpeningDate,
                a.Extra.Select(c => new HeldCurrency(c.Currency, c.OpeningBalance)).ToList()))
            .ToList();
        var holdings = (await db.Holdings
                .Select(h => new
                {
                    h.Id, h.Name, h.Currency, h.InvestedAmount, h.AcquiredOn, h.DisposedOn,
                    Valuations = h.HoldingValuations.Select(v => new { v.ValuedOn, v.Value }).ToList(),
                })
                .AsSplitQuery()
                .ToListAsync())
            .Select(h => new WealthHolding(h.Id, h.Name, h.Currency, h.InvestedAmount, h.AcquiredOn, h.DisposedOn,
                h.Valuations.Select(v => (v.ValuedOn, v.Value)).ToList()))
            .ToList();
        var moves = await LoanMoves.LoadAsync(db);
        var loans = (await db.Loans
                .Select(l => new WealthLoan(l.Id, l.Name, l.Direction == LoanKinds.Lent, l.Currency, l.Principal, l.AnnualRate,
                    l.TermMonths, l.StartDate, l.EmiAmount, l.ClosedOn, l.AssumedPaidThrough, null))
                .ToListAsync())
            .Select(l => l with { Moves = moves.GetValueOrDefault(l.Id) ?? [] })
            .ToList();
        return new WealthInputs(accounts, flows, holdings, loans, rates, await FinanceRates.MasterAsync(db, baseCurrency));
    }

    private static WealthItemDto ToDto(WealthItem i) => new()
    {
        Type = i.Type, Id = i.Id, Name = i.Name, Currency = i.Currency, Amount = i.Amount, InBase = i.InBase,
    };

    // ADO.NET shapes as they come (DATE → DateTime).
    private sealed class FlowRow
    {
        public int AccountId { get; init; }
        public string Currency { get; init; } = string.Empty;
        public DateTime Day { get; init; }
        public decimal Net { get; init; }
    }

    private sealed class RateRow
    {
        public string Currency { get; init; } = string.Empty;
        public DateTime Day { get; init; }
        public decimal Rate { get; init; }
    }
}
