using System.Linq.Expressions;
using LifeOS.Core.Calendar.ServiceContracts;
using LifeOS.Core.Finance.DTOs;
using LifeOS.Core.Finance.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using LifeOS.Core.Shared.Services;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Finance.Services;

/// <summary>
/// The ledger. Each movement of money is one row — a transfer has both accounts, so it can't be half-recorded —
/// checked by <see cref="FinanceRules.CheckTransaction"/>; tags are replaced whole on save; totals are worked out in
/// the base currency by <see cref="FinanceRules.Totals"/>. Receipts are attachments on the transaction.
/// </summary>
public class TransactionsService(
    AppDbContext db, IEntityLinksService entityLinksService, IRemindersService remindersService, IAttachmentsService attachmentsService)
    : ITransactionsService
{
    private const string NotFound = "Transaction not found.";
    private const string NoBaseCurrency = "Choose your base currency in Settings first — totals are reported in it.";

    public async Task<LedgerDto> GetLedgerAsync(DateOnly? from, DateOnly? to, int? accountId, int? tagId, string? kind)
    {
        var query = db.Transactions.AsQueryable();
        if (from is { } f)
        {
            query = query.Where(t => t.OccurredOn >= f);
        }

        if (to is { } until)
        {
            query = query.Where(t => t.OccurredOn <= until);
        }

        if (accountId is { } account)
        {
            query = query.Where(t => t.FromAccountId == account || t.ToAccountId == account);
        }

        if (tagId is { } tag)
        {
            query = query.Where(t => t.TransactionTags.Any(tt => tt.TagId == tag));
        }

        if (!string.IsNullOrEmpty(kind))
        {
            query = query.Where(t => t.Kind == kind);
        }

        var transactions = await query
            .OrderByDescending(t => t.OccurredOn).ThenByDescending(t => t.Id)
            .Select(ToDto)
            .AsSplitQuery()
            .ToListAsync();
        var baseCurrency = await BaseCurrencyAsync();
        return new LedgerDto
        {
            Transactions = transactions,
            Totals = FinanceRules.Totals(
                transactions.Select(t => new LedgerLine(t.Kind, t.Amount, t.Currency, t.ExchangeRate)), baseCurrency),
        };
    }

    public async Task<OperationResult<TransactionDto>> GetAsync(int id)
    {
        var transaction = await db.Transactions.Where(t => t.Id == id).Select(ToDto).AsSplitQuery().FirstOrDefaultAsync();
        return transaction is null ? OperationResult<TransactionDto>.Fail(NotFound) : OperationResult<TransactionDto>.Ok(transaction);
    }

    public async Task<OperationResult<TransactionDto>> CreateAsync(TransactionRequest request)
    {
        var userId = db.CurrentUserId!.Value;
        var transaction = new Transaction { UserId = userId };
        var error = await ApplyAsync(transaction, request);
        if (error is not null)
        {
            return OperationResult<TransactionDto>.Fail(error);
        }

        foreach (var tagId in request.TagIds.Distinct())
        {
            transaction.TransactionTags.Add(new TransactionTag { UserId = userId, TagId = tagId });
        }

        db.Transactions.Add(transaction);
        await db.SaveChangesAsync();
        return await GetAsync(transaction.Id);
    }

    public async Task<OperationResult<TransactionDto>> UpdateAsync(int id, TransactionRequest request)
    {
        var transaction = await db.Transactions.FindAsync(id);
        if (transaction is null)
        {
            return OperationResult<TransactionDto>.Fail(NotFound);
        }

        var error = await ApplyAsync(transaction, request);
        if (error is not null)
        {
            return OperationResult<TransactionDto>.Fail(error);
        }

        var now = DateTime.UtcNow;
        transaction.UpdatedAt = now;
        var wanted = request.TagIds.ToHashSet();
        var current = await db.TransactionTags.Where(t => t.TransactionId == id).ToListAsync();
        foreach (var tag in current.Where(t => !wanted.Contains(t.TagId)))
        {
            tag.IsDeleted = true;
            tag.DeletedAt = now;
        }

        foreach (var tagId in wanted.Except(current.Select(t => t.TagId)))
        {
            db.TransactionTags.Add(new TransactionTag { UserId = transaction.UserId, TransactionId = id, TagId = tagId });
        }

        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            return OperationResult<TransactionDto>.Fail("This transaction was changed somewhere else at the same time. Reload and try again.");
        }

        return await GetAsync(id);
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var transaction = await db.Transactions.FindAsync(id);
        if (transaction is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        var now = DateTime.UtcNow;
        await using var dbTransaction = await db.Database.BeginTransactionAsync();
        await db.TransactionTags.Where(t => t.TransactionId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.IsDeleted, true).SetProperty(t => t.DeletedAt, now));
        await db.TaxItems.Where(t => t.TransactionId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.TransactionId, (int?)null).SetProperty(t => t.UpdatedAt, now));
        transaction.IsDeleted = true;
        transaction.DeletedAt = now;
        await db.SaveChangesAsync();
        await attachmentsService.RemoveAllForEntityAsync(TransactionLinkableProvider.Type, id);
        await entityLinksService.RemoveAllForEntityAsync(TransactionLinkableProvider.Type, id);
        await remindersService.RemoveAllForEntityAsync(TransactionLinkableProvider.Type, id);
        await dbTransaction.CommitAsync();
        return OperationResult<bool>.Ok(true);
    }

    private async Task<string?> BaseCurrencyAsync() =>
        await db.Users.Where(u => u.Id == db.CurrentUserId).Select(u => u.BaseCurrency).FirstOrDefaultAsync();

    private async Task<string?> ApplyAsync(Transaction transaction, TransactionRequest request)
    {
        var baseCurrency = await BaseCurrencyAsync();
        if (baseCurrency is null)
        {
            return NoBaseCurrency;
        }

        var accountIds = new[] { request.FromAccountId, request.ToAccountId }.OfType<int>().Distinct().ToList();
        var accounts = await db.Accounts.Where(a => accountIds.Contains(a.Id))
            .Select(a => new { a.Id, a.Currency, a.OpeningDate, a.IsArchived, Extra = a.AccountCurrencies.Select(c => c.Currency).ToList() })
            .ToDictionaryAsync(a => a.Id, a => new LedgerAccount(a.Id, a.Currency, a.OpeningDate, a.IsArchived, a.Extra));
        if (accounts.Count != accountIds.Count)
        {
            return "Account not found.";
        }

        if (request.EmploymentId is { } employmentId && !await db.Employments.AnyAsync(e => e.Id == employmentId))
        {
            return "Role not found.";
        }

        if (request.SideIncomeSourceId is { } sideId && !await db.SideIncomeSources.AnyAsync(s => s.Id == sideId))
        {
            return "Side income not found.";
        }

        if (request.EmploymentId is not null && request.SideIncomeSourceId is not null)
        {
            return "An income is either salary or side income, not both.";
        }

        var tagIds = request.TagIds.Distinct().ToList();
        if (tagIds.Count > 0 && await db.Tags.CountAsync(t => tagIds.Contains(t.Id)) != tagIds.Count)
        {
            return "Tag not found.";
        }

        var kept = new HashSet<int>(new[] { transaction.FromAccountId, transaction.ToAccountId }.OfType<int>());
        var (ok, error) = FinanceRules.CheckTransaction(
            new TransactionInput(
                request.Kind,
                request.OccurredOn,
                request.Amount,
                request.ExchangeRate,
                request.ToAmount,
                request.FromAccountId is { } fromId ? accounts[fromId] : null,
                request.ToAccountId is { } toId ? accounts[toId] : null,
                request.EmploymentId is not null || request.SideIncomeSourceId is not null,
                FinanceRules.Code(request.Currency),
                FinanceRules.Code(request.ToCurrency)),
            baseCurrency,
            kept);
        if (ok is null)
        {
            return error;
        }

        transaction.Kind = request.Kind;
        transaction.OccurredOn = request.OccurredOn;
        transaction.Amount = request.Amount;
        transaction.Currency = ok.Currency;
        transaction.ExchangeRate = ok.ExchangeRate;
        transaction.ToAmount = ok.ToAmount;
        transaction.ToCurrency = ok.ToCurrency;
        transaction.FromAccountId = request.FromAccountId;
        transaction.ToAccountId = request.ToAccountId;
        transaction.Payee = string.IsNullOrWhiteSpace(request.Payee) ? null : request.Payee.Trim();
        transaction.Note = string.IsNullOrWhiteSpace(request.Note) ? null : request.Note.Trim();
        transaction.Reference = string.IsNullOrWhiteSpace(request.Reference) ? null : request.Reference.Trim();
        transaction.EmploymentId = request.EmploymentId;
        transaction.SideIncomeSourceId = request.SideIncomeSourceId;
        return null;
    }

    internal static readonly Expression<Func<Transaction, TransactionDto>> ToDto = t => new TransactionDto
    {
        Id = t.Id,
        Kind = t.Kind,
        OccurredOn = t.OccurredOn,
        Amount = t.Amount,
        Currency = t.Currency,
        ExchangeRate = t.ExchangeRate,
        ToAmount = t.ToAmount,
        FromAccountId = t.FromAccountId,
        FromAccountName = t.FromAccount != null ? t.FromAccount.Name : null,
        ToAccountId = t.ToAccountId,
        ToAccountName = t.ToAccount != null ? t.ToAccount.Name : null,
        ToCurrency = t.ToCurrency,
        Payee = t.Payee,
        Note = t.Note,
        Reference = t.Reference,
        EmploymentId = t.EmploymentId,
        EmploymentTitle = t.Employment != null ? t.Employment.Role + " at " + t.Employment.Organisation : null,
        SideIncomeSourceId = t.SideIncomeSourceId,
        SideIncomeName = t.SideIncomeSource != null ? t.SideIncomeSource.Name : null,
        RecurringTransactionId = t.RecurringTransactionId,
        RecurringName = t.RecurringTransaction != null ? t.RecurringTransaction.Name : null,
        Tags = t.TransactionTags.OrderBy(tt => tt.Tag.Name).Select(tt => new TagDto { Id = tt.TagId, Name = tt.Tag.Name }).ToList(),
    };
}
