using System.IO.Compression;
using System.Reflection;
using System.Text;
using System.Text.Json;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ModelExtensions;
using LifeOS.Core.Shared.ServiceContracts;
using Microsoft.AspNetCore.Identity;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;

namespace LifeOS.Core.Shared.Services;

/// <summary>
/// Export, import and permanent deletion, driven by the EF model rather than one hand-written exporter per module:
/// every entity with a UserId column is the user's data, so a module added later is covered the moment it's
/// scaffolded. The zip holds manifest.json, data/&lt;schema&gt;.&lt;Table&gt;.json (exact values, read back on import),
/// csv/&lt;schema&gt;/&lt;Table&gt;.csv (for people and spreadsheets) and files/&lt;stored name&gt; (decrypted bytes).
/// Everything is exported, soft-deleted rows included (with IsDeleted), so an import is a faithful copy and no row
/// points at one that's missing. Import gives rows new ids (foreign keys, the task-repeat self-reference and the
/// EntityType/EntityId pairs of links, reminders and attachments are all remapped) and new stored file names.
/// </summary>
public class AccountDataService(AppDbContext db, IFileStore fileStore, IVaultService vaultService) : IAccountDataService
{
    private const string NotEmpty =
        "Import goes into an empty account, and this one already has {0}. Register a new account for the import, or delete this data first.";

    private static readonly JsonSerializerOptions Json = new() { WriteIndented = false };

    private static readonly MethodInfo LoadMethod =
        typeof(AccountDataService).GetMethod(nameof(LoadRowsAsync), BindingFlags.NonPublic | BindingFlags.Instance)!;

    private static readonly MethodInfo AnyMethod =
        typeof(AccountDataService).GetMethod(nameof(AnyRowsAsync), BindingFlags.NonPublic | BindingFlags.Instance)!;

    private static readonly MethodInfo CountMethod =
        typeof(AccountDataService).GetMethod(nameof(CountLiveAsync), BindingFlags.NonPublic | BindingFlags.Instance)!;

    // ---- Export ----

