using System.ComponentModel.DataAnnotations;

namespace LifeOS.Core.Shared.DTOs;

/// <summary>What an import brought in: rows per table (only tables that had any) and files.</summary>
public class ImportSummaryDto
{
    public int Rows { get; init; }
    public int Files { get; init; }
    /// <summary>File rows left out because the export didn't carry their bytes.</summary>
    public int FilesMissing { get; init; }
    public List<ImportTableDto> Tables { get; init; } = [];
}

public class ImportTableDto
{
    /// <summary>"goals.Goals".</summary>
    public string Table { get; init; } = string.Empty;
    public int Rows { get; init; }
}

/// <summary>Permanent deletion: the password, and the username typed out as confirmation.</summary>
public class DeleteAccountRequest
{
    [Required]
    public string Password { get; init; } = string.Empty;

    [Required]
    [StringLength(100)]
    public string Confirmation { get; init; } = string.Empty;
}

public static class AccountDataErrors
{
    public const string VaultLocked = "Your export includes vault documents — unlock the vault first.";
}
