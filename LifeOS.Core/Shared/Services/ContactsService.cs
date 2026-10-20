using System.Linq.Expressions;
using LifeOS.Core.Calendar.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Shared.Services;

/// <summary>
/// Contacts (Session 51): the shared people list, with tags for groupings. Deleting one releases what pointed at it
/// (job applications' recruiter/referrer for now; later modules add theirs here) rather than deleting those too.
/// </summary>
public class ContactsService(AppDbContext db, IEntityLinksService entityLinksService, IRemindersService remindersService)
    : IContactsService
{
    private const string NotFound = "Contact not found.";

    public async Task<List<ContactDto>> GetAllAsync(int? tagId)
    {
        var query = db.Contacts.AsQueryable();
        if (tagId is { } id)
        {
            query = query.Where(c => c.ContactTags.Any(t => t.TagId == id));
        }

        return await query.OrderBy(c => c.Name).ThenBy(c => c.Id).Select(ToDto).ToListAsync();
    }

    public async Task<OperationResult<ContactDto>> GetAsync(int id)
    {
        var contact = await db.Contacts.Where(c => c.Id == id).Select(ToDto).FirstOrDefaultAsync();
        return contact is null ? OperationResult<ContactDto>.Fail(NotFound) : OperationResult<ContactDto>.Ok(contact);
    }

    public async Task<OperationResult<ContactDto>> CreateAsync(ContactRequest request)
    {
        var userId = db.CurrentUserId!.Value;
        var contact = new Contact { UserId = userId };
        var error = await ApplyAsync(contact, request);
        if (error is not null)
        {
            return OperationResult<ContactDto>.Fail(error);
        }

        foreach (var tagId in request.TagIds.Distinct())
        {
            contact.ContactTags.Add(new ContactTag { UserId = userId, TagId = tagId });
        }

        db.Contacts.Add(contact);
        await db.SaveChangesAsync();
        return await GetAsync(contact.Id);
    }

    public async Task<OperationResult<ContactDto>> UpdateAsync(int id, ContactRequest request)
    {
        var contact = await db.Contacts.FindAsync(id);
        if (contact is null)
        {
            return OperationResult<ContactDto>.Fail(NotFound);
        }

        var error = await ApplyAsync(contact, request);
        if (error is not null)
        {
            return OperationResult<ContactDto>.Fail(error);
        }

        contact.UpdatedAt = DateTime.UtcNow;
        var wanted = request.TagIds.ToHashSet();
        var current = await db.ContactTags.Where(t => t.ContactId == id).ToListAsync();
        foreach (var tag in current.Where(t => !wanted.Contains(t.TagId)))
        {
            tag.IsDeleted = true;
            tag.DeletedAt = DateTime.UtcNow;
        }

        foreach (var tagId in wanted.Except(current.Select(t => t.TagId)))
        {
            db.ContactTags.Add(new ContactTag { UserId = contact.UserId, ContactId = id, TagId = tagId });
        }

        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            return OperationResult<ContactDto>.Fail("This contact was changed somewhere else at the same time. Reload and try again.");
        }

        return await GetAsync(id);
    }

    public async Task<OperationResult<ContactDto>> ContactedAsync(int id, DateOnly today)
    {
        if (today == default)
        {
            return OperationResult<ContactDto>.Fail("Today's date is required.");
        }

        var contact = await db.Contacts.FindAsync(id);
        if (contact is null)
        {
            return OperationResult<ContactDto>.Fail(NotFound);
        }

        contact.LastContactedOn = today;
        contact.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return await GetAsync(id);
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var contact = await db.Contacts.FindAsync(id);
        if (contact is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        var now = DateTime.UtcNow;
        await using var transaction = await db.Database.BeginTransactionAsync();
        await db.ContactTags.Where(t => t.ContactId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.IsDeleted, true).SetProperty(t => t.DeletedAt, now));
        await db.JobApplications.Where(a => a.ContactId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(a => a.ContactId, (int?)null).SetProperty(a => a.UpdatedAt, now));
        await db.Loans.Where(l => l.ContactId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(l => l.ContactId, (int?)null).SetProperty(l => l.UpdatedAt, now));
        await db.InsurancePolicies.Where(p => p.ContactId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(p => p.ContactId, (int?)null).SetProperty(p => p.UpdatedAt, now));
        await db.DoctorVisits.Where(v => v.ContactId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(v => v.ContactId, (int?)null).SetProperty(v => v.UpdatedAt, now));
        await db.Warranties.Where(w => w.ContactId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(w => w.ContactId, (int?)null).SetProperty(w => w.UpdatedAt, now));
        await db.MaintenanceTasks.Where(m => m.ContactId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(m => m.ContactId, (int?)null).SetProperty(m => m.UpdatedAt, now));
        // Family: their place in the tree, their days and their keep-in-touch cadence go with them.
        await db.Relationships.Where(r => r.PersonContactId == id || r.RelativeContactId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(r => r.IsDeleted, true).SetProperty(r => r.DeletedAt, now));
        await db.SignificantDates.Where(d => d.ContactId == id || d.OtherContactId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(d => d.IsDeleted, true).SetProperty(d => d.DeletedAt, now));
        await db.KeepInTouches.Where(k => k.ContactId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(k => k.IsDeleted, true).SetProperty(k => k.DeletedAt, now));
        contact.IsDeleted = true;
        contact.DeletedAt = now;
        await db.SaveChangesAsync();
        await entityLinksService.RemoveAllForEntityAsync(ContactLinkableProvider.Type, id);
        await remindersService.RemoveAllForEntityAsync(ContactLinkableProvider.Type, id);
        await transaction.CommitAsync();
        return OperationResult<bool>.Ok(true);
    }

    private async Task<string?> ApplyAsync(Contact contact, ContactRequest request)
    {
        var name = request.Name.Trim();
        if (name.Length == 0)
        {
            return "Give the contact a name.";
        }

        if (request.Today == default)
        {
            return "Today's date is required.";
        }

        if (request.LastContactedOn is { } last && last > request.Today)
        {
            return "The last time you were in touch can't be in the future.";
        }

        var tagIds = request.TagIds.Distinct().ToList();
        if (tagIds.Count > 0 && await db.Tags.CountAsync(t => tagIds.Contains(t.Id)) != tagIds.Count)
        {
            return "Tag not found.";
        }

        contact.Name = name;
        contact.Organisation = Clean(request.Organisation);
        contact.JobTitle = Clean(request.JobTitle);
        contact.Email = Clean(request.Email);
        contact.Phone = Clean(request.Phone);
        contact.Notes = Clean(request.Notes);
        contact.LastContactedOn = request.LastContactedOn;
        return null;
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static readonly Expression<Func<Contact, ContactDto>> ToDto = c => new ContactDto
    {
        Id = c.Id,
        Name = c.Name,
        Organisation = c.Organisation,
        JobTitle = c.JobTitle,
        Email = c.Email,
        Phone = c.Phone,
        Notes = c.Notes,
        LastContactedOn = c.LastContactedOn,
        Tags = c.ContactTags.OrderBy(t => t.Tag.Name).Select(t => new TagDto { Id = t.TagId, Name = t.Tag.Name }).ToList(),
    };
}

/// <summary>Contacts can be linked to anything, have reminders set on them, and be found by search.</summary>
public class ContactLinkableProvider(AppDbContext db) : ILinkableEntityProvider
{
    public const string Type = "Contact";

    public string EntityType => Type;

    public string DisplayName => "Contact";

    public async Task<Dictionary<int, string>> GetTitlesAsync(IReadOnlyCollection<int> ids) =>
        await db.Contacts.Where(c => ids.Contains(c.Id)).ToDictionaryAsync(c => c.Id, c => c.Name);

    public async Task<List<LinkableItemDto>> SearchAsync(string? search, int take)
    {
        var query = db.Contacts.AsQueryable();
        if (!string.IsNullOrEmpty(search))
        {
            query = query.Where(c => c.Name.Contains(search)
                || (c.Organisation != null && c.Organisation.Contains(search))
                || (c.Email != null && c.Email.Contains(search)));
        }

        return await query
            .OrderBy(c => c.Name)
            .Take(take)
            .Select(c => new LinkableItemDto { EntityType = Type, EntityId = c.Id, Title = c.Name })
            .ToListAsync();
    }
}
