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
/// Bank statements in, one account at a time. The client reads the CSV and maps its columns; this checks every line
/// with <see cref="FinanceRules.CheckTransaction"/> (+ in = income, − out = expense), skips lines already imported
/// (<see cref="StatementImport.Hashes"/> against every ImportHash the user has, deleted rows included) and writes
/// the rest — all or nothing: one bad line and nothing is written. A preview runs the same checks and writes nothing.
/// Lines in another currency than the base take the exchange-rate master's rate for their day.
/// </summary>
public class StatementImportService(AppDbContext db) : IStatementImportService
{
    public async Task<OperationResult<ImportResultDto>> ImportAsync(ImportRequest request, bool write)
    {
        if (request.Lines.Count == 0)
        {
            return OperationResult<ImportResultDto>.Fail("The statement has no lines to import.");
        }

        if (request.Lines.Count > StatementImport.MaxLines)
        {
            return OperationResult<ImportResultDto>.Fail(
                $"That's {request.Lines.Count} lines — import at most {StatementImport.MaxLines} at a time (split the file by date).");
        }

        var userId = db.CurrentUserId!.Value;
        var baseCurrency = await db.Users.Where(u => u.Id == userId).Select(u => u.BaseCurrency).FirstOrDefaultAsync();
        if (baseCurrency is null)
        {
            return OperationResult<ImportResultDto>.Fail("Choose your base currency in Settings first — totals are reported in it.");
        }

        var account = await db.Accounts.Where(a => a.Id == request.AccountId)
            .Select(a => new LedgerAccount(a.Id, a.Currency, a.OpeningDate, a.IsArchived))
            .FirstOrDefaultAsync();
        if (account is null)
        {
            return OperationResult<ImportResultDto>.Fail("Account not found.");
        }

        var tagIds = request.TagIds.Distinct().ToList();
        if (tagIds.Count > 0 && await db.Tags.CountAsync(t => tagIds.Contains(t.Id)) != tagIds.Count)
        {
            return OperationResult<ImportResultDto>.Fail("Tag not found.");
        }

        List<CurrencyRate> master = [], typed = [];
        if (account.Currency != baseCurrency)
        {
            master = await FinanceRates.MasterAsync(db, baseCurrency);
            typed = await FinanceRates.TypedAsync(db);
        }

        var lines = request.Lines.Select(l => new StatementLine(l.OccurredOn, l.Amount, StatementImport.Clean(l.Description))).ToList();
        var accountKey = await db.Accounts.Where(a => a.Id == account.Id).Select(a => a.ImportKey).FirstAsync();
        var hashes = StatementImport.Hashes(accountKey, lines);
        // Deleted rows count too: an imported line you deleted doesn't come back. (The index is per user, so the
        // query filters are bypassed and the user is filtered by hand.)
        var known = (await db.Transactions.IgnoreQueryFilters()
                .Where(t => t.UserId == userId && t.ImportHash != null && hashes.Contains(t.ImportHash))
                .Select(t => t.ImportHash!)
                .ToListAsync())
            .ToHashSet(StringComparer.Ordinal);

        var results = new List<ImportLineResultDto>(lines.Count);
        var toWrite = new List<Transaction>();
        var noAccounts = new HashSet<int>();
        for (var i = 0; i < lines.Count; i++)
        {
            var line = lines[i];
            if (known.Contains(hashes[i]))
            {
                results.Add(new ImportLineResultDto { Index = i, Status = ImportLineStatuses.Duplicate });
                continue;
            }

            var error = CheckLine(line, account, baseCurrency, master, typed, noAccounts, out var transaction);
            if (error is not null)
            {
                results.Add(new ImportLineResultDto { Index = i, Status = ImportLineStatuses.Error, Error = error });
                continue;
            }

            transaction!.UserId = userId;
            transaction.ImportHash = hashes[i];
            transaction.Reference = StatementImport.Fit(request.Lines[i].Reference, 100);
            foreach (var tagId in tagIds)
            {
                transaction.TransactionTags.Add(new TransactionTag { UserId = userId, TagId = tagId });
            }

            toWrite.Add(transaction);
            results.Add(new ImportLineResultDto { Index = i, Status = ImportLineStatuses.New });
        }

        var errors = results.Count(r => r.Status == ImportLineStatuses.Error);
        var added = 0;
        if (write && errors == 0 && toWrite.Count > 0)
        {
            db.Transactions.AddRange(toWrite);
            try
            {
                await db.SaveChangesAsync();
            }
            catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
            {
                return OperationResult<ImportResultDto>.Fail(
                    "Some of these lines were imported at the same moment by another request — nothing was added; import again to add the rest.");
            }

            added = toWrite.Count;
        }

        return OperationResult<ImportResultDto>.Ok(new ImportResultDto
        {
            Added = added,
            New = toWrite.Count,
            Duplicates = results.Count(r => r.Status == ImportLineStatuses.Duplicate),
            Errors = errors,
            Lines = results,
        });
    }

