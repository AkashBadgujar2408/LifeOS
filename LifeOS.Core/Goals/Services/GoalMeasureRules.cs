using LifeOS.Core.Goals.DTOs;

namespace LifeOS.Core.Goals.Services;

/// <summary>
/// Checks for measured goals (Session 71d) that mirror goals.Goals' CHECKs, so a wrong request gets a clean message
/// instead of a database error. Pure, xUnit-tested.
/// </summary>
public static class GoalMeasureRules
{
    /// <summary>The largest figure DECIMAL(19,4) holds with room to add things up.</summary>
    public const decimal MaxValue = 999_999_999_999m;

    public const int MaxUnitLength = 30;

    /// <summary>The measure part of a goal request: all of target, unit and source, or none of them.</summary>
    public static string? CheckMeasure(decimal? target, decimal? start, string? unit, string? source)
    {
        var anything = target is not null || start is not null || !string.IsNullOrWhiteSpace(unit) || source is not null;
        if (!anything)
        {
            return null;
        }

        if (target is null)
        {
            return "Give the number to reach.";
        }

        if (string.IsNullOrWhiteSpace(unit))
        {
            return "Say what it's measured in — steps, km, pages, hours…";
        }

        if (unit.Trim().Length > MaxUnitLength)
        {
            return $"Keep the unit to {MaxUnitLength} characters.";
        }

        if (source is not (GoalMeasureSources.Manual or GoalMeasureSources.Linked))
        {
            return "Choose whether you log the number or it's counted from other items.";
        }

        if (target is <= 0 or > MaxValue)
        {
            return "The number to reach has to be more than zero.";
        }

        if (start is < 0)
        {
            return "What's already done can't be below zero.";
        }

        if ((start ?? 0) >= target)
        {
            return "What's already done has to be less than the number to reach.";
        }

        return null;
    }

    /// <summary>The unit as stored: trimmed, inner runs of spaces made single.</summary>
    public static string? Unit(string? unit) =>
        string.IsNullOrWhiteSpace(unit) ? null : string.Join(' ', unit.Split(' ', StringSplitOptions.RemoveEmptyEntries));

    /// <summary>"Steps" and " steps " are the same unit; "pages" and "steps" aren't.</summary>
    public static bool SameUnit(string? a, string? b) =>
        string.Equals(Unit(a), Unit(b), StringComparison.OrdinalIgnoreCase);

    /// <summary>A manual entry: a positive amount on a day that has begun.</summary>
    public static string? CheckEntry(DateOnly day, decimal value, DateOnly today)
    {
        if (value is <= 0 or > MaxValue)
        {
            return "Log an amount more than zero.";
        }

        if (day > today)
        {
            return "That day hasn't come yet.";
        }

        return null;
    }
}
