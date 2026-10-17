namespace LifeOS.Core.Shared.DTOs;

/// <summary>A file the store has written: what to keep in SQL (documents.DocumentFiles, later attachments).</summary>
/// <param name="StoredName">The name on disk: 32 random hex characters + the extension. Never user input.</param>
/// <param name="OriginalName">The uploaded name, cleaned (no folders, no control characters), to offer it back with.</param>
/// <param name="ContentType">Decided from the extension and checked against the bytes — never the client's claim.</param>
/// <param name="Sha256">Of the bytes as written, upper-case hex.</param>
public sealed record StoredFile(string StoredName, string OriginalName, string ContentType, long SizeBytes, string Sha256);

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
}
