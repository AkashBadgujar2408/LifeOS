using LifeOS.Core.Shared.DTOs;

namespace LifeOS.Core.Shared.ServiceContracts;

/// <summary>
/// Files on any item, by the same EntityType/EntityId pair as links and reminders. Bytes go through IFileStore;
/// only the types in <see cref="Services.AttachmentsService.AttachableTypes"/> accept files, because each of those
/// modules' deletes calls <see cref="RemoveAllForEntityAsync"/>.
/// </summary>
public interface IAttachmentsService
{
    Task<OperationResult<List<AttachmentDto>>> ListAsync(string entityType, int entityId);

    /// <summary>1–10 files; all or none. Returns the item's attachments afterwards.</summary>
    Task<OperationResult<List<AttachmentDto>>> AddAsync(string entityType, int entityId, IReadOnlyList<FileUpload> files,
        CancellationToken cancellationToken = default);

    /// <summary>Soft-deletes one attachment; its bytes stay until permanent deletion.</summary>
    Task<OperationResult<bool>> DeleteAsync(int id);

    /// <summary>The file's bytes for its owner; not found for anyone else.</summary>
    Task<OperationResult<FileContent>> OpenAsync(int id);

    /// <summary>Called by a module's delete: the item's attachments go with it (bytes kept for restore).</summary>
    Task RemoveAllForEntityAsync(string entityType, int entityId);
}
