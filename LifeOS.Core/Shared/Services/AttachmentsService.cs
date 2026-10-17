using LifeOS.Core.Goals.Services;
using LifeOS.Core.Journal.Services;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using LifeOS.Core.Tasks.Services;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Shared.Services;

public class AttachmentsService(AppDbContext db, IFileStore fileStore, IEnumerable<ILinkableEntityProvider> providers)
    : IAttachmentsService
{
    private const int MaxFilesPerUpload = 10;

    /// <summary>
    /// The item types that take attachments. Each one's delete calls RemoveAllForEntityAsync — a new type is added
    /// here together with that call.
    /// </summary>
    public static readonly IReadOnlySet<string> AttachableTypes = new HashSet<string>(
        [GoalLinkableProvider.Type, TaskLinkableProvider.Type, JournalEntryLinkableProvider.Type], StringComparer.Ordinal);

    public async Task<OperationResult<List<AttachmentDto>>> ListAsync(string entityType, int entityId)
    {
        var error = await CheckTargetAsync(entityType, entityId);
        return error is not null
            ? OperationResult<List<AttachmentDto>>.Fail(error)
            : OperationResult<List<AttachmentDto>>.Ok(await ListForAsync(entityType, entityId));
    }

    public async Task<OperationResult<List<AttachmentDto>>> AddAsync(string entityType, int entityId,
        IReadOnlyList<FileUpload> files, CancellationToken cancellationToken = default)
    {
        var error = await CheckTargetAsync(entityType, entityId);
        if (error is not null)
        {
            return OperationResult<List<AttachmentDto>>.Fail(error);
        }

        if (files.Count == 0)
        {
            return OperationResult<List<AttachmentDto>>.Fail("Choose at least one file.");
        }

        if (files.Count > MaxFilesPerUpload)
        {
            return OperationResult<List<AttachmentDto>>.Fail($"Upload at most {MaxFilesPerUpload} files at a time.");
        }

        var userId = db.CurrentUserId!.Value;
        var stored = new List<StoredFile>();
        foreach (var file in files)
        {
            var result = await fileStore.SaveAsync(userId, file.Content, file.FileName, cancellationToken);
            if (!result.Success)
            {
                // All or none: the ones already written have no row and never will.
                stored.ForEach(s => fileStore.Delete(userId, s.StoredName));
                return OperationResult<List<AttachmentDto>>.Fail(result.Error!);
            }

            stored.Add(result.Data!);
        }

        db.Attachments.AddRange(stored.Select(s => new Attachment
        {
            UserId = userId,
            EntityType = entityType,
            EntityId = entityId,
            StoredName = s.StoredName,
            OriginalName = s.OriginalName,
            ContentType = s.ContentType,
            SizeBytes = s.SizeBytes,
            Sha256 = s.Sha256,
        }));

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch
        {
            // No row was saved, so nothing would ever point at these bytes.
            stored.ForEach(s => fileStore.Delete(userId, s.StoredName));
            throw;
        }

        return OperationResult<List<AttachmentDto>>.Ok(await ListForAsync(entityType, entityId));
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var attachment = await db.Attachments.FirstOrDefaultAsync(a => a.Id == id);
        if (attachment is null)
        {
            return OperationResult<bool>.Fail(AttachmentErrors.NotFound);
        }

        attachment.IsDeleted = true;
        attachment.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return OperationResult<bool>.Ok(true);
    }

    public async Task<OperationResult<FileContent>> OpenAsync(int id)
    {
        // The user filter is what keeps this owner-only.
        var row = await db.Attachments.AsNoTracking().FirstOrDefaultAsync(a => a.Id == id);
        var content = row is null ? null : fileStore.OpenRead(row.UserId, row.StoredName);
        return row is null || content is null
            ? OperationResult<FileContent>.Fail(AttachmentErrors.NotFound)
            : OperationResult<FileContent>.Ok(new FileContent(content, row.ContentType, row.OriginalName, row.SizeBytes, row.Sha256));
    }

    public async Task RemoveAllForEntityAsync(string entityType, int entityId)
    {
        var now = DateTime.UtcNow;
        await db.Attachments
            .Where(a => a.EntityType == entityType && a.EntityId == entityId)
            .ExecuteUpdateAsync(s => s.SetProperty(a => a.IsDeleted, true).SetProperty(a => a.DeletedAt, now));
    }

    /// <summary>The type takes attachments and the item exists for this user (another user's is "not found").</summary>
    private async Task<string?> CheckTargetAsync(string entityType, int entityId)
    {
        if (!AttachableTypes.Contains(entityType))
        {
            return $"Files can't be attached to '{entityType}' items.";
        }

        var provider = providers.Single(p => p.EntityType == entityType);
        return (await provider.GetTitlesAsync([entityId])).Count == 0 ? AttachmentErrors.TargetNotFound : null;
    }

    private Task<List<AttachmentDto>> ListForAsync(string entityType, int entityId) =>
        db.Attachments.AsNoTracking()
            .Where(a => a.EntityType == entityType && a.EntityId == entityId)
            .OrderBy(a => a.CreatedAt).ThenBy(a => a.Id)
            .Select(a => new AttachmentDto
            {
                Id = a.Id,
                EntityType = a.EntityType,
                EntityId = a.EntityId,
                OriginalName = a.OriginalName,
                ContentType = a.ContentType,
                SizeBytes = a.SizeBytes,
                Sha256 = a.Sha256,
                CreatedAt = a.CreatedAt,
            })
            .ToListAsync();
}
