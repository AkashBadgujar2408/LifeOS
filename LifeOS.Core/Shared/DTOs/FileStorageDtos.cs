namespace LifeOS.Core.Shared.DTOs;

/// <summary>A file the store has written: what to keep in SQL (documents.DocumentFiles, later attachments).</summary>
/// <param name="StoredName">The name on disk: 32 random hex characters + the extension. Never user input.</param>
/// <param name="OriginalName">The uploaded name, cleaned (no folders, no control characters), to offer it back with.</param>
/// <param name="ContentType">Decided from the extension and checked against the bytes — never the client's claim.</param>
/// <param name="Sha256">Of the original bytes, upper-case hex (also for an encrypted file).</param>
/// <param name="IsEncrypted">Written as Data Protection ciphertext (vault files); reading it back needs the same flag.</param>
public sealed record StoredFile(string StoredName, string OriginalName, string ContentType, long SizeBytes, string Sha256,
    bool IsEncrypted = false);

/// <summary>One file in an upload, however it arrived (multipart from the API, a stream in tests).</summary>
public sealed record FileUpload(string? FileName, Stream Content);

/// <summary>A stored file's bytes, ready to send. The caller disposes Content.</summary>
public sealed record FileContent(Stream Content, string ContentType, string FileName, long SizeBytes, string Sha256);

/// <summary>"FileStorage" in appsettings.</summary>
public class FileStorageOptions
{
    public const string Section = "FileStorage";

    /// <summary>
    /// Where files live. Empty = %LOCALAPPDATA%/LifeOS/files (outside the repo and any web root). Each environment
    /// (UAT, Live) should point at its own folder, as each has its own database.
    /// </summary>
    public string? RootPath { get; init; }

    /// <summary>Largest single file accepted.</summary>
    public long MaxFileBytes { get; init; } = 20 * 1024 * 1024;

    /// <summary>
    /// The Data Protection key ring that encrypts vault files. Empty = %LOCALAPPDATA%/LifeOS/keys. Losing it makes
    /// every vault file unreadable, so back it up together with the files folder (README).
    /// </summary>
    public string? KeysPath { get; init; }
}
