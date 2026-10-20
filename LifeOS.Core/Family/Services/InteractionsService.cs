using LifeOS.Core.Family.DTOs;
using LifeOS.Core.Family.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.Services;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Family.Services;

/// <summary>
/// Calls, visits and messages (Session 74) — one entry with everyone it was with. Each person's
/// <c>Contacts.LastContactedOn</c> follows their interactions: logging one moves it forward (never back past a later
/// day already there, e.g. one marked "in touch today" by hand); editing or deleting the one that set it goes back to
/// their latest interaction left (empty when none). A later day set by hand is never touched.
/// </summary>
public class InteractionsService(AppDbContext db) : IInteractionsService
{
    private const string NotFound = "Interaction not found.";
    private const int MaxTake = 500;

    public async Task<List<InteractionDto>> GetAllAsync(int? contactId, int take)
    {
        var query = db.Interactions.AsQueryable();
        if (contactId is { } id)
        {
            query = query.Where(i => i.InteractionPeople.Any(p => p.ContactId == id));
        }

        var rows = await query
            .OrderByDescending(i => i.OccurredOn).ThenByDescending(i => i.Id)
            .Take(Math.Clamp(take, 1, MaxTake))
            .Select(i => new
            {
                i.Id, i.OccurredOn, i.Kind, i.Summary, i.Notes,
                // The soft-delete filter doesn't reach into a projection's collection, so filter here too.
                People = i.InteractionPeople.Where(p => !p.IsDeleted && !p.Contact.IsDeleted)
                    .Select(p => new FamilyPersonRefDto { ContactId = p.ContactId, Name = p.Contact.Name }).ToList(),
            })
            .ToListAsync();

        return rows.Select(r => new InteractionDto
        {
            Id = r.Id,
            OccurredOn = r.OccurredOn,
            Kind = r.Kind,
            Summary = r.Summary,
            Notes = r.Notes,
            People = r.People.OrderBy(p => p.Name).ToList(),
        }).ToList();
    }

    public async Task<OperationResult<InteractionDto>> CreateAsync(InteractionRequest request)
    {
        var contactIds = request.ContactIds.Distinct().ToList();
        if (await CheckAsync(request, contactIds) is { } error)
        {
            return OperationResult<InteractionDto>.Fail(error);
        }

        var userId = db.CurrentUserId!.Value;
        var interaction = new Interaction
        {
            UserId = userId,
            OccurredOn = request.OccurredOn,
            Kind = request.Kind,
            Summary = Clean(request.Summary),
            Notes = Clean(request.Notes),
        };
        foreach (var contactId in contactIds)
        {
            interaction.InteractionPeople.Add(new InteractionPerson { UserId = userId, ContactId = contactId });
        }

        await using var transaction = await db.Database.BeginOrJoinTransactionAsync();
        db.Interactions.Add(interaction);
        await db.SaveChangesAsync();
        await SyncLastContactedAsync(contactIds, null);
        await transaction.CommitAsync();
        return OperationResult<InteractionDto>.Ok(await GetOneAsync(interaction.Id));
    }

