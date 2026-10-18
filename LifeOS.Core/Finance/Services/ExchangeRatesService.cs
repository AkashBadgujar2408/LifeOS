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
/// The exchange-rate master: rates set by hand against the base currency, each from a day on (history kept, so
/// past month ends convert at the rate of the time). Only rates set against the current base count. They convert
/// balances, investments and loans for totals, net worth and savings (<see cref="NetWorth.RateFor"/>, ahead of the
/// rates typed on transactions) and prefill a new transaction's rate; a transaction keeps its own rate.
/// </summary>
public class ExchangeRatesService(AppDbContext db, ISettingsService settingsService) : IExchangeRatesService
{
    public async Task<List<ExchangeRateDto>> GetAllAsync()
    {
        var baseCurrency = await BaseCurrencyAsync();
        return baseCurrency is null
            ? []
            : await db.ExchangeRates
                .Where(r => r.BaseCurrency == baseCurrency)
                .OrderBy(r => r.Currency).ThenByDescending(r => r.EffectiveOn)
                .Select(r => new ExchangeRateDto
                {
                    Id = r.Id, Currency = r.Currency, BaseCurrency = r.BaseCurrency, Rate = r.Rate, EffectiveOn = r.EffectiveOn,
                })
                .ToListAsync();
    }

    /// <summary>Sets a currency's rate from a day; a second rate for the same day replaces the first.</summary>
    public async Task<OperationResult<List<ExchangeRateDto>>> SetAsync(ExchangeRateRequest request)
    {
        var baseCurrency = await BaseCurrencyAsync();
        var currency = CareerRules.Currency(request.Currency);
        if (currency is not null && settingsService.Currencies().All(c => c.Code != currency))
        {
            return OperationResult<List<ExchangeRateDto>>.Fail("That isn't a currency code LifeOS knows.");
        }

        var error = RateRules.Check(currency, baseCurrency, request.Rate, request.EffectiveOn, request.Today);
        if (error is not null)
        {
            return OperationResult<List<ExchangeRateDto>>.Fail(error);
        }

        var existing = await db.ExchangeRates.FirstOrDefaultAsync(r =>
            r.Currency == currency && r.BaseCurrency == baseCurrency && r.EffectiveOn == request.EffectiveOn);
        if (existing is not null)
        {
            existing.Rate = request.Rate;
            existing.UpdatedAt = DateTime.UtcNow;
        }
        else
        {
            db.ExchangeRates.Add(new ExchangeRate
            {
                UserId = db.CurrentUserId!.Value, Currency = currency!, BaseCurrency = baseCurrency!, Rate = request.Rate, EffectiveOn = request.EffectiveOn,
            });
        }

        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            return OperationResult<List<ExchangeRateDto>>.Fail("A rate for that day was set somewhere else at the same time. Reload and try again.");
        }

        return OperationResult<List<ExchangeRateDto>>.Ok(await GetAllAsync());
    }

    public async Task<OperationResult<List<ExchangeRateDto>>> DeleteAsync(int id)
    {
        var rate = await db.ExchangeRates.FindAsync(id);
        if (rate is null)
        {
            return OperationResult<List<ExchangeRateDto>>.Fail("Rate not found.");
        }

        rate.IsDeleted = true;
        rate.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return OperationResult<List<ExchangeRateDto>>.Ok(await GetAllAsync());
    }

    private async Task<string?> BaseCurrencyAsync() =>
        await db.Users.Where(u => u.Id == db.CurrentUserId).Select(u => u.BaseCurrency).FirstOrDefaultAsync();
}

/// <summary>The two kinds of rate everything converting into the base currency reads (EF, per-user filtered).</summary>
public static class FinanceRates
{
    /// <summary>The master's rates against <paramref name="baseCurrency"/>.</summary>
    public static async Task<List<CurrencyRate>> MasterAsync(AppDbContext db, string baseCurrency) =>
        (await db.ExchangeRates.Where(r => r.BaseCurrency == baseCurrency)
            .Select(r => new { r.Currency, r.EffectiveOn, r.Rate })
            .ToListAsync())
        .Select(r => new CurrencyRate(r.Currency, r.EffectiveOn, r.Rate))
        .ToList();

    /// <summary>The rates typed on transactions (the fallback when the master has none for a currency yet).</summary>
    public static async Task<List<CurrencyRate>> TypedAsync(AppDbContext db) =>
        (await db.Transactions.Where(t => t.ExchangeRate != null)
            .Select(t => new { t.Currency, t.OccurredOn, t.Id, Rate = t.ExchangeRate!.Value })
            .ToListAsync())
        .OrderBy(t => t.Id)
        .Select(t => new CurrencyRate(t.Currency, t.OccurredOn, t.Rate))
        .ToList();
}
