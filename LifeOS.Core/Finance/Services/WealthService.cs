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

        var inputs = await LoadAsync();
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

    public async Task<OperationResult<SavingsProgressDto?>> GetSavingsAsync(int goalId, DateOnly today)
    {
        var goal = await db.Goals.Where(g => g.Id == goalId)
            .Select(g => new { g.TargetAmount, g.TargetCurrency })
            .FirstOrDefaultAsync();
        if (goal is null)
        {
            return OperationResult<SavingsProgressDto?>.Fail("Goal not found.");
        }

        if (goal.TargetAmount is not { } target || goal.TargetCurrency is not { } currency)
        {
            return OperationResult<SavingsProgressDto?>.Ok(null);
        }

        // Links are stored with the ordinally smaller type first, so look both ways.
        var goalType = GoalLinkableProvider.Type;
        var linked = await db.EntityLinks
            .Where(l => (l.SourceEntityType == goalType && l.SourceEntityId == goalId)
                || (l.TargetEntityType == goalType && l.TargetEntityId == goalId))
            .Select(l => l.SourceEntityType == goalType && l.SourceEntityId == goalId
                ? new { Type = l.TargetEntityType, Id = l.TargetEntityId }
                : new { Type = l.SourceEntityType, Id = l.SourceEntityId })
            .ToListAsync();
        var wanted = linked
            .Where(l => l.Type is NetWorth.AccountType or NetWorth.HoldingType)
            .Select(l => (l.Type, l.Id))
            .ToHashSet();

        var baseCurrency = await BaseCurrencyAsync();
        var items = wanted.Count == 0
            ? []
            : NetWorth.At(today, await LoadAsync(), baseCurrency ?? currency).Items.Where(i => wanted.Contains((i.Type, i.Id))).ToList();
        var (saved, percent, counted) = SavingsProgress.Of(target, currency, baseCurrency, items);
        return OperationResult<SavingsProgressDto?>.Ok(new SavingsProgressDto
        {
            TargetAmount = target,
            TargetCurrency = currency,
            Saved = saved,
            Percent = percent,
            Items = counted.Select(c => new WealthItemDto
            {
                Type = c.Item.Type, Id = c.Item.Id, Name = c.Item.Name, Currency = c.Item.Currency, Amount = c.Item.Amount, InBase = c.Counted,
            }).ToList(),
        });
    }

    private async Task<string?> BaseCurrencyAsync() =>
        await db.Users.Where(u => u.Id == db.CurrentUserId).Select(u => u.BaseCurrency).FirstOrDefaultAsync();

    private async Task<WealthInputs> LoadAsync()
    {
        var parameters = new DynamicParameters();
        parameters.Add("UserId", db.CurrentUserId!.Value, DbType.Int32);
        List<AccountFlow> flows;
        List<CurrencyRate> rates;
        await using (var reader = await db.Database.GetDbConnection().QueryMultipleAsync(
            "finance.GetNetWorthFacts", parameters, commandType: CommandType.StoredProcedure))
        {
            // Read in exactly the order the procedure returns them.
            flows = (await reader.ReadAsync<FlowRow>()).Select(f => new AccountFlow(f.AccountId, DateOnly.FromDateTime(f.Day), f.Net)).ToList();
            rates = (await reader.ReadAsync<RateRow>()).Select(r => new CurrencyRate(r.Currency, DateOnly.FromDateTime(r.Day), r.Rate)).ToList();
        }

        var accounts = await db.Accounts
            .Select(a => new WealthAccount(a.Id, a.Name, a.Currency, a.OpeningBalance, a.OpeningDate))
            .ToListAsync();
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
        var loans = await db.Loans
            .Select(l => new WealthLoan(l.Id, l.Name, l.Direction == LoanKinds.Lent, l.Currency, l.Principal, l.AnnualRate,
                l.TermMonths, l.StartDate, l.EmiAmount, l.ClosedOn))
            .ToListAsync();
        return new WealthInputs(accounts, flows, holdings, loans, rates);
    }

    private static WealthItemDto ToDto(WealthItem i) => new()
    {
        Type = i.Type, Id = i.Id, Name = i.Name, Currency = i.Currency, Amount = i.Amount, InBase = i.InBase,
    };

    // ADO.NET shapes as they come (DATE → DateTime).
    private sealed class FlowRow
    {
        public int AccountId { get; init; }
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
