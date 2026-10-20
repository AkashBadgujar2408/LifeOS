using System.Globalization;
using System.Linq.Expressions;
using LifeOS.Core.Career.Services;
using LifeOS.Core.Finance.DTOs;
using LifeOS.Core.Finance.ServiceContracts;
using LifeOS.Core.Home.DTOs;
using LifeOS.Core.Home.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.Services;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Home.Services;

/// <summary>
/// A vehicle's fuel log. A fill stores the price per unit <b>or</b> the quantity (the other is worked out); mileage,
/// cost per km and monthly spend are all <see cref="FuelEconomy"/>, never stored. The odometer only goes up between
/// fills and never falls below a service reading logged before. A fill can be recorded in Finance as one Expense
/// through <see cref="ITransactionsService"/> (unique TransactionId, like bills); deleting the fill deletes it.
/// </summary>
public class FuelLogsService(AppDbContext db, ITransactionsService transactionsService) : IFuelLogsService
{
    private const string VehicleNotFound = "Vehicle not found.";
    private const string NotFound = "Fill not found.";

    public async Task<OperationResult<FuelHistoryDto>> GetHistoryAsync(int vehicleId)
    {
        var vehicle = await db.Vehicles.Where(v => v.Id == vehicleId).Select(v => new { v.FuelUnit }).FirstOrDefaultAsync();
        if (vehicle is null)
        {
            return OperationResult<FuelHistoryDto>.Fail(VehicleNotFound);
        }

        var logs = await db.FuelLogs.Where(f => f.VehicleId == vehicleId)
            .OrderByDescending(f => f.FilledOn).ThenByDescending(f => f.OdometerKm).ThenByDescending(f => f.Id)
            .Select(ToDto).ToListAsync();
        logs.ForEach(Complete);
        var fills = logs.Select(l => new FuelFill(l.Id, l.FilledOn, l.OdometerKm, l.Amount, l.Currency, l.Quantity, l.MissedFillBefore)).ToList();
        return OperationResult<FuelHistoryDto>.Ok(new FuelHistoryDto
        {
            VehicleId = vehicleId,
            FuelUnit = vehicle.FuelUnit,
            Fills = logs,
            Average = FuelEconomy.Average(fills),
            Trend = FuelEconomy.Trend(fills),
            Monthly = FuelEconomy.Monthly(fills),
        });
    }

    public async Task<OperationResult<FuelLogDto>> CreateAsync(int vehicleId, FuelLogRequest request)
    {
        var log = new FuelLog { UserId = db.CurrentUserId!.Value, VehicleId = vehicleId };
        var error = await ApplyAsync(log, request, null);
        if (error is not null)
        {
            return OperationResult<FuelLogDto>.Fail(error);
        }

        await using var transaction = await db.Database.BeginTransactionAsync();
        db.FuelLogs.Add(log);
        await db.SaveChangesAsync();
        if (request.Expense is { } expense)
        {
            var expenseError = await RecordAsync(log, expense);
            if (expenseError is not null)
            {
                return OperationResult<FuelLogDto>.Fail(expenseError);
            }
        }

        await transaction.CommitAsync();
        return await GetAsync(vehicleId, log.Id);
    }

    public async Task<OperationResult<FuelLogDto>> UpdateAsync(int vehicleId, int id, FuelLogRequest request)
    {
        var log = await db.FuelLogs.FirstOrDefaultAsync(f => f.Id == id && f.VehicleId == vehicleId);
        if (log is null)
        {
            return OperationResult<FuelLogDto>.Fail(NotFound);
        }

        var (day, amount, currency) = (log.FilledOn, log.Amount, log.Currency);
        var error = await ApplyAsync(log, request, id);
        if (error is not null)
        {
            return OperationResult<FuelLogDto>.Fail(error);
        }

        // The ledger already has what was paid; changing it here would make the two disagree.
        if (log.TransactionId is not null && (log.FilledOn != day || log.Amount != amount || log.Currency != currency))
        {
            return OperationResult<FuelLogDto>.Fail("It's in Finance already — take the expense back first to change the day or what you paid.");
        }

        log.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return await GetAsync(vehicleId, id);
    }

