using LifeOS.Core.Family.DTOs;
using LifeOS.Core.Family.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.Services;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Family.Services;

/// <summary>
/// The family tree's edges (Session 73). Partners and siblings are stored once, the smaller id first (you first of
/// all), so "Asha is Ravi's partner" and "Ravi is Asha's partner" are the same row. Two people have one relationship;
/// nobody becomes their own ancestor (FamilyTree.WouldLoop). Where people sit is FamilyTree on every read — nothing
/// about the tree is stored but its edges.
/// </summary>
public class RelationshipsService(AppDbContext db) : IRelationshipsService
{
    private const string NotFound = "Relationship not found.";

    public async Task<List<RelationshipDto>> GetAllAsync() =>
        await db.Relationships
            .OrderBy(r => r.Id)
            .Select(r => new RelationshipDto
            {
                Id = r.Id,
                PersonContactId = r.PersonContactId,
                PersonName = r.PersonContact != null ? r.PersonContact.Name : null,
                RelativeContactId = r.RelativeContactId,
                RelativeName = r.RelativeContact != null ? r.RelativeContact.Name : null,
                Kind = r.Kind,
                Label = r.Label,
            })
            .ToListAsync();

    public async Task<List<FamilyPersonDto>> GetPeopleAsync(DateOnly today)
    {
        var edges = await EdgesAsync();
        var places = FamilyTree.Places(edges);
        var inTree = edges.SelectMany(e => new[] { e.Person, e.Relative }).OfType<int>().ToHashSet();
        var birthdays = (await db.SignificantDates
                .Where(d => d.Kind == SignificantDateKinds.Birthday)
                .Select(d => new { d.ContactId, d.Month, d.Day, d.Year })
                .ToListAsync())
            .ToDictionary(d => d.ContactId);

        return (await db.Contacts.OrderBy(c => c.Name)
                .Select(c => new { c.Id, c.Name, c.Phone, c.Email, c.LastContactedOn })
                .ToListAsync())
            .Select(c =>
            {
                places.TryGetValue(c.Id, out var place);
                DateOnly? next = null;
                int? turns = null;
                if (birthdays.TryGetValue(c.Id, out var b))
                {
                    next = SignificantDays.Next(b.Month, b.Day, today);
                    turns = SignificantDays.YearsOn(b.Year, next.Value.Year);
                }

                return new FamilyPersonDto
                {
                    ContactId = c.Id,
                    Name = c.Name,
                    Phone = c.Phone,
                    Email = c.Email,
                    IsFamily = inTree.Contains(c.Id),
                    Relation = place?.Relation,
                    Generation = place?.Generation,
                    NextBirthday = next,
                    TurnsAge = turns,
                    LastContactedOn = c.LastContactedOn,
                };
            })
            .ToList();
    }

    public async Task<OperationResult<RelationshipDto>> CreateAsync(RelationshipRequest request)
    {
        if (!RelationshipKinds.All.Contains(request.Kind))
        {
            return Fail("Choose how they're related.");
        }

        var label = string.IsNullOrWhiteSpace(request.Label) ? null : request.Label.Trim();
        if (request.Kind == RelationshipKinds.Other && label is null)
        {
            return Fail("Say how they're related — cousin, godmother…");
        }

        int? person = request.PersonContactId;
        int? relative = request.RelativeContactId;
        if (person == relative)
        {
            return Fail("Choose two different people.");
        }

        if (relative is null && request.Kind != RelationshipKinds.Parent)
        {
            // Only "you are their parent" puts you on the relative side; a partner/sibling reads the other way round.
            if (request.Kind == RelationshipKinds.Other)
            {
                return Fail("Add it from their side: they are your … (cousin, godchild…).");
            }

            (person, relative) = (relative, person);
        }

        if (RelationshipKinds.IsMutual(request.Kind) && person is not null && relative is not null && person > relative)
        {
            (person, relative) = (relative, person);
        }

        var ids = new[] { person, relative }.OfType<int>().ToList();
        if (await db.Contacts.CountAsync(c => ids.Contains(c.Id)) != ids.Count)
        {
            return Fail("Contact not found.");
        }

        var edges = await EdgesAsync();
        if (edges.Any(e => (e.Person == person && e.Relative == relative) || (e.Person == relative && e.Relative == person)))
        {
            return Fail("They're already related — remove that first to change it.");
        }

        if (request.Kind == RelationshipKinds.Parent && FamilyTree.WouldLoop(edges, person, relative))
        {
            return Fail("That would make someone their own ancestor.");
        }

        var relationship = new Relationship
        {
            UserId = db.CurrentUserId!.Value,
            PersonContactId = person,
            RelativeContactId = relative,
            Kind = request.Kind,
            Label = label,
        };
        db.Relationships.Add(relationship);
        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            return Fail("They're already related — remove that first to change it.");
        }

        return OperationResult<RelationshipDto>.Ok((await GetAllAsync()).First(r => r.Id == relationship.Id));
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var relationship = await db.Relationships.FindAsync(id);
        if (relationship is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        relationship.IsDeleted = true;
        relationship.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return OperationResult<bool>.Ok(true);
    }

    private async Task<List<FamilyEdge>> EdgesAsync() =>
        (await db.Relationships.Select(r => new { r.PersonContactId, r.RelativeContactId, r.Kind, r.Label }).ToListAsync())
        .Select(r => new FamilyEdge(r.PersonContactId, r.RelativeContactId, r.Kind, r.Label))
        .ToList();

    private static OperationResult<RelationshipDto> Fail(string error) => OperationResult<RelationshipDto>.Fail(error);
}
