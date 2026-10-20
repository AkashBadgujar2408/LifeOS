using LifeOS.Core.Family.DTOs;
using LifeOS.Core.Family.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Family.Services;

/// <summary>
/// Gifts for people (Session 74): an idea, then bought, then given. Money is never kept on a gift — a bought one may
/// point at its Purchase (which owns the Finance expense); the estimate is only what the idea is expected to cost.
/// The occasion is one of the person's significant dates (theirs, or an anniversary they share) or free text.
/// </summary>
public class GiftIdeasService(AppDbContext db) : IGiftIdeasService
{
    private const string NotFound = "Gift not found.";

    public async Task<List<GiftIdeaDto>> GetAllAsync(int? contactId)
    {
        var query = db.GiftIdeas.Where(g => !g.Contact.IsDeleted);
        if (contactId is { } id)
        {
            query = query.Where(g => g.ContactId == id);
        }

        var rows = await query
            // Ideas first, then bought, then given (most recent first); A–Z inside.
            .OrderBy(g => g.Status == GiftStatuses.Idea ? 0 : g.Status == GiftStatuses.Bought ? 1 : 2)
            .ThenByDescending(g => g.GivenOn)
            .ThenBy(g => g.Title)
            .Select(g => new
            {
                Gift = g,
                ContactName = g.Contact.Name,
                PurchaseTitle = g.Purchase != null && !g.Purchase.IsDeleted ? g.Purchase.Title : null,
                Date = g.SignificantDate != null && !g.SignificantDate.IsDeleted
                    ? new
                    {
                        g.SignificantDate.Kind,
                        g.SignificantDate.Label,
                        Name = g.SignificantDate.Contact.Name,
                        OtherName = g.SignificantDate.OtherContact != null ? g.SignificantDate.OtherContact.Name : null,
                    }
                    : null,
            })
            .ToListAsync();

        return rows.Select(r => new GiftIdeaDto
        {
            Id = r.Gift.Id,
            ContactId = r.Gift.ContactId,
            ContactName = r.ContactName,
            Title = r.Gift.Title,
            SignificantDateId = r.Date is null ? null : r.Gift.SignificantDateId,
            OccasionTitle = r.Date is { } d ? SignificantDays.Title(d.Kind, d.Label, d.Name, d.OtherName, null) : r.Gift.Occasion,
            Occasion = r.Gift.Occasion,
            Status = r.Gift.Status,
            EstimatedAmount = r.Gift.EstimatedAmount,
            Currency = r.Gift.Currency,
            Link = r.Gift.Link,
            PurchaseId = r.PurchaseTitle is null ? null : r.Gift.PurchaseId,
            PurchaseTitle = r.PurchaseTitle,
            GivenOn = r.Gift.GivenOn,
            Notes = r.Gift.Notes,
        }).ToList();
    }

    public async Task<OperationResult<GiftIdeaDto>> CreateAsync(GiftIdeaRequest request)
    {
        var gift = new GiftIdea { UserId = db.CurrentUserId!.Value };
        if (await ApplyAsync(gift, request) is { } error)
        {
            return OperationResult<GiftIdeaDto>.Fail(error);
        }

        db.GiftIdeas.Add(gift);
        await db.SaveChangesAsync();
        return OperationResult<GiftIdeaDto>.Ok(await GetOneAsync(gift.Id));
    }

    public async Task<OperationResult<GiftIdeaDto>> UpdateAsync(int id, GiftIdeaRequest request)
    {
        var gift = await db.GiftIdeas.FindAsync(id);
        if (gift is null)
        {
            return OperationResult<GiftIdeaDto>.Fail(NotFound);
        }

        if (await ApplyAsync(gift, request) is { } error)
        {
            return OperationResult<GiftIdeaDto>.Fail(error);
        }

        gift.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return OperationResult<GiftIdeaDto>.Ok(await GetOneAsync(id));
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var gift = await db.GiftIdeas.FindAsync(id);
        if (gift is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        // The purchase (and its expense) stays: the money was spent whether or not the gift is remembered here.
        gift.IsDeleted = true;
        gift.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return OperationResult<bool>.Ok(true);
    }

    private async Task<string?> ApplyAsync(GiftIdea gift, GiftIdeaRequest request)
    {
        var title = request.Title?.Trim() ?? string.Empty;
        var currency = Clean(request.Currency)?.ToUpperInvariant();
        var link = Clean(request.Link);
        if (request.Today == default)
        {
            return "Today's date is required.";
        }

        if (FamilyLogRules.CheckGift(title, request.Status, request.EstimatedAmount, currency, link, request.PurchaseId,
                request.GivenOn, request.Today) is { } error)
        {
            return error;
        }

        if (!await db.Contacts.AnyAsync(c => c.Id == request.ContactId))
        {
            return "Contact not found.";
        }

        if (request.SignificantDateId is { } dateId && !await db.SignificantDates.AnyAsync(d => d.Id == dateId
                && (d.ContactId == request.ContactId || d.OtherContactId == request.ContactId)))
        {
            return "Choose one of their own days as the occasion.";
        }

        if (request.PurchaseId is { } purchaseId && !await db.Purchases.AnyAsync(p => p.Id == purchaseId))
        {
            return "Purchase not found.";
        }

        gift.ContactId = request.ContactId;
        gift.Title = title;
        gift.SignificantDateId = request.SignificantDateId;
        gift.Occasion = request.SignificantDateId is null ? Clean(request.Occasion) : null;
        gift.Status = request.Status;
        gift.EstimatedAmount = request.EstimatedAmount;
        gift.Currency = currency;
        gift.Link = link;
        gift.PurchaseId = request.PurchaseId;
        gift.GivenOn = request.Status == GiftStatuses.Given ? request.GivenOn : null;
        gift.Notes = Clean(request.Notes);
        return null;
    }

    private async Task<GiftIdeaDto> GetOneAsync(int id)
    {
        var contactId = await db.GiftIdeas.Where(g => g.Id == id).Select(g => g.ContactId).SingleAsync();
        return (await GetAllAsync(contactId)).Single(g => g.Id == id);
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