    public async Task<OperationResult<FuelLogDto>> RecordExpenseAsync(int vehicleId, int id, FuelExpenseRequest request)
    {
        var log = await db.FuelLogs.FirstOrDefaultAsync(f => f.Id == id && f.VehicleId == vehicleId);
        if (log is null)
        {
            return OperationResult<FuelLogDto>.Fail(NotFound);
        }

        if (log.TransactionId is not null)
        {
            return OperationResult<FuelLogDto>.Fail("It's in Finance already.");
        }

        await using var transaction = await db.Database.BeginTransactionAsync();
        var error = await RecordAsync(log, request);
        if (error is not null)
        {
            return OperationResult<FuelLogDto>.Fail(error);
        }

        await transaction.CommitAsync();
        return await GetAsync(vehicleId, id);
    }

    public async Task<OperationResult<FuelLogDto>> RemoveExpenseAsync(int vehicleId, int id)
    {
        var log = await db.FuelLogs.FirstOrDefaultAsync(f => f.Id == id && f.VehicleId == vehicleId);
        if (log is null)
        {
            return OperationResult<FuelLogDto>.Fail(NotFound);
        }

        if (log.TransactionId is { } transactionId)
        {
            // Deleting the expense also clears TransactionId here.
            var deleted = await transactionsService.DeleteAsync(transactionId);
            if (!deleted.Success)
            {
                return OperationResult<FuelLogDto>.Fail(deleted.Error!);
            }
        }

        return await GetAsync(vehicleId, id);
    }

    public async Task<OperationResult<bool>> DeleteAsync(int vehicleId, int id)
    {
        var log = await db.FuelLogs.FirstOrDefaultAsync(f => f.Id == id && f.VehicleId == vehicleId);
        if (log is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        // The expense it created goes first (a fill that didn't happen wasn't paid for). Not in one transaction:
        // deleting a transaction opens its own, like taking a bill's payment back.
        if (log.TransactionId is { } transactionId)
        {
            var deleted = await transactionsService.DeleteAsync(transactionId);
            if (!deleted.Success)
            {
                return OperationResult<bool>.Fail(deleted.Error!);
            }

            await db.Entry(log).ReloadAsync();
        }

        log.IsDeleted = true;
        log.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return OperationResult<bool>.Ok(true);
    }

    private async Task<OperationResult<FuelLogDto>> GetAsync(int vehicleId, int id)
    {
        var log = await db.FuelLogs.Where(f => f.Id == id && f.VehicleId == vehicleId).Select(ToDto).FirstOrDefaultAsync();
        if (log is null)
        {
            return OperationResult<FuelLogDto>.Fail(NotFound);
        }

        Complete(log);
        return OperationResult<FuelLogDto>.Ok(log);
    }

    /// <summary>Works out whichever of rate / quantity wasn't entered (in C#, the same as <see cref="FuelEconomy"/>).</summary>
    private static void Complete(FuelLogDto log)
    {
        decimal? rate = log.QuantityGiven ? null : log.PricePerUnit;
        decimal? quantity = log.QuantityGiven ? log.Quantity : null;
        log.PricePerUnit = FuelEconomy.PricePerUnit(log.Amount, rate, quantity);
        log.Quantity = FuelEconomy.Quantity(log.Amount, rate, quantity);
    }

    private async Task<string?> ApplyAsync(FuelLog log, FuelLogRequest request, int? id)
    {
        var vehicle = await db.Vehicles.Where(v => v.Id == log.VehicleId)
            .Select(v => new { v.PurchasedOn, v.DisposedOn }).FirstOrDefaultAsync();
        if (vehicle is null)
        {
            return VehicleNotFound;
        }

        if (request.Today == default)
        {
            return "Today's date is required.";
        }

        var currency = CareerRules.Currency(request.Currency);
        var error = FuelEconomy.CheckFill(
            request.FilledOn, request.OdometerKm, request.Amount, currency, request.PricePerUnit, request.Quantity, request.Today);
        if (error is not null)
        {
            return error;
        }

        if (vehicle.PurchasedOn is { } bought && request.FilledOn < bought)
        {
            return "That's before it was bought.";
        }

        if (vehicle.DisposedOn is { } gone && request.FilledOn > gone)
        {
            return "That's after you let it go.";
        }

        var others = await db.FuelLogs.Where(f => f.VehicleId == log.VehicleId && f.Id != id)
            .Select(f => new { f.FilledOn, f.OdometerKm }).ToListAsync();
        error = FuelEconomy.CheckOdometer(request.FilledOn, request.OdometerKm, others.Select(o => (o.FilledOn, o.OdometerKm)));
        if (error is not null)
        {
            return error;
        }

        // A service logged on an earlier day already saw this reading or more.
        var serviced = await db.MaintenanceLogs
            .Where(l => l.MaintenanceTask.VehicleId == log.VehicleId && l.DoneOn < request.FilledOn && l.OdometerKm > request.OdometerKm)
            .OrderByDescending(l => l.OdometerKm)
            .Select(l => l.OdometerKm)
            .FirstOrDefaultAsync();
        if (serviced is { } reading)
        {
            return FormattableString.Invariant($"A service before this day already read {reading:N0} km — the odometer only goes up.");
        }

        log.FilledOn = request.FilledOn;
        log.OdometerKm = request.OdometerKm;
        log.Amount = request.Amount;
        log.Currency = currency!;
        log.PricePerUnit = request.PricePerUnit;
        log.Quantity = request.Quantity;
        log.MissedFillBefore = request.MissedFillBefore;
        log.Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
        return null;
    }

    /// <summary>One Expense for the fill (every Finance rule applies), stored as its TransactionId.</summary>
    private async Task<string?> RecordAsync(FuelLog log, FuelExpenseRequest request)
    {
        var vehicle = await db.Vehicles.Where(v => v.Id == log.VehicleId).Select(v => new { v.Name, v.FuelUnit }).FirstAsync();
        var expense = await transactionsService.CreateAsync(new TransactionRequest
        {
            Kind = TransactionKinds.Expense,
            OccurredOn = log.FilledOn,
            Amount = log.Amount,
            Currency = log.Currency,
            ExchangeRate = request.ExchangeRate,
            FromAccountId = request.AccountId,
            Payee = "Fuel",
            Note = ExpenseNote(vehicle.Name, FuelEconomy.Quantity(log.Amount, log.PricePerUnit, log.Quantity), vehicle.FuelUnit, log.OdometerKm),
            TagIds = request.TagIds,
        });
        if (!expense.Success)
        {
            return expense.Error!;
        }

        log.TransactionId = expense.Data!.Id;
        log.UpdatedAt = DateTime.UtcNow;
        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            return "This fill was recorded somewhere else at the same time. Reload.";
        }

        return null;
    }

