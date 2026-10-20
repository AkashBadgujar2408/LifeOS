using LifeOS.Core.Family.DTOs;
using LifeOS.Core.Family.ServiceContracts;
using LifeOS.Core.Models;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Family.Services;

/// <summary>
/// A contact's delete (ContactsService) releases what the family log holds about them: they leave their
/// interactions (an interaction left with nobody goes too), their gifts go, and responsibilities stop pointing at
/// them — one someone else held becomes Shared with nobody named (the CHECK needs a holder for Someone).
/// </summary>
public class FamilyLogCleanup(AppDbContext db) : IFamilyLogCleanup
{
    public async Task ReleaseContactAsync(int contactId)
    {
        var now = DateTime.UtcNow;
        var interactionIds = await db.InteractionPeople.Where(p => p.ContactId == contactId)
            .Select(p => p.InteractionId).Distinct().ToListAsync();
        await db.InteractionPeople.Where(p => p.ContactId == contactId)
            .ExecuteUpdateAsync(s => s.SetProperty(p => p.IsDeleted, true).SetProperty(p => p.DeletedAt, now));
        await db.Interactions.Where(i => interactionIds.Contains(i.Id) && !i.InteractionPeople.Any(p => !p.IsDeleted))
            .ExecuteUpdateAsync(s => s.SetProperty(i => i.IsDeleted, true).SetProperty(i => i.DeletedAt, now));

        await db.GiftIdeas.Where(g => g.ContactId == contactId)
            .ExecuteUpdateAsync(s => s.SetProperty(g => g.IsDeleted, true).SetProperty(g => g.DeletedAt, now));

        await db.Responsibilities.Where(r => r.ContactId == contactId)
            .ExecuteUpdateAsync(s => s.SetProperty(r => r.ContactId, (int?)null).SetProperty(r => r.UpdatedAt, now));
        await db.Responsibilities.Where(r => r.HolderContactId == contactId)
            .ExecuteUpdateAsync(s => s
                .SetProperty(r => r.HolderContactId, (int?)null)
                .SetProperty(r => r.HeldBy, r => r.HeldBy == ResponsibilityHolders.Someone ? ResponsibilityHolders.Shared : r.HeldBy)
                .SetProperty(r => r.UpdatedAt, now));
    }
}
