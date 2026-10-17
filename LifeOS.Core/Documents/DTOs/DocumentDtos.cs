using System.ComponentModel.DataAnnotations;
using LifeOS.Core.Shared.DTOs;

namespace LifeOS.Core.Documents.DTOs;

/// <summary>Matches CK_Documents_Kind. Never rename one once stored.</summary>
public static class DocumentKinds
{
    public const string Identity = "Identity";
    public const string Education = "Education";
    public const string Employment = "Employment";
    public const string Financial = "Financial";
    public const string Legal = "Legal";
    public const string Medical = "Medical";
    public const string Other = "Other";

    public static readonly IReadOnlyList<string> All = [Identity, Education, Employment, Financial, Legal, Medical, Other];
}

/// <summary>A document in the library list.</summary>
public class DocumentSummaryDto
{
    public int Id { get; init; }
    public string Title { get; init; } = string.Empty;
    public string Kind { get; init; } = string.Empty;
    public string? Issuer { get; init; }
    /// <summary>Only ever the last 4 characters of the document's number.</summary>
    public string? NumberLast4 { get; init; }
    public DateOnly? IssuedOn { get; init; }
    public DateOnly? ExpiresOn { get; init; }
    public bool IsVault { get; init; }
    public int FileCount { get; init; }
    public List<TagDto> Tags { get; init; } = [];
    public DateTime CreatedAt { get; init; }
}

public class DocumentDto : DocumentSummaryDto
{
    public string? Notes { get; init; }
    /// <summary>Remind this many days before ExpiresOn (0 = on the day); null = no expiry reminder.</summary>
    public int? ExpiryReminderDays { get; init; }
    public int? ExpiryReminderId { get; init; }
    /// <summary>Oldest first, so pages keep the order they were uploaded in.</summary>
    public List<DocumentFileDto> Files { get; init; } = [];
}

public class DocumentFileDto
{
    public int Id { get; init; }
    public string OriginalName { get; init; } = string.Empty;
    public string ContentType { get; init; } = string.Empty;
    public long SizeBytes { get; init; }
    public string Sha256 { get; init; } = string.Empty;
    public DateTime CreatedAt { get; init; }
}

public class DocumentRequest
{
    [Required]
    [StringLength(200)]
    public string Title { get; init; } = string.Empty;

    [Required]
    public string Kind { get; init; } = string.Empty;

    [StringLength(200)]
    public string? Issuer { get; init; }

    /// <summary>The number as typed (up to 40 characters); only its last 4 letters/digits are kept.</summary>
    [StringLength(40)]
    public string? Number { get; init; }

    public DateOnly? IssuedOn { get; init; }
    public DateOnly? ExpiresOn { get; init; }

    [StringLength(4000)]
    public string? Notes { get; init; }

    public bool IsVault { get; init; }

    /// <summary>0–365, needs ExpiresOn; null = no expiry reminder.</summary>
    [Range(0, 365, ErrorMessage = "Remind between 0 and 365 days before it expires.")]
    public int? ExpiryReminderDays { get; init; }

    /// <summary>The browser's IANA zone, used for the expiry reminder's 09:00 when no zone is set in Settings.</summary>
    [StringLength(64)]
    public string? TimeZone { get; init; }

    public List<int> TagIds { get; init; } = [];
}

/// <summary>One file in an upload, however it arrived (multipart from the API, a stream in tests).</summary>
public sealed record FileUpload(string? FileName, Stream Content);

/// <summary>A file's bytes, ready to send. The caller disposes Content.</summary>
public sealed record DocumentFileContent(Stream Content, string ContentType, string FileName, long SizeBytes, string Sha256);

public static class DocumentErrors
{
    public const string NotFound = "Document not found.";
    public const string FileNotFound = "File not found.";
}
