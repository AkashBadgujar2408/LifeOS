using System.Data;
using Dapper;
using LifeOS.Core.Finance.DTOs;
using LifeOS.Core.Finance.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.Services;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Finance.Services;

/// <summary>
/// What you mean to spend on a tag in a month, against what you did (finance.GetMonthSummary → BudgetSummary). One
/// budget per tag per month, rewritten in place; null removes it. A new month starts empty until you copy the last
/// one forward — LifeOS doesn't guess that this month should look like the last.
/// </summary>
public class BudgetsService(AppDbContext db) : IBudgetsService
{
    private const string NotMonthStart = "A budget month is given by its first day.";

    public async Task<OperationResult<MonthSummaryDto>> GetMonthAsync(DateOnly monthStart)
    {
        if (monthStart.Day != 1)
        {
            return OperationResult<MonthSummaryDto>.Fail(NotMonthStart);
        }

        var baseCurrency = await BaseCurrencyAsync();
        if (baseCurrency is null)
        {
            return OperationResult<MonthSummaryDto>.Ok(new MonthSummaryDto { MonthStart = monthStart });
        }

        var parameters = new DynamicParameters();
        parameters.Add("UserId", db.CurrentUserId!.Value, DbType.Int32);
        parameters.Add("MonthStart", monthStart.ToDateTime(TimeOnly.MinValue), DbType.Date);
        parameters.Add("BaseCurrency", baseCurrency, DbType.AnsiStringFixedLength, size: 3);
        await using var reader = await db.Database.GetDbConnection().QueryMultipleAsync(
            "finance.GetMonthSummary", parameters, commandType: CommandType.StoredProcedure);

        // Read in exactly the order the procedure returns them.
        var lines = (await reader.ReadAsync<LineRow>()).ToList();
        var totals = await reader.ReadSingleAsync<TotalsRow>();
        return OperationResult<MonthSummaryDto>.Ok(new MonthSummaryDto
        {
            MonthStart = monthStart,
            Currency = baseCurrency,
            Income = Math.Round(totals.Income, 4),
            Spending = Math.Round(totals.Spending, 4),
            UntaggedSpending = Math.Round(totals.UntaggedSpending, 4),
            Unconverted = totals.Unconverted,
            Lines = BudgetSummary.Summarise(
                lines.Select(l => new BudgetSummary.Line(l.TagId, l.TagName, l.Budget, l.BudgetCurrency, l.Spent, l.TransactionCount, l.Unconverted)),
                baseCurrency),
        });
    }

    /// <summary>The month's tags that have gone past their budget (for My Day's insight); empty without a base currency.</summary>
    public async Task<List<BudgetLineDto>> OverBudgetAsync(DateOnly today)
    {
        var month = await GetMonthAsync(BudgetSummary.MonthStart(today));
        return month.Data?.Lines.Where(l => l.IsOver).ToList() ?? [];
    }

    public async Task<OperationResult<MonthSummaryDto>> SetAsync(DateOnly monthStart, int tagId, decimal? amount)
    {
        if (monthStart.Day != 1)
        {
            return OperationResult<MonthSummaryDto>.Fail(NotMonthStart);
        }

        if (amount is <= 0)
        {
            return OperationResult<MonthSummaryDto>.Fail("A budget has to be more than zero — clear it to remove it.");
        }

        if (amount > FinanceRules.MaxAmount)
        {
            return OperationResult<MonthSummaryDto>.Fail("That budget is too large.");
        }

        if (!await db.Tags.AnyAsync(t => t.Id == tagId))
        {
            return OperationResult<MonthSummaryDto>.Fail("Tag not found.");
        }

        var baseCurrency = await BaseCurrencyAsync();
        if (baseCurrency is null)
        {
            return OperationResult<MonthSummaryDto>.Fail("Choose your base currency in Settings first — budgets are in it.");
        }

        var now = DateTime.UtcNow;
        var budget = await db.Budgets.FirstOrDefaultAsync(b => b.TagId == tagId && b.MonthStart == monthStart);
        if (budget is not null && amount is null)
        {
            budget.IsDeleted = true;
            budget.DeletedAt = now;
        }
        else if (budget is not null)
        {
            budget.Amount = amount!.Value;
            budget.Currency = baseCurrency;
            budget.UpdatedAt = now;
        }
        else if (amount is { } value)
        {
            db.Budgets.Add(new Budget
            {
                UserId = db.CurrentUserId!.Value, TagId = tagId, MonthStart = monthStart, Amount = value, Currency = baseCurrency,
            });
        }

        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            return OperationResult<MonthSummaryDto>.Fail("This budget was set somewhere else at the same time. Reload and try again.");
        }

        return await GetMonthAsync(monthStart);
    }

    public async Task<OperationResult<MonthSummaryDto>> CopyPreviousAsync(DateOnly monthStart)
    {
        if (monthStart.Day != 1)
        {
            return OperationResult<MonthSummaryDto>.Fail(NotMonthStart);
        }

        var previous = BudgetSummary.PreviousMonth(monthStart);
        var earlier = await db.Budgets.Where(b => b.MonthStart == previous).ToListAsync();
        if (earlier.Count == 0)
        {
            return OperationResult<MonthSummaryDto>.Fail("The month before has no budgets to copy.");
        }

        // Tags already budgeted this month keep their figure.
        var taken = (await db.Budgets.Where(b => b.MonthStart == monthStart).Select(b => b.TagId).ToListAsync()).ToHashSet();
        foreach (var b in earlier.Where(b => !taken.Contains(b.TagId)))
        {
            db.Budgets.Add(new Budget { UserId = b.UserId, TagId = b.TagId, MonthStart = monthStart, Amount = b.Amount, Currency = b.Currency });
        }

        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            return OperationResult<MonthSummaryDto>.Fail("This month's budgets were changed somewhere else at the same time. Reload and try again.");
        }

        return await GetMonthAsync(monthStart);
    }

    private async Task<string?> BaseCurrencyAsync() =>
        await db.Users.Where(u => u.Id == db.CurrentUserId).Select(u => u.BaseCurrency).FirstOrDefaultAsync();

    // ADO.NET shapes as they come.
    private sealed class LineRow
    {
        public int TagId { get; init; }
        public string TagName { get; init; } = string.Empty;
        public decimal? Budget { get; init; }
        public string? BudgetCurrency { get; init; }
        public decimal Spent { get; init; }
        public int Unconverted { get; init; }
        public int TransactionCount { get; init; }
    }

    private sealed class TotalsRow
    {
        public decimal Income { get; init; }
        public decimal Spending { get; init; }
        public decimal UntaggedSpending { get; init; }
        public int Unconverted { get; init; }
    }
}
