using LifeOS.Core.Shared.DTOs;

namespace LifeOS.Core.Shared.ServiceContracts;

/// <summary>
/// The one place files are kept (documents now, attachments from Session 41). Bytes go to a per-user folder outside
/// the web root; callers keep the returned <see cref="StoredFile"/> in SQL and serve files only through the API, to
/// their owner. A stored name is all a caller ever passes back — anything that isn't a well-formed stored name is
/// refused, so a path can never be smuggled in.
/// </summary>
public interface IFileStore
{
    /// <summary>
    /// Streams the upload to disk, checking type (by extension, then the file's own first bytes), size limit and
    /// emptiness on the way; nothing is left behind when it fails.
    /// </summary>
    Task<OperationResult<StoredFile>> SaveAsync(int userId, Stream content, string? originalName,
        CancellationToken cancellationToken = default);

    /// <summary>The file's bytes, or null when the name is malformed or the user has no such file.</summary>
    Stream? OpenRead(int userId, string storedName);

    /// <summary>
    /// Removes the bytes for good. Only for permanent deletion (Session 60) and for cleaning up a file whose SQL row
    /// was never saved — a soft-deleted row keeps its file so it can be restored.
    /// </summary>
    bool Delete(int userId, string storedName);
}