    public async Task<OperationResult<InteractionDto>> UpdateAsync(int id, InteractionRequest request)
    {
        var interaction = await db.Interactions.Include(i => i.InteractionPeople).FirstOrDefaultAsync(i => i.Id == id);
        if (interaction is null)
        {
            return OperationResult<InteractionDto>.Fail(NotFound);
        }

        var contactIds = request.ContactIds.Distinct().ToList();
        if (await CheckAsync(request, contactIds) is { } error)
        {
            return OperationResult<InteractionDto>.Fail(error);
        }

        var now = DateTime.UtcNow;
        var oldDay = interaction.OccurredOn;
        var oldPeople = interaction.InteractionPeople.Where(p => !p.IsDeleted).Select(p => p.ContactId).ToList();

        interaction.OccurredOn = request.OccurredOn;
        interaction.Kind = request.Kind;
        interaction.Summary = Clean(request.Summary);
        interaction.Notes = Clean(request.Notes);
        interaction.UpdatedAt = now;
        foreach (var person in interaction.InteractionPeople.Where(p => !p.IsDeleted && !contactIds.Contains(p.ContactId)))
        {
            person.IsDeleted = true;
            person.DeletedAt = now;
        }

        foreach (var contactId in contactIds.Except(oldPeople))
        {
            interaction.InteractionPeople.Add(new InteractionPerson { UserId = interaction.UserId, ContactId = contactId });
        }

        await using var transaction = await db.Database.BeginOrJoinTransactionAsync();
        await db.SaveChangesAsync();
        await SyncLastContactedAsync(oldPeople.Union(contactIds).ToList(), oldDay);
        await transaction.CommitAsync();
        return OperationResult<InteractionDto>.Ok(await GetOneAsync(id));
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var interaction = await db.Interactions.Include(i => i.InteractionPeople).FirstOrDefaultAsync(i => i.Id == id);
        if (interaction is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        var now = DateTime.UtcNow;
        var people = interaction.InteractionPeople.Where(p => !p.IsDeleted).Select(p => p.ContactId).ToList();
        foreach (var person in interaction.InteractionPeople.Where(p => !p.IsDeleted))
        {
            person.IsDeleted = true;
            person.DeletedAt = now;
        }

        interaction.IsDeleted = true;
        interaction.DeletedAt = now;
        await using var transaction = await db.Database.BeginOrJoinTransactionAsync();
        await db.SaveChangesAsync();
        await SyncLastContactedAsync(people, interaction.OccurredOn);
        await transaction.CommitAsync();
        return OperationResult<bool>.Ok(true);
    }

    /// <summary>
    /// After a change: each person's last-contacted day moves forward to their latest interaction, and if the change
    /// took away the interaction that had set it (<paramref name="removedDay"/>), back to the latest one left.
    /// </summary>
    private async Task SyncLastContactedAsync(List<int> contactIds, DateOnly? removedDay)
    {
        if (contactIds.Count == 0)
        {
            return;
        }

        var latest = await db.InteractionPeople
            .Where(p => contactIds.Contains(p.ContactId) && !p.Interaction.IsDeleted)
            .GroupBy(p => p.ContactId)
            .Select(g => new { ContactId = g.Key, Day = g.Max(p => p.Interaction.OccurredOn) })
            .ToDictionaryAsync(x => x.ContactId, x => (DateOnly?)x.Day);

        var contacts = await db.Contacts.Where(c => contactIds.Contains(c.Id)).ToListAsync();
        var now = DateTime.UtcNow;
        foreach (var contact in contacts)
        {
            var next = LastContactedAfterChange(contact.LastContactedOn, latest.GetValueOrDefault(contact.Id), removedDay);
            if (next != contact.LastContactedOn)
            {
                contact.LastContactedOn = next;
                contact.UpdatedAt = now;
            }
        }

        await db.SaveChangesAsync();
    }

    /// <summary>The rule above, pure (xUnit-tested).</summary>
    internal static DateOnly? LastContactedAfterChange(DateOnly? current, DateOnly? latestInteraction, DateOnly? removedDay)
    {
        if (latestInteraction is { } latest && (current is null || current < latest))
        {
            return latest;
        }

        return removedDay is { } removed && current == removed && (latestInteraction is null || latestInteraction < removed)
            ? latestInteraction
            : current;
    }

    private async Task<string?> CheckAsync(InteractionRequest request, List<int> contactIds)
    {
        if (FamilyLogRules.CheckInteraction(request.Kind, request.OccurredOn, contactIds.Count, request.Today) is { } error)
        {
            return error;
        }

        if (request.Today == default)
        {
            return "Today's date is required.";
        }

        var found = await db.Contacts.CountAsync(c => contactIds.Contains(c.Id));
        return found == contactIds.Count ? null : "Contact not found.";
    }

    private async Task<InteractionDto> GetOneAsync(int id) =>
        (await GetAllAsyncFor(id)).Single();

    private Task<List<InteractionDto>> GetAllAsyncFor(int id) =>
        db.Interactions.Where(i => i.Id == id)
            .Select(i => new InteractionDto
            {
                Id = i.Id,
                OccurredOn = i.OccurredOn,
                Kind = i.Kind,
                Summary = i.Summary,
                Notes = i.Notes,
                People = i.InteractionPeople.Where(p => !p.IsDeleted && !p.Contact.IsDeleted)
                    .OrderBy(p => p.Contact.Name)
                    .Select(p => new FamilyPersonRefDto { ContactId = p.ContactId, Name = p.Contact.Name }).ToList(),
            })
            .ToListAsync();

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