    /// <summary>"Swift — 4.81 L at 5,300 km".</summary>
    internal static string ExpenseNote(string vehicleName, decimal quantity, string unit, int odometerKm) =>
        string.Create(CultureInfo.InvariantCulture, $"{vehicleName} — {quantity:0.##} {UnitShort(unit)} at {odometerKm:N0} km");

    private static string UnitShort(string unit) => unit switch { "Litre" => "L", "Kg" => "kg", _ => unit };

    /// <summary>What <see cref="FuelEconomy"/> needs from a fill, with its vehicle (shared with the vehicles list).</summary>
    internal sealed record FuelRow(int Id, int VehicleId, DateOnly FilledOn, int OdometerKm, decimal Amount, string Currency, decimal? PricePerUnit, decimal? Quantity, bool MissedFillBefore)
    {
        public FuelFill Fill => new(Id, FilledOn, OdometerKm, Amount, Currency, FuelEconomy.Quantity(Amount, PricePerUnit, Quantity), MissedFillBefore);
    }

    internal static readonly Expression<Func<FuelLog, FuelRow>> ToRow = f =>
        new FuelRow(f.Id, f.VehicleId, f.FilledOn, f.OdometerKm, f.Amount, f.Currency, f.PricePerUnit, f.Quantity, f.MissedFillBefore);

    private static readonly Expression<Func<FuelLog, FuelLogDto>> ToDto = f => new FuelLogDto
    {
        Id = f.Id,
        VehicleId = f.VehicleId,
        FilledOn = f.FilledOn,
        OdometerKm = f.OdometerKm,
        Amount = f.Amount,
        Currency = f.Currency,
        PricePerUnit = f.PricePerUnit ?? 0,
        Quantity = f.Quantity ?? 0,
        QuantityGiven = f.Quantity != null,
        MissedFillBefore = f.MissedFillBefore,
        TransactionId = f.TransactionId,
        PaidFromAccountName = f.Transaction != null && f.Transaction.FromAccount != null ? f.Transaction.FromAccount.Name : null,
        Notes = f.Notes,
    };
}
