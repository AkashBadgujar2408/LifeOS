using LifeOS.Core.Documents.DTOs;
using LifeOS.Core.Shared.DTOs;

namespace LifeOS.Core.Documents.ServiceContracts;

/// <summary>Documents and their files. Bytes go through IFileStore; this keeps the records and who may see them.</summary>
public interface IDocumentsService
{
    /// <summary>Optionally by kind, a tag, and text in the title, issuer or notes; by title.</summary>
    Task<OperationResult<List<DocumentSummaryDto>>> ListAsync(string? kind, string? search, int? tagId);

    Task<OperationResult<DocumentDto>> GetAsync(int id);
    Task<OperationResult<DocumentDto>> CreateAsync(DocumentRequest request);
    /// <summary>Moving it into or out of the vault rewrites its files encrypted or not; out needs the vault unlocked.</summary>
    Task<OperationResult<DocumentDto>> UpdateAsync(int id, DocumentRequest request);

    /// <summary>Soft-deletes the document, its file rows and tags, and its links and reminders. The bytes stay until permanent deletion.</summary>
    Task<OperationResult<bool>> DeleteAsync(int id);

    /// <summary>Stores 1–10 files on the document; all or none (a refused file stops the whole upload).</summary>
    Task<OperationResult<DocumentDto>> AddFilesAsync(int id, IReadOnlyList<FileUpload> files, CancellationToken cancellationToken = default);

    /// <summary>A new version of one file: stored as a new file, the old row soft-deleted.</summary>
    Task<OperationResult<DocumentDto>> ReplaceFileAsync(int id, int fileId, FileUpload file, CancellationToken cancellationToken = default);

    Task<OperationResult<DocumentDto>> RemoveFileAsync(int id, int fileId);

    /// <summary>
    /// The file's bytes for its owner; not found for anyone else. A vault document's files need the vault unlocked
    /// (<see cref="DocumentErrors.VaultLocked"/> otherwise), and each open is logged.
    /// </summary>
    Task<OperationResult<FileContent>> OpenFileAsync(int id, int fileId);
}
