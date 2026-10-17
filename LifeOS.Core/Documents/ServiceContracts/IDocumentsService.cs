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
    Task<OperationResult<DocumentDto>> UpdateAsync(int id, DocumentRequest request);

    /// <summary>Soft-deletes the document, its file rows and tags, and its links and reminders. The bytes stay until permanent deletion.</summary>
    Task<OperationResult<bool>> DeleteAsync(int id);

    /// <summary>Stores 1–10 files on the document; all or none (a refused file stops the whole upload).</summary>
    Task<OperationResult<DocumentDto>> AddFilesAsync(int id, IReadOnlyList<FileUpload> files, CancellationToken cancellationToken = default);

    /// <summary>A new version of one file: stored as a new file, the old row soft-deleted.</summary>
    Task<OperationResult<DocumentDto>> ReplaceFileAsync(int id, int fileId, FileUpload file, CancellationToken cancellationToken = default);

    Task<OperationResult<DocumentDto>> RemoveFileAsync(int id, int fileId);

    /// <summary>The file's bytes for its owner; not found for anyone else.</summary>
    Task<OperationResult<DocumentFileContent>> OpenFileAsync(int id, int fileId);
}
