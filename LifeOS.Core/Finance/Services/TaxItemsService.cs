using System.Linq.Expressions;
using LifeOS.Core.Calendar.ServiceContracts;
using LifeOS.Core.Career.Services;
using LifeOS.Core.Finance.DTOs;
using LifeOS.Core.Finance.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Finance.Services;

/// <summary>
/// Things for the taxman: deadlines, deductions, payments, forms to collect, grouped by the user's own tax-year label.
/// A due day shows on the calendar (calendar.GetCalendarFeed's TaxItem branch); DoneOn marks it handled. An item
/// may point at the transaction it's about — with no amount of its own it takes the transaction's.
/// </summary>
public class TaxItemsService(AppDbContext db, IEntityLinksService entityLinksService, IRemindersService remindersService)
    : ITaxItemsService
{
    private const string NotFound = "Tax item not found.";

    public async Task<List<TaxItemDto>> GetAllAsync() =>
        await db.TaxItems
            // Newest tax year first; inside it, open before done, then by due day (undated last).
            .OrderByDescending(t => t.TaxYear).ThenBy(t => t.DoneOn != null).ThenBy(t => t.DueOn == null).ThenBy(t => t.DueOn).ThenBy(t => t.Title)
            .Select(ToDto)
            .ToListAsync();

    public async Task<OperationResult<TaxItemDto>> GetAsync(int id)
    {
        var item = await db.TaxItems.Where(t => t.Id == id).Select(ToDto).FirstOrDefaultAsync();
        return item is null ? OperationResult<TaxItemDto>.Fail(NotFound) : OperationResult<TaxItemDto>.Ok(item);
    }

    public async Task<OperationResult<TaxItemDto>> CreateAsync(TaxItemRequest request)
    {
        var item = new TaxItem { UserId = db.CurrentUserId!.Value };
        var error = await ApplyAsync(item, request);
        if (error is not null)
        {
            return OperationResult<TaxItemDto>.Fail(error);
        }

        db.TaxItems.Add(item);
        await db.SaveChangesAsync();
        return await GetAsync(item.Id);
    }

    public async Task<OperationResult<TaxItemDto>> UpdateAsync(int id, TaxItemRequest request)
    {
        var item = await db.TaxItems.FindAsync(id);
        if (item is null)
        {
            return OperationResult<TaxItemDto>.Fail(NotFound);
        }

        var error = await ApplyAsync(item, request);
        if (error is not null)
        {
            return OperationResult<TaxItemDto>.Fail(error);
        }

        item.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return await GetAsync(id);
    }

    public async Task<OperationResult<TaxItemDto>> SetDoneAsync(int id, TaxItemDoneRequest request)
    {
        var item = await db.TaxItems.FindAsync(id);
        if (item is null)
        {
            return OperationResult<TaxItemDto>.Fail(NotFound);
        }

        if (request.Today == default)
        {
            return OperationResult<TaxItemDto>.Fail("Today's date is required.");
        }

        if (request.DoneOn is { } done && done > request.Today)
        {
            return OperationResult<TaxItemDto>.Fail("It can't be done in the future.");
        }

        item.DoneOn = request.DoneOn;
        item.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return await GetAsync(id);
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var item = await db.TaxItems.FindAsync(id);
        if (item is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        await using var transaction = await db.Database.BeginTransactionAsync();
        item.IsDeleted = true;
        item.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        await entityLinksService.RemoveAllForEntityAsync(TaxItemLinkableProvider.Type, id);
        await remindersService.RemoveAllForEntityAsync(TaxItemLinkableProvider.Type, id);
        await transaction.CommitAsync();
        return OperationResult<bool>.Ok(true);
    }

    private async Task<string?> ApplyAsync(TaxItem item, TaxItemRequest request)
    {
        var title = request.Title.Trim();
        if (title.Length == 0)
        {
            return "Say what it is (e.g. File income tax return).";
        }

        if (request.Today == default)
        {
            return "Today's date is required.";
        }

        decimal? amount = request.Amount;
        var currency = string.IsNullOrWhiteSpace(request.Currency) ? null : CareerRules.Currency(request.Currency);
        if (!string.IsNullOrWhiteSpace(request.Currency) && currency is null)
        {
            return "Choose the amount's currency.";
        }

        if (request.TransactionId is { } transactionId)
        {
            var moved = await db.Transactions.Where(t => t.Id == transactionId)
                .Select(t => new { t.Amount, t.Currency }).FirstOrDefaultAsync();
            if (moved is null)
            {
                return "Transaction not found.";
            }

            if (amount is null && currency is null)
            {
                amount = moved.Amount;
                currency = moved.Currency;
            }
        }

        var error = ProtectionRules.CheckTaxItem(request.Kind, amount, currency, request.DoneOn, request.Today);
        if (error is not null)
        {
            return error;
        }

        item.Title = title;
        item.Kind = request.Kind;
        item.TaxYear = string.IsNullOrWhiteSpace(request.TaxYear) ? null : request.TaxYear.Trim();
        item.DueOn = request.DueOn;
        item.Amount = amount;
        item.Currency = currency;
        item.IsDeductible = request.IsDeductible;
        item.TransactionId = request.TransactionId;
        item.DoneOn = request.DoneOn;
        item.Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
        return null;
    }

    private static readonly Expression<Func<TaxItem, TaxItemDto>> ToDto = t => new TaxItemDto
    {
        Id = t.Id,
        Title = t.Title,
        Kind = t.Kind,
        TaxYear = t.TaxYear,
        DueOn = t.DueOn,
        Amount = t.Amount,
        Currency = t.Currency,
        IsDeductible = t.IsDeductible,
        TransactionId = t.TransactionId,
        TransactionOn = t.Transaction != null ? t.Transaction.OccurredOn : null,
        TransactionPayee = t.Transaction != null ? t.Transaction.Payee : null,
        TransactionAmount = t.Transaction != null ? t.Transaction.Amount : null,
        TransactionCurrency = t.Transaction != null ? t.Transaction.Currency : null,
        DoneOn = t.DoneOn,
        Notes = t.Notes,
    };
}

/// <summary>Tax items can be linked, have reminders, open from the calendar and be found by search.</summary>
public class TaxItemLinkableProvider(AppDbContext db) : ILinkableEntityProvider
{
    public const string Type = "TaxItem";

    public string EntityType => Type;

    public string DisplayName => "Tax item";

    public async Task<Dictionary<int, string>> GetTitlesAsync(IReadOnlyCollection<int> ids) =>
        await db.TaxItems.Where(t => ids.Contains(t.Id)).ToDictionaryAsync(t => t.Id, t => t.Title);

    public async Task<List<LinkableItemDto>> SearchAsync(string? search, int take)
    {
        var query = db.TaxItems.AsQueryable();
        if (!string.IsNullOrEmpty(search))
        {
            query = query.Where(t => t.Title.Contains(search) || (t.TaxYear != null && t.TaxYear.Contains(search)));
        }

        return await query
            .OrderBy(t => t.DoneOn != null).ThenBy(t => t.Title)
            .Take(take)
            .Select(t => new LinkableItemDto { EntityType = Type, EntityId = t.Id, Title = t.Title })
            .ToListAsync();
    }
}
