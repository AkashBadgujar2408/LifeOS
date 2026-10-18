using System.Linq.Expressions;
using LifeOS.Core.Finance.DTOs;
using LifeOS.Core.Finance.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.Services;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Finance.Services;

/// <summary>
/// Repeating transactions — salary, rent, an EMI, a subscription. A schedule is checked like a transaction on its
/// start day (<see cref="FinanceRules.CheckTransaction"/>); its transactions are written when due, by
/// <see cref="GenerateDueAsync"/>, which the Finance pages call before reading: everything after GeneratedThrough up
/// to today, then GeneratedThrough moves on — so deleting a written transaction doesn't bring it back, and running
/// twice writes nothing twice (UX_Transactions_Occurrence backs that up when two requests race).
/// </summary>
public class RecurringTransactionsService(AppDbContext db) : IRecurringTransactionsService
{
    private const string NotFound = "Repeating transaction not found.";

    public async Task<List<RecurringTransactionDto>> GetAllAsync()
    {
        var schedules = await db.RecurringTransactions
            .OrderBy(r => r.IsPaused).ThenBy(r => r.Name)
            .Select(ToDto)
            .AsSplitQuery()
            .ToListAsync();
        foreach (var s in schedules)
        {
            s.NextOn = s.IsPaused ? null : RecurringSchedule.Next(s.RecurrenceFrequency, s.RecurrenceInterval, s.StartDate, s.Until, s.GeneratedThrough);
        }

        return schedules;
    }

    public async Task<OperationResult<RecurringTransactionDto>> GetAsync(int id)
    {
        var schedule = await db.RecurringTransactions.Where(r => r.Id == id).Select(ToDto).AsSplitQuery().FirstOrDefaultAsync();
        if (schedule is null)
        {
            return OperationResult<RecurringTransactionDto>.Fail(NotFound);
        }

        schedule.NextOn = schedule.IsPaused
            ? null
            : RecurringSchedule.Next(schedule.RecurrenceFrequency, schedule.RecurrenceInterval, schedule.StartDate, schedule.Until, schedule.GeneratedThrough);
        return OperationResult<RecurringTransactionDto>.Ok(schedule);
    }

    public async Task<OperationResult<RecurringTransactionDto>> CreateAsync(RecurringTransactionRequest request)
    {
        var userId = db.CurrentUserId!.Value;
        var schedule = new RecurringTransaction { UserId = userId };
        var error = await ApplyAsync(schedule, request);
        if (error is not null)
        {
            return OperationResult<RecurringTransactionDto>.Fail(error);
        }

        foreach (var tagId in request.TagIds.Distinct())
        {
            schedule.RecurringTransactionTags.Add(new RecurringTransactionTag { UserId = userId, TagId = tagId });
        }

        db.RecurringTransactions.Add(schedule);
        await db.SaveChangesAsync();
        return await GetAsync(schedule.Id);
    }

    public async Task<OperationResult<RecurringTransactionDto>> UpdateAsync(int id, RecurringTransactionRequest request)
    {
        var schedule = await db.RecurringTransactions.FindAsync(id);
        if (schedule is null)
        {
            return OperationResult<RecurringTransactionDto>.Fail(NotFound);
        }

        var wasPaused = schedule.IsPaused;
        var error = await ApplyAsync(schedule, request);
        if (error is not null)
        {
            return OperationResult<RecurringTransactionDto>.Fail(error);
        }

        if (wasPaused && !schedule.IsPaused)
        {
            schedule.GeneratedThrough = RecurringSchedule.OnResume(schedule.GeneratedThrough, request.Today);
        }

        var now = DateTime.UtcNow;
        schedule.UpdatedAt = now;
        var wanted = request.TagIds.ToHashSet();
        var current = await db.RecurringTransactionTags.Where(t => t.RecurringTransactionId == id).ToListAsync();
        foreach (var tag in current.Where(t => !wanted.Contains(t.TagId)))
        {
            tag.IsDeleted = true;
            tag.DeletedAt = now;
        }

        foreach (var tagId in wanted.Except(current.Select(t => t.TagId)))
        {
            db.RecurringTransactionTags.Add(new RecurringTransactionTag { UserId = schedule.UserId, RecurringTransactionId = id, TagId = tagId });
        }

        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            return OperationResult<RecurringTransactionDto>.Fail("This schedule was changed somewhere else at the same time. Reload and try again.");
        }

