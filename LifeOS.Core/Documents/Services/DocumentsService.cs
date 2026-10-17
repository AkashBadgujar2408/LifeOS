using LifeOS.Core.Calendar.DTOs;
using LifeOS.Core.Calendar.ServiceContracts;
using LifeOS.Core.Documents.DTOs;
using LifeOS.Core.Documents.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using LifeOS.Core.Story.Services;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Documents.Services;

public class DocumentsService(AppDbContext db, IFileStore fileStore, IEntityLinksService entityLinksService,
    IRemindersService remindersService, IVaultService vaultService) : IDocumentsService
{
    private const string NotFound = DocumentErrors.NotFound;
    private const int MaxFilesPerUpload = 10;

    public async Task<OperationResult<List<DocumentSummaryDto>>> ListAsync(string? kind, string? search, int? tagId)
    {
        if (kind is not null && !DocumentKinds.All.Contains(kind))
        {
            return OperationResult<List<DocumentSummaryDto>>.Fail(KindError);
        }

        var query = db.Documents.AsQueryable();
        if (kind is not null)
        {
            query = query.Where(d => d.Kind == kind);
        }

        if (tagId is not null)
        {
            query = query.Where(d => d.DocumentTags.Any(dt => dt.TagId == tagId));
        }

        var text = search?.Trim();
        if (!string.IsNullOrEmpty(text))
        {
            query = query.Where(d => d.Title.Contains(text)
                                     || (d.Issuer != null && d.Issuer.Contains(text))
                                     || (d.Notes != null && d.Notes.Contains(text)));
        }

        // Navigations in a projection get the same user + soft-delete filters, so deleted files and tags don't count.
        var documents = await query
            .OrderBy(d => d.Title)
            .Select(d => new DocumentSummaryDto
            {
                Id = d.Id,
                Title = d.Title,
                Kind = d.Kind,
                Issuer = d.Issuer,
                NumberLast4 = d.NumberLast4,
                IssuedOn = d.IssuedOn,
                ExpiresOn = d.ExpiresOn,
                IsVault = d.IsVault,
                FileCount = d.DocumentFiles.Count(),
                Tags = d.DocumentTags.OrderBy(dt => dt.Tag.Name).Select(dt => new TagDto { Id = dt.TagId, Name = dt.Tag.Name }).ToList(),
                CreatedAt = d.CreatedAt,
            })
            .AsSplitQuery()
            .ToListAsync();

        return OperationResult<List<DocumentSummaryDto>>.Ok(documents);
    }

    public async Task<OperationResult<DocumentDto>> GetAsync(int id)
    {
        var document = await db.Documents
            .AsNoTracking()
            .Include(d => d.DocumentTags).ThenInclude(dt => dt.Tag)
            .Include(d => d.DocumentFiles)
            .AsSplitQuery()
            .FirstOrDefaultAsync(d => d.Id == id);

        return document is null ? OperationResult<DocumentDto>.Fail(NotFound) : OperationResult<DocumentDto>.Ok(ToDto(document));
    }

    public async Task<OperationResult<DocumentDto>> CreateAsync(DocumentRequest request)
    {
        var error = await ValidateAsync(request);
        if (error is not null)
        {
            return OperationResult<DocumentDto>.Fail(error);
        }

        var userId = db.CurrentUserId!.Value;
        var document = new Document { UserId = userId };
        Apply(document, request);
        foreach (var tagId in request.TagIds.Distinct())
        {
            document.DocumentTags.Add(new DocumentTag { UserId = userId, TagId = tagId });
        }

        await using var transaction = await db.Database.BeginTransactionAsync();
        db.Documents.Add(document);
        await db.SaveChangesAsync();
        var reminderError = await SyncExpiryReminderAsync(document, request.TimeZone);
        if (reminderError is not null)
        {
            return OperationResult<DocumentDto>.Fail(reminderError);
        }

        await transaction.CommitAsync();
        return await GetAsync(document.Id);
    }

    public async Task<OperationResult<DocumentDto>> UpdateAsync(int id, DocumentRequest request)
    {
        var document = await db.Documents.FirstOrDefaultAsync(d => d.Id == id);
        if (document is null)
        {
            return OperationResult<DocumentDto>.Fail(NotFound);
        }

        var error = await ValidateAsync(request);
        if (error is not null)
        {
            return OperationResult<DocumentDto>.Fail(error);
        }

        // Out of the vault means its files get decrypted on disk: that needs the vault unlocked, like opening them.
        var leavingVault = document.IsVault && !request.IsVault;
        if (leavingVault && !vaultService.IsUnlocked)
        {
            return OperationResult<DocumentDto>.Fail(DocumentErrors.VaultLocked);
        }

        // Every save of a vault document also encrypts any file still stored plain (one marked sensitive before
        // Session 41), so nothing sensitive is left readable on disk.
        var rewritten = document.IsVault || request.IsVault ? await RewriteFilesAsync(document, request.IsVault) : [];
        var now = DateTime.UtcNow;
        Apply(document, request);
        document.UpdatedAt = now;

        var wanted = request.TagIds.ToHashSet();
        var current = await db.DocumentTags.Where(dt => dt.DocumentId == id).ToListAsync();
        foreach (var tag in current.Where(dt => !wanted.Contains(dt.TagId)))
        {
            tag.IsDeleted = true;
            tag.DeletedAt = now;
        }

        foreach (var tagId in wanted.Except(current.Select(dt => dt.TagId)))
        {
            db.DocumentTags.Add(new DocumentTag { UserId = document.UserId, DocumentId = id, TagId = tagId });
        }

        try
        {
            await using var transaction = await db.Database.BeginTransactionAsync();
            await db.SaveChangesAsync();
            var reminderError = await SyncExpiryReminderAsync(document, request.TimeZone);
            if (reminderError is not null)
            {
                DeleteStored(document.UserId, rewritten.Select(r => r.NewName));
                return OperationResult<DocumentDto>.Fail(reminderError);
            }

            await transaction.CommitAsync();
        }
        catch
        {
            // The rows still name the old bytes, which are untouched; the rewritten copies would never be read.
            DeleteStored(document.UserId, rewritten.Select(r => r.NewName));
            throw;
        }

        // Only now that the rows point at the new copies: the old bytes (plaintext, when entering the vault) go.
        DeleteStored(document.UserId, rewritten.Select(r => r.OldName));
        if (leavingVault)
        {
            await vaultService.LogAsync(VaultActions.Unprotected, DocumentLinkableProvider.Type, id, null);
        }

        return await GetAsync(id);
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var document = await db.Documents.FirstOrDefaultAsync(d => d.Id == id);
        if (document is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        var now = DateTime.UtcNow;
        await using var transaction = await db.Database.BeginTransactionAsync();
        document.IsDeleted = true;
        document.DeletedAt = now;
        // File rows go with it; their bytes stay on disk until permanent deletion (Session 60), so it can be restored.
        foreach (var file in await db.DocumentFiles.Where(f => f.DocumentId == id).ToListAsync())
        {
            file.IsDeleted = true;
            file.DeletedAt = now;
        }

        foreach (var tag in await db.DocumentTags.Where(dt => dt.DocumentId == id).ToListAsync())
        {
            tag.IsDeleted = true;
            tag.DeletedAt = now;
        }

        await db.SaveChangesAsync();
        await entityLinksService.RemoveAllForEntityAsync(DocumentLinkableProvider.Type, id);
        // Includes the expiry reminder.
        await remindersService.RemoveAllForEntityAsync(DocumentLinkableProvider.Type, id);
        await transaction.CommitAsync();
        return OperationResult<bool>.Ok(true);
    }

    public async Task<OperationResult<DocumentDto>> AddFilesAsync(int id, IReadOnlyList<FileUpload> files,
        CancellationToken cancellationToken = default)
    {
        var document = await db.Documents.FirstOrDefaultAsync(d => d.Id == id, cancellationToken);
        if (document is null)
        {
            return OperationResult<DocumentDto>.Fail(NotFound);
        }

        if (files.Count == 0)
        {
            return OperationResult<DocumentDto>.Fail("Choose at least one file.");
        }

        if (files.Count > MaxFilesPerUpload)
        {
            return OperationResult<DocumentDto>.Fail($"Upload at most {MaxFilesPerUpload} files at a time.");
        }

        var stored = new List<StoredFile>();
        foreach (var file in files)
        {
            var result = await fileStore.SaveAsync(document.UserId, file.Content, file.FileName, cancellationToken,
                encrypt: document.IsVault);
            if (!result.Success)
            {
                // All or none: the ones already written have no row and never will.
                DeleteStored(document.UserId, stored);
                return OperationResult<DocumentDto>.Fail(result.Error!);
            }

            stored.Add(result.Data!);
        }

        db.DocumentFiles.AddRange(stored.Select(s => ToRow(document, s)));
        document.UpdatedAt = DateTime.UtcNow;
        await SaveOrCleanUpAsync(document.UserId, stored);
        return await GetAsync(id);
    }

    public async Task<OperationResult<DocumentDto>> ReplaceFileAsync(int id, int fileId, FileUpload file,
        CancellationToken cancellationToken = default)
    {
        var row = await db.DocumentFiles.Include(f => f.Document).FirstOrDefaultAsync(f => f.Id == fileId && f.DocumentId == id, cancellationToken);
        if (row is null)
        {
            return await db.Documents.AnyAsync(d => d.Id == id, cancellationToken)
                ? OperationResult<DocumentDto>.Fail(DocumentErrors.FileNotFound)
                : OperationResult<DocumentDto>.Fail(NotFound);
        }

        var result = await fileStore.SaveAsync(row.UserId, file.Content, file.FileName, cancellationToken,
            encrypt: row.Document.IsVault);
        if (!result.Success)
        {
            return OperationResult<DocumentDto>.Fail(result.Error!);
        }

        var now = DateTime.UtcNow;
        row.IsDeleted = true;
        row.DeletedAt = now;
        row.Document.UpdatedAt = now;
        db.DocumentFiles.Add(ToRow(row.Document, result.Data!));
        await SaveOrCleanUpAsync(row.UserId, [result.Data!]);
        return await GetAsync(id);
    }

    public async Task<OperationResult<DocumentDto>> RemoveFileAsync(int id, int fileId)
    {
        var row = await db.DocumentFiles.Include(f => f.Document).FirstOrDefaultAsync(f => f.Id == fileId && f.DocumentId == id);
        if (row is null)
        {
            return await db.Documents.AnyAsync(d => d.Id == id)
                ? OperationResult<DocumentDto>.Fail(DocumentErrors.FileNotFound)
                : OperationResult<DocumentDto>.Fail(NotFound);
        }

        var now = DateTime.UtcNow;
        row.IsDeleted = true;
        row.DeletedAt = now;
        row.Document.UpdatedAt = now;
        await db.SaveChangesAsync();
        return await GetAsync(id);
    }

    public async Task<OperationResult<FileContent>> OpenFileAsync(int id, int fileId)
    {
        // The user filter on DocumentFiles (and on the document it must belong to) is what keeps this owner-only.
        var row = await db.DocumentFiles.AsNoTracking().Include(f => f.Document)
            .FirstOrDefaultAsync(f => f.Id == fileId && f.DocumentId == id && !f.Document.IsDeleted);
        if (row is null)
        {
            return OperationResult<FileContent>.Fail(DocumentErrors.FileNotFound);
        }

        var sensitive = row.Document.IsVault || row.IsEncrypted;
        if (sensitive && !vaultService.IsUnlocked)
        {
            return OperationResult<FileContent>.Fail(DocumentErrors.VaultLocked);
        }

        var content = fileStore.OpenRead(row.UserId, row.StoredName, row.IsEncrypted);
        if (content is null)
        {
            return OperationResult<FileContent>.Fail(DocumentErrors.FileNotFound);
        }

        if (sensitive)
        {
            await vaultService.LogAsync(VaultActions.Opened, DocumentLinkableProvider.Type, id, row.OriginalName);
        }

        return OperationResult<FileContent>.Ok(new FileContent(content, row.ContentType, row.OriginalName, row.SizeBytes, row.Sha256));
    }

    private static string KindError => $"Kind must be one of {string.Join(", ", DocumentKinds.All)}.";

    private async Task<string?> ValidateAsync(DocumentRequest request)
    {
        if (request.Title.Trim().Length == 0)
        {
            return "Give the document a title.";
        }

        if (!DocumentKinds.All.Contains(request.Kind))
        {
            return KindError;
        }

        if (request.IssuedOn is { } issued && request.ExpiresOn is { } expires && expires < issued)
        {
            return "It can't expire before it was issued.";
        }

        if (request.ExpiryReminderDays is not null && request.ExpiresOn is null)
        {
            return "An expiry reminder needs an expiry date.";
        }

        if (request.ExpiryReminderDays is < 0 or > 365)
        {
            return "Remind between 0 and 365 days before it expires.";
        }

        // Tags go through the per-user filter, so another user's tag id counts as missing.
        var tagIds = request.TagIds.Distinct().ToList();
        if (tagIds.Count > 0 && await db.Tags.CountAsync(t => tagIds.Contains(t.Id)) != tagIds.Count)
        {
            return "Tag not found.";
        }

        return null;
    }

    private static void Apply(Document document, DocumentRequest request)
    {
        document.Title = request.Title.Trim();
        document.Kind = request.Kind;
        document.Issuer = string.IsNullOrWhiteSpace(request.Issuer) ? null : request.Issuer.Trim();
        document.NumberLast4 = DocumentRules.Last4(request.Number);
        document.IssuedOn = request.IssuedOn;
        document.ExpiresOn = request.ExpiresOn;
        document.Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
        document.IsVault = request.IsVault;
        document.ExpiryReminderDays = request.ExpiryReminderDays;
    }

    /// <summary>
    /// Keeps the one expiry reminder in step with ExpiresOn / ExpiryReminderDays: written when first wanted, moved
    /// (and made pending again) when the date or title changes, removed when no longer wanted. A reminder the user
    /// deleted is written again on the next save. Returns an error or null.
    /// </summary>
    private async Task<string?> SyncExpiryReminderAsync(Document document, string? requestZone)
    {
        var existing = document.ExpiryReminderId is { } reminderId ? (await remindersService.GetAsync(reminderId)).Data : null;

        if (document.ExpiresOn is not { } expiresOn || document.ExpiryReminderDays is not { } days)
        {
            if (existing is not null)
            {
                await remindersService.DeleteAsync(existing.Id);
            }

            if (document.ExpiryReminderId is not null)
            {
                document.ExpiryReminderId = null;
                await db.SaveChangesAsync();
            }

            return null;
        }

        var zone = await ReminderZoneAsync(requestZone);
        var request = new ReminderRequest
        {
            Title = DocumentRules.ExpiryReminderTitle(document.Title, expiresOn),
            Notes = "Time to renew it, or to check what needs doing.",
            RemindAt = DocumentRules.ExpiryReminderAt(expiresOn, days, zone),
            EntityType = DocumentLinkableProvider.Type,
            EntityId = document.Id,
        };

        if (existing is null)
        {
            var created = await remindersService.CreateAsync(request);
            if (!created.Success)
            {
                return created.Error;
            }

            document.ExpiryReminderId = created.Data!.Id;
            await db.SaveChangesAsync();
            return null;
        }

        var moved = existing.RemindAt != request.RemindAt;
        if (moved || existing.Title != request.Title)
        {
            var updated = await remindersService.UpdateAsync(existing.Id, request);
            if (!updated.Success)
            {
                return updated.Error;
            }

            // A new date is a new reminder as far as the user is concerned, even if they'd dealt with the old one.
            if (moved && existing.DismissedAt is not null)
            {
                await remindersService.SetDismissedAsync(existing.Id, false);
            }
        }

        return null;
    }

    /// <summary>The zone chosen in Settings, else the browser's (sent with the request), else UTC.</summary>
    private async Task<TimeZoneInfo> ReminderZoneAsync(string? requestZone)
    {
        var preferred = await db.Users.Where(u => u.Id == db.CurrentUserId).Select(u => u.TimeZone).FirstOrDefaultAsync();
        foreach (var candidate in new[] { preferred, requestZone })
        {
            if (!string.IsNullOrWhiteSpace(candidate) && LifeStoryService.TryFindZone(candidate, out var zone))
            {
                return zone;
            }
        }

        return TimeZoneInfo.Utc;
    }

    /// <summary>
    /// A document entering or leaving the vault: every one of its files — removed ones too, they're kept for restore —
    /// is written again encrypted or not under a new name, and the tracked rows are pointed at the new copies. The
    /// caller saves, then deletes the old names (or the new ones, if the save fails).
    /// </summary>
    private async Task<List<(string OldName, string NewName)>> RewriteFilesAsync(Document document, bool encrypt)
    {
        var rows = await db.DocumentFiles.IgnoreQueryFilters()
            .Where(f => f.DocumentId == document.Id && f.UserId == document.UserId && f.IsEncrypted != encrypt)
            .ToListAsync();

        var rewritten = new List<(string OldName, string NewName)>();
        try
        {
            foreach (var row in rows)
            {
                // Null: the bytes are missing (never expected) — nothing to rewrite, the row is left as it was.
                if (await fileStore.RewriteAsync(row.UserId, row.StoredName, row.IsEncrypted, encrypt) is not { } newName)
                {
                    continue;
                }

                rewritten.Add((row.StoredName, newName));
                row.StoredName = newName;
                row.IsEncrypted = encrypt;
            }
        }
        catch
        {
            DeleteStored(document.UserId, rewritten.Select(r => r.NewName));
            throw;
        }

        return rewritten;
    }

    private async Task SaveOrCleanUpAsync(int userId, List<StoredFile> stored)
    {
        try
        {
            await db.SaveChangesAsync();
        }
        catch
        {
            // No row was saved, so nothing would ever point at these bytes.
            DeleteStored(userId, stored);
            throw;
        }
    }

    private void DeleteStored(int userId, IEnumerable<StoredFile> stored) =>
        DeleteStored(userId, stored.Select(s => s.StoredName));

    private void DeleteStored(int userId, IEnumerable<string> storedNames)
    {
        foreach (var name in storedNames)
        {
            fileStore.Delete(userId, name);
        }
    }

    private static DocumentFile ToRow(Document document, StoredFile stored) => new()
    {
        UserId = document.UserId,
        DocumentId = document.Id,
        StoredName = stored.StoredName,
        OriginalName = stored.OriginalName,
        ContentType = stored.ContentType,
        SizeBytes = stored.SizeBytes,
        Sha256 = stored.Sha256,
        IsEncrypted = stored.IsEncrypted,
    };

    private static DocumentDto ToDto(Document d) => new()
    {
        Id = d.Id,
        Title = d.Title,
        Kind = d.Kind,
        Issuer = d.Issuer,
        NumberLast4 = d.NumberLast4,
        IssuedOn = d.IssuedOn,
        ExpiresOn = d.ExpiresOn,
        IsVault = d.IsVault,
        FileCount = d.DocumentFiles.Count,
        Tags = d.DocumentTags.OrderBy(dt => dt.Tag.Name).Select(dt => new TagDto { Id = dt.TagId, Name = dt.Tag.Name }).ToList(),
        CreatedAt = d.CreatedAt,
        Notes = d.Notes,
        ExpiryReminderDays = d.ExpiryReminderDays,
        ExpiryReminderId = d.ExpiryReminderId,
        Files = d.DocumentFiles.OrderBy(f => f.CreatedAt).ThenBy(f => f.Id).Select(f => new DocumentFileDto
        {
            Id = f.Id,
            OriginalName = f.OriginalName,
            ContentType = f.ContentType,
            SizeBytes = f.SizeBytes,
            Sha256 = f.Sha256,
            IsEncrypted = f.IsEncrypted,
            CreatedAt = f.CreatedAt,
        }).ToList(),
    };
}
