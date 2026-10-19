using LifeOS.Core.Calendar.ServiceContracts;
using LifeOS.Core.Health.DTOs;
using LifeOS.Core.Health.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Health.Services;

/// <summary>Medical history. Ongoing first (no end), then the most recent; surgeries by the day they happened.</summary>
public class MedicalConditionsService(AppDbContext db, IEntityLinksService entityLinksService, IRemindersService remindersService)
    : IMedicalConditionsService
{
    private const string NotFound = "Medical history item not found.";

    public async Task<List<MedicalConditionDto>> GetAllAsync() =>
        (await db.MedicalConditions.AsNoTracking()
            .OrderBy(c => c.EndedOn != null).ThenByDescending(c => c.StartedOn).ThenBy(c => c.Name)
            .ToListAsync())
        .Select(ToDto).ToList();

    public async Task<OperationResult<MedicalConditionDto>> GetAsync(int id)
    {
        var condition = await db.MedicalConditions.AsNoTracking().FirstOrDefaultAsync(c => c.Id == id);
        return condition is null ? OperationResult<MedicalConditionDto>.Fail(NotFound) : OperationResult<MedicalConditionDto>.Ok(ToDto(condition));
    }

    public async Task<OperationResult<MedicalConditionDto>> CreateAsync(MedicalConditionRequest request)
    {
        if (HealthRules.CheckCondition(request) is { } error)
        {
            return OperationResult<MedicalConditionDto>.Fail(error);
        }

        var condition = new MedicalCondition { UserId = db.CurrentUserId!.Value };
        Apply(condition, request);
        db.MedicalConditions.Add(condition);
        await db.SaveChangesAsync();
        return OperationResult<MedicalConditionDto>.Ok(ToDto(condition));
    }

    public async Task<OperationResult<MedicalConditionDto>> UpdateAsync(int id, MedicalConditionRequest request)
    {
        var condition = await db.MedicalConditions.FindAsync(id);
        if (condition is null)
        {
            return OperationResult<MedicalConditionDto>.Fail(NotFound);
        }

        if (HealthRules.CheckCondition(request) is { } error)
        {
            return OperationResult<MedicalConditionDto>.Fail(error);
        }

        Apply(condition, request);
        condition.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return OperationResult<MedicalConditionDto>.Ok(ToDto(condition));
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var condition = await db.MedicalConditions.FindAsync(id);
        if (condition is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        var now = DateTime.UtcNow;
        await using var transaction = await db.Database.BeginTransactionAsync();
        condition.IsDeleted = true;
        condition.DeletedAt = now;
        await db.DoctorVisits.Where(v => v.ConditionId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(v => v.ConditionId, (int?)null).SetProperty(v => v.UpdatedAt, now));
        await db.Medications.Where(m => m.ConditionId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(m => m.ConditionId, (int?)null).SetProperty(m => m.UpdatedAt, now));
        await db.SaveChangesAsync();
        await entityLinksService.RemoveAllForEntityAsync(MedicalConditionLinkableProvider.Type, id);
        await remindersService.RemoveAllForEntityAsync(MedicalConditionLinkableProvider.Type, id);
        await transaction.CommitAsync();
        return OperationResult<bool>.Ok(true);
    }

    private static void Apply(MedicalCondition condition, MedicalConditionRequest request)
    {
        condition.Kind = request.Kind;
        condition.Name = request.Name.Trim();
        condition.Severity = request.Severity;
        condition.StartedOn = request.StartedOn;
        condition.EndedOn = request.EndedOn;
        condition.Notes = HealthRules.Text(request.Notes);
    }

    private static MedicalConditionDto ToDto(MedicalCondition c) => new()
    {
        Id = c.Id,
        Kind = c.Kind,
        Name = c.Name,
        Severity = c.Severity,
        StartedOn = c.StartedOn,
        EndedOn = c.EndedOn,
        Notes = c.Notes,
    };
}
