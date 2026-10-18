using System.Data;
using System.Linq.Expressions;
using Dapper;
using LifeOS.Core.Calendar.ServiceContracts;
using LifeOS.Core.Career.Services;
using LifeOS.Core.Documents.Services;
using LifeOS.Core.Finance.DTOs;
using LifeOS.Core.Finance.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using LifeOS.Core.Shared.Services;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Finance.Services;

/// <summary>
/// Where money sits. An account keeps one opening balance on its opening date; its balance on a day is that plus
/// what came in minus what went out (finance.GetAccountBalances), never stored. Names are unique per user. An account
/// money has moved through can't be deleted (archive it), nor change its currency.
/// </summary>
public class AccountsService(AppDbContext db, IEntityLinksService entityLinksService, IRemindersService remindersService)
    : IAccountsService
{
    private const string NotFound = "Account not found.";
    private const string Duplicate = "You already have an account with that name.";

    public async Task<List<AccountDto>> GetAllAsync(DateOnly asOf)
    {
        var accounts = await db.Accounts
            .OrderBy(a => a.IsArchived).ThenBy(a => a.Name)
            .Select(ToDto)
            .ToListAsync();
        await FillBalancesAsync(accounts, asOf);
        return accounts;
    }

    public async Task<OperationResult<AccountDto>> GetAsync(int id, DateOnly asOf)
    {
        var account = await db.Accounts.Where(a => a.Id == id).Select(ToDto).FirstOrDefaultAsync();
        if (account is null)
        {
            return OperationResult<AccountDto>.Fail(NotFound);
        }

        await FillBalancesAsync([account], asOf);
        return OperationResult<AccountDto>.Ok(account);
    }

    public async Task<OperationResult<AccountDto>> CreateAsync(AccountRequest request, DateOnly asOf)
    {
        var account = new Account { UserId = db.CurrentUserId!.Value };
        var error = await ApplyAsync(account, request);
        if (error is not null)
        {
            return OperationResult<AccountDto>.Fail(error);
        }

        db.Accounts.Add(account);
        return await SaveAsync(account, asOf);
    }

    public async Task<OperationResult<AccountDto>> UpdateAsync(int id, AccountRequest request, DateOnly asOf)
    {
        var account = await db.Accounts.FindAsync(id);
        if (account is null)
        {
            return OperationResult<AccountDto>.Fail(NotFound);
        }

        var error = await ApplyAsync(account, request);
        if (error is not null)
        {
            return OperationResult<AccountDto>.Fail(error);
        }

        account.UpdatedAt = DateTime.UtcNow;
        return await SaveAsync(account, asOf);
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var account = await db.Accounts.FindAsync(id);
        if (account is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        var used = await db.Transactions.CountAsync(t => t.FromAccountId == id || t.ToAccountId == id);
        if (used > 0)
        {
            return OperationResult<bool>.Fail(
                $"{used} transaction{(used == 1 ? " uses" : "s use")} this account — archive it instead, so the history stays.");
        }

        if (await db.RecurringTransactions.AnyAsync(r => r.FromAccountId == id || r.ToAccountId == id))
        {
            return OperationResult<bool>.Fail("A repeating transaction uses this account — change or delete that first.");
        }

        var now = DateTime.UtcNow;
        await using var transaction = await db.Database.BeginTransactionAsync();
        await db.Holdings.Where(h => h.AccountId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(h => h.AccountId, (int?)null).SetProperty(h => h.UpdatedAt, now));
        await db.Loans.Where(l => l.AccountId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(l => l.AccountId, (int?)null).SetProperty(l => l.UpdatedAt, now));
        account.IsDeleted = true;
        account.DeletedAt = now;
        await db.SaveChangesAsync();
        await entityLinksService.RemoveAllForEntityAsync(AccountLinkableProvider.Type, id);
        await remindersService.RemoveAllForEntityAsync(AccountLinkableProvider.Type, id);
        await transaction.CommitAsync();
        return OperationResult<bool>.Ok(true);
    }

    private async Task<OperationResult<AccountDto>> SaveAsync(Account account, DateOnly asOf)
    {
        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            return OperationResult<AccountDto>.Fail(Duplicate);
        }

        return await GetAsync(account.Id, asOf);
    }

    private async Task<string?> ApplyAsync(Account account, AccountRequest request)
    {
        var name = request.Name.Trim();
        if (name.Length == 0)
        {
            return "Name the account.";
        }

        var currency = CareerRules.Currency(request.Currency);
        DateOnly? firstOn = account.Id == 0
            ? null
            : await db.Transactions.Where(t => t.FromAccountId == account.Id || t.ToAccountId == account.Id)
                .MinAsync(t => (DateOnly?)t.OccurredOn);
        var error = FinanceRules.CheckAccount(
            request.Kind, currency, request.OpeningBalance, request.OpeningDate, account.Id == 0 ? null : account.Currency, firstOn);
        if (error is not null)
        {
            return error;
        }

        if (await db.Accounts.AnyAsync(a => a.Name == name && a.Id != account.Id))
        {
            return Duplicate;
        }

        account.Name = name;
        account.Kind = request.Kind;
        account.Institution = string.IsNullOrWhiteSpace(request.Institution) ? null : request.Institution.Trim();
        account.NumberLast4 = DocumentRules.Last4(request.Number);
        account.Currency = currency!;
        account.OpeningBalance = request.OpeningBalance;
        account.OpeningDate = request.OpeningDate;
        account.IsArchived = request.IsArchived;
        account.Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
        return null;
    }

    private async Task FillBalancesAsync(IReadOnlyCollection<AccountDto> accounts, DateOnly asOf)
    {
        if (accounts.Count == 0)
        {
            return;
        }

        var parameters = new DynamicParameters();
        parameters.Add("UserId", db.CurrentUserId!.Value, DbType.Int32);
        parameters.Add("AsOf", asOf.ToDateTime(TimeOnly.MinValue), DbType.Date);
        var rows = (await db.Database.GetDbConnection().QueryAsync<BalanceRow>(
                "finance.GetAccountBalances", parameters, commandType: CommandType.StoredProcedure))
            .ToDictionary(r => r.AccountId);
        foreach (var account in accounts)
        {
            if (rows.TryGetValue(account.Id, out var row))
            {
                account.Balance = account.OpeningBalance + row.MoneyIn - row.MoneyOut;
                account.TransactionCount = row.TransactionCount;
                account.LastOn = row.LastOn is { } last ? DateOnly.FromDateTime(last) : null;
            }
            else
            {
                account.Balance = account.OpeningBalance;
            }
        }
    }

    // ADO.NET shapes as they come (DATE → DateTime).
    private sealed class BalanceRow
    {
        public int AccountId { get; init; }
        public decimal MoneyIn { get; init; }
        public decimal MoneyOut { get; init; }
        public int TransactionCount { get; init; }
        public DateTime? LastOn { get; init; }
    }

    private static readonly Expression<Func<Account, AccountDto>> ToDto = a => new AccountDto
    {
        Id = a.Id,
        Name = a.Name,
        Kind = a.Kind,
        Institution = a.Institution,
        NumberLast4 = a.NumberLast4,
        Currency = a.Currency,
        OpeningBalance = a.OpeningBalance,
        OpeningDate = a.OpeningDate,
        IsArchived = a.IsArchived,
        Notes = a.Notes,
    };
}
