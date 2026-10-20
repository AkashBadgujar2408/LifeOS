using System.Linq.Expressions;
using LifeOS.Core.Calendar.ServiceContracts;
using LifeOS.Core.Career.Services;
using LifeOS.Core.Home.DTOs;
using LifeOS.Core.Home.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using LifeOS.Core.Shared.Services;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Home.Services;

/// <summary>
/// Vehicles. Insurance is the Finance policy a vehicle links to (its renewal reminder is owned there); the PUC and the
/// registration each own a reminder here, N days before they run out. The next service is the vehicle's maintenance
/// due soonest — computed, like every next due day.
/// </summary>
public class VehiclesService(
    AppDbContext db,
    HomeReminders homeReminders,
    IWarrantiesService warrantiesService,
    IEntityLinksService entityLinksService,
    IRemindersService remindersService) : IVehiclesService
{
    private const string NotFound = "Vehicle not found.";
    private const string Duplicate = "You already have a vehicle with that name.";

    public async Task<List<VehicleDto>> GetAllAsync()
    {
        var vehicles = await db.Vehicles.OrderBy(v => v.DisposedOn != null).ThenBy(v => v.Name).Select(ToDto).ToListAsync();
        await FillAsync(vehicles);
        return vehicles;
    }

    public async Task<OperationResult<VehicleDto>> GetAsync(int id)
    {
        var vehicle = await db.Vehicles.Where(v => v.Id == id).Select(ToDto).FirstOrDefaultAsync();
        if (vehicle is null)
        {
            return OperationResult<VehicleDto>.Fail(NotFound);
        }

        await FillAsync([vehicle]);
        return OperationResult<VehicleDto>.Ok(vehicle);
    }

    public async Task<OperationResult<VehicleDto>> CreateAsync(VehicleRequest request)
    {
        var vehicle = new Vehicle { UserId = db.CurrentUserId!.Value };
        var error = await ApplyAsync(vehicle, request, null);
        if (error is not null)
        {
            return OperationResult<VehicleDto>.Fail(error);
        }

        await using var transaction = await db.Database.BeginTransactionAsync();
        db.Vehicles.Add(vehicle);
        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            return OperationResult<VehicleDto>.Fail(Duplicate);
        }

        var reminderError = await SyncRemindersAsync(vehicle, request.TimeZone);
        if (reminderError is not null)
        {
            return OperationResult<VehicleDto>.Fail(reminderError);
        }

        await transaction.CommitAsync();
        return await GetAsync(vehicle.Id);
    }

    public async Task<OperationResult<VehicleDto>> UpdateAsync(int id, VehicleRequest request)
    {
        var vehicle = await db.Vehicles.FindAsync(id);
        if (vehicle is null)
        {
            return OperationResult<VehicleDto>.Fail(NotFound);
        }

        var error = await ApplyAsync(vehicle, request, id);
        if (error is not null)
        {
            return OperationResult<VehicleDto>.Fail(error);
        }

        if (vehicle.DisposedOn is { } disposed && vehicle.PurchasedOn is { } bought && disposed < bought)
        {
            return OperationResult<VehicleDto>.Fail("It was let go before that day — change the purchase day or the disposal first.");
        }

        if (vehicle.DisposalAmount is not null && vehicle.Currency is null)
        {
            return OperationResult<VehicleDto>.Fail("Keep a currency: it was sold for an amount.");
        }

        vehicle.UpdatedAt = DateTime.UtcNow;
        await using var transaction = await db.Database.BeginTransactionAsync();
        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            return OperationResult<VehicleDto>.Fail(Duplicate);
        }

        var reminderError = await SyncRemindersAsync(vehicle, request.TimeZone);
        if (reminderError is not null)
        {
            return OperationResult<VehicleDto>.Fail(reminderError);
        }

        await transaction.CommitAsync();
        return await GetAsync(id);
    }

    public async Task<OperationResult<VehicleDto>> SetDisposalAsync(int id, DisposalRequest request)
    {
        var vehicle = await db.Vehicles.FindAsync(id);
        if (vehicle is null)
        {
            return OperationResult<VehicleDto>.Fail(NotFound);
        }

        if (request.Today == default)
        {
            return OperationResult<VehicleDto>.Fail("Today's date is required.");
        }

        var currency = request.Amount is null ? null : CareerRules.Currency(request.Currency ?? vehicle.Currency);
        var error = HomeRules.CheckDisposal(request.Kind, request.On, request.Amount, currency, vehicle.PurchasedOn, request.Today);
        if (error is not null)
        {
            return OperationResult<VehicleDto>.Fail(error);
        }

        if (currency is not null && vehicle.Currency is not null && vehicle.PurchasePrice is not null && currency != vehicle.Currency)
        {
            return OperationResult<VehicleDto>.Fail($"Give what it sold for in {vehicle.Currency}, the currency it was bought in.");
        }

        vehicle.DisposalKind = request.Kind;
        vehicle.DisposedOn = request.Kind is null ? null : request.On;
        vehicle.DisposalAmount = request.Kind is null ? null : request.Amount;
        vehicle.Currency = vehicle.Currency ?? currency;
        vehicle.UpdatedAt = DateTime.UtcNow;
        await using var transaction = await db.Database.BeginTransactionAsync();
        await db.SaveChangesAsync();
        // A vehicle you no longer have needs no PUC or registration reminders (they come back if it's taken back).
        var reminderError = await SyncRemindersAsync(vehicle, null);
        if (reminderError is not null)
        {
            return OperationResult<VehicleDto>.Fail(reminderError);
        }

        await transaction.CommitAsync();
        return await GetAsync(id);
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var vehicle = await db.Vehicles.FindAsync(id);
        if (vehicle is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        var now = DateTime.UtcNow;
        await using var transaction = await db.Database.BeginTransactionAsync();
        await db.MaintenanceTasks.Where(m => m.VehicleId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(m => m.VehicleId, (int?)null).SetProperty(m => m.UpdatedAt, now));
        await warrantiesService.RemoveAsync(await db.Warranties.Where(w => w.VehicleId == id).Select(w => w.Id).ToListAsync());
        vehicle.IsDeleted = true;
        vehicle.DeletedAt = now;
        await db.SaveChangesAsync();
        // Includes the PUC and registration reminders. A linked insurance policy stays in Finance.
        await entityLinksService.RemoveAllForEntityAsync(VehicleLinkableProvider.Type, id);
        await remindersService.RemoveAllForEntityAsync(VehicleLinkableProvider.Type, id);
        await transaction.CommitAsync();
        return OperationResult<bool>.Ok(true);
    }

    private async Task<string?> ApplyAsync(Vehicle vehicle, VehicleRequest request, int? id)
    {
        var name = request.Name.Trim();
        if (name.Length == 0)
        {
            return "Name it (e.g. Swift, Activa).";
        }

        if (request.Today == default)
        {
            return "Today's date is required.";
        }

        var currency = request.PurchasePrice is null && vehicle.DisposalAmount is null ? null : CareerRules.Currency(request.Currency);
        var error = HomeRules.CheckVehicle(
            request.Kind, request.ModelYear, request.PurchasedOn, request.PurchasePrice, currency,
            request.PucValidUntil, request.RegistrationValidUntil, request.ReminderDays, request.Today)
            ?? HomeReminders.CheckZone(request.TimeZone);
        if (error is not null)
        {
            return error;
        }

        if (await db.Vehicles.AnyAsync(v => v.Name == name && v.Id != id))
        {
            return Duplicate;
        }

        if (request.InsurancePolicyId is { } policyId && !await db.InsurancePolicies.AnyAsync(p => p.Id == policyId))
        {
            return "Insurance policy not found.";
        }

        vehicle.Name = name;
        vehicle.Kind = request.Kind;
        vehicle.Make = Clean(request.Make);
        vehicle.Model = Clean(request.Model);
        vehicle.ModelYear = request.ModelYear;
        vehicle.RegistrationNumber = Clean(request.RegistrationNumber)?.ToUpperInvariant();
        vehicle.PurchasedOn = request.PurchasedOn;
        vehicle.PurchasePrice = request.PurchasePrice;
        vehicle.Currency = currency;
        vehicle.InsurancePolicyId = request.InsurancePolicyId;
        vehicle.PucValidUntil = request.PucValidUntil;
        vehicle.RegistrationValidUntil = request.RegistrationValidUntil;
        vehicle.ReminderDays = request.ReminderDays;
        vehicle.Notes = Clean(request.Notes);
        return null;
    }

    private async Task<string?> SyncRemindersAsync(Vehicle vehicle, string? zone)
    {
        // Nothing to remind about for a vehicle you no longer have.
        var days = vehicle.DisposedOn is null ? vehicle.ReminderDays : null;
        var (pucId, pucError) = await homeReminders.SyncAsync(
            vehicle.PucReminderId,
            new OwnedReminder(
                VehicleLinkableProvider.Type,
                vehicle.Id,
                vehicle.PucValidUntil,
                days,
                vehicle.PucValidUntil is { } puc ? HomeRules.PucReminderTitle(vehicle.Name, puc) : string.Empty,
                "Get the pollution check done before the certificate runs out."),
            zone);
        if (pucError is not null)
        {
            return pucError;
        }

        var (registrationId, registrationError) = await homeReminders.SyncAsync(
            vehicle.RegistrationReminderId,
            new OwnedReminder(
                VehicleLinkableProvider.Type,
                vehicle.Id,
                vehicle.RegistrationValidUntil,
                days,
                vehicle.RegistrationValidUntil is { } reg ? HomeRules.RegistrationReminderTitle(vehicle.Name, reg) : string.Empty,
                "Renew the registration (or re-register) before it runs out."),
            zone);
        if (registrationError is not null)
        {
            return registrationError;
        }

        if (vehicle.PucReminderId != pucId || vehicle.RegistrationReminderId != registrationId)
        {
            vehicle.PucReminderId = pucId;
            vehicle.RegistrationReminderId = registrationId;
            await db.SaveChangesAsync();
        }

        return null;
    }

    /// <summary>Odometer (highest logged) and the next service (its maintenance due soonest, not paused).</summary>
    private async Task FillAsync(List<VehicleDto> vehicles)
    {
        var ids = vehicles.Select(v => v.Id).ToList();
        var tasks = await db.MaintenanceTasks
            .Where(m => m.VehicleId != null && ids.Contains(m.VehicleId.Value))
            .Select(m => new
            {
                m.Id,
                VehicleId = m.VehicleId!.Value,
                m.Title,
                m.IsPaused,
                m.RecurrenceFrequency,
                m.RecurrenceInterval,
                m.FirstDueOn,
                LastDoneOn = m.MaintenanceLogs.Max(l => (DateOnly?)l.DoneOn),
                Odometer = m.MaintenanceLogs.Max(l => l.OdometerKm),
            })
            .ToListAsync();
        foreach (var vehicle in vehicles)
        {
            var own = tasks.Where(t => t.VehicleId == vehicle.Id).ToList();
            vehicle.OdometerKm = own.Max(t => t.Odometer);
            var next = own
                .Where(t => !t.IsPaused)
                .Select(t => (t.Id, t.Title, On: HomeRules.NextDue(t.RecurrenceFrequency, t.RecurrenceInterval, t.FirstDueOn, t.LastDoneOn)))
                .OrderBy(t => t.On).ThenBy(t => t.Title, StringComparer.Ordinal)
                .FirstOrDefault();
            if (next.Id != 0)
            {
                vehicle.NextServiceTaskId = next.Id;
                vehicle.NextServiceTitle = next.Title;
                vehicle.NextServiceOn = next.On;
            }
        }
    }

    private static string? Clean(string? text) => string.IsNullOrWhiteSpace(text) ? null : text.Trim();

    private static readonly Expression<Func<Vehicle, VehicleDto>> ToDto = v => new VehicleDto
    {
        Id = v.Id,
        Name = v.Name,
        Kind = v.Kind,
        Make = v.Make,
        Model = v.Model,
        ModelYear = v.ModelYear,
        RegistrationNumber = v.RegistrationNumber,
        PurchasedOn = v.PurchasedOn,
        PurchasePrice = v.PurchasePrice,
        Currency = v.Currency,
        InsurancePolicyId = v.InsurancePolicyId,
        InsurancePolicyName = v.InsurancePolicy != null ? v.InsurancePolicy.Name : null,
        InsuranceRenewsOn = v.InsurancePolicy != null ? v.InsurancePolicy.RenewsOn : null,
        InsuranceEndsOn = v.InsurancePolicy != null ? v.InsurancePolicy.EndsOn : null,
        PucValidUntil = v.PucValidUntil,
        RegistrationValidUntil = v.RegistrationValidUntil,
        ReminderDays = v.ReminderDays,
        DisposedOn = v.DisposedOn,
        DisposalKind = v.DisposalKind,
        DisposalAmount = v.DisposalAmount,
        Notes = v.Notes,
    };
}
