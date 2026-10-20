using LifeOS.Core.Calendar.ServiceContracts;
using LifeOS.Core.Career.Services;
using LifeOS.Core.Home.DTOs;
using LifeOS.Core.Home.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Home.Services;

/// <summary>
/// Maintenance that comes round again (service the car every 6 months). The next due day is never stored:
/// <see cref="HomeRules.NextDue"/> on the first due day and the latest log. "Done" adds a log; the next due day and the
/// reminder before it (owned here, through <see cref="HomeReminders"/>) move on. A paused task has no reminder.
/// </summary>
public class MaintenanceService(
    AppDbContext db,
    HomeReminders homeReminders,
    IEntityLinksService entityLinksService,
    IRemindersService remindersService) : IMaintenanceService
{
    private const string NotFound = "Maintenance not found.";

    public async Task<List<MaintenanceTaskDto>> GetAllAsync()
    {
        var tasks = await Project(db.MaintenanceTasks).ToListAsync();
        tasks.ForEach(t => Fill(t));
        return tasks.OrderBy(t => t.IsPaused).ThenBy(t => t.NextDueOn).ThenBy(t => t.Title, StringComparer.Ordinal).ToList();
    }

    public async Task<OperationResult<MaintenanceTaskDto>> GetAsync(int id)
    {
        var task = await Project(db.MaintenanceTasks.Where(m => m.Id == id)).FirstOrDefaultAsync();
        return task is null ? OperationResult<MaintenanceTaskDto>.Fail(NotFound) : OperationResult<MaintenanceTaskDto>.Ok(Fill(task));
    }

    public async Task<OperationResult<MaintenanceTaskDto>> CreateAsync(MaintenanceTaskRequest request)
    {
        var task = new MaintenanceTask { UserId = db.CurrentUserId!.Value };
        var error = await ApplyAsync(task, request);
        if (error is not null)
        {
            return OperationResult<MaintenanceTaskDto>.Fail(error);
        }

        await using var transaction = await db.Database.BeginTransactionAsync();
        db.MaintenanceTasks.Add(task);
        await db.SaveChangesAsync();
        var reminderError = await SyncReminderAsync(task, request.TimeZone);
        if (reminderError is not null)
        {
            return OperationResult<MaintenanceTaskDto>.Fail(reminderError);
        }

        await transaction.CommitAsync();
        return await GetAsync(task.Id);
    }

    public async Task<OperationResult<MaintenanceTaskDto>> UpdateAsync(int id, MaintenanceTaskRequest request)
    {
        var task = await db.MaintenanceTasks.FindAsync(id);
        if (task is null)
        {
            return OperationResult<MaintenanceTaskDto>.Fail(NotFound);
        }

        var error = await ApplyAsync(task, request);
        if (error is not null)
        {
            return OperationResult<MaintenanceTaskDto>.Fail(error);
        }

        task.UpdatedAt = DateTime.UtcNow;
        await using var transaction = await db.Database.BeginTransactionAsync();
        await db.SaveChangesAsync();
        var reminderError = await SyncReminderAsync(task, request.TimeZone);
        if (reminderError is not null)
        {
            return OperationResult<MaintenanceTaskDto>.Fail(reminderError);
        }

        await transaction.CommitAsync();
        return await GetAsync(id);
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var task = await db.MaintenanceTasks.FindAsync(id);
        if (task is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        var now = DateTime.UtcNow;
        await using var transaction = await db.Database.BeginTransactionAsync();
        // The history goes with it; expenses recorded in Finance stay there.
        await db.MaintenanceLogs.Where(l => l.MaintenanceTaskId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(l => l.IsDeleted, true).SetProperty(l => l.DeletedAt, now));
        task.IsDeleted = true;
        task.DeletedAt = now;
        await db.SaveChangesAsync();
        await entityLinksService.RemoveAllForEntityAsync(MaintenanceTaskLinkableProvider.Type, id);
        await remindersService.RemoveAllForEntityAsync(MaintenanceTaskLinkableProvider.Type, id);
        await transaction.CommitAsync();
        return OperationResult<bool>.Ok(true);
    }

    public async Task<OperationResult<List<MaintenanceLogDto>>> GetLogsAsync(int id)
    {
        if (!await db.MaintenanceTasks.AnyAsync(m => m.Id == id))
        {
            return OperationResult<List<MaintenanceLogDto>>.Fail(NotFound);
        }

        var logs = await db.MaintenanceLogs
            .Where(l => l.MaintenanceTaskId == id)
            .OrderByDescending(l => l.DoneOn).ThenByDescending(l => l.Id)
            .Select(l => new MaintenanceLogDto
            {
                Id = l.Id,
                MaintenanceTaskId = l.MaintenanceTaskId,
                DoneOn = l.DoneOn,
                Cost = l.Cost,
                Currency = l.Currency,
                OdometerKm = l.OdometerKm,
                TransactionId = l.TransactionId,
                Notes = l.Notes,
            })
            .ToListAsync();
        return OperationResult<List<MaintenanceLogDto>>.Ok(logs);
    }

    public async Task<OperationResult<MaintenanceTaskDto>> DoneAsync(int id, MaintenanceDoneRequest request)
    {
        var task = await db.MaintenanceTasks.FindAsync(id);
        if (task is null)
        {
            return OperationResult<MaintenanceTaskDto>.Fail(NotFound);
        }

        if (request.Today == default)
        {
            return OperationResult<MaintenanceTaskDto>.Fail("Today's date is required.");
        }

        var currency = request.Cost is null ? null : CareerRules.Currency(request.Currency);
        var error = HomeRules.CheckDone(request.DoneOn, request.Cost, currency, request.OdometerKm, request.Today)
            ?? HomeReminders.CheckZone(request.TimeZone);
        if (error is not null)
        {
            return OperationResult<MaintenanceTaskDto>.Fail(error);
        }

        await using var transaction = await db.Database.BeginTransactionAsync();
        db.MaintenanceLogs.Add(new MaintenanceLog
        {
            UserId = task.UserId,
            MaintenanceTaskId = id,
            DoneOn = request.DoneOn,
            Cost = request.Cost,
            Currency = currency,
            OdometerKm = request.OdometerKm,
            Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim(),
        });
        task.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        var reminderError = await SyncReminderAsync(task, request.TimeZone);
        if (reminderError is not null)
        {
            return OperationResult<MaintenanceTaskDto>.Fail(reminderError);
        }

        await transaction.CommitAsync();
        return await GetAsync(id);
    }

    public async Task<OperationResult<MaintenanceTaskDto>> RemoveLogAsync(int id, int logId, string? timeZone)
    {
        var task = await db.MaintenanceTasks.FindAsync(id);
        var log = await db.MaintenanceLogs.FirstOrDefaultAsync(l => l.Id == logId && l.MaintenanceTaskId == id);
        if (task is null || log is null)
        {
            return OperationResult<MaintenanceTaskDto>.Fail(NotFound);
        }

        var zoneError = HomeReminders.CheckZone(timeZone);
        if (zoneError is not null)
        {
            return OperationResult<MaintenanceTaskDto>.Fail(zoneError);
        }

        await using var transaction = await db.Database.BeginTransactionAsync();
        log.IsDeleted = true;
        log.DeletedAt = DateTime.UtcNow;
        task.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        var reminderError = await SyncReminderAsync(task, timeZone);
        if (reminderError is not null)
        {
            return OperationResult<MaintenanceTaskDto>.Fail(reminderError);
        }

        await transaction.CommitAsync();
        return await GetAsync(id);
    }

    private async Task<string?> ApplyAsync(MaintenanceTask task, MaintenanceTaskRequest request)
    {
        var title = request.Title.Trim();
        if (title.Length == 0)
        {
            return "Say what needs doing (e.g. Service the car).";
        }

        var targetType = string.IsNullOrWhiteSpace(request.TargetType) ? null : request.TargetType;
        var error = HomeRules.CheckMaintenance(
            targetType, request.TargetId, request.RecurrenceFrequency, request.RecurrenceInterval, request.FirstDueOn, request.ReminderDays)
            ?? HomeReminders.CheckZone(request.TimeZone);
        if (error is not null)
        {
            return error;
        }

        var targetFound = targetType switch
        {
            null => true,
            HomeTargets.Asset => await db.Assets.AnyAsync(a => a.Id == request.TargetId),
            HomeTargets.Vehicle => await db.Vehicles.AnyAsync(v => v.Id == request.TargetId),
            _ => await db.Properties.AnyAsync(p => p.Id == request.TargetId),
        };
        if (!targetFound)
        {
            return "What it's for wasn't found.";
        }

        if (request.ContactId is { } contactId && !await db.Contacts.AnyAsync(c => c.Id == contactId))
        {
            return "Contact not found.";
        }

        task.Title = title;
        task.AssetId = targetType == HomeTargets.Asset ? request.TargetId : null;
        task.VehicleId = targetType == HomeTargets.Vehicle ? request.TargetId : null;
        task.PropertyId = targetType == HomeTargets.Property ? request.TargetId : null;
        task.RecurrenceFrequency = request.RecurrenceFrequency;
        task.RecurrenceInterval = request.RecurrenceInterval;
        task.FirstDueOn = request.FirstDueOn;
        task.IsPaused = request.IsPaused;
        task.ContactId = request.ContactId;
        task.ReminderDays = request.ReminderDays;
        task.Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
        return null;
    }

    private async Task<string?> SyncReminderAsync(MaintenanceTask task, string? zone)
    {
        var lastDone = await db.MaintenanceLogs.Where(l => l.MaintenanceTaskId == task.Id).MaxAsync(l => (DateOnly?)l.DoneOn);
        var next = HomeRules.NextDue(task.RecurrenceFrequency, task.RecurrenceInterval, task.FirstDueOn, lastDone);
        var (reminderId, error) = await homeReminders.SyncAsync(
            task.ReminderId,
            new OwnedReminder(
                MaintenanceTaskLinkableProvider.Type,
                task.Id,
                task.IsPaused ? null : next,
                task.ReminderDays,
                HomeRules.MaintenanceReminderTitle(task.Title, next),
                "Book it in, or mark it done once it's been taken care of."),
            zone);
        if (error is not null)
        {
            return error;
        }

        if (task.ReminderId != reminderId)
        {
            task.ReminderId = reminderId;
            await db.SaveChangesAsync();
        }

        return null;
    }

    /// <summary>The DTO without the computed next due day — <see cref="Fill"/> adds it once the rows are read.</summary>
    private static IQueryable<MaintenanceTaskDto> Project(IQueryable<MaintenanceTask> query) =>
        query.Select(m => new MaintenanceTaskDto
        {
            Id = m.Id,
            Title = m.Title,
            TargetType = m.AssetId != null ? HomeTargets.Asset : m.VehicleId != null ? HomeTargets.Vehicle : m.PropertyId != null ? HomeTargets.Property : null,
            TargetId = m.AssetId ?? m.VehicleId ?? m.PropertyId,
            TargetName = m.Asset != null ? m.Asset.Name : m.Vehicle != null ? m.Vehicle.Name : m.Property != null ? m.Property.Name : null,
            RecurrenceFrequency = m.RecurrenceFrequency,
            RecurrenceInterval = m.RecurrenceInterval,
            FirstDueOn = m.FirstDueOn,
            IsPaused = m.IsPaused,
            ContactId = m.ContactId,
            ContactName = m.Contact != null ? m.Contact.Name : null,
            ReminderDays = m.ReminderDays,
            Notes = m.Notes,
            LastDoneOn = m.MaintenanceLogs.Max(l => (DateOnly?)l.DoneOn),
            TimesDone = m.MaintenanceLogs.Count,
        });

    private static MaintenanceTaskDto Fill(MaintenanceTaskDto task)
    {
        task.NextDueOn = HomeRules.NextDue(task.RecurrenceFrequency, task.RecurrenceInterval, task.FirstDueOn, task.LastDoneOn);
        return task;
    }
}
