using System.ComponentModel.DataAnnotations;
using LifeOS.Core.Dashboard.Services;

namespace LifeOS.Core.Dashboard.DTOs;

/// <summary>Stable identifiers of the KPI tiles (dashboard.KpiTiles.KpiKey, CK_KpiTiles_KpiKey) — never rename one.</summary>
public static class KpiKeys
{
    public const string TasksDoneWeek = "tasks-done-week";
    public const string FocusWeek = "focus-week";
    public const string HabitConsistency30 = "habit-consistency-30";
    public const string JournalDays30 = "journal-days-30";
    public const string ObjectivesDone30 = "objectives-done-30";
    public const string GoalsPassedYear = "goals-passed-year";
    public const string GoalsActive = "goals-active";
}

/// <summary>How a tile's number reads: a plain count, a percentage, or minutes (shown as hours and minutes).</summary>
public static class KpiUnits
{
    public const string Count = "Count";
    public const string Percent = "Percent";
    public const string Minutes = "Minutes";
}

/// <summary>A figure that can be put on My Day, and the module it belongs to (hidden with it in Settings).</summary>
public record KpiDefinition(string Key, string Label, string Module, string Unit, string? ComparedWith);

/// <summary>A KPI tile as My Day shows it.</summary>
public class KpiTileDto
{
    public string Key { get; init; } = string.Empty;
    public string Label { get; init; } = string.Empty;
    public string Module { get; init; } = string.Empty;
    public string Unit { get; init; } = KpiUnits.Count;
    /// <summary>Null when there's nothing to measure yet (no habit was scheduled in the window).</summary>
    public int? Value { get; init; }
    /// <summary>The same figure for the period before, when the tile compares ("last week").</summary>
    public int? Previous { get; init; }
    public string? ComparedWith { get; init; }
}

public class KpisDto
{
    /// <summary>The user's chosen tiles, in their order.</summary>
    public List<KpiTileDto> Tiles { get; init; } = [];
    /// <summary>Every figure that can be chosen, in a fixed order.</summary>
    public List<KpiDefinition> Available { get; init; } = [];
}

public class SaveKpisRequest
{
    [Required]
    [MaxLength(KpiFigures.MaxTiles, ErrorMessage = "Pick at most 6 figures.")]
    public List<string> Keys { get; init; } = [];
}

public class DismissInsightRequest
{
    [Required]
    [StringLength(200)]
    public string Key { get; init; } = string.Empty;
}
