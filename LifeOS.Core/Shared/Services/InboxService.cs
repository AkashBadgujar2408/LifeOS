using AutoMapper;
using AutoMapper.QueryableExtensions;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Shared.Services;

public class InboxService(AppDbContext db, IMapper mapper, IEntityLinksService entityLinksService) : IInboxService
{
    public async Task<List<InboxItemDto>> GetAllAsync(string? kind, bool includeProcessed)
    {
        var query = db.InboxItems.AsQueryable();
        if (!string.IsNullOrWhiteSpace(kind))
        {
            query = query.Where(i => i.Kind == kind);
        }

        if (!includeProcessed)
        {
            query = query.Where(i => i.ProcessedAt == null);
        }

        return await query
            .OrderBy(i => i.ProcessedAt != null)
            .ThenByDescending(i => i.CreatedAt)
            .ProjectTo<InboxItemDto>(mapper.ConfigurationProvider)
            .ToListAsync();
    }

    public async Task<OperationResult<InboxItemDto>> CreateAsync(CreateInboxItemRequest request)
    {
        var title = request.Title.Trim();
        if (title.Length == 0)
        {
            return OperationResult<InboxItemDto>.Fail("Title is required.");
        }

        var item = new InboxItem
        {
            UserId = db.CurrentUserId!.Value,
            Kind = request.Kind,
            Title = title,
            Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim(),
        };
        db.InboxItems.Add(item);
        await db.SaveChangesAsync();

        return OperationResult<InboxItemDto>.Ok(mapper.Map<InboxItemDto>(item));
    }

    public async Task<OperationResult<InboxItemDto>> SetProcessedAsync(int id, bool processed)
    {
        var item = await db.InboxItems.FindAsync(id);
        if (item is null)
        {
            return OperationResult<InboxItemDto>.Fail("Inbox item not found.");
        }

        item.ProcessedAt = processed ? item.ProcessedAt ?? DateTime.UtcNow : null;
        item.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        return OperationResult<InboxItemDto>.Ok(mapper.Map<InboxItemDto>(item));
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var item = await db.InboxItems.FindAsync(id);
        if (item is null)
        {
            return OperationResult<bool>.Fail("Inbox item not found.");
        }

        item.IsDeleted = true;
        item.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        await entityLinksService.RemoveAllForEntityAsync(InboxLinkableProvider.Type, id);

        return OperationResult<bool>.Ok(true);
    }
}
