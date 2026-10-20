using System.Globalization;
using System.Linq.Expressions;
using LifeOS.Core.Calendar.ServiceContracts;
using LifeOS.Core.Career.Services;
using LifeOS.Core.Finance.DTOs;
using LifeOS.Core.Finance.ServiceContracts;
using LifeOS.Core.Home.Services;
using LifeOS.Core.Models;
using LifeOS.Core.Purchases.DTOs;
using LifeOS.Core.Purchases.ServiceContracts;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using LifeOS.Core.Shared.Services;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Purchases.Services;

/// <summary>
/// Subscriptions. The next charge, monthly/yearly cost and decide-by nudges are <see cref="SubscriptionRules"/> on every
/// read. Charged to an account, a subscription owns a Finance repeating transaction (through
/// <see cref="IRecurringTransactionsService"/>) so each charge lands in the ledger: anchored on the first charge,
/// written from today on (charges before it was added aren't back-filled), paused with it, stopped from its cancel day.
/// The renewal reminder (N days before the next charge) is owned here and moved on each read.
/// </summary>
public class SubscriptionsService(
    AppDbContext db,
    IRecurringTransactionsService recurringService,
    HomeReminders homeReminders,
    IEntityLinksService entityLinksService,
    IRemindersService remindersService) : ISubscriptionsService
{
    private const string NotFound = "Subscription not found.";

    public async Task<SubscriptionsOverviewDto> GetAllAsync(DateOnly today, string? zone)
    {
        var subscriptions = Fill(await db.Subscriptions.Select(ToDto).ToListAsync(), today);
        // The next charge moves on by itself; keep each renewal reminder on it.
        foreach (var row in await db.Subscriptions.Where(s => s.Status == SubscriptionStatuses.Active && s.ReminderDays != null).ToListAsync())
        {
            await SyncReminderAsync(row, today, zone);
        }

        return new SubscriptionsOverviewDto
        {
            Subscriptions = subscriptions
                .OrderBy(s => s.Status switch { SubscriptionStatuses.Active => 0, SubscriptionStatuses.Paused => 1, _ => 2 })
                .ThenBy(s => s.NextCharge ?? DateOnly.MaxValue)
                .ThenBy(s => s.Name)
                .ToList(),
            Totals = SubscriptionRules.Totals(subscriptions.Select(s => (s.Currency, s.Amount, s.RecurrenceFrequency, s.RecurrenceInterval, s.Status))),
        };
    }

    public async Task<OperationResult<SubscriptionDto>> GetAsync(int id, DateOnly today)
    {
        var subscription = await db.Subscriptions.Where(s => s.Id == id).Select(ToDto).FirstOrDefaultAsync();
        return subscription is null
            ? OperationResult<SubscriptionDto>.Fail(NotFound)
            : OperationResult<SubscriptionDto>.Ok(Fill([subscription], today)[0]);
    }

    public async Task<List<SubscriptionDto>> AttentionAsync(DateOnly today) =>
        Fill(await db.Subscriptions.Where(s => s.Status != SubscriptionStatuses.Cancelled && s.CancelBy != null).Select(ToDto).ToListAsync(), today)
            .Where(s => s.DecideSoon)
            .OrderBy(s => s.CancelBy)
            .ToList();

    public async Task<OperationResult<SubscriptionDto>> CreateAsync(SubscriptionRequest request)
    {
        var subscription = new Subscription { UserId = db.CurrentUserId!.Value };
        var error = await ApplyAsync(subscription, request);
        if (error is not null)
        {
            return OperationResult<SubscriptionDto>.Fail(error);
        }

        await using var transaction = await db.Database.BeginOrJoinTransactionAsync();
        db.Subscriptions.Add(subscription);
        await db.SaveChangesAsync();
        error = await SyncScheduleAsync(subscription, request.ExchangeRate, request.Today)
            ?? await SyncReminderAsync(subscription, request.Today, request.TimeZone);
        if (error is not null)
        {
            return OperationResult<SubscriptionDto>.Fail(error);
        }

        await transaction.CommitAsync();
        return await GetAsync(subscription.Id, request.Today);
    }

    public async Task<OperationResult<SubscriptionDto>> UpdateAsync(int id, SubscriptionRequest request)
    {
        var subscription = await db.Subscriptions.FindAsync(id);
        if (subscription is null)
        {
            return OperationResult<SubscriptionDto>.Fail(NotFound);
        }

        var error = await ApplyAsync(subscription, request);
        if (error is not null)
        {
            return OperationResult<SubscriptionDto>.Fail(error);
        }

        subscription.UpdatedAt = DateTime.UtcNow;
        await using var transaction = await db.Database.BeginOrJoinTransactionAsync();
        await db.SaveChangesAsync();
        error = await SyncScheduleAsync(subscription, request.ExchangeRate, request.Today)
            ?? await SyncReminderAsync(subscription, request.Today, request.TimeZone);
        if (error is not null)
        {
            return OperationResult<SubscriptionDto>.Fail(error);
        }

        await transaction.CommitAsync();
        return await GetAsync(id, request.Today);
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var subscription = await db.Subscriptions.FindAsync(id);
        if (subscription is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        await using var transaction = await db.Database.BeginOrJoinTransactionAsync();
        // Charges already written stay in the ledger; no more are written.
        if (subscription.RecurringTransactionId is { } scheduleId)
        {
            await recurringService.DeleteAsync(scheduleId);
            await db.Entry(subscription).ReloadAsync();
        }

        subscription.IsDeleted = true;
        subscription.DeletedAt = DateTime.UtcNow;
        subscription.ReminderId = null;
        await db.SaveChangesAsync();
        await entityLinksService.RemoveAllForEntityAsync(SubscriptionLinkableProvider.Type, id);
        await remindersService.RemoveAllForEntityAsync(SubscriptionLinkableProvider.Type, id);
        await transaction.CommitAsync();
        return OperationResult<bool>.Ok(true);
    }

    /// <summary>Each renewal in a range, for the calendar (paused ones and charges from the cancel day left out).</summary>
    public static async Task<List<(int Id, string Name, DateOnly Day)>> RenewalsAsync(AppDbContext db, DateOnly from, DateOnly to)
    {
        var rows = await db.Subscriptions.Where(s => s.Status == SubscriptionStatuses.Active && s.StartedOn <= to)
            .Select(s => new { s.Id, s.Name, s.Amount, s.Currency, s.RecurrenceFrequency, s.RecurrenceInterval, s.StartedOn, s.Status, s.CancelledOn })
            .ToListAsync();
        return rows
            .SelectMany(s => SubscriptionRules.ChargesBetween(s.RecurrenceFrequency, s.RecurrenceInterval, s.StartedOn, s.Status, s.CancelledOn, from, to)
                .Select(day => (s.Id, $"{s.Name} renews ({s.Amount.ToString("0.##", CultureInfo.InvariantCulture)} {s.Currency})", day)))
            .ToList();
    }

    private async Task<string?> ApplyAsync(Subscription subscription, SubscriptionRequest request)
    {
        if (request.Today == default)
        {
            return "Today's date is required.";
        }

        var currency = CareerRules.Currency(request.Currency);
        var error = SubscriptionRules.Check(request.Name, request.Amount, currency, request.RecurrenceFrequency, request.RecurrenceInterval,
                request.StartedOn, request.Status, request.CancelledOn, request.CancelBy, request.ReminderDays, request.Today)
            ?? HomeReminders.CheckZone(request.TimeZone);
        if (error is not null)
        {
            return error;
        }

        if (request.AccountId is { } accountId && !await db.Accounts.AnyAsync(a => a.Id == accountId))
        {
            return "Account not found.";
        }

        subscription.Name = request.Name.Trim();
        subscription.Provider = string.IsNullOrWhiteSpace(request.Provider) ? null : request.Provider.Trim();
        subscription.Amount = request.Amount;
        subscription.Currency = currency!;
        subscription.RecurrenceFrequency = request.RecurrenceFrequency;
        subscription.RecurrenceInterval = request.RecurrenceInterval;
        subscription.StartedOn = request.StartedOn;
        subscription.Status = request.Status;
        subscription.CancelledOn = request.Status == SubscriptionStatuses.Cancelled ? request.CancelledOn : null;
        subscription.CancelBy = request.CancelBy;
        subscription.AccountId = request.AccountId;
        subscription.ReminderDays = request.ReminderDays;
        subscription.Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
        return null;
    }

    /// <summary>
    /// Keeps the Finance repeating transaction in step: none without an account (or when it never charges); otherwise
    /// the same amount, account and rhythm, paused with it, ending the day before it was cancelled.
    /// </summary>
    private async Task<string?> SyncScheduleAsync(Subscription subscription, decimal? exchangeRate, DateOnly today)
    {
        var until = subscription.CancelledOn?.AddDays(-1);
        var wanted = subscription.AccountId is not null && (until is null || until >= subscription.StartedOn);
        if (!wanted)
        {
            if (subscription.RecurringTransactionId is { } oldId)
            {
                var deleted = await recurringService.DeleteAsync(oldId);
                if (!deleted.Success)
                {
                    return deleted.Error;
                }

                await db.Entry(subscription).ReloadAsync();
                subscription.RecurringTransactionId = null;
                await db.SaveChangesAsync();
            }

            return null;
        }

        var request = new RecurringTransactionRequest
        {
            Name = subscription.Name,
            Kind = TransactionKinds.Expense,
            Amount = subscription.Amount,
            Currency = subscription.Currency,
            ExchangeRate = exchangeRate,
            FromAccountId = subscription.AccountId,
            Payee = subscription.Provider ?? subscription.Name,
            Note = "Subscription",
            RecurrenceFrequency = subscription.RecurrenceFrequency,
            RecurrenceInterval = subscription.RecurrenceInterval,
            StartDate = subscription.StartedOn,
            Until = until,
            IsPaused = subscription.Status == SubscriptionStatuses.Paused,
            Today = today,
        };

        if (subscription.RecurringTransactionId is { } scheduleId)
        {
            var updated = await recurringService.UpdateAsync(scheduleId, request);
            return updated.Success ? null : updated.Error;
        }

        var created = await recurringService.CreateAsync(request);
        if (!created.Success)
        {
            return created.Error;
        }

        // Charges before today aren't written: you were tracking it from now, not re-recording its past.
        var schedule = await db.RecurringTransactions.FindAsync(created.Data!.Id);
        if (schedule is not null && subscription.StartedOn < today)
        {
            schedule.GeneratedThrough = today.AddDays(-1);
        }

        subscription.RecurringTransactionId = created.Data.Id;
        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            return "This subscription was saved somewhere else at the same time. Reload.";
        }

        return null;
    }

    /// <summary>The renewal reminder: N days before the next charge, while it's active.</summary>
    private async Task<string?> SyncReminderAsync(Subscription subscription, DateOnly today, string? zone)
    {
        var next = subscription.Status == SubscriptionStatuses.Active
            ? SubscriptionRules.NextCharge(subscription.RecurrenceFrequency, subscription.RecurrenceInterval, subscription.StartedOn,
                subscription.Status, subscription.CancelledOn, today)
            : null;
        var (reminderId, error) = await homeReminders.SyncAsync(
            subscription.ReminderId,
            new OwnedReminder(SubscriptionLinkableProvider.Type, subscription.Id, next, subscription.ReminderDays,
                next is { } day ? RenewalTitle(subscription.Name, day) : string.Empty,
                "Keep it, or cancel before it charges again."),
            zone);
        if (error is not null)
        {
            return error;
        }

        if (subscription.ReminderId != reminderId)
        {
            subscription.ReminderId = reminderId;
            await db.SaveChangesAsync();
        }

        return null;
    }

    /// <summary>"Netflix renews on 15/Nov/2026" (at most 200 characters).</summary>
    internal static string RenewalTitle(string name, DateOnly day)
    {
        var suffix = $" renews on {day.ToString("dd'/'MMM'/'yyyy", CultureInfo.InvariantCulture)}";
        return (name.Length + suffix.Length > 200 ? name[..(200 - suffix.Length - 1)] + "…" : name) + suffix;
    }

    private static List<SubscriptionDto> Fill(List<SubscriptionDto> subscriptions, DateOnly today)
    {
        foreach (var s in subscriptions)
        {
            s.NextCharge = SubscriptionRules.NextCharge(s.RecurrenceFrequency, s.RecurrenceInterval, s.StartedOn, s.Status, s.CancelledOn, today);
            s.MonthlyCost = SubscriptionRules.MonthlyCost(s.Amount, s.RecurrenceFrequency, s.RecurrenceInterval);
            s.DecideSoon = s.Status != SubscriptionStatuses.Cancelled && SubscriptionRules.NeedsAttention(s.CancelBy, today);
        }

        return subscriptions;
    }

    private static readonly Expression<Func<Subscription, SubscriptionDto>> ToDto = s => new SubscriptionDto
    {
        Id = s.Id,
        Name = s.Name,
        Provider = s.Provider,
        Amount = s.Amount,
        Currency = s.Currency,
        RecurrenceFrequency = s.RecurrenceFrequency,
        RecurrenceInterval = s.RecurrenceInterval,
        StartedOn = s.StartedOn,
        Status = s.Status,
        CancelledOn = s.CancelledOn,
        CancelBy = s.CancelBy,
        AccountId = s.AccountId,
        AccountName = s.Account != null ? s.Account.Name : null,
        RecurringTransactionId = s.RecurringTransactionId,
        ReminderDays = s.ReminderDays,
        Notes = s.Notes,
    };
}

/// <summary>
/// Returns of purchases: one per purchase, with a return-by reminder (owned here) until it's sent back, and the refund
/// received as one Finance income (unique RefundTransactionId; undone by deleting that income). State is computed.
/// </summary>
public class ReturnsService(
    AppDbContext db,
    ITransactionsService transactionsService,
    HomeReminders homeReminders,
    IEntityLinksService entityLinksService,
    IRemindersService remindersService) : IReturnsService
{
    private const string NotFound = "Return not found.";

    public async Task<List<ReturnDto>> GetAllAsync(DateOnly today) =>
        Fill(await db.Returns.Select(ToDto).ToListAsync(), today)
            .OrderBy(r => r.State switch { ReturnStates.Open => 0, ReturnStates.AwaitingRefund => 1, ReturnStates.Missed => 2, _ => 3 })
            .ThenBy(r => r.ReturnBy ?? DateOnly.MaxValue)
            .ThenByDescending(r => r.PurchasedOn)
            .ToList();

    public async Task<OperationResult<ReturnDto>> GetAsync(int id, DateOnly today)
    {
        var item = await db.Returns.Where(r => r.Id == id).Select(ToDto).FirstOrDefaultAsync();
        return item is null ? OperationResult<ReturnDto>.Fail(NotFound) : OperationResult<ReturnDto>.Ok(Fill([item], today)[0]);
    }

    public async Task<List<ReturnDto>> AttentionAsync(DateOnly today) =>
        (await GetAllAsync(today)).Where(r => r.DueSoon).ToList();

    public async Task<OperationResult<ReturnDto>> CreateAsync(ReturnRequest request)
    {
        var item = new Return { UserId = db.CurrentUserId!.Value };
        var error = await ApplyAsync(item, request);
        if (error is not null)
        {
            return OperationResult<ReturnDto>.Fail(error);
        }

        if (await db.Returns.AnyAsync(r => r.PurchaseId == request.PurchaseId))
        {
            return OperationResult<ReturnDto>.Fail("There's a return for this purchase already.");
        }

        await using var transaction = await db.Database.BeginOrJoinTransactionAsync();
        db.Returns.Add(item);
        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            return OperationResult<ReturnDto>.Fail("There's a return for this purchase already.");
        }

        error = await SyncReminderAsync(item, request.TimeZone);
        if (error is not null)
        {
            return OperationResult<ReturnDto>.Fail(error);
        }

        await transaction.CommitAsync();
        return await GetAsync(item.Id, request.Today);
    }

    public async Task<OperationResult<ReturnDto>> UpdateAsync(int id, ReturnRequest request)
    {
        var item = await db.Returns.FindAsync(id);
        if (item is null)
        {
            return OperationResult<ReturnDto>.Fail(NotFound);
        }

        if (request.PurchaseId != item.PurchaseId)
        {
            return OperationResult<ReturnDto>.Fail("A return stays with its purchase.");
        }

        var refund = item.RefundAmount;
        var error = await ApplyAsync(item, request);
        if (error is not null)
        {
            return OperationResult<ReturnDto>.Fail(error);
        }

        if (item.RefundTransactionId is not null && item.RefundAmount != refund)
        {
            return OperationResult<ReturnDto>.Fail("The refund is in Finance — undo it first to change the amount.");
        }

        if (item.RefundedOn is not null && item.ReturnedOn is null)
        {
            return OperationResult<ReturnDto>.Fail("It's refunded — keep the day it went back.");
        }

        item.UpdatedAt = DateTime.UtcNow;
        await using var transaction = await db.Database.BeginOrJoinTransactionAsync();
        await db.SaveChangesAsync();
        error = await SyncReminderAsync(item, request.TimeZone);
        if (error is not null)
        {
            return OperationResult<ReturnDto>.Fail(error);
        }

        await transaction.CommitAsync();
        return await GetAsync(id, request.Today);
    }

    public async Task<OperationResult<ReturnDto>> RefundAsync(int id, RefundRequest request)
    {
        var item = await db.Returns.Include(r => r.Purchase).FirstOrDefaultAsync(r => r.Id == id);
        if (item is null)
        {
            return OperationResult<ReturnDto>.Fail(NotFound);
        }

        var error = item.RefundedOn is not null ? "The refund is in already."
            : request.Today == default ? "Today's date is required."
            : request.RefundedOn == default ? "Say when the refund arrived."
            : request.RefundedOn > request.Today ? "It can't arrive in the future."
            : request.RefundedOn < item.Purchase.PurchasedOn ? "That's before it was bought."
            : request.Amount <= 0 || request.Amount > Finance.Services.FinanceRules.MaxAmount ? "The refund has to be more than zero."
            : null;
        if (error is not null)
        {
            return OperationResult<ReturnDto>.Fail(error);
        }

        await using var transaction = await db.Database.BeginOrJoinTransactionAsync();
        if (request.AccountId is { } accountId)
        {
            var income = await transactionsService.CreateAsync(new TransactionRequest
            {
                Kind = TransactionKinds.Income,
                OccurredOn = request.RefundedOn,
                Amount = request.Amount,
                Currency = item.Purchase.Currency,
                ExchangeRate = request.ExchangeRate,
                ToAccountId = accountId,
                Payee = item.Purchase.Store ?? item.Purchase.Title,
                Note = $"Refund: {item.Purchase.Title}",
            });
            if (!income.Success)
            {
                return OperationResult<ReturnDto>.Fail(income.Error!);
            }

            item.RefundTransactionId = income.Data!.Id;
        }

        // A refund means it went back (if the day wasn't noted, the refund's day stands in).
        item.ReturnedOn ??= request.RefundedOn;
        item.RefundAmount = request.Amount;
        item.RefundedOn = request.RefundedOn;
        item.UpdatedAt = DateTime.UtcNow;
        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            return OperationResult<ReturnDto>.Fail("This refund was recorded somewhere else at the same time. Reload.");
        }

        error = await SyncReminderAsync(item, null);
        if (error is not null)
        {
            return OperationResult<ReturnDto>.Fail(error);
        }

        await transaction.CommitAsync();
        return await GetAsync(id, request.Today);
    }

    public async Task<OperationResult<ReturnDto>> UndoRefundAsync(int id, DateOnly today)
    {
        var item = await db.Returns.FindAsync(id);
        if (item is null)
        {
            return OperationResult<ReturnDto>.Fail(NotFound);
        }

        await using var transaction = await db.Database.BeginOrJoinTransactionAsync();
        if (item.RefundTransactionId is { } transactionId)
        {
            // Deleting the income also clears RefundTransactionId here.
            var deleted = await transactionsService.DeleteAsync(transactionId);
            if (!deleted.Success)
            {
                return OperationResult<ReturnDto>.Fail(deleted.Error!);
            }

            await db.Entry(item).ReloadAsync();
        }

        item.RefundedOn = null;
        item.RefundTransactionId = null;
        item.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return await GetAsync(id, today);
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var item = await db.Returns.FindAsync(id);
        if (item is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        await using var transaction = await db.Database.BeginOrJoinTransactionAsync();
        // A refund that really arrived stays in Finance; only the return goes.
        item.IsDeleted = true;
        item.DeletedAt = DateTime.UtcNow;
        item.ReminderId = null;
        await db.SaveChangesAsync();
        await entityLinksService.RemoveAllForEntityAsync(ReturnLinkableProvider.Type, id);
        await remindersService.RemoveAllForEntityAsync(ReturnLinkableProvider.Type, id);
        await transaction.CommitAsync();
        return OperationResult<bool>.Ok(true);
    }

    private async Task<string?> ApplyAsync(Return item, ReturnRequest request)
    {
        if (request.Today == default)
        {
            return "Today's date is required.";
        }

        var purchase = await db.Purchases.Where(p => p.Id == request.PurchaseId).Select(p => new { p.PurchasedOn }).FirstOrDefaultAsync();
        if (purchase is null)
        {
            return "Purchase not found.";
        }

        var error = SubscriptionRules.CheckReturn(request.ReturnBy, request.ReturnedOn, request.RefundAmount, request.ReminderDays,
                purchase.PurchasedOn, request.Today)
            ?? HomeReminders.CheckZone(request.TimeZone);
        if (error is not null)
        {
            return error;
        }

        item.PurchaseId = request.PurchaseId;
        item.Reason = string.IsNullOrWhiteSpace(request.Reason) ? null : request.Reason.Trim();
        item.ReturnBy = request.ReturnBy;
        item.ReturnedOn = request.ReturnedOn;
        item.RefundAmount = request.RefundAmount;
        item.ReminderDays = request.ReminderDays;
        item.Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
        return null;
    }

    /// <summary>The return-by reminder, until it's sent back.</summary>
    private async Task<string?> SyncReminderAsync(Return item, string? zone)
    {
        var day = item.ReturnedOn is null ? item.ReturnBy : null;
        var title = await db.Purchases.Where(p => p.Id == item.PurchaseId).Select(p => p.Title).FirstAsync();
        var (reminderId, error) = await homeReminders.SyncAsync(
            item.ReminderId,
            new OwnedReminder(ReturnLinkableProvider.Type, item.Id, day, item.ReminderDays,
                day is { } d ? ReturnTitle(title, d) : string.Empty,
                "Send it back before the shop's deadline."),
            zone);
        if (error is not null)
        {
            return error;
        }

        if (item.ReminderId != reminderId)
        {
            item.ReminderId = reminderId;
            await db.SaveChangesAsync();
        }

        return null;
    }

    /// <summary>"Return the Mixer by 30/Oct/2026" (at most 200 characters).</summary>
    internal static string ReturnTitle(string title, DateOnly day)
    {
        const string prefix = "Return the ";
        var suffix = $" by {day.ToString("dd'/'MMM'/'yyyy", CultureInfo.InvariantCulture)}";
        var room = 200 - prefix.Length - suffix.Length;
        return prefix + (title.Length > room ? title[..(room - 1)] + "…" : title) + suffix;
    }

    private static List<ReturnDto> Fill(List<ReturnDto> items, DateOnly today)
    {
        foreach (var r in items)
        {
            r.State = SubscriptionRules.ReturnState(r.ReturnBy, r.ReturnedOn, r.RefundedOn, today);
            r.DueSoon = r.State == ReturnStates.Open && SubscriptionRules.NeedsAttention(r.ReturnBy, today);
        }

        return items;
    }

    private static readonly Expression<Func<Return, ReturnDto>> ToDto = r => new ReturnDto
    {
        Id = r.Id,
        PurchaseId = r.PurchaseId,
        PurchaseTitle = r.Purchase.Title,
        Store = r.Purchase.Store,
        PurchasedOn = r.Purchase.PurchasedOn,
        PurchaseAmount = r.Purchase.Amount,
        Currency = r.Purchase.Currency,
        Reason = r.Reason,
        ReturnBy = r.ReturnBy,
        ReturnedOn = r.ReturnedOn,
        RefundAmount = r.RefundAmount,
        RefundedOn = r.RefundedOn,
        RefundTransactionId = r.RefundTransactionId,
        RefundAccountName = r.RefundTransaction != null && r.RefundTransaction.ToAccount != null ? r.RefundTransaction.ToAccount.Name : null,
        ReminderDays = r.ReminderDays,
        Notes = r.Notes,
    };
}

/// <summary>Subscriptions: linked (the account, a goal to cut costs), reminders, found by name or provider.</summary>
public class SubscriptionLinkableProvider(AppDbContext db) : ILinkableEntityProvider
{
    public const string Type = "Subscription";

    public string EntityType => Type;

    public string DisplayName => "Subscription";

    public async Task<Dictionary<int, string>> GetTitlesAsync(IReadOnlyCollection<int> ids) =>
        await db.Subscriptions.Where(s => ids.Contains(s.Id)).ToDictionaryAsync(s => s.Id, s => s.Name);

    public async Task<List<LinkableItemDto>> SearchAsync(string? search, int take)
    {
        var query = db.Subscriptions.AsQueryable();
        if (!string.IsNullOrEmpty(search))
        {
            query = query.Where(s => s.Name.Contains(search) || (s.Provider != null && s.Provider.Contains(search)));
        }

        return await query
            .OrderBy(s => s.Status == SubscriptionStatuses.Cancelled).ThenBy(s => s.Name)
            .Take(take)
            .Select(s => new LinkableItemDto { EntityType = Type, EntityId = s.Id, Title = s.Name })
            .ToListAsync();
    }
}
