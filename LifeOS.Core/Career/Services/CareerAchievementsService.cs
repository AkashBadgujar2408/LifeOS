using System.Linq.Expressions;
using LifeOS.Core.Calendar.ServiceContracts;
using LifeOS.Core.Career.DTOs;
using LifeOS.Core.Career.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Career.Services;

/// <summary>Professional achievements — projects, promotions, awards, contributions. Each is a Life Story beat.</summary>
public class CareerAchievementsService(AppDbContext db, IEntityLinksService entityLinksService, IRemindersService remindersService)
    : ICareerAchievementsService
{
    private const string NotFound = "Achievement not found.";

    public async Task<List<CareerAchievementDto>> GetAllAsync() =>
        await db.CareerAchievements
            .OrderByDescending(a => a.AchievedOn).ThenByDescending(a => a.Id)
            .Select(ToDto)
            .ToListAsync();

    public async Task<OperationResult<CareerAchievementDto>> GetAsync(int id)
    {
        var achievement = await db.CareerAchievements.Where(a => a.Id == id).Select(ToDto).FirstOrDefaultAsync();
        return achievement is null
            ? OperationResult<CareerAchievementDto>.Fail(NotFound)
            : OperationResult<CareerAchievementDto>.Ok(achievement);
    }

    public async Task<OperationResult<CareerAchievementDto>> CreateAsync(CareerAchievementRequest request)
    {
        var achievement = new CareerAchievement { UserId = db.CurrentUserId!.Value };
        var error = await ApplyAsync(achievement, request);
        if (error is not null)
        {
            return OperationResult<CareerAchievementDto>.Fail(error);
        }

        db.CareerAchievements.Add(achievement);
        await db.SaveChangesAsync();
        return await GetAsync(achievement.Id);
    }

    public async Task<OperationResult<CareerAchievementDto>> UpdateAsync(int id, CareerAchievementRequest request)
    {
        var achievement = await db.CareerAchievements.FindAsync(id);
        if (achievement is null)
        {
            return OperationResult<CareerAchievementDto>.Fail(NotFound);
        }

        var error = await ApplyAsync(achievement, request);
        if (error is not null)
        {
            return OperationResult<CareerAchievementDto>.Fail(error);
        }

        achievement.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return await GetAsync(id);
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var achievement = await db.CareerAchievements.FindAsync(id);
        if (achievement is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        await using var transaction = await db.Database.BeginTransactionAsync();
        achievement.IsDeleted = true;
        achievement.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        await entityLinksService.RemoveAllForEntityAsync(CareerAchievementLinkableProvider.Type, id);
        await remindersService.RemoveAllForEntityAsync(CareerAchievementLinkableProvider.Type, id);
        await transaction.CommitAsync();
        return OperationResult<bool>.Ok(true);
    }

    private async Task<string?> ApplyAsync(CareerAchievement achievement, CareerAchievementRequest request)
    {
        var title = request.Title.Trim();
        if (title.Length == 0)
        {
            return "Give the achievement a title.";
        }

        if (!CareerAchievementKinds.All.Contains(request.Kind))
        {
            return "Unknown kind of achievement.";
        }

        if (request.AchievedOn == default || request.Today == default)
        {
            return "The date is required.";
        }

        if (request.AchievedOn > request.Today)
        {
            return "An achievement can't be in the future.";
        }

        if (request.EmploymentId is { } id && !await db.Employments.AnyAsync(e => e.Id == id))
        {
            return "Role not found.";
        }

        achievement.EmploymentId = request.EmploymentId;
        achievement.Kind = request.Kind;
        achievement.Title = title;
        achievement.AchievedOn = request.AchievedOn;
        achievement.Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();
        return null;
    }

    private static readonly Expression<Func<CareerAchievement, CareerAchievementDto>> ToDto = a => new CareerAchievementDto
    {
        Id = a.Id,
        EmploymentId = a.EmploymentId,
        Organisation = a.Employment != null ? a.Employment.Organisation : null,
        Role = a.Employment != null ? a.Employment.Role : null,
        Kind = a.Kind,
        Title = a.Title,
        AchievedOn = a.AchievedOn,
        Description = a.Description,
    };
}
