using LifeOS.Core.Shared.DTOs;

namespace LifeOS.Core.Shared.ServiceContracts;

/// <summary>
/// The one place files are kept (document files, attachments). Bytes go to a per-user folder outside
/// the web root; callers keep the returned <see cref="StoredFile"/> in SQL and serve files only through the API, to
/// their owner. A stored name is all a caller ever passes back — anything that isn't a well-formed stored name is
/// refused, so a path can never be smuggled in.
/// </summary>
public interface IFileStore
{
    /// <summary>
    /// Streams the upload to disk, checking type (by extension, then the file's own first bytes), size limit and
    /// emptiness on the way; nothing is left behind when it fails. With <paramref name="encrypt"/> only ciphertext is
    /// written (vault files); the returned hash and size are still those of the original bytes.
    /// </summary>
    Task<OperationResult<StoredFile>> SaveAsync(int userId, Stream content, string? originalName,
        CancellationToken cancellationToken = default, bool encrypt = false);

    /// <summary>
    /// The file's bytes (decrypted when <paramref name="encrypted"/>, which must say how it was stored), or null when
    /// the name is malformed or the user has no such file.
    /// </summary>
    Stream? OpenRead(int userId, string storedName, bool encrypted = false);

    /// <summary>
    /// Writes the file again under a new stored name, encrypted or not (a document moving into or out of the vault),
    /// and returns that name — null if there's no such file. The old bytes stay: the caller points its row at the new
    /// name, saves, and only then deletes the old file, so a row's name and IsEncrypted always agree with the disk.
    /// </summary>
    Task<string?> RewriteAsync(int userId, string storedName, bool encrypted, bool encrypt,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Removes the bytes for good. Only for permanent deletion (Session 60) and for cleaning up a file whose SQL row
    /// was never saved — a soft-deleted row keeps its file so it can be restored.
    /// </summary>
    bool Delete(int userId, string storedName);

    /// <summary>Removes the user's whole folder (permanent account deletion only). Returns how many files it held.</summary>
    int DeleteAll(int userId);
}
