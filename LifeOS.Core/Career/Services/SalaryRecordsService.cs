using LifeOS.Core.Career.DTOs;
using LifeOS.Core.Career.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.Services;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Career.Services;

/// <summary>Salary history: pay from a day on, per role. Change % is computed on read (SalaryHistory), never stored.</summary>
public class SalaryRecordsService(AppDbContext db) : ISalaryRecordsService
{
    private const string NotFound = "Salary record not found.";
    private const string SameDay = "This role already has pay recorded from that day.";

    public async Task<List<SalaryRecordDto>> GetAllAsync()
    {
        var records = await db.SalaryRecords
            .OrderByDescending(s => s.EffectiveOn).ThenByDescending(s => s.Id)
            .Select(s => new SalaryRecordDto
            {
                Id = s.Id,
                EmploymentId = s.EmploymentId,
                Organisation = s.Employment != null ? s.Employment.Organisation : null,
                Role = s.Employment != null ? s.Employment.Role : null,
                EffectiveOn = s.EffectiveOn,
                Amount = s.Amount,
                Currency = s.Currency,
                Period = s.Period,
                Reason = s.Reason,
                Note = s.Note,
            })
            .ToListAsync();
        SalaryHistory.FillChanges(records);
        return records;
    }

    public async Task<OperationResult<SalaryRecordDto>> CreateAsync(SalaryRecordRequest request)
    {
        var record = new SalaryRecord { UserId = db.CurrentUserId!.Value };
        var error = await ApplyAsync(record, request);
        if (error is not null)
        {
            return OperationResult<SalaryRecordDto>.Fail(error);
        }

        db.SalaryRecords.Add(record);
        return await SaveAsync(record);
    }

    public async Task<OperationResult<SalaryRecordDto>> UpdateAsync(int id, SalaryRecordRequest request)
    {
        var record = await db.SalaryRecords.FindAsync(id);
        if (record is null)
        {
            return OperationResult<SalaryRecordDto>.Fail(NotFound);
        }

        var error = await ApplyAsync(record, request);
        if (error is not null)
        {
            return OperationResult<SalaryRecordDto>.Fail(error);
        }

        record.UpdatedAt = DateTime.UtcNow;
        return await SaveAsync(record);
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var record = await db.SalaryRecords.FindAsync(id);
        if (record is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        record.IsDeleted = true;
        record.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return OperationResult<bool>.Ok(true);
    }

    /// <summary>Saves, then reads the record back from the full history so its change % is right.</summary>
    private async Task<OperationResult<SalaryRecordDto>> SaveAsync(SalaryRecord record)
    {
        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            db.Entry(record).State = EntityState.Detached;
            return OperationResult<SalaryRecordDto>.Fail(SameDay);
        }

        var saved = (await GetAllAsync()).First(r => r.Id == record.Id);
        return OperationResult<SalaryRecordDto>.Ok(saved);
    }

    private async Task<string?> ApplyAsync(SalaryRecord record, SalaryRecordRequest request)
    {
        if (request.EffectiveOn == default || request.Today == default)
        {
            return "The date is required.";
        }

        var currency = CareerRules.Currency(request.Currency);
        if (currency is null)
        {
            return "Use a three-letter currency code, like INR or EUR.";
        }

        if (!SalaryPeriods.All.Contains(request.Period))
        {
            return "Unknown pay period.";
        }

        if (!SalaryReasons.All.Contains(request.Reason))
        {
            return "Unknown reason.";
        }

        if (request.EmploymentId is { } employmentId)
        {
            var role = await db.Employments.Where(e => e.Id == employmentId)
                .Select(e => new { e.StartDate, e.EndDate }).FirstOrDefaultAsync();
            if (role is null)
            {
                return "Role not found.";
            }

            var dayError = CareerRules.CheckDayInRole(request.EffectiveOn, role.StartDate, role.EndDate);
            if (dayError is not null)
            {
                return dayError;
            }

            // The filtered unique index backs this up under a race.
            if (await db.SalaryRecords.AnyAsync(s => s.EmploymentId == employmentId && s.EffectiveOn == request.EffectiveOn && s.Id != record.Id))
            {
                return SameDay;
            }
        }

        record.EmploymentId = request.EmploymentId;
        record.EffectiveOn = request.EffectiveOn;
        record.Amount = request.Amount;
        record.Currency = currency;
        record.Period = request.Period;
        record.Reason = request.Reason;
        record.Note = string.IsNullOrWhiteSpace(request.Note) ? null : request.Note.Trim();
        return null;
    }
}
