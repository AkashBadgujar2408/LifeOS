using System.Globalization;
using System.Linq.Expressions;
using LifeOS.Core.Calendar.ServiceContracts;
using LifeOS.Core.Career.Services;
using LifeOS.Core.Finance.DTOs;
using LifeOS.Core.Finance.ServiceContracts;
using LifeOS.Core.Home.DTOs;
using LifeOS.Core.Home.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using LifeOS.Core.Shared.Services;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Home.Services;

/// <summary>
/// Bills for running the house. Paying one can record it in Finance: one Expense through
/// <see cref="ITransactionsService"/> (so every Finance rule applies), stored as the bill's TransactionId — unique, so a
/// bill is never in the ledger twice. Taking the payment back deletes that expense. The due day is on the calendar
/// (the UtilityBill branch of calendar.GetCalendarFeed).
/// </summary>
public class UtilityBillsService(
    AppDbContext db,
    ITransactionsService transactionsService,
    IEntityLinksService entityLinksService,
    IRemindersService remindersService) : IUtilityBillsService
{
    private const string NotFound = "Bill not found.";

    public async Task<List<UtilityBillDto>> GetAllAsync() =>
        // Unpaid first (due soonest), then paid ones, latest due first.
        (await db.UtilityBills.Select(ToDto).ToListAsync())
            .OrderBy(b => b.PaidOn is not null)
            .ThenBy(b => b.PaidOn is null ? b.DueOn.DayNumber : -b.DueOn.DayNumber)
            .ThenBy(b => b.Id)
            .ToList();

    public async Task<OperationResult<UtilityBillDto>> GetAsync(int id)
    {
        var bill = await db.UtilityBills.Where(b => b.Id == id).Select(ToDto).FirstOrDefaultAsync();
        return bill is null ? OperationResult<UtilityBillDto>.Fail(NotFound) : OperationResult<UtilityBillDto>.Ok(bill);
    }

    public async Task<OperationResult<UtilityBillDto>> CreateAsync(UtilityBillRequest request)
    {
        var bill = new UtilityBill { UserId = db.CurrentUserId!.Value };
        var error = await ApplyAsync(bill, request);
        if (error is not null)
        {
            return OperationResult<UtilityBillDto>.Fail(error);
        }

        db.UtilityBills.Add(bill);
        await db.SaveChangesAsync();
        return await GetAsync(bill.Id);
    }

    public async Task<OperationResult<UtilityBillDto>> UpdateAsync(int id, UtilityBillRequest request)
    {
        var bill = await db.UtilityBills.FindAsync(id);
        if (bill is null)
        {
            return OperationResult<UtilityBillDto>.Fail(NotFound);
        }

        var (amount, currency) = (bill.Amount, bill.Currency);
        var error = await ApplyAsync(bill, request);
        if (error is not null)
        {
            return OperationResult<UtilityBillDto>.Fail(error);
        }

        // The ledger already has the paid amount; changing it here would make the two disagree.
        if (bill.TransactionId is not null && (bill.Amount != amount || bill.Currency != currency))
        {
            return OperationResult<UtilityBillDto>.Fail("It's paid in Finance already — take the payment back first to change the amount.");
        }

        bill.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return await GetAsync(id);
    }

    public async Task<OperationResult<UtilityBillDto>> PayAsync(int id, BillPaidRequest request)
    {
        var bill = await db.UtilityBills.Include(b => b.Property).FirstOrDefaultAsync(b => b.Id == id);
        if (bill is null)
        {
            return OperationResult<UtilityBillDto>.Fail(NotFound);
        }

        if (request.Today == default)
        {
            return OperationResult<UtilityBillDto>.Fail("Today's date is required.");
        }

        var error = HomeRules.CheckPaid(request.PaidOn, request.Today);
        if (error is not null)
        {
            return OperationResult<UtilityBillDto>.Fail(error);
        }

        if (bill.PaidOn is not null)
        {
            return OperationResult<UtilityBillDto>.Fail("It's paid already.");
        }

        await using var transaction = await db.Database.BeginTransactionAsync();
        if (request.AccountId is { } accountId)
        {
            var expense = await transactionsService.CreateAsync(new TransactionRequest
            {
                Kind = TransactionKinds.Expense,
                OccurredOn = request.PaidOn,
                Amount = bill.Amount,
                Currency = bill.Currency,
                ExchangeRate = request.ExchangeRate,
                FromAccountId = accountId,
                Payee = bill.Provider ?? BillPayee(bill.Kind),
                Note = BillNote(bill),
                TagIds = request.TagIds,
            });
            if (!expense.Success)
            {
                return OperationResult<UtilityBillDto>.Fail(expense.Error!);
            }

            bill.TransactionId = expense.Data!.Id;
        }

        bill.PaidOn = request.PaidOn;
        bill.UpdatedAt = DateTime.UtcNow;
        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            return OperationResult<UtilityBillDto>.Fail("This bill was paid somewhere else at the same time. Reload.");
        }

        await transaction.CommitAsync();
        return await GetAsync(id);
    }

    public async Task<OperationResult<UtilityBillDto>> UnpayAsync(int id)
    {
        var bill = await db.UtilityBills.FindAsync(id);
        if (bill is null)
        {
            return OperationResult<UtilityBillDto>.Fail(NotFound);
        }

        // The expense this bill created goes too (deleting it also clears TransactionId here).
        if (bill.TransactionId is { } transactionId)
        {
            var deleted = await transactionsService.DeleteAsync(transactionId);
            if (!deleted.Success)
            {
                return OperationResult<UtilityBillDto>.Fail(deleted.Error!);
            }

            await db.Entry(bill).ReloadAsync();
        }

        bill.PaidOn = null;
        bill.TransactionId = null;
        bill.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return await GetAsync(id);
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var bill = await db.UtilityBills.FindAsync(id);
        if (bill is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        await using var transaction = await db.Database.BeginTransactionAsync();
        // Money that really left stays in the ledger; only the bill goes.
        bill.IsDeleted = true;
        bill.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        await entityLinksService.RemoveAllForEntityAsync(UtilityBillLinkableProvider.Type, id);
        await remindersService.RemoveAllForEntityAsync(UtilityBillLinkableProvider.Type, id);
        await transaction.CommitAsync();
        return OperationResult<bool>.Ok(true);
    }

    private async Task<string?> ApplyAsync(UtilityBill bill, UtilityBillRequest request)
    {
        var currency = CareerRules.Currency(request.Currency);
        var error = HomeRules.CheckBill(
            request.Kind, request.PeriodStart, request.PeriodEnd, request.DueOn, request.Amount, currency, request.UnitsUsed);
        if (error is not null)
        {
            return error;
        }

        if (request.PropertyId is { } propertyId && !await db.Properties.AnyAsync(p => p.Id == propertyId))
        {
            return "Property not found.";
        }

        bill.PropertyId = request.PropertyId;
        bill.Kind = request.Kind;
        bill.Provider = Clean(request.Provider);
        bill.PeriodStart = request.PeriodStart;
        bill.PeriodEnd = request.PeriodEnd;
        bill.DueOn = request.DueOn;
        bill.Amount = request.Amount;
        bill.Currency = currency!;
        bill.UnitsUsed = request.UnitsUsed;
        bill.Notes = Clean(request.Notes);
        return null;
    }

    /// <summary>"Electricity bill" when there's no provider to name.</summary>
    internal static string BillPayee(string kind) => kind == "Other" ? "Bill" : $"{kind} bill";

    /// <summary>"Electricity bill, Flat 4B, 01/Sep/2026 – 30/Sep/2026" — what the expense is for.</summary>
    internal static string BillNote(UtilityBill bill)
    {
        var parts = new List<string> { BillPayee(bill.Kind) };
        if (bill.Property is not null)
        {
            parts.Add(bill.Property.Name);
        }

        if (bill.PeriodStart is { } start && bill.PeriodEnd is { } end)
        {
            parts.Add($"{start.ToString("dd'/'MMM'/'yyyy", CultureInfo.InvariantCulture)} – " +
                end.ToString("dd'/'MMM'/'yyyy", CultureInfo.InvariantCulture));
        }

        return string.Join(", ", parts);
    }

    private static string? Clean(string? text) => string.IsNullOrWhiteSpace(text) ? null : text.Trim();

    private static readonly Expression<Func<UtilityBill, UtilityBillDto>> ToDto = b => new UtilityBillDto
    {
        Id = b.Id,
        PropertyId = b.PropertyId,
        PropertyName = b.Property != null ? b.Property.Name : null,
        Kind = b.Kind,
        Provider = b.Provider,
        PeriodStart = b.PeriodStart,
        PeriodEnd = b.PeriodEnd,
        DueOn = b.DueOn,
        Amount = b.Amount,
        Currency = b.Currency,
        UnitsUsed = b.UnitsUsed,
        PaidOn = b.PaidOn,
        TransactionId = b.TransactionId,
        PaidFromAccountName = b.Transaction != null && b.Transaction.FromAccount != null ? b.Transaction.FromAccount.Name : null,
        Notes = b.Notes,
    };
}