        return await GetAsync(id);
    }

    /// <summary>Stops the schedule; what it already wrote stays in the ledger (now just ordinary transactions).</summary>
    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var schedule = await db.RecurringTransactions.FindAsync(id);
        if (schedule is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        var now = DateTime.UtcNow;
        await using var transaction = await db.Database.BeginTransactionAsync();
        await db.RecurringTransactionTags.Where(t => t.RecurringTransactionId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.IsDeleted, true).SetProperty(t => t.DeletedAt, now));
        schedule.IsDeleted = true;
        schedule.DeletedAt = now;
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return OperationResult<bool>.Ok(true);
    }

    public async Task<int> GenerateDueAsync(DateOnly today)
    {
        var schedules = await db.RecurringTransactions
            .Where(r => !r.IsPaused && (r.GeneratedThrough == null || r.GeneratedThrough < today) && (r.Until == null || r.GeneratedThrough == null || r.GeneratedThrough < r.Until))
            .Include(r => r.RecurringTransactionTags)
            .ToListAsync();
        if (schedules.Count == 0)
        {
            return 0;
        }

        var accountIds = schedules.SelectMany(s => new[] { s.FromAccountId, s.ToAccountId }).OfType<int>().Distinct().ToList();
        var accounts = await db.Accounts.Where(a => accountIds.Contains(a.Id)).ToDictionaryAsync(a => a.Id);
        var written = 0;
        foreach (var schedule in schedules)
        {
            var involved = new[] { schedule.FromAccountId, schedule.ToAccountId }.OfType<int>().ToList();
            // An account that's gone or archived takes nothing new; the schedule waits (and catches up if it's unarchived).
            if (involved.Any(id => !accounts.TryGetValue(id, out var a) || a.IsArchived))
            {
                continue;
            }

            var due = RecurringSchedule.Due(
                schedule.RecurrenceFrequency, schedule.RecurrenceInterval, schedule.StartDate, schedule.Until, schedule.GeneratedThrough, today);
            var opens = involved.Max(id => accounts[id].OpeningDate);
            foreach (var day in due.Where(d => d >= opens))
            {
                var transaction = new Transaction
                {
                    UserId = schedule.UserId,
                    Kind = schedule.Kind,
                    OccurredOn = day,
                    Amount = schedule.Amount,
                    Currency = schedule.Currency,
                    ExchangeRate = schedule.ExchangeRate,
                    ToAmount = schedule.ToAmount,
                    FromAccountId = schedule.FromAccountId,
                    ToAccountId = schedule.ToAccountId,
                    Payee = schedule.Payee,
                    Note = schedule.Note,
                    RecurringTransactionId = schedule.Id,
                    OccurrenceDate = day,
                };
                foreach (var tag in schedule.RecurringTransactionTags)
                {
                    transaction.TransactionTags.Add(new TransactionTag { UserId = schedule.UserId, TagId = tag.TagId });
                }

                db.Transactions.Add(transaction);
                written++;
            }

            schedule.GeneratedThrough = RecurringSchedule.WrittenThrough(due, schedule.Until, today);
        }

        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            // Another request wrote the same occurrences a moment ago; its run stands, this one adds nothing.
            db.ChangeTracker.Clear();
            return 0;
        }

        return written;
    }

    private async Task<string?> ApplyAsync(RecurringTransaction schedule, RecurringTransactionRequest request)
    {
        var name = request.Name.Trim();
        if (name.Length == 0)
        {
            return "Name it (e.g. Rent).";
        }

        if (!RecurringSchedule.IsKnownFrequency(request.RecurrenceFrequency))
        {
            return "Unknown frequency.";
        }

        if (request.RecurrenceInterval is < 1 or > 999)
        {
            return "Repeat every 1 to 999.";
        }

        if (request.StartDate == default)
        {
            return "Say when it starts.";
        }

        if (request.Until is { } until && until < request.StartDate)
        {
            return "It can't stop before it starts.";
        }

        if (request.Today == default)
        {
            return "Today's date is required.";
        }

        var baseCurrency = await db.Users.Where(u => u.Id == db.CurrentUserId).Select(u => u.BaseCurrency).FirstOrDefaultAsync();
        if (baseCurrency is null)
        {
            return "Choose your base currency in Settings first — totals are reported in it.";
        }

        var accountIds = new[] { request.FromAccountId, request.ToAccountId }.OfType<int>().Distinct().ToList();
        var accounts = await db.Accounts.Where(a => accountIds.Contains(a.Id))
            .ToDictionaryAsync(a => a.Id, a => new LedgerAccount(a.Id, a.Currency, a.OpeningDate, a.IsArchived));
        if (accounts.Count != accountIds.Count)
        {
            return "Account not found.";
        }

        var tagIds = request.TagIds.Distinct().ToList();
        if (tagIds.Count > 0 && await db.Tags.CountAsync(t => tagIds.Contains(t.Id)) != tagIds.Count)
        {
            return "Tag not found.";
        }

        // Checked as its first transaction would be. Its accounts may open later than the start: the days before
        // an account opens are just skipped when writing, so only the account rules that don't depend on the day apply.
        var kept = new HashSet<int>(new[] { schedule.FromAccountId, schedule.ToAccountId }.OfType<int>());
        var (ok, error) = FinanceRules.CheckTransaction(
            new TransactionInput(
                request.Kind,
                DateOnly.MaxValue,
                request.Amount,
                request.ExchangeRate,
                request.ToAmount,
                request.FromAccountId is { } fromId ? accounts[fromId] : null,
                request.ToAccountId is { } toId ? accounts[toId] : null,
                false),
            baseCurrency,
            kept);
        if (ok is null)
        {
            return error;
        }

        schedule.Name = name;
        schedule.Kind = request.Kind;
        schedule.Amount = request.Amount;
        schedule.Currency = ok.Currency;
        schedule.ExchangeRate = ok.ExchangeRate;
        schedule.ToAmount = ok.ToAmount;
        schedule.FromAccountId = request.FromAccountId;
        schedule.ToAccountId = request.ToAccountId;
        schedule.Payee = string.IsNullOrWhiteSpace(request.Payee) ? null : request.Payee.Trim();
        schedule.Note = string.IsNullOrWhiteSpace(request.Note) ? null : request.Note.Trim();
        schedule.RecurrenceFrequency = request.RecurrenceFrequency;
        schedule.RecurrenceInterval = request.RecurrenceInterval;
        schedule.StartDate = request.StartDate;
        schedule.Until = request.Until;
        schedule.IsPaused = request.IsPaused;
        return null;
    }

    private static readonly Expression<Func<RecurringTransaction, RecurringTransactionDto>> ToDto = r => new RecurringTransactionDto
    {
        Id = r.Id,
        Name = r.Name,
        Kind = r.Kind,
        Amount = r.Amount,
        Currency = r.Currency,
        ExchangeRate = r.ExchangeRate,
        ToAmount = r.ToAmount,
        FromAccountId = r.FromAccountId,
        FromAccountName = r.FromAccount != null ? r.FromAccount.Name : null,
        ToAccountId = r.ToAccountId,
        ToAccountName = r.ToAccount != null ? r.ToAccount.Name : null,
        ToCurrency = r.ToAccount != null ? r.ToAccount.Currency : null,
        Payee = r.Payee,
        Note = r.Note,
        RecurrenceFrequency = r.RecurrenceFrequency,
        RecurrenceInterval = r.RecurrenceInterval,
        StartDate = r.StartDate,
        Until = r.Until,
        GeneratedThrough = r.GeneratedThrough,
        IsPaused = r.IsPaused,
        GeneratedCount = r.Transactions.Count,
        Tags = r.RecurringTransactionTags.OrderBy(t => t.Tag.Name).Select(t => new TagDto { Id = t.TagId, Name = t.Tag.Name }).ToList(),
    };
}
