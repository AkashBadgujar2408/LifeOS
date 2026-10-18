using System.Linq.Expressions;
using LifeOS.Core.Calendar.ServiceContracts;
using LifeOS.Core.Career.Services;
using LifeOS.Core.Finance.DTOs;
using LifeOS.Core.Finance.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using LifeOS.Core.Shared.Services;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Finance.Services;

/// <summary>
/// Investments — shares, funds, gold, PPF, FDs — with valuations entered by hand (no live prices). What one is worth
/// on a day is its latest valuation on or before it, else what was put in (<see cref="NetWorth.HoldingValue"/>).
/// A sold or matured one keeps its history and leaves net worth from its disposal day.
/// </summary>
public class HoldingsService(AppDbContext db, IEntityLinksService entityLinksService, IRemindersService remindersService)
    : IHoldingsService
{
    private const string NotFound = "Investment not found.";

    public async Task<List<HoldingDto>> GetAllAsync(DateOnly today)
    {
        var holdings = await db.Holdings
            .OrderBy(h => h.DisposedOn != null).ThenBy(h => h.Name)
            .Select(ToDto)
            .AsSplitQuery()
            .ToListAsync();
        holdings.ForEach(h => FillValue(h, today));
        return holdings;
    }

    public async Task<OperationResult<HoldingDto>> GetAsync(int id, DateOnly today)
    {
        var holding = await db.Holdings.Where(h => h.Id == id).Select(ToDto).AsSplitQuery().FirstOrDefaultAsync();
        if (holding is null)
        {
            return OperationResult<HoldingDto>.Fail(NotFound);
        }

        FillValue(holding, today);
        return OperationResult<HoldingDto>.Ok(holding);
    }

    public async Task<OperationResult<HoldingDto>> CreateAsync(HoldingRequest request)
    {
        var holding = new Holding { UserId = db.CurrentUserId!.Value };
        var error = await ApplyAsync(holding, request);
        if (error is not null)
        {
            return OperationResult<HoldingDto>.Fail(error);
        }

        db.Holdings.Add(holding);
        await db.SaveChangesAsync();
        return await GetAsync(holding.Id, request.Today);
    }

    public async Task<OperationResult<HoldingDto>> UpdateAsync(int id, HoldingRequest request)
    {
        var holding = await db.Holdings.FindAsync(id);
        if (holding is null)
        {
            return OperationResult<HoldingDto>.Fail(NotFound);
        }

        var error = await ApplyAsync(holding, request);
        if (error is not null)
        {
            return OperationResult<HoldingDto>.Fail(error);
        }

        holding.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return await GetAsync(id, request.Today);
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var holding = await db.Holdings.FindAsync(id);
        if (holding is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        var now = DateTime.UtcNow;
        await using var transaction = await db.Database.BeginTransactionAsync();
        await db.HoldingValuations.Where(v => v.HoldingId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(v => v.IsDeleted, true).SetProperty(v => v.DeletedAt, now));
        holding.IsDeleted = true;
        holding.DeletedAt = now;
        await db.SaveChangesAsync();
        await entityLinksService.RemoveAllForEntityAsync(HoldingLinkableProvider.Type, id);
        await remindersService.RemoveAllForEntityAsync(HoldingLinkableProvider.Type, id);
        await transaction.CommitAsync();
        return OperationResult<bool>.Ok(true);
    }

    /// <summary>Records what it was worth on a day; a second valuation on the same day replaces the first.</summary>
    public async Task<OperationResult<HoldingDto>> SetValuationAsync(int holdingId, HoldingValuationRequest request)
    {
        var holding = await db.Holdings.FindAsync(holdingId);
        if (holding is null)
        {
            return OperationResult<HoldingDto>.Fail(NotFound);
        }

        var error = WealthRules.CheckValuation(request.ValuedOn, request.Value, holding.AcquiredOn, request.Today);
        if (error is not null)
        {
            return OperationResult<HoldingDto>.Fail(error);
        }

        var note = string.IsNullOrWhiteSpace(request.Note) ? null : request.Note.Trim();
        var existing = await db.HoldingValuations.FirstOrDefaultAsync(v => v.HoldingId == holdingId && v.ValuedOn == request.ValuedOn);
        if (existing is not null)
        {
            existing.Value = request.Value;
            existing.Note = note;
            existing.UpdatedAt = DateTime.UtcNow;
        }
        else
        {
            db.HoldingValuations.Add(new HoldingValuation
            {
                UserId = holding.UserId, HoldingId = holdingId, ValuedOn = request.ValuedOn, Value = request.Value, Note = note,
            });
        }

        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            return OperationResult<HoldingDto>.Fail("A valuation for that day was saved somewhere else at the same time. Reload and try again.");
        }

        return await GetAsync(holdingId, request.Today);
    }

    public async Task<OperationResult<HoldingDto>> DeleteValuationAsync(int holdingId, int valuationId, DateOnly today)
    {
        var valuation = await db.HoldingValuations.FirstOrDefaultAsync(v => v.Id == valuationId && v.HoldingId == holdingId);
        if (valuation is null)
        {
            return OperationResult<HoldingDto>.Fail("Valuation not found.");
        }

        valuation.IsDeleted = true;
        valuation.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return await GetAsync(holdingId, today);
    }

    private async Task<string?> ApplyAsync(Holding holding, HoldingRequest request)
    {
        var name = request.Name.Trim();
        if (name.Length == 0)
        {
            return "Name it (e.g. Nifty 50 index fund).";
        }

        if (request.Today == default)
        {
            return "Today's date is required.";
        }

        var currency = CareerRules.Currency(request.Currency);
        var error = WealthRules.CheckHolding(
            request.Kind, currency, request.Units, request.InvestedAmount, request.InterestRate,
            request.AcquiredOn, request.MaturesOn, request.DisposedOn, request.Today);
        if (error is not null)
        {
            return error;
        }

        if (request.AccountId is { } accountId && !await db.Accounts.AnyAsync(a => a.Id == accountId))
        {
            return "Account not found.";
        }

        if (request.AcquiredOn is { } acquired && holding.Id != 0
            && await db.HoldingValuations.AnyAsync(v => v.HoldingId == holding.Id && v.ValuedOn < acquired))
        {
            return "There are valuations before that day — remove them first, or pick an earlier day.";
        }

        holding.Name = name;
        holding.Kind = request.Kind;
        holding.Currency = currency!;
        holding.Units = request.Units;
        holding.InvestedAmount = request.InvestedAmount;
        holding.InterestRate = request.InterestRate;
        holding.AcquiredOn = request.AcquiredOn;
        holding.MaturesOn = request.MaturesOn;
        holding.DisposedOn = request.DisposedOn;
        holding.AccountId = request.AccountId;
        holding.Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
        return null;
    }

    private static void FillValue(HoldingDto holding, DateOnly today)
    {
        holding.CurrentValue = NetWorth.HoldingValue(
            new WealthHolding(holding.Id, holding.Name, holding.Currency, holding.InvestedAmount, holding.AcquiredOn, holding.DisposedOn,
                holding.Valuations.Select(v => (v.ValuedOn, v.Value)).ToList()),
            today);
        holding.Gain = holding.CurrentValue is { } value && holding.InvestedAmount is { } invested ? value - invested : null;
    }

    private static readonly Expression<Func<Holding, HoldingDto>> ToDto = h => new HoldingDto
    {
        Id = h.Id,
        Name = h.Name,
        Kind = h.Kind,
        Currency = h.Currency,
        Units = h.Units,
        InvestedAmount = h.InvestedAmount,
        InterestRate = h.InterestRate,
        AcquiredOn = h.AcquiredOn,
        MaturesOn = h.MaturesOn,
        DisposedOn = h.DisposedOn,
        AccountId = h.AccountId,
        AccountName = h.Account != null ? h.Account.Name : null,
        Notes = h.Notes,
        Valuations = h.HoldingValuations
            .OrderByDescending(v => v.ValuedOn)
            .Select(v => new HoldingValuationDto { Id = v.Id, ValuedOn = v.ValuedOn, Value = v.Value, Note = v.Note })
            .ToList(),
    };
}

/// <summary>Investments can be linked (a savings goal counts the ones linked to it), have reminders and be searched.</summary>
public class HoldingLinkableProvider(AppDbContext db) : ILinkableEntityProvider
{
    public const string Type = NetWorth.HoldingType;

    public string EntityType => Type;

    public string DisplayName => "Investment";

    public async Task<Dictionary<int, string>> GetTitlesAsync(IReadOnlyCollection<int> ids) =>
        await db.Holdings.Where(h => ids.Contains(h.Id)).ToDictionaryAsync(h => h.Id, h => h.Name);

    public async Task<List<LinkableItemDto>> SearchAsync(string? search, int take)
    {
        var query = db.Holdings.AsQueryable();
        if (!string.IsNullOrEmpty(search))
        {
            query = query.Where(h => h.Name.Contains(search));
        }

        return await query
            .OrderBy(h => h.DisposedOn != null).ThenBy(h => h.Name)
            .Take(take)
            .Select(h => new LinkableItemDto { EntityType = Type, EntityId = h.Id, Title = h.Name })
            .ToListAsync();
    }
}
