using System.Globalization;
using System.Security.Cryptography;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using Microsoft.AspNetCore.DataProtection;

namespace LifeOS.Core.Shared.Services;

/// <summary>
/// <see cref="IFileStore"/> on the local disk: &lt;root&gt;/&lt;userId&gt;/&lt;stored name&gt;. An upload is streamed to a
/// ".part" file while its size and SHA-256 are counted, checked, then renamed into place — so a half-written or
/// refused upload never looks like a real file. Registered as a singleton; it holds no per-request state.
/// Encrypted files (the vault, Session 41) are protected with ASP.NET Core Data Protection under a per-user purpose,
/// so the bytes on disk are unreadable without the app's key ring — and a file copied into another user's folder
/// doesn't open there either. They are held in memory while being checked, so plaintext never touches the disk.
/// </summary>
public class DiskFileStore : IFileStore
{
    private const int BufferSize = 81920;

    private const string ProtectionPurpose = "LifeOS.Files.v1";

    private readonly string root;
    private readonly long maxFileBytes;
    private readonly IDataProtectionProvider dataProtection;

    public DiskFileStore(string root, long maxFileBytes, IDataProtectionProvider dataProtection)
    {
        this.root = Path.GetFullPath(root);
        this.maxFileBytes = maxFileBytes;
        this.dataProtection = dataProtection;
        Directory.CreateDirectory(this.root);
    }

    public string Root => root;

    /// <summary>
    /// The folder files go in: the configured one, or %LOCALAPPDATA%/LifeOS/files. Refused if it's inside the web
    /// root, where the static file middleware could hand files out to anyone.
    /// </summary>
    public static string ResolveRoot(string? configured, string? webRootPath)
    {
        var resolved = Path.GetFullPath(string.IsNullOrWhiteSpace(configured)
            ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "LifeOS", "files")
            : configured);

        if (!string.IsNullOrWhiteSpace(webRootPath) && IsInside(resolved, Path.GetFullPath(webRootPath)))
        {
            throw new InvalidOperationException(
                $"FileStorage:RootPath ({resolved}) is inside the web root; files must never be served directly.");
        }