    public async Task<OperationResult<bool>> ExportAsync(Stream output, CancellationToken cancellationToken = default)
    {
        var userId = db.CurrentUserId!.Value;
        var user = await db.Users.AsNoTracking().FirstAsync(u => u.Id == userId, cancellationToken);
        var tables = UserTables().Where(t => !AccountData.NotExported.Contains(t.Entity.ClrType.Name)).ToList();

        // Vault files leave decrypted, so they need the vault open — like opening them one by one would.
        var vaultDocumentIds = await db.DocumentFiles.IgnoreQueryFilters()
            .Where(f => f.UserId == userId && f.IsEncrypted)
            .Select(f => f.DocumentId).Distinct().ToListAsync(cancellationToken);
        if (vaultDocumentIds.Count > 0 && !vaultService.IsUnlocked)
        {
            return OperationResult<bool>.Fail(AccountDataErrors.VaultLocked);
        }

        // So do sensitive records (health): their encrypted notes leave as plain text.
        var hasSensitive = false;
        foreach (var table in tables.Where(t => SensitiveColumns.Schemas.Contains(t.Schema)))
        {
            if (await (Task<bool>)AnyMethod.MakeGenericMethod(table.Entity.ClrType).Invoke(this, [userId])!)
            {
                hasSensitive = true;
                break;
            }
        }

        if (hasSensitive && !vaultService.IsUnlocked)
        {
            return OperationResult<bool>.Fail(AccountDataErrors.SensitiveLocked);
        }

        using var zip = new ZipArchive(output, ZipArchiveMode.Create, leaveOpen: true);
        var manifestTables = new List<object>();
        var files = 0;
        var filesMissing = 0;
        foreach (var table in tables)
        {
            var rows = await LoadAsync(table, userId);
            if (rows.Count == 0)
            {
                continue;
            }

            manifestTables.Add(new { table = table.Key, entity = table.Entity.ClrType.Name, rows = rows.Count });
            await using (var json = zip.CreateEntry($"data/{table.Key}.json", CompressionLevel.Optimal).Open())
            {
                await using var writer = new Utf8JsonWriter(json);
                writer.WriteStartArray();
                foreach (var row in rows)
                {
                    writer.WriteStartObject();
                    foreach (var column in table.Columns)
                    {
                        writer.WritePropertyName(column.Name);
                        JsonSerializer.Serialize(writer, column.PropertyInfo!.GetValue(row), column.ClrType, Json);
                    }

                    writer.WriteEndObject();
                }

                writer.WriteEndArray();
            }

            var csv = AccountData.Csv(
                table.Columns.Select(c => c.Name).ToList(),
                rows.Select(row => (IReadOnlyList<object?>)table.Columns.Select(c => c.PropertyInfo!.GetValue(row)).ToList()));
            await WriteTextAsync(zip, $"csv/{table.Schema}/{table.Name}.csv", csv, cancellationToken);

            if (table.HasFiles)
            {
                foreach (var row in rows)
                {
                    var storedName = (string)table.StoredName!.PropertyInfo!.GetValue(row)!;
                    var encrypted = table.IsEncrypted?.PropertyInfo!.GetValue(row) is true;
                    await using var bytes = fileStore.OpenRead(userId, storedName, encrypted);
                    if (bytes is null)
                    {
                        filesMissing++;
                        continue;
                    }

                    await using var entry = zip.CreateEntry($"files/{storedName}", CompressionLevel.Fastest).Open();
                    await bytes.CopyToAsync(entry, cancellationToken);
                    files++;
                }
            }
        }

        var manifest = new
        {
            format = AccountData.Format,
            version = AccountData.Version,
            exportedAtUtc = DateTime.UtcNow,
            username = user.Username,
            displayName = user.DisplayName,
            profile = new { user.TimeZone, user.BaseCurrency, user.LifeVision },
            tables = manifestTables,
            files,
            filesMissing,
        };
        await WriteTextAsync(zip, "manifest.json", JsonSerializer.Serialize(manifest, new JsonSerializerOptions { WriteIndented = true }), cancellationToken);
        await WriteTextAsync(zip, "README.txt", Readme, cancellationToken);

        foreach (var documentId in vaultDocumentIds)
        {
            await vaultService.LogAsync(VaultActions.Opened, "Document", documentId, "Included in a data export");
        }

        if (hasSensitive)
        {
            await vaultService.LogAsync(VaultActions.Opened, null, null, "Health records included in a data export");
        }

        return OperationResult<bool>.Ok(true);
    }

    // ---- Import ----

