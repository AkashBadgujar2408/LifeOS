using LifeOS.Core.Models;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Learning.Services;

/// <summary>Checks for the references a learning item can carry; all go through the per-user filters.</summary>
internal static class LearningLookups
{
    public static async Task<string?> CheckAsync(AppDbContext db, int? lifeAreaId, IReadOnlyCollection<int> tagIds, int? skillId = null)
    {
        if (lifeAreaId is { } areaId && !await db.LifeAreas.AnyAsync(a => a.Id == areaId))
        {
            return "Life area not found.";
        }

        // Another user's skill or tag counts as missing.
        if (skillId is { } id && !await db.Skills.AnyAsync(s => s.Id == id))
        {
            return "Skill not found.";
        }

        var distinct = tagIds.Distinct().ToList();
        if (distinct.Count > 0 && await db.Tags.CountAsync(t => distinct.Contains(t.Id)) != distinct.Count)
        {
            return "Tag not found.";
        }

        return null;
    }
}