    private static string? CheckLine(
        StatementLine line, LedgerAccount account, string baseCurrency, List<CurrencyRate> master, List<CurrencyRate> typed,
        HashSet<int> kept, out Transaction? transaction)
    {
        transaction = null;
        if (line.OccurredOn == default)
        {
            return "No date.";
        }

        if (line.Amount == 0)
        {
            return "The amount is zero.";
        }

        decimal? rate = null;
        if (account.Currency != baseCurrency)
        {
            rate = NetWorth.RateFor(account.Currency, line.OccurredOn, master, typed);
            if (rate is null)
            {
                return $"No {account.Currency} rate for that day — add one under Settings › Exchange rates.";
            }
        }

        var income = line.Amount > 0;
        var kind = income ? TransactionKinds.Income : TransactionKinds.Expense;
        var (ok, error) = FinanceRules.CheckTransaction(
            new TransactionInput(kind, line.OccurredOn, Math.Abs(line.Amount), rate, null, income ? null : account, income ? account : null, false),
            baseCurrency,
            kept);
        if (ok is null)
        {
            return error;
        }

        transaction = new Transaction
        {
            Kind = kind,
            OccurredOn = line.OccurredOn,
            Amount = Math.Abs(line.Amount),
            Currency = ok.Currency,
            ExchangeRate = ok.ExchangeRate,
            FromAccountId = income ? null : account.Id,
            ToAccountId = income ? account.Id : null,
            Payee = StatementImport.Fit(line.Description, 200),
        };
        return null;
    }
}

/// <summary>Money over time for the Reports page: cash flow and savings rate by month, spending by tag.</summary>
public class FinanceReportsService(AppDbContext db) : IFinanceReportsService
{
    public async Task<CashFlowReportDto> GetCashFlowAsync(DateOnly today, int months)
    {
        var userId = db.CurrentUserId!.Value;
        var baseCurrency = await db.Users.Where(u => u.Id == userId).Select(u => u.BaseCurrency).FirstOrDefaultAsync();
        if (baseCurrency is null)
        {
            return new CashFlowReportDto();
        }

        var firstMonth = CashFlowReport.FirstMonth(today, months);
        var lastMonth = CashFlowReport.FirstMonth(today, 1);
        var parameters = new DynamicParameters();
        parameters.Add("UserId", userId, DbType.Int32);
        parameters.Add("FromMonth", firstMonth.ToDateTime(TimeOnly.MinValue), DbType.Date);
        parameters.Add("ToDate", today.ToDateTime(TimeOnly.MinValue), DbType.Date);
        parameters.Add("BaseCurrency", baseCurrency, DbType.AnsiStringFixedLength, size: 3);
        await using var reader = await db.Database.GetDbConnection().QueryMultipleAsync(
            "finance.GetCashFlow", parameters, commandType: CommandType.StoredProcedure);

        // Read in exactly the order the procedure returns them.
        var monthRows = (await reader.ReadAsync<MonthRow>()).ToList();
        var tagRows = (await reader.ReadAsync<CashFlowTagDto>()).ToList();
        var untagged = await reader.ReadSingleAsync<decimal>();

        var monthList = CashFlowReport.Months(
            monthRows.Select(r => new CashFlowRow(DateOnly.FromDateTime(r.MonthStart), r.Income, r.Spending, r.Unconverted)),
            firstMonth,
            lastMonth);
        return new CashFlowReportDto
        {
            Currency = baseCurrency,
            Months = monthList,
            Total = CashFlowReport.Total(monthList),
            Tags = tagRows,
            UntaggedSpending = Math.Round(untagged, 4),
        };
    }

    private sealed class MonthRow
    {
        public DateTime MonthStart { get; init; }
        public decimal Income { get; init; }
        public decimal Spending { get; init; }
        public int Unconverted { get; init; }
    }
}
