using System.ComponentModel.DataAnnotations;

namespace LifeOS.Core.Shared.DTOs;

/// <summary>Modules a user can switch off; matches CK_UserHiddenModules_ModuleKey. Never rename one once stored.</summary>
public static class ModuleKeys
{
    public const string Calendar = "Calendar";
    public const string Reminders = "Reminders";
    public const string Goals = "Goals";
    public const string Tasks = "Tasks";
    public const string Projects = "Projects";
    public const string Habits = "Habits";
    public const string Journal = "Journal";
    public const string Story = "Story";
    public const string Documents = "Documents";
    public const string Learning = "Learning";
    public const string Career = "Career";
    public const string Finance = "Finance";
    public const string Health = "Health";
    public const string Home = "Home";

    public static readonly IReadOnlySet<string> All =
        new HashSet<string>([Calendar, Reminders, Goals, Tasks, Projects, Habits, Journal, Story, Documents, Learning, Career, Finance, Health, Home], StringComparer.Ordinal);
}

/// <summary>Everything on the Settings page, and what the shell needs to know (hidden modules) on every load.</summary>
public class SettingsDto
{
    public string Username { get; init; } = string.Empty;
    public string Email { get; init; } = string.Empty;
    public string DisplayName { get; init; } = string.Empty;
    /// <summary>IANA zone repeating events and reminders follow; null = the device's.</summary>
    public string? TimeZone { get; init; }
    /// <summary>ISO 4217 code; null until chosen.</summary>
    public string? BaseCurrency { get; init; }
    public List<string> HiddenModules { get; init; } = [];
    public List<int> HiddenLifeAreaIds { get; init; } = [];
    /// <summary>Unused recovery codes; 0 means a forgotten password can't be reset — generate a set.</summary>
    public int RecoveryCodesLeft { get; init; }
}

public class ProfileRequest
{
    [Required, MaxLength(200)]
    public string DisplayName { get; init; } = string.Empty;

    [Required, EmailAddress, MaxLength(256)]
    public string Email { get; init; } = string.Empty;
}

public class PreferencesRequest
{
    /// <summary>An IANA zone, or null to follow the device.</summary>
    [StringLength(64)]
    public string? TimeZone { get; init; }

    /// <summary>An ISO 4217 code from GET api/Shared/Settings/currencies, or null.</summary>
    [StringLength(3)]
    public string? BaseCurrency { get; init; }

    public List<string> HiddenModules { get; init; } = [];
    public List<int> HiddenLifeAreaIds { get; init; } = [];
}

public class CurrencyDto
{
    public string Code { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
}

public class ChangePasswordRequest
{
    [Required]
    public string CurrentPassword { get; init; } = string.Empty;

    [Required, MinLength(8), MaxLength(100)]
    public string NewPassword { get; init; } = string.Empty;
}

/// <summary>Making a new set of recovery codes asks for the password again.</summary>
public class RegenerateRecoveryCodesRequest
{
    [Required]
    public string CurrentPassword { get; init; } = string.Empty;
}

public class RecoveryCodesDto
{
    /// <summary>Shown once; only their hashes are kept.</summary>
    public List<string> Codes { get; init; } = [];
}

public class ResetPasswordRequest
{
    [Required]
    public string Username { get; init; } = string.Empty;

    [Required, MaxLength(40)]
    public string RecoveryCode { get; init; } = string.Empty;

    [Required, MinLength(8), MaxLength(100)]
    public string NewPassword { get; init; } = string.Empty;
}
