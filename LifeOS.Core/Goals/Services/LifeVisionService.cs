using LifeOS.Core.Goals.DTOs;
using LifeOS.Core.Goals.ServiceContracts;
using LifeOS.Core.Models;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Goals.Services;

/// <summary>
/// The life vision is one statement per user (shared.Users.LifeVision), owned by Goals since that's where it's
/// written; the Life Story shows it as its premise.
/// </summary>
public class LifeVisionService(AppDbContext db) : ILifeVisionService
{
    public async Task<LifeVisionDto> GetAsync()
    {
        var text = await db.Users
            .Where(u => u.Id == db.CurrentUserId)
            .Select(u => u.LifeVision)
            .FirstOrDefaultAsync();
        return new LifeVisionDto { Text = text };
    }

    public async Task<LifeVisionDto> SaveAsync(LifeVisionRequest request)
    {
        var user = await db.Users.FirstAsync(u => u.Id == db.CurrentUserId);
        var text = string.IsNullOrWhiteSpace(request.Text) ? null : request.Text.Trim();
        if (user.LifeVision != text)
        {
            user.LifeVision = text;
            user.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
        }

        return new LifeVisionDto { Text = text };
    }
}