        return resolved;
    }

    /// <summary>Where the Data Protection key ring lives: the configured folder, or %LOCALAPPDATA%/LifeOS/keys.</summary>
    public static string ResolveKeysPath(string? configured) =>
        Path.GetFullPath(string.IsNullOrWhiteSpace(configured)
            ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "LifeOS", "keys")
            : configured);

    public async Task<OperationResult<StoredFile>> SaveAsync(int userId, Stream content, string? originalName,
        CancellationToken cancellationToken = default, bool encrypt = false)
    {
        var name = FileRules.CleanOriginalName(originalName);
        if (name is null)
        {
            return OperationResult<StoredFile>.Fail("The file needs a name.");
        }

        var type = FileRules.TypeOf(name, out var extension);
        if (type is null)
        {
            return OperationResult<StoredFile>.Fail($"\"{name}\" can't be stored: {FileRules.TypeList} only.");
        }

        var folder = UserFolder(userId);
        Directory.CreateDirectory(folder);
        var storedName = FileRules.NewStoredName(extension);
        var finalPath = Path.Combine(folder, storedName);
        var partPath = finalPath + ".part";

        var head = new byte[FileRules.HeadLength];
        var headLength = 0;
        long total = 0;
        using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        string? problem = null;

        try
        {
            // An encrypted file is collected in memory (it's at most maxFileBytes) and only its ciphertext is written.
            var plain = encrypt ? new MemoryStream() : null;
            await using (Stream output = (Stream?)plain ?? new FileStream(partPath, FileMode.CreateNew, FileAccess.Write,
                             FileShare.None, BufferSize, useAsync: true))
            {
                var buffer = new byte[BufferSize];
                int read;
                while ((read = await content.ReadAsync(buffer, cancellationToken)) > 0)
                {
                    total += read;
                    if (total > maxFileBytes)
                    {
                        problem = $"\"{name}\" is too big: files can be up to {FormatSize(maxFileBytes)}.";
                        break;
                    }

                    if (headLength < head.Length)
                    {
                        var take = Math.Min(read, head.Length - headLength);
                        Array.Copy(buffer, 0, head, headLength, take);
                        headLength += take;
                    }

                    hash.AppendData(buffer, 0, read);
                    await output.WriteAsync(buffer.AsMemory(0, read), cancellationToken);
                }
            }

            problem ??= total == 0
                ? $"\"{name}\" is empty."
                : !type.LooksRight(head.AsSpan(0, headLength))
                    ? $"\"{name}\" isn't really a {type.Label}: its contents don't match its {extension} extension."
                    : null;

            if (problem is not null)
            {
                TryDelete(partPath);
                return OperationResult<StoredFile>.Fail(problem);
            }

            if (plain is not null)
            {
                await File.WriteAllBytesAsync(partPath, Protector(userId).Protect(plain.ToArray()), cancellationToken);
            }

            File.Move(partPath, finalPath);
        }
        catch
        {
            // Cancelled, disk full, client gone: leave nothing behind.
            TryDelete(partPath);
            throw;
        }

        var sha256 = Convert.ToHexString(hash.GetHashAndReset());
        return OperationResult<StoredFile>.Ok(new StoredFile(storedName, name, type.ContentType, total, sha256, encrypt));
    }

    public Stream? OpenRead(int userId, string storedName, bool encrypted = false)
    {
        var path = PathOf(userId, storedName);
        if (path is null || !File.Exists(path))
        {
            return null;
        }

        return encrypted
            ? new MemoryStream(Protector(userId).Unprotect(File.ReadAllBytes(path)), writable: false)
            : new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, BufferSize, useAsync: true);
    }

    public async Task<string?> RewriteAsync(int userId, string storedName, bool encrypted, bool encrypt,
        CancellationToken cancellationToken = default)
    {
        var path = PathOf(userId, storedName);
        if (path is null || !File.Exists(path))
        {
            return null;
        }

        var protector = Protector(userId);
        var bytes = await File.ReadAllBytesAsync(path, cancellationToken);
        if (encrypted)
        {
            bytes = protector.Unprotect(bytes);
        }

        if (encrypt)
        {
            bytes = protector.Protect(bytes);
        }

        var newPath = Path.Combine(UserFolder(userId), FileRules.NewStoredName(Path.GetExtension(storedName)));
        var partPath = newPath + ".part";
        try
        {
            await File.WriteAllBytesAsync(partPath, bytes, cancellationToken);
            File.Move(partPath, newPath);
        }
        catch
        {
            TryDelete(partPath);
            throw;
        }

        return Path.GetFileName(newPath);
    }

    public bool Delete(int userId, string storedName)
    {
        var path = PathOf(userId, storedName);
        if (path is null || !File.Exists(path))
        {
            return false;
        }

        File.Delete(path);
        return true;
    }

    public int DeleteAll(int userId)
    {
        if (userId <= 0)
        {
            return 0;
        }

        var folder = UserFolder(userId);
        if (!Directory.Exists(folder))
        {
            return 0;
        }

        var count = Directory.GetFiles(folder).Length;
        Directory.Delete(folder, recursive: true);
        return count;
    }

    private IDataProtector Protector(int userId) =>
        dataProtection.CreateProtector(ProtectionPurpose, userId.ToString(CultureInfo.InvariantCulture));

    private string UserFolder(int userId) => Path.Combine(root, userId.ToString(CultureInfo.InvariantCulture));

    /// <summary>The file's full path, or null for anything that isn't a stored name or would land outside the folder.</summary>
    private string? PathOf(int userId, string storedName)
    {
        if (userId <= 0 || !FileRules.IsStoredName(storedName))
        {
            return null;
        }

        var folder = UserFolder(userId);
        var path = Path.GetFullPath(Path.Combine(folder, storedName));
        // Belt and braces: the name pattern already rules out every way out of the folder.
        return IsInside(path, folder) ? path : null;
    }

    private static bool IsInside(string path, string folder)
    {
        var withSeparator = folder.EndsWith(Path.DirectorySeparatorChar) ? folder : folder + Path.DirectorySeparatorChar;
        return path.StartsWith(withSeparator, OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal)
               || string.Equals(path, folder, OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal);
    }

    private static string FormatSize(long bytes) =>
        bytes >= 1024 * 1024 ? $"{bytes / (1024 * 1024)} MB" : $"{bytes / 1024} KB";

    private static void TryDelete(string path)
    {
        try
        {
            File.Delete(path);
        }
        catch (IOException)
        {
            // Nothing more to do; a stray .part file is never read.
        }
    }
}
