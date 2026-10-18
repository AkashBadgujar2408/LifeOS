using System.Linq.Expressions;
using LifeOS.Core.Calendar.ServiceContracts;
using LifeOS.Core.Career.DTOs;
using LifeOS.Core.Career.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Career.Services;

/// <summary>
/// Roles over time (career.Employments). A promotion is a new role at the same organisation: PromoteAsync ends the
/// current one the day before and records the Promotion achievement (and the new pay) in one go, so the timeline,
/// the salary history and the Life Story all tell it.
/// </summary>
public class EmploymentsService(AppDbContext db, IEntityLinksService entityLinksService, IRemindersService remindersService)
    : IEmploymentsService
{
    private const string NotFound = "Role not found.";

    public async Task<List<EmploymentDto>> GetAllAsync() =>
        await db.Employments
            .OrderByDescending(e => e.StartDate).ThenByDescending(e => e.Id)
            .Select(ToDto)
            .ToListAsync();

    public async Task<OperationResult<EmploymentDto>> GetAsync(int id)
    {
        var role = await db.Employments.Where(e => e.Id == id).Select(ToDto).FirstOrDefaultAsync();
        return role is null ? OperationResult<EmploymentDto>.Fail(NotFound) : OperationResult<EmploymentDto>.Ok(role);
    }

    public async Task<OperationResult<EmploymentDto>> CreateAsync(EmploymentRequest request)
    {
        var role = new Employment { UserId = db.CurrentUserId!.Value };
        var error = Apply(role, request);
        if (error is not null)
        {
            return OperationResult<EmploymentDto>.Fail(error);
        }

        db.Employments.Add(role);
        await db.SaveChangesAsync();
        return await GetAsync(role.Id);
    }

    public async Task<OperationResult<EmploymentDto>> UpdateAsync(int id, EmploymentRequest request)
    {
        var role = await db.Employments.FindAsync(id);
        if (role is null)
        {
            return OperationResult<EmploymentDto>.Fail(NotFound);
        }

        var error = Apply(role, request);
        // Pay recorded for the role has to stay inside its dates.
        error ??= await db.SalaryRecords.AnyAsync(s => s.EmploymentId == id
                && (s.EffectiveOn < role.StartDate || (role.EndDate != null && s.EffectiveOn > role.EndDate)))
            ? "Some of this role's salary history falls outside these dates. Move or remove it first."
            : null;
        if (error is not null)
        {
            return OperationResult<EmploymentDto>.Fail(error);
        }

        role.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return await GetAsync(id);
    }

    public async Task<OperationResult<PromotionResultDto>> PromoteAsync(int id, PromotionRequest request)
    {
        var current = await db.Employments.FindAsync(id);
        if (current is null)
        {
            return OperationResult<PromotionResultDto>.Fail(NotFound);
        }

        var newRole = request.NewRole.Trim();
        string? currency = null;
        var error = newRole.Length == 0 ? "Name the new role."
            : request.On == default || request.Today == default ? "The date is required."
            : CareerRules.CheckPromotion(current.StartDate, current.EndDate, request.On);
        if (error is null && request.Salary is { } pay)
        {
            currency = CareerRules.Currency(pay.Currency);
            error = currency is null ? "Use a three-letter currency code, like INR or EUR."
                : !SalaryPeriods.All.Contains(pay.Period) ? "Unknown pay period."
                : null;
        }

        if (error is not null)
        {
            return OperationResult<PromotionResultDto>.Fail(error);
        }

        var now = DateTime.UtcNow;
        await using var transaction = await db.Database.BeginTransactionAsync();
        current.EndDate = request.On.AddDays(-1);
        current.UpdatedAt = now;
        var promoted = new Employment
        {
            UserId = current.UserId,
            Organisation = current.Organisation,
            Role = newRole,
            EmploymentType = current.EmploymentType,
            Location = current.Location,
            StartDate = request.On,
        };
        db.Employments.Add(promoted);
        await db.SaveChangesAsync();

        var achievement = new CareerAchievement
        {
            UserId = current.UserId,
            EmploymentId = promoted.Id,
            Kind = CareerAchievementKinds.Promotion,
            Title = $"Promoted to {newRole}",
            AchievedOn = request.On,
            Description = string.IsNullOrWhiteSpace(request.Note) ? null : request.Note.Trim(),
        };
        db.CareerAchievements.Add(achievement);
        SalaryRecord? salary = null;
        if (request.Salary is { } amount)
        {
            salary = new SalaryRecord
            {
                UserId = current.UserId,
                EmploymentId = promoted.Id,
                EffectiveOn = request.On,
                Amount = amount.Amount,
                Currency = currency!,
                Period = amount.Period,
                Reason = SalaryReasons.Promotion,
            };
            db.SalaryRecords.Add(salary);
        }

        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return OperationResult<PromotionResultDto>.Ok(new PromotionResultDto
        {
            PreviousRole = (await GetAsync(id)).Data!,
            NewRole = (await GetAsync(promoted.Id)).Data!,
            AchievementId = achievement.Id,
            SalaryRecordId = salary?.Id,
        });
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var role = await db.Employments.FindAsync(id);
        if (role is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        var now = DateTime.UtcNow;
        await using var transaction = await db.Database.BeginTransactionAsync();
        await db.SalaryRecords.Where(s => s.EmploymentId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.EmploymentId, (int?)null).SetProperty(x => x.UpdatedAt, now));
        await db.CareerAchievements.Where(a => a.EmploymentId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.EmploymentId, (int?)null).SetProperty(x => x.UpdatedAt, now));
        await db.PerformanceReviews.Where(r => r.EmploymentId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.EmploymentId, (int?)null).SetProperty(x => x.UpdatedAt, now));
        role.IsDeleted = true;
        role.DeletedAt = now;
        await db.SaveChangesAsync();
        await entityLinksService.RemoveAllForEntityAsync(EmploymentLinkableProvider.Type, id);
        await remindersService.RemoveAllForEntityAsync(EmploymentLinkableProvider.Type, id);
        await transaction.CommitAsync();
        return OperationResult<bool>.Ok(true);
    }

    private static string? Apply(Employment role, EmploymentRequest request)
    {
        var organisation = request.Organisation.Trim();
        var title = request.Role.Trim();
        if (organisation.Length == 0)
        {
            return "Name the organisation.";
        }

        if (title.Length == 0)
        {
            return "Name the role.";
        }

        if (request.StartDate == default || request.Today == default)
        {
            return "The start date is required.";
        }

        var error = CareerRules.CheckRole(request.EmploymentType, request.StartDate, request.EndDate);
        if (error is not null)
        {
            return error;
        }

        role.Organisation = organisation;
        role.Role = title;
        role.EmploymentType = request.EmploymentType;
        role.Location = string.IsNullOrWhiteSpace(request.Location) ? null : request.Location.Trim();
        role.StartDate = request.StartDate;
        role.EndDate = request.EndDate;
        role.Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();
        return null;
    }

    private static readonly Expression<Func<Employment, EmploymentDto>> ToDto = e => new EmploymentDto
    {
        Id = e.Id,
        Organisation = e.Organisation,
        Role = e.Role,
        EmploymentType = e.EmploymentType,
        Location = e.Location,
        StartDate = e.StartDate,
        EndDate = e.EndDate,
        Description = e.Description,
        AchievementCount = e.CareerAchievements.Count,
    };
}
