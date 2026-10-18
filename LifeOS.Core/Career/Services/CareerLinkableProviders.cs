using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Career.Services;

/// <summary>Roles can be linked, have reminders, and be found by search; the title reads "Role at Organisation".</summary>
public class EmploymentLinkableProvider(AppDbContext db) : ILinkableEntityProvider
{
    public const string Type = "Employment";

    public string EntityType => Type;

    public string DisplayName => "Role";

    public async Task<Dictionary<int, string>> GetTitlesAsync(IReadOnlyCollection<int> ids) =>
        await db.Employments.Where(e => ids.Contains(e.Id)).ToDictionaryAsync(e => e.Id, e => e.Role + " at " + e.Organisation);

    public async Task<List<LinkableItemDto>> SearchAsync(string? search, int take)
    {
        var query = db.Employments.AsQueryable();
        if (!string.IsNullOrEmpty(search))
        {
            query = query.Where(e => e.Role.Contains(search) || e.Organisation.Contains(search));
        }

        return await query
            .OrderByDescending(e => e.StartDate)
            .Take(take)
            .Select(e => new LinkableItemDto { EntityType = Type, EntityId = e.Id, Title = e.Role + " at " + e.Organisation })
            .ToListAsync();
    }
}

public class CareerAchievementLinkableProvider(AppDbContext db) : ILinkableEntityProvider
{
    public const string Type = "CareerAchievement";

    public string EntityType => Type;

    public string DisplayName => "Career achievement";

    public async Task<Dictionary<int, string>> GetTitlesAsync(IReadOnlyCollection<int> ids) =>
        await db.CareerAchievements.Where(a => ids.Contains(a.Id)).ToDictionaryAsync(a => a.Id, a => a.Title);

    public async Task<List<LinkableItemDto>> SearchAsync(string? search, int take)
    {
        var query = db.CareerAchievements.AsQueryable();
        if (!string.IsNullOrEmpty(search))
        {
            query = query.Where(a => a.Title.Contains(search) || (a.Description != null && a.Description.Contains(search)));
        }

        return await query
            .OrderByDescending(a => a.AchievedOn)
            .Take(take)
            .Select(a => new LinkableItemDto { EntityType = Type, EntityId = a.Id, Title = a.Title })
            .ToListAsync();
    }
}
