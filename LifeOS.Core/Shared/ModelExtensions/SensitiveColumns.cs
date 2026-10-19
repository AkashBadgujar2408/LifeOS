using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace LifeOS.Core.Shared.ModelExtensions;

/// <summary>
/// Free text that is encrypted at rest (Blueprint: medical records are "highly sensitive: encrypt"). Every string
/// column named <c>...Notes</c> in a sensitive schema holds ASP.NET Core Data Protection ciphertext: the value
/// converter protects on write and unprotects on read, so services, DTOs and the exporter see plain text and SQL
/// sees only "CfDJ8..." payloads (each such column has a <c>CK_..._NotesEncrypted</c> check that refuses anything
/// else). A new sensitive column only needs that name; a new sensitive module adds its schema here.
/// </summary>
public static class SensitiveColumns
{
    /// <summary>Data Protection purpose; never change it, or stored text can no longer be read.</summary>
    public const string Purpose = "LifeOS.SensitiveColumns.v1";

    public static readonly IReadOnlySet<string> Schemas = new HashSet<string>(["health"], StringComparer.Ordinal);

    public static bool IsEncrypted(IReadOnlyProperty property) =>
        property.ClrType == typeof(string)
        && property.Name.EndsWith("Notes", StringComparison.Ordinal)
        && property.DeclaringType is IReadOnlyEntityType entity
        && entity.GetSchema() is { } schema
        && Schemas.Contains(schema);

    /// <summary>
    /// The converter for <paramref name="protector"/>. Without one (a context built from options alone, as tests do)
    /// the model still builds, but reading or writing a sensitive column throws rather than store plain text.
    /// </summary>
    public static ValueConverter<string, string> Converter(IDataProtector? protector) =>
        new(v => Protect(protector, v), v => Unprotect(protector, v));

    private static string Protect(IDataProtector? protector, string value) =>
        (protector ?? throw MissingProtector()).Protect(value);

    private static string Unprotect(IDataProtector? protector, string value) =>
        (protector ?? throw MissingProtector()).Unprotect(value);

    private static InvalidOperationException MissingProtector() =>
        new("Sensitive columns need Data Protection: build AppDbContext through DI.");
}
