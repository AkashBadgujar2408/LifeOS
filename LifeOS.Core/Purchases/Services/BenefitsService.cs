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
/// Rewards & vouchers. Balances, points left, what's expiring and what was lost are <see cref="BenefitRules"/> on every
/// read — never stored. Money that moves goes through Finance once: a gift card you paid for is a purchase with its
/// expense, received cashback is one income (unique TransactionId), points cashed in are one income on their
/// redemption. Codes and PINs are encrypted at rest by the context (…Secret columns). The expiry reminder (N days before
/// the next thing with value left runs out) is owned here through <see cref="HomeReminders"/>.
/// </summary>
public class BenefitsService(
    AppDbContext db,
    ITransactionsService transactionsService,
    HomeReminders homeReminders,
    IEntityLinksService entityLinksService,
    IRemindersService remindersService) : IBenefitsService
{
    private const string NotFound = "Reward not found.";

    public async Task<List<BenefitDto>> GetAllAsync(DateOnly today) => await LoadAsync(db.Benefits, today);

    public async Task<OperationResult<BenefitDetailDto>> GetAsync(int id, DateOnly today)
    {
        var benefit = (await LoadAsync(db.Benefits.Where(b => b.Id == id), today)).FirstOrDefault();
        if (benefit is null)
        {
            return OperationResult<BenefitDetailDto>.Fail(NotFound);
        }

        var secrets = await db.Benefits.Where(b => b.Id == id).Select(b => new { b.CodeSecret, b.PinSecret }).FirstAsync();
        benefit.Code = secrets.CodeSecret;
        benefit.Pin = secrets.PinSecret;
        var facts = await FactsAsync([id]);
        var state = State(benefit, facts, today);
        var redemptions = await db.BenefitRedemptions.Where(r => r.BenefitId == id)
            .OrderByDescending(r => r.RedeemedOn).ThenByDescending(r => r.Id)
            .Select(r => new BenefitRedemptionDto
            {
                Id = r.Id,
                RedeemedOn = r.RedeemedOn,
                Amount = r.Amount,
                Points = r.Points,
                PurchaseId = r.PurchaseId,
                PurchaseTitle = r.Purchase != null ? r.Purchase.Title : null,
                TransactionId = r.TransactionId,
                Notes = r.Notes,
            })
            .ToListAsync();
        var batches = await db.PointBatches.Where(b => b.BenefitId == id)
            .OrderByDescending(b => b.EarnedOn).ThenByDescending(b => b.Id)
            .Select(b => new PointBatchDto
            {
                Id = b.Id,
                EarnedOn = b.EarnedOn,
                Points = b.Points,
                ExpiresOn = b.ExpiresOn,
                PurchaseId = b.PurchaseId,
                PurchaseTitle = b.Purchase != null ? b.Purchase.Title : null,
                Notes = b.Notes,
            })
            .ToListAsync();
        batches.ForEach(b => b.Remaining = state.BatchRemaining.GetValueOrDefault(b.Id));
        return OperationResult<BenefitDetailDto>.Ok(new BenefitDetailDto { Benefit = benefit, Redemptions = redemptions, Batches = batches });
    }

    public async Task<RewardsSummaryDto> SummaryAsync(DateOnly today)
    {
        var all = await GetAllAsync(today);
        var yearStart = new DateOnly(today.Year, 1, 1);
        var cashbackThisYear = all.Where(b => b.Kind == BenefitKinds.Cashback && b.ReceivedOn >= yearStart && b.ReceivedOn <= today);
        return new RewardsSummaryDto
        {
            Usable = Sum(all.Where(b => b.Status == BenefitStatuses.Usable && b.Currency is not null)
                .Select(b => (b.Currency!, b.Kind == BenefitKinds.Points ? b.PointsValue ?? 0 : BenefitKinds.Money.Contains(b.Kind) ? b.Balance ?? 0 : 0))),
            LostThisYear = Sum(all.Where(b => b.Lost > 0 && b.LostOn >= yearStart && b.Currency is not null).Select(b => (b.Currency!, b.Lost))),
            CashbackThisYear = Sum(cashbackThisYear.Select(b => (b.Currency!, b.Value ?? 0))),
            CashbackPending = Sum(all.Where(b => b.Status == BenefitStatuses.Pending).Select(b => (b.Currency!, b.Value ?? 0))),
        };
    }

    public async Task<List<BenefitDto>> UsableAtAsync(string? store, DateOnly today)
    {
        var name = store?.Trim();
        var all = await LoadAsync(db.Benefits.Where(b => b.Kind != BenefitKinds.Cashback), today);
        bool AtStore(string? store) => name is { Length: > 0 } && string.Equals(store, name, StringComparison.OrdinalIgnoreCase);
        // Money and coupons with no store work anywhere; points only at their programme's own name.
        return all.Where(b => b.Status == BenefitStatuses.Usable
                && (b.Kind == BenefitKinds.Points ? AtStore(b.Store) : b.Store is null || AtStore(b.Store)))
            .OrderBy(b => b.ExpiresOn ?? b.NextExpiry ?? DateOnly.MaxValue)
            .ToList();
    }

    public async Task<List<BenefitDto>> AttentionAsync(DateOnly today) =>
        (await GetAllAsync(today)).Where(b => b.ExpiringSoon || b.Overdue)
            .OrderBy(b => b.Overdue ? b.ExpectedBy : b.NextExpiry ?? b.ExpiresOn)
            .ToList();

    public async Task<OperationResult<BenefitDetailDto>> CreateAsync(BenefitRequest request)
    {
        var benefit = new Benefit { UserId = db.CurrentUserId!.Value };
        var error = await ApplyAsync(benefit, request, isNew: true);
        if (error is not null)
        {
            return OperationResult<BenefitDetailDto>.Fail(error);
        }

        if (request.Bought is not null && benefit.Kind is not (BenefitKinds.Voucher or BenefitKinds.GiftCard or BenefitKinds.StoreCredit))
        {
            return OperationResult<BenefitDetailDto>.Fail("Only a voucher, gift card or store credit is bought.");
        }

        await using var transaction = await db.Database.BeginOrJoinTransactionAsync();
        if (request.Bought is { } bought)
        {
            // Paying for it is a purchase like any other, with its expense in Finance.
            var purchase = new Purchase
            {
                UserId = benefit.UserId,
                Title = benefit.Name,
                Store = benefit.Store,
                PurchasedOn = request.Today,
                Amount = benefit.Value!.Value,
                Currency = benefit.Currency!,
            };
            db.Purchases.Add(purchase);
            await db.SaveChangesAsync();
            var expense = await transactionsService.CreateAsync(new TransactionRequest
            {
                Kind = TransactionKinds.Expense,
                OccurredOn = request.Today,
                Amount = purchase.Amount,
                Currency = purchase.Currency,
                ExchangeRate = bought.ExchangeRate,
                FromAccountId = bought.AccountId,
                Payee = purchase.Store ?? purchase.Title,
                Note = purchase.Title,
            });
            if (!expense.Success)
            {
                return OperationResult<BenefitDetailDto>.Fail(expense.Error!);
            }

            purchase.TransactionId = expense.Data!.Id;
            benefit.PurchaseId = purchase.Id;
        }

        db.Benefits.Add(benefit);
        await db.SaveChangesAsync();
        var reminderError = await SyncReminderAsync(benefit, request.Today, request.TimeZone);
        if (reminderError is not null)
        {
            return OperationResult<BenefitDetailDto>.Fail(reminderError);
        }

        await transaction.CommitAsync();
        return await GetAsync(benefit.Id, request.Today);
    }

    public async Task<OperationResult<BenefitDetailDto>> UpdateAsync(int id, BenefitRequest request)
    {
        var benefit = await db.Benefits.FindAsync(id);
        if (benefit is null)
        {
            return OperationResult<BenefitDetailDto>.Fail(NotFound);
        }

        var before = (benefit.Kind, benefit.Value, benefit.Currency);
        var error = await ApplyAsync(benefit, request, isNew: false);
        if (error is not null)
        {
            return OperationResult<BenefitDetailDto>.Fail(error);
        }

        var used = await db.BenefitRedemptions.Where(r => r.BenefitId == id).ToListAsync();
        var earned = await db.PointBatches.AnyAsync(b => b.BenefitId == id);
        if (benefit.Kind != before.Kind && (used.Count > 0 || earned))
        {
            return OperationResult<BenefitDetailDto>.Fail("It has been used — its kind can't change.");
        }

        if (benefit.Currency != before.Currency && (used.Count > 0 || earned))
        {
            return OperationResult<BenefitDetailDto>.Fail("It has been used — its currency can't change.");
        }

        if (BenefitKinds.Money.Contains(benefit.Kind) && benefit.Value < used.Sum(r => r.Amount ?? 0))
        {
            return OperationResult<BenefitDetailDto>.Fail("More than that has been used already.");
        }

        if (benefit.TransactionId is not null && (benefit.Value != before.Value || benefit.Currency != before.Currency))
        {
            return OperationResult<BenefitDetailDto>.Fail("It's received in Finance — undo that first to change the amount.");
        }

        benefit.UpdatedAt = DateTime.UtcNow;
        await using var transaction = await db.Database.BeginOrJoinTransactionAsync();
        await db.SaveChangesAsync();
        var reminderError = await SyncReminderAsync(benefit, request.Today, request.TimeZone);
        if (reminderError is not null)
        {
            return OperationResult<BenefitDetailDto>.Fail(reminderError);
        }

        await transaction.CommitAsync();
        return await GetAsync(id, request.Today);
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var benefit = await db.Benefits.FindAsync(id);
        if (benefit is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        var now = DateTime.UtcNow;
        await using var transaction = await db.Database.BeginOrJoinTransactionAsync();
        // Money that really moved (cashback received, points cashed in, the gift card's purchase) stays in Finance.
        await db.BenefitRedemptions.Where(r => r.BenefitId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(r => r.IsDeleted, true).SetProperty(r => r.DeletedAt, now));
        await db.PointBatches.Where(b => b.BenefitId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(b => b.IsDeleted, true).SetProperty(b => b.DeletedAt, now));
        benefit.IsDeleted = true;
        benefit.DeletedAt = now;
        await db.SaveChangesAsync();
        await entityLinksService.RemoveAllForEntityAsync(BenefitLinkableProvider.Type, id);
        await remindersService.RemoveAllForEntityAsync(BenefitLinkableProvider.Type, id);
        await transaction.CommitAsync();
        return OperationResult<bool>.Ok(true);
    }

    public async Task<OperationResult<BenefitDetailDto>> RedeemAsync(int id, RedemptionRequest request)
    {
        var benefit = await db.Benefits.FindAsync(id);
        if (benefit is null)
        {
            return OperationResult<BenefitDetailDto>.Fail(NotFound);
        }

        if (request.PurchaseId is { } purchaseId && !await db.Purchases.AnyAsync(p => p.Id == purchaseId))
        {
            return OperationResult<BenefitDetailDto>.Fail("Purchase not found.");
        }

        if (request.CashIn is not null && benefit.Kind != BenefitKinds.Points)
        {
            return OperationResult<BenefitDetailDto>.Fail("Only points are cashed in.");
        }

        await using var transaction = await db.Database.BeginOrJoinTransactionAsync();
        var error = await RedeemOneAsync(benefit, request.RedeemedOn, request.Amount, request.Points, request.PurchaseId, request.Notes,
            request.CashIn, request.Today, request.TimeZone);
        if (error is not null)
        {
            return OperationResult<BenefitDetailDto>.Fail(error);
        }

        await transaction.CommitAsync();
        return await GetAsync(id, request.Today);
    }

    public async Task<string?> RedeemOnPurchaseAsync(int purchaseId, DateOnly day, IReadOnlyList<PurchaseRedemptionRequest> uses, DateOnly today, string? zone)
    {
        foreach (var use in uses)
        {
            var benefit = await db.Benefits.FindAsync(use.BenefitId);
            if (benefit is null)
            {
                return NotFound;
            }

            var error = await RedeemOneAsync(benefit, day, use.Amount, use.Points, purchaseId, null, null, today, zone);
            if (error is not null)
            {
                return $"{benefit.Name}: {error}";
            }
        }

        return null;
    }

    public async Task<OperationResult<BenefitDetailDto>> RemoveRedemptionAsync(int id, int redemptionId, DateOnly today)
    {
        var redemption = await db.BenefitRedemptions.FirstOrDefaultAsync(r => r.Id == redemptionId && r.BenefitId == id);
        if (redemption is null)
        {
            return OperationResult<BenefitDetailDto>.Fail("That use wasn't found.");
        }

        await using var transaction = await db.Database.BeginOrJoinTransactionAsync();
        // Points cashed in: the income they became goes too.
        if (redemption.TransactionId is { } transactionId)
        {
            var deleted = await transactionsService.DeleteAsync(transactionId);
            if (!deleted.Success)
            {
                return OperationResult<BenefitDetailDto>.Fail(deleted.Error!);
            }
        }

        await db.BenefitRedemptions.Where(r => r.Id == redemptionId)
            .ExecuteUpdateAsync(s => s.SetProperty(r => r.IsDeleted, true).SetProperty(r => r.DeletedAt, DateTime.UtcNow));
        await SyncReminderAsync((await db.Benefits.FindAsync(id))!, today, null);
        await transaction.CommitAsync();
        return await GetAsync(id, today);
    }

    public async Task<OperationResult<BenefitDetailDto>> AddPointsAsync(int id, PointBatchRequest request)
    {
        var benefit = await db.Benefits.FindAsync(id);
        if (benefit is null)
        {
            return OperationResult<BenefitDetailDto>.Fail(NotFound);
        }

        var error = benefit.Kind != BenefitKinds.Points ? "Only a points programme earns points."
            : request.EarnedOn == default ? "Say when they were earned."
            : request.EarnedOn > request.Today ? "They can't be earned in the future."
            : request.Points is < 1 or > 100_000_000 ? "Give how many points (more than zero)."
            : request.ExpiresOn is { } e && e < request.EarnedOn ? "They can't run out before they were earned."
            : request.PurchaseId is { } p && !await db.Purchases.AnyAsync(x => x.Id == p) ? "Purchase not found."
            : null;
        if (error is not null)
        {
            return OperationResult<BenefitDetailDto>.Fail(error);
        }

        await using var transaction = await db.Database.BeginOrJoinTransactionAsync();
        db.PointBatches.Add(new PointBatch
        {
            UserId = benefit.UserId,
            BenefitId = id,
            EarnedOn = request.EarnedOn,
            Points = request.Points,
            ExpiresOn = request.ExpiresOn,
            PurchaseId = request.PurchaseId,
            Notes = Clean(request.Notes),
        });
        await db.SaveChangesAsync();
        var reminderError = await SyncReminderAsync(benefit, request.Today, request.TimeZone);
        if (reminderError is not null)
        {
            return OperationResult<BenefitDetailDto>.Fail(reminderError);
        }

        await transaction.CommitAsync();
        return await GetAsync(id, request.Today);
    }

    public async Task<OperationResult<BenefitDetailDto>> RemovePointsAsync(int id, int batchId, DateOnly today)
    {
        var batch = await db.PointBatches.FirstOrDefaultAsync(b => b.Id == batchId && b.BenefitId == id);
        if (batch is null)
        {
            return OperationResult<BenefitDetailDto>.Fail("Those points weren't found.");
        }

        // Points already spent can't be taken away from under their uses.
        var uses = await UsesAsync(id);
        var batches = (await BatchesAsync(id)).Where(b => b.Id != batchId).ToList();
        var stillCovered = uses.Where(u => u.Points is > 0).OrderBy(u => u.Day).ThenBy(u => u.Id)
            .All(u => BenefitRules.CheckUse(BenefitKinds.Points, null, null, u.Day, null, u.Points,
                uses.Where(x => x.Day < u.Day || (x.Day == u.Day && x.Id < u.Id)).ToList(), batches, today) is null);
        if (!stillCovered)
        {
            return OperationResult<BenefitDetailDto>.Fail("Some of these points have been used — remove those uses first.");
        }

        await using var transaction = await db.Database.BeginOrJoinTransactionAsync();
        batch.IsDeleted = true;
        batch.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        await SyncReminderAsync((await db.Benefits.FindAsync(id))!, today, null);
        await transaction.CommitAsync();
        return await GetAsync(id, today);
    }

    public async Task<OperationResult<BenefitDetailDto>> MarkReceivedAsync(int id, CashbackReceivedRequest request)
    {
        var benefit = await db.Benefits.FindAsync(id);
        if (benefit is null)
        {
            return OperationResult<BenefitDetailDto>.Fail(NotFound);
        }

        var error = benefit.Kind != BenefitKinds.Cashback ? "Only cashback is received."
            : benefit.ReceivedOn is not null ? "It's received already."
            : request.Today == default ? "Today's date is required."
            : request.ReceivedOn == default ? "Say when it arrived."
            : request.ReceivedOn > request.Today ? "It can't arrive in the future."
            : null;
        if (error is not null)
        {
            return OperationResult<BenefitDetailDto>.Fail(error);
        }

        await using var transaction = await db.Database.BeginOrJoinTransactionAsync();
        if (request.AccountId is { } accountId)
        {
            var income = await transactionsService.CreateAsync(new TransactionRequest
            {
                Kind = TransactionKinds.Income,
                OccurredOn = request.ReceivedOn,
                Amount = benefit.Value!.Value,
                Currency = benefit.Currency,
                ExchangeRate = request.ExchangeRate,
                ToAccountId = accountId,
                Payee = benefit.Store ?? benefit.Name,
                Note = $"Cashback: {benefit.Name}",
            });
            if (!income.Success)
            {
                return OperationResult<BenefitDetailDto>.Fail(income.Error!);
            }

            benefit.TransactionId = income.Data!.Id;
        }

        benefit.ReceivedOn = request.ReceivedOn;
        benefit.UpdatedAt = DateTime.UtcNow;
        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            return OperationResult<BenefitDetailDto>.Fail("This cashback was received somewhere else at the same time. Reload.");
        }

        await transaction.CommitAsync();
        return await GetAsync(id, request.Today);
    }

    public async Task<OperationResult<BenefitDetailDto>> UndoReceivedAsync(int id, DateOnly today)
    {
        var benefit = await db.Benefits.FindAsync(id);
        if (benefit is null)
        {
            return OperationResult<BenefitDetailDto>.Fail(NotFound);
        }

        await using var transaction = await db.Database.BeginOrJoinTransactionAsync();
        if (benefit.TransactionId is { } transactionId)
        {
            // Deleting the income also clears TransactionId here.
            var deleted = await transactionsService.DeleteAsync(transactionId);
            if (!deleted.Success)
            {
                return OperationResult<BenefitDetailDto>.Fail(deleted.Error!);
            }

            await db.Entry(benefit).ReloadAsync();
        }

        benefit.ReceivedOn = null;
        benefit.TransactionId = null;
        benefit.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return await GetAsync(id, today);
    }

    /// <summary>One use, checked against the benefit's state that day; points cashed in become one Finance income.</summary>
    private async Task<string?> RedeemOneAsync(
        Benefit benefit, DateOnly day, decimal? amount, int? points, int? purchaseId, string? notes, BenefitMoneyRequest? cashIn,
        DateOnly today, string? zone)
    {
        if (today == default)
        {
            return "Today's date is required.";
        }

        var uses = await UsesAsync(benefit.Id);
        var batches = await BatchesAsync(benefit.Id);
        var error = BenefitRules.CheckUse(benefit.Kind, benefit.Value, benefit.ExpiresOn, day, amount, points, uses, batches, today);
        if (error is not null)
        {
            return error;
        }

        var redemption = new BenefitRedemption
        {
            UserId = benefit.UserId,
            BenefitId = benefit.Id,
            RedeemedOn = day,
            Amount = amount,
            Points = points,
            PurchaseId = purchaseId,
            Notes = Clean(notes),
        };
        if (cashIn is not null)
        {
            var worth = Math.Round(points!.Value * benefit.ValuePerPoint!.Value, 2, MidpointRounding.AwayFromZero);
            if (worth <= 0)
            {
                return "Those points are worth nothing to cash in.";
            }

            var income = await transactionsService.CreateAsync(new TransactionRequest
            {
                Kind = TransactionKinds.Income,
                OccurredOn = day,
                Amount = worth,
                Currency = benefit.Currency,
                ExchangeRate = cashIn.ExchangeRate,
                ToAccountId = cashIn.AccountId,
                Payee = benefit.Store ?? benefit.Name,
                Note = string.Create(CultureInfo.InvariantCulture, $"{points:N0} points cashed in"),
            });
            if (!income.Success)
            {
                return income.Error!;
            }

            redemption.TransactionId = income.Data!.Id;
        }

        db.BenefitRedemptions.Add(redemption);
        await db.SaveChangesAsync();
        return await SyncReminderAsync(benefit, today, zone);
    }

    private async Task<string?> ApplyAsync(Benefit benefit, BenefitRequest request, bool isNew)
    {
        if (request.Today == default)
        {
            return "Today's date is required.";
        }

        var hasMoney = request.Value is not null || request.MinSpend is not null || request.Kind == BenefitKinds.Points;
        var currency = hasMoney ? CareerRules.Currency(request.Currency) : null;
        var store = Clean(request.Store);
        var error = BenefitRules.Check(request.Kind, request.Name, store, request.Value, currency, request.DiscountPercent,
                request.MinSpend, request.ValuePerPoint, request.AccountId, request.ExpectedBy, request.ReminderDays, request.ExpiresOn)
            ?? HomeReminders.CheckZone(request.TimeZone);
        if (error is not null)
        {
            return error;
        }

        if (request.AccountId is { } accountId && !await db.Accounts.AnyAsync(a => a.Id == accountId))
        {
            return "Account not found.";
        }

        if (request.PurchaseId is { } purchaseId && !await db.Purchases.AnyAsync(p => p.Id == purchaseId))
        {
            return "Purchase not found.";
        }

        benefit.Kind = request.Kind;
        benefit.Name = request.Name.Trim();
        benefit.Store = store;
        benefit.Value = request.Value;
        benefit.Currency = currency;
        benefit.DiscountPercent = request.Kind == BenefitKinds.Coupon ? request.DiscountPercent : null;
        benefit.MinSpend = request.MinSpend;
        benefit.ValuePerPoint = request.Kind == BenefitKinds.Points ? request.ValuePerPoint : null;
        benefit.CodeSecret = Clean(request.Code);
        benefit.PinSecret = Clean(request.Pin);
        benefit.ExpiresOn = request.ExpiresOn;
        benefit.ReminderDays = request.ReminderDays;
        benefit.AccountId = request.AccountId;
        benefit.ExpectedBy = request.Kind == BenefitKinds.Cashback ? request.ExpectedBy : null;
        if (isNew || request.PurchaseId is not null)
        {
            benefit.PurchaseId = request.PurchaseId;
        }

        benefit.Notes = Clean(request.Notes);
        return null;
    }

    /// <summary>
    /// The owned reminder: N days before the next thing with value left runs out (a voucher's expiry, the soonest points
    /// batch); none once it's used up, expired or received.
    /// </summary>
    private async Task<string?> SyncReminderAsync(Benefit benefit, DateOnly today, string? zone)
    {
        var facts = await FactsAsync([benefit.Id]);
        var state = BenefitRules.State(benefit.Kind, benefit.Value, benefit.ValuePerPoint, benefit.ExpiresOn, benefit.ReceivedOn,
            benefit.ExpectedBy, facts.Uses[benefit.Id].ToList(), facts.Batches[benefit.Id].ToList(), today);
        var day = state.Status == BenefitStatuses.Usable ? state.NextExpiry : null;
        var (reminderId, error) = await homeReminders.SyncAsync(
            benefit.ReminderId,
            new OwnedReminder(BenefitLinkableProvider.Type, benefit.Id, day, benefit.ReminderDays,
                day is { } d ? ReminderTitle(benefit.Name, d) : string.Empty,
                "Use it before it runs out."),
            zone);
        if (error is not null)
        {
            return error;
        }

        if (benefit.ReminderId != reminderId)
        {
            benefit.ReminderId = reminderId;
            await db.SaveChangesAsync();
        }

        return null;
    }

    /// <summary>"Amazon gift card runs out on 31/Dec/2026" (at most 200 characters).</summary>
    internal static string ReminderTitle(string name, DateOnly day)
    {
        var suffix = $" runs out on {day.ToString("dd'/'MMM'/'yyyy", CultureInfo.InvariantCulture)}";
        return (name.Length + suffix.Length > 200 ? name[..(200 - suffix.Length - 1)] + "…" : name) + suffix;
    }

    private async Task<List<BenefitDto>> LoadAsync(IQueryable<Benefit> query, DateOnly today)
    {
        var benefits = await query.OrderBy(b => b.Name).Select(ToDto).ToListAsync();
        var facts = await FactsAsync(benefits.Select(b => b.Id).ToList());
        foreach (var benefit in benefits)
        {
            State(benefit, facts, today);
        }

        return benefits;
    }

    private static BenefitState State(BenefitDto benefit, (ILookup<int, BenefitUse> Uses, ILookup<int, PointBatchFacts> Batches) facts, DateOnly today)
    {
        var state = BenefitRules.State(benefit.Kind, benefit.Value, benefit.ValuePerPoint, benefit.ExpiresOn, benefit.ReceivedOn,
            benefit.ExpectedBy, facts.Uses[benefit.Id].ToList(), facts.Batches[benefit.Id].ToList(), today);
        benefit.Status = state.Status;
        benefit.Balance = state.Balance;
        benefit.PointsAvailable = state.PointsAvailable;
        benefit.PointsValue = state.PointsValue;
        benefit.Lost = state.Lost;
        benefit.LostOn = state.LostOn;
        benefit.ExpiringSoon = state.ExpiringSoon;
        benefit.Overdue = state.Overdue;
        benefit.NextExpiry = state.NextExpiry;
        return state;
    }

    private async Task<(ILookup<int, BenefitUse> Uses, ILookup<int, PointBatchFacts> Batches)> FactsAsync(IReadOnlyCollection<int> ids)
    {
        var uses = await db.BenefitRedemptions.Where(r => ids.Contains(r.BenefitId))
            .Select(r => new { r.BenefitId, Use = new BenefitUse(r.Id, r.RedeemedOn, r.Amount, r.Points) }).ToListAsync();
        var batches = await db.PointBatches.Where(b => ids.Contains(b.BenefitId))
            .Select(b => new { b.BenefitId, Batch = new PointBatchFacts(b.Id, b.EarnedOn, b.Points, b.ExpiresOn) }).ToListAsync();
        return (uses.ToLookup(u => u.BenefitId, u => u.Use), batches.ToLookup(b => b.BenefitId, b => b.Batch));
    }

    private async Task<List<BenefitUse>> UsesAsync(int id) =>
        await db.BenefitRedemptions.Where(r => r.BenefitId == id).Select(r => new BenefitUse(r.Id, r.RedeemedOn, r.Amount, r.Points)).ToListAsync();

    private async Task<List<PointBatchFacts>> BatchesAsync(int id) =>
        await db.PointBatches.Where(b => b.BenefitId == id).Select(b => new PointBatchFacts(b.Id, b.EarnedOn, b.Points, b.ExpiresOn)).ToListAsync();

    private static List<MoneyAmountDto> Sum(IEnumerable<(string Currency, decimal Amount)> amounts) =>
        amounts.Where(a => a.Amount != 0)
            .GroupBy(a => a.Currency)
            .OrderBy(g => g.Key, StringComparer.Ordinal)
            .Select(g => new MoneyAmountDto { Currency = g.Key, Amount = g.Sum(a => a.Amount) })
            .ToList();

    private static string? Clean(string? text) => string.IsNullOrWhiteSpace(text) ? null : text.Trim();

    private static readonly Expression<Func<Benefit, BenefitDto>> ToDto = b => new BenefitDto
    {
        Id = b.Id,
        Kind = b.Kind,
        Name = b.Name,
        Store = b.Store,
        Value = b.Value,
        Currency = b.Currency,
        DiscountPercent = b.DiscountPercent,
        MinSpend = b.MinSpend,
        ValuePerPoint = b.ValuePerPoint,
        HasCode = b.CodeSecret != null,
        HasPin = b.PinSecret != null,
        ExpiresOn = b.ExpiresOn,
        ReminderDays = b.ReminderDays,
        PurchaseId = b.PurchaseId,
        PurchaseTitle = b.Purchase != null ? b.Purchase.Title : null,
        AccountId = b.AccountId,
        AccountName = b.Account != null ? b.Account.Name : null,
        ExpectedBy = b.ExpectedBy,
        ReceivedOn = b.ReceivedOn,
        TransactionId = b.TransactionId,
        Notes = b.Notes,
    };
}

/// <summary>Rewards: linked (the order, a trip), reminders, found by name or store.</summary>
public class BenefitLinkableProvider(AppDbContext db) : ILinkableEntityProvider
{
    public const string Type = "Benefit";

    public string EntityType => Type;

    public string DisplayName => "Reward";

    public async Task<Dictionary<int, string>> GetTitlesAsync(IReadOnlyCollection<int> ids) =>
        await db.Benefits.Where(b => ids.Contains(b.Id)).ToDictionaryAsync(b => b.Id, b => b.Name);

    public async Task<List<LinkableItemDto>> SearchAsync(string? search, int take)
    {
        var query = db.Benefits.AsQueryable();
        if (!string.IsNullOrEmpty(search))
        {
            query = query.Where(b => b.Name.Contains(search) || (b.Store != null && b.Store.Contains(search)));
        }

        return await query
            .OrderBy(b => b.Name)
            .Take(take)
            .Select(b => new LinkableItemDto { EntityType = Type, EntityId = b.Id, Title = b.Name })
            .ToListAsync();
    }
}