    public async Task<OperationResult<ImportSummaryDto>> ImportAsync(Stream zipStream, CancellationToken cancellationToken = default)
    {
        var userId = db.CurrentUserId!.Value;
        ZipArchive zip;
        try
        {
            zip = new ZipArchive(zipStream, ZipArchiveMode.Read, leaveOpen: true);
        }
        catch (InvalidDataException)
        {
            return OperationResult<ImportSummaryDto>.Fail("That isn't a LifeOS export (not a zip file).");
        }

        using (zip)
        {
            var manifestEntry = zip.GetEntry("manifest.json");
            if (manifestEntry is null)
            {
                return OperationResult<ImportSummaryDto>.Fail("That isn't a LifeOS export (no manifest.json).");
            }

            JsonElement manifest;
            await using (var stream = manifestEntry.Open())
            {
                manifest = (await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken)).RootElement.Clone();
            }

            if (!manifest.TryGetProperty("format", out var format) || format.GetString() != AccountData.Format)
            {
                return OperationResult<ImportSummaryDto>.Fail("That isn't a LifeOS export.");
            }

            if (!manifest.TryGetProperty("version", out var version) || version.GetInt32() > AccountData.Version)
            {
                return OperationResult<ImportSummaryDto>.Fail("That export was made by a newer LifeOS — update this one first.");
            }

            var tables = UserTables().Where(t => !AccountData.NotImported.Contains(t.Entity.ClrType.Name)).ToList();
            var existing = await FirstNonEmptyAsync(tables, userId);
            if (existing is not null)
            {
                return OperationResult<ImportSummaryDto>.Fail(string.Format(NotEmpty, existing));
            }

            var importer = new Importer(db, fileStore, zip, userId, tables);
            await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
            try
            {
                var summary = await importer.RunAsync(cancellationToken);
                if (manifest.TryGetProperty("profile", out var profile))
                {
                    var user = await db.Users.FirstAsync(u => u.Id == userId, cancellationToken);
                    user.TimeZone = profile.TryGetProperty("TimeZone", out var zone) ? zone.GetString() : user.TimeZone;
                    user.BaseCurrency = profile.TryGetProperty("BaseCurrency", out var currency) ? currency.GetString() : user.BaseCurrency;
                    user.LifeVision = profile.TryGetProperty("LifeVision", out var vision) ? vision.GetString() : user.LifeVision;
                    user.UpdatedAt = DateTime.UtcNow;
                    await db.SaveChangesAsync(cancellationToken);
                }

                await transaction.CommitAsync(cancellationToken);
                return OperationResult<ImportSummaryDto>.Ok(summary);
            }
            catch
            {
                await transaction.RollbackAsync(CancellationToken.None);
                db.ChangeTracker.Clear();
                importer.DeleteSavedFiles();
                throw;
            }
        }
    }

    // ---- Permanent deletion ----

    public async Task<OperationResult<bool>> DeleteAccountAsync(DeleteAccountRequest request)
    {
        var userId = db.CurrentUserId!.Value;
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId);
        if (user is null || new PasswordHasher<User>().VerifyHashedPassword(user, user.PasswordHash, request.Password)
                == PasswordVerificationResult.Failed)
        {
            return OperationResult<bool>.Fail("That isn't your password.");
        }

        if (request.Confirmation.Trim() != user.Username)
        {
            return OperationResult<bool>.Fail($"Type your username ({user.Username}) exactly to confirm.");
        }

        var tables = UserTables();
        var order = AccountData.InsertOrder(tables, t => t.Principals(tables));
        await using (var transaction = await db.Database.BeginTransactionAsync())
        {
            // Self-references first (a repeating task points at its next one), then dependents before principals.
            foreach (var table in tables.Where(t => t.SelfReferences.Count > 0))
            {
                // Identifiers come from the EF model, never from input; the user id is a parameter.
                var sets = string.Join(", ", table.SelfReferences.Select(c => $"[{table.ColumnName(c)}] = NULL"));
                var update = $"UPDATE [{table.Schema}].[{table.Name}] SET {sets} WHERE [UserId] = @UserId";
                await db.Database.ExecuteSqlRawAsync(update, new SqlParameter("@UserId", userId));
            }

            foreach (var table in Enumerable.Reverse(order))
            {
                var delete = $"DELETE FROM [{table.Schema}].[{table.Name}] WHERE [UserId] = @UserId";
                await db.Database.ExecuteSqlRawAsync(delete, new SqlParameter("@UserId", userId));
            }

            await db.Database.ExecuteSqlRawAsync("DELETE FROM [shared].[Users] WHERE [Id] = @UserId", new SqlParameter("@UserId", userId));
            await transaction.CommitAsync();
        }

        // Only once the rows are gone for good: a failure above leaves the account (files included) as it was.
        fileStore.DeleteAll(userId);
        db.ChangeTracker.Clear();
        return OperationResult<bool>.Ok(true);
    }

    // ---- The model ----

    /// <summary>Every table with a UserId column, in the model's (stable) order.</summary>
    private List<UserTable> UserTables() =>
        db.Model.GetEntityTypes()
            .Where(e => !e.IsOwned() && e.GetTableName() is not null && e.FindProperty("UserId") is not null)
            .OrderBy(e => e.GetSchema()).ThenBy(e => e.GetTableName())
            .Select(e => new UserTable(e))
            .ToList();

    private async Task<List<object>> LoadAsync(UserTable table, int userId) =>
        await (Task<List<object>>)LoadMethod.MakeGenericMethod(table.Entity.ClrType).Invoke(this, [userId])!;

    private async Task<List<object>> LoadRowsAsync<T>(int userId)
        where T : class =>
        (await db.Set<T>().IgnoreQueryFilters().AsNoTracking()
            .Where(e => EF.Property<int>(e, "UserId") == userId)
            .OrderBy(e => EF.Property<int>(e, "Id"))
            .ToListAsync())
        .Cast<object>().ToList();

    private async Task<bool> AnyRowsAsync<T>(int userId)
        where T : class =>
        await db.Set<T>().IgnoreQueryFilters().AnyAsync(e => EF.Property<int>(e, "UserId") == userId);

    private async Task<int> CountLiveAsync<T>(int userId)
        where T : class =>
        await db.Set<T>().IgnoreQueryFilters()
            .CountAsync(e => EF.Property<int>(e, "UserId") == userId && !EF.Property<bool>(e, "IsDeleted"));

    /// <summary>"3 Goals"-style description of the first table that already has live rows, or null when empty.</summary>
    private async Task<string?> FirstNonEmptyAsync(List<UserTable> tables, int userId)
    {
        foreach (var table in tables.Where(t => t.Entity.FindProperty("IsDeleted") is not null))
        {
            var count = await (Task<int>)CountMethod.MakeGenericMethod(table.Entity.ClrType).Invoke(this, [userId])!;
            if (count > 0)
            {
                return $"{count} {table.Name}";
            }
        }

        return null;
    }

    private static async Task WriteTextAsync(ZipArchive zip, string path, string text, CancellationToken cancellationToken)
    {
        await using var entry = zip.CreateEntry(path, CompressionLevel.Optimal).Open();
        await entry.WriteAsync(Encoding.UTF8.GetBytes(text), cancellationToken);
    }

    private const string Readme =
        """
        LifeOS data export

        data/   one JSON file per table, exact values. This is what LifeOS reads back on import.
        csv/    the same tables as CSV, for spreadsheets (text starting with = + - @ has a leading ' there).
        files/  your document files and attachments, by their stored name (see StoredName / OriginalName in
                documents.DocumentFiles and shared.Attachments). Vault files are included decrypted — keep this
                file somewhere safe.

        Rows you deleted in LifeOS are included too (IsDeleted = true), so an import is a faithful copy.
        Dates are ISO (yyyy-MM-dd); moments are UTC.
        """;

    /// <summary>A user-owned table and what export/import/delete need to know about it.</summary>
    private sealed class UserTable
    {
        public UserTable(IEntityType entity)
        {
            Entity = entity;
            Schema = entity.GetSchema() ?? "dbo";
            Name = entity.GetTableName()!;
            Store = StoreObjectIdentifier.Table(Name, Schema);
            Columns = entity.GetProperties().Where(p => p.PropertyInfo is not null && p.GetComputedColumnSql() is null).ToList();
            StoredName = entity.FindProperty("StoredName");
            IsEncrypted = entity.FindProperty("IsEncrypted");
            SelfReferences = entity.GetForeignKeys()
                .Where(fk => fk.PrincipalEntityType == entity)
                .SelectMany(fk => fk.Properties).ToList();
        }

        public IEntityType Entity { get; }
        public string Schema { get; }
        public string Name { get; }
        public string Key => $"{Schema}.{Name}";
        public StoreObjectIdentifier Store { get; }
        public List<IProperty> Columns { get; }
        public IProperty? StoredName { get; }
        public IProperty? IsEncrypted { get; }
        public bool HasFiles => StoredName is not null && Entity.FindProperty("OriginalName") is not null;
        public List<IProperty> SelfReferences { get; }

        public string ColumnName(IProperty property) => property.GetColumnName(Store)!;

        public IEnumerable<UserTable> Principals(List<UserTable> tables) =>
            Entity.GetForeignKeys()
                .Select(fk => tables.FirstOrDefault(t => t.Entity == fk.PrincipalEntityType))
                .OfType<UserTable>();

        public override string ToString() => Key;
    }

    /// <summary>One import run: inserts table by table in FK order, remembering old id → new id per entity.</summary>
    private sealed class Importer(AppDbContext db, IFileStore fileStore, ZipArchive zip, int userId, List<UserTable> tables)
    {
        private readonly Dictionary<IEntityType, Dictionary<int, int>> newIds = [];
        private readonly List<string> savedFiles = [];
        private readonly List<(object Row, IProperty Property, int OldId)> selfPatches = [];
        private readonly List<(object Row, UserTable Table)> polymorphic = [];

        public async Task<ImportSummaryDto> RunAsync(CancellationToken cancellationToken)
        {
            var counts = new List<ImportTableDto>();
            var files = 0;
            var filesMissing = 0;
            foreach (var table in AccountData.InsertOrder(tables, t => t.Principals(tables)))
            {
                var entry = zip.GetEntry($"data/{table.Key}.json");
                if (entry is null)
                {
                    continue;
                }

                JsonElement data;
                await using (var stream = entry.Open())
                {
                    data = (await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken)).RootElement.Clone();
                }

                var rows = new List<(int OldId, object Row)>();
                foreach (var item in data.EnumerateArray())
                {
                    var row = Activator.CreateInstance(table.Entity.ClrType)!;
                    foreach (var column in table.Columns.Where(c => !c.IsPrimaryKey()))
                    {
                        if (item.TryGetProperty(column.Name, out var value))
                        {
                            column.PropertyInfo!.SetValue(row, value.Deserialize(column.ClrType, Json));
                        }
                    }

                    table.Entity.FindProperty("UserId")!.PropertyInfo!.SetValue(row, userId);
                    if (!RemapForeignKeys(table, row))
                    {
                        continue;
                    }

                    if (table.HasFiles)
                    {
                        var saved = await CopyFileAsync(table, row, cancellationToken);
                        if (!saved)
                        {
                            filesMissing++;
                            continue;
                        }

                        files++;
                    }

                    if (IsPolymorphic(table))
                    {
                        // Parked on a negative id until every table is in (the target may come later).
                        Park(table, row);
                        polymorphic.Add((row, table));
                    }

                    rows.Add((item.GetProperty("Id").GetInt32(), row));
                }

                if (rows.Count == 0)
                {
                    continue;
                }

                db.AddRange(rows.Select(r => r.Row));
                await db.SaveChangesAsync(cancellationToken);
                var map = newIds[table.Entity] = [];
                var key = table.Entity.FindPrimaryKey()!.Properties[0].PropertyInfo!;
                foreach (var (oldId, row) in rows)
                {
                    map[oldId] = (int)key.GetValue(row)!;
                }

                counts.Add(new ImportTableDto { Table = table.Key, Rows = rows.Count });
                // Rows still to patch stay tracked; the rest are let go so a big import doesn't drag.
                var keep = selfPatches.Select(p => p.Row).Concat(polymorphic.Select(p => p.Row)).ToHashSet(ReferenceEqualityComparer.Instance);
                foreach (var tracked in db.ChangeTracker.Entries().Where(e => !keep.Contains(e.Entity)).ToList())
                {
                    tracked.State = EntityState.Detached;
                }
            }

            PatchSelfReferences();
            PatchPolymorphic();
            await db.SaveChangesAsync(cancellationToken);
            db.ChangeTracker.Clear();
            return new ImportSummaryDto { Rows = counts.Sum(c => c.Rows), Files = files, FilesMissing = filesMissing, Tables = counts };
        }

        /// <summary>The bytes of any file saved so far (the import failed and its rows were rolled back).</summary>
        public void DeleteSavedFiles()
        {
            foreach (var name in savedFiles)
            {
                fileStore.Delete(userId, name);
            }
        }

        /// <summary>Points every foreign key at the new ids; false drops a row whose required principal isn't there.</summary>
        private bool RemapForeignKeys(UserTable table, object row)
        {
            foreach (var fk in table.Entity.GetForeignKeys())
            {
                var principal = tables.FirstOrDefault(t => t.Entity == fk.PrincipalEntityType);
                if (principal is null)
                {
                    // Users (already set) and LifeAreas (a fixed, shared list — ids are the same everywhere).
                    continue;
                }

                var property = fk.Properties[0];
                if (property.PropertyInfo!.GetValue(row) is not int oldId)
                {
                    continue;
                }

                if (principal == table)
                {
                    property.PropertyInfo.SetValue(row, null);
                    selfPatches.Add((row, property, oldId));
                    continue;
                }

                if (newIds.TryGetValue(principal.Entity, out var map) && map.TryGetValue(oldId, out var newId))
                {
                    property.PropertyInfo.SetValue(row, newId);
                }
                else if (property.IsNullable)
                {
                    property.PropertyInfo.SetValue(row, null);
                }
                else
                {
                    return false;
                }
            }

            return true;
        }

        private async Task<bool> CopyFileAsync(UserTable table, object row, CancellationToken cancellationToken)
        {
            var storedName = (string)table.StoredName!.PropertyInfo!.GetValue(row)!;
            var entry = zip.GetEntry($"files/{storedName}");
            if (entry is null)
            {
                return false;
            }

            var originalName = (string?)table.Entity.FindProperty("OriginalName")!.PropertyInfo!.GetValue(row);
            var encrypt = table.IsEncrypted?.PropertyInfo!.GetValue(row) is true;
            await using var bytes = entry.Open();
            var saved = await fileStore.SaveAsync(userId, bytes, originalName, cancellationToken, encrypt);
            if (!saved.Success)
            {
                throw new InvalidOperationException($"A file in the export couldn't be stored: {saved.Error}");
            }

            savedFiles.Add(saved.Data!.StoredName);
            table.StoredName.PropertyInfo.SetValue(row, saved.Data.StoredName);
            return true;
        }

        private static bool IsPolymorphic(UserTable table) =>
            Pairs(table).Any();

        /// <summary>The (type, id) column pairs of a table: links have two, reminders/attachments/logs one.</summary>
        private static IEnumerable<(PropertyInfo Type, PropertyInfo Id)> Pairs(UserTable table)
        {
            foreach (var prefix in new[] { "", "SourceEntity", "TargetEntity" })
            {
                var type = table.Entity.FindProperty(prefix == "" ? "EntityType" : prefix + "Type")?.PropertyInfo;
                var id = table.Entity.FindProperty(prefix == "" ? "EntityId" : prefix + "Id")?.PropertyInfo;
                if (type is not null && id is not null)
                {
                    yield return (type, id);
                }
            }
        }

        private static void Park(UserTable table, object row)
        {
            foreach (var (_, id) in Pairs(table))
            {
                if (id.GetValue(row) is int old)
                {
                    id.SetValue(row, -old);
                }
            }
        }

        private void PatchSelfReferences()
        {
            foreach (var (row, property, oldId) in selfPatches)
            {
                var map = newIds[property.DeclaringType.ContainingEntityType];
                property.PropertyInfo!.SetValue(row, map.TryGetValue(oldId, out var newId) ? newId : null);
            }
        }

        /// <summary>
        /// Points links, reminders and attachments at their targets' new ids. One whose target didn't come across is
        /// kept but soft-deleted (it would point nowhere); links are put back in canonical order, since new ids can
        /// swap which end is "smaller".
        /// </summary>
        private void PatchPolymorphic()
        {
            foreach (var (row, table) in polymorphic)
            {
                var resolved = true;
                foreach (var (typeProperty, idProperty) in Pairs(table))
                {
                    if (typeProperty.GetValue(row) is not string type || idProperty.GetValue(row) is not int parked)
                    {
                        continue;
                    }

                    var target = tables.FirstOrDefault(t => t.Entity.ClrType.Name == AccountData.ModelTypeFor(type));
                    if (target is not null && newIds.TryGetValue(target.Entity, out var map) && map.TryGetValue(-parked, out var newId))
                    {
                        idProperty.SetValue(row, newId);
                    }
                    else
                    {
                        resolved = false;
                    }
                }

                if (row is EntityLink link)
                {
                    (link.SourceEntityType, link.SourceEntityId, link.TargetEntityType, link.TargetEntityId) =
                        EntityLinksService.Canonicalize(link.SourceEntityType, link.SourceEntityId, link.TargetEntityType, link.TargetEntityId);
                }

                if (!resolved && table.Entity.FindProperty("IsDeleted")?.PropertyInfo is { } isDeleted)
                {
                    isDeleted.SetValue(row, true);
                    table.Entity.FindProperty("DeletedAt")?.PropertyInfo?.SetValue(row, DateTime.UtcNow);
                }
            }
        }
    }
}