/// <summary>Bills: linked (the bill PDF in Documents), reminders, found by kind or provider.</summary>
public class UtilityBillLinkableProvider(AppDbContext db) : ILinkableEntityProvider
{
    public const string Type = "UtilityBill";

    public string EntityType => Type;

    public string DisplayName => "Bill";

    public async Task<Dictionary<int, string>> GetTitlesAsync(IReadOnlyCollection<int> ids) =>
        (await Titled(db.UtilityBills.Where(b => ids.Contains(b.Id)))).ToDictionary(b => b.EntityId, b => b.Title);

    public async Task<List<LinkableItemDto>> SearchAsync(string? search, int take)
    {
        var query = db.UtilityBills.AsQueryable();
        if (!string.IsNullOrEmpty(search))
        {
            query = query.Where(b => b.Kind.Contains(search) || (b.Provider != null && b.Provider.Contains(search)));
        }

        return await Titled(query.OrderByDescending(b => b.DueOn).Take(take));
    }

    /// <summary>"MSEDCL bill due 25/Oct/2026" (the date formatted here, not in SQL).</summary>
    private static async Task<List<LinkableItemDto>> Titled(IQueryable<UtilityBill> query) =>
        (await query.Select(b => new { b.Id, Name = b.Provider ?? b.Kind, b.DueOn }).ToListAsync())
            .Select(b => new LinkableItemDto
            {
                EntityType = Type,
                EntityId = b.Id,
                Title = $"{b.Name} bill due {b.DueOn.ToString("dd'/'MMM'/'yyyy", CultureInfo.InvariantCulture)}",
            })
            .ToList();
}
