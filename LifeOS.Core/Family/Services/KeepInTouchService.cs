using LifeOS.Core.Family.DTOs;
using LifeOS.Core.Family.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.Services;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Family.Services;

/// <summary>
/// "Keep in touch every N days" (Session 74): one cadence per person (KeepInTouch is one-to-one with the contact, so
/// it's rewritten in place). When the next touch is due is <see cref="KeepInTouchRules"/> over the contact's
/// LastContactedOn — worked out per request, never stored.
/// </summary>
public class KeepInTouchService(AppDbContext db) : IKeepInTouchService
{
    private const string ContactNotFound = "Contact not found.";

    public async Task<List<KeepInTouchDto>> GetAllAsync(DateOnly today) =>
        (await LoadAsync(null, today)).OrderBy(k => k.DaysUntil).ThenBy(k => k.Name).ToList();

    public async Task<OperationResult<KeepInTouchDto?>> GetAsync(int contactId, DateOnly today)
    {
        if (!await db.Contacts.AnyAsync(c => c.Id == contactId))
        {
            return OperationResult<KeepInTouchDto?>.Fail(ContactNotFound);
        }

        return OperationResult<KeepInTouchDto?>.Ok((await LoadAsync(contactId, today)).FirstOrDefault());
    }

    public async Task<OperationResult<KeepInTouchDto>> SetAsync(int contactId, KeepInTouchRequest request)
    {
        if (!await db.Contacts.AnyAsync(c => c.Id == contactId))
        {
            return OperationResult<KeepInTouchDto>.Fail(ContactNotFound);
        }

        if (KeepInTouchRules.CheckCadence(request.CadenceDays) is { } error)
        {
            return OperationResult<KeepInTouchDto>.Fail(error);
        }

        if (request.Today == default)
        {
            return OperationResult<KeepInTouchDto>.Fail("Today's date is required.");
        }

        var cadence = await db.KeepInTouches.FirstOrDefaultAsync(k => k.ContactId == contactId);
        if (cadence is null)
        {
            db.KeepInTouches.Add(new KeepInTouch
            {
                UserId = db.CurrentUserId!.Value,
                ContactId = contactId,
                CadenceDays = (short)request.CadenceDays,
            });
        }
        else
        {
            cadence.CadenceDays = (short)request.CadenceDays;
            cadence.UpdatedAt = DateTime.UtcNow;
        }

        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            return OperationResult<KeepInTouchDto>.Fail("That person already has a cadence — reload and change it.");
        }

        return OperationResult<KeepInTouchDto>.Ok((await LoadAsync(contactId, request.Today)).Single());
    }

    public async Task<OperationResult<bool>> ClearAsync(int contactId)
    {
        var cadence = await db.KeepInTouches.FirstOrDefaultAsync(k => k.ContactId == contactId);
        if (cadence is null)
        {
            return OperationResult<bool>.Fail(await db.Contacts.AnyAsync(c => c.Id == contactId)
                ? "There's no cadence to clear."
                : ContactNotFound);
        }

        cadence.IsDeleted = true;
        cadence.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return OperationResult<bool>.Ok(true);
    }

    private async Task<List<KeepInTouchDto>> LoadAsync(int? contactId, DateOnly today)
    {
        var query = db.KeepInTouches.Where(k => !k.Contact.IsDeleted);
        if (contactId is { } id)
        {
            query = query.Where(k => k.ContactId == id);
        }

        var rows = await query
            .Select(k => new { k.ContactId, k.Contact.Name, k.CadenceDays, k.Contact.LastContactedOn, k.CreatedAt })
            .ToListAsync();
        return rows.Select(r =>
        {
            var due = KeepInTouchRules.DueOn(r.LastContactedOn, DateOnly.FromDateTime(r.CreatedAt), r.CadenceDays);
            return new KeepInTouchDto
            {
                ContactId = r.ContactId,
                Name = r.Name,
                CadenceDays = r.CadenceDays,
                LastContactedOn = r.LastContactedOn,
                DueOn = due,
                DaysUntil = KeepInTouchRules.DaysUntil(due, today),
            };
        }).ToList();
    }
}
