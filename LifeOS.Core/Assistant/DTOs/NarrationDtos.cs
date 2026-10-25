using System.ComponentModel.DataAnnotations;
using LifeOS.Core.Finance.DTOs;

namespace LifeOS.Core.Assistant.DTOs;

/// <summary>Where a narration belongs: the Story recap ("Previously on…") or one year's Annual Life Review.</summary>
public static class NarrationScopes
{
    public const string Recap = "Recap";
    public const string Year = "Year";
}

/// <summary>
/// "Narrate": the lines the page shows, word for word (beats with their days, figures) — the only thing the model
/// gets besides the narrator's instructions.
/// </summary>
public class NarrateRequest
{
    [Required]
    [AllowedValues(NarrationScopes.Recap, NarrationScopes.Year, ErrorMessage = "Narrate the recap or a year.")]
    public string Scope { get; init; } = string.Empty;

    /// <summary>Year scope only.</summary>
    public int? Year { get; init; }

    [Required]
    public List<string> Lines { get; init; } = [];

    [Required]
    public DateOnly Today { get; init; }
}

public class NarrationDto
{
    public string Text { get; init; } = string.Empty;
    /// <summary>Everything sent to Mistral for it, in order.</summary>
    public List<SentItemDto> Sent { get; init; } = [];
}

/// <summary>"Keep": the narration the user saw, stored for that recap/year (replacing a kept one).</summary>
public class KeepNarrationRequest
{
    [Required]
    [AllowedValues(NarrationScopes.Recap, NarrationScopes.Year, ErrorMessage = "Keep the recap's or a year's narration.")]
    public string Scope { get; init; } = string.Empty;

    public int? Year { get; init; }

    [Required(ErrorMessage = "There's no narration to keep.")]
    [StringLength(4000, ErrorMessage = "A narration is at most 4000 characters.")]
    public string Text { get; init; } = string.Empty;

    [Required]
    public DateOnly Today { get; init; }
}

public class KeptNarrationDto
{
    public string Scope { get; init; } = string.Empty;
    public int? Year { get; init; }
    public string Text { get; init; } = string.Empty;
    public DateTime KeptAt { get; init; }
}

/// <summary>Predict: asks Mistral for the forecast 3, 6 or 12 months from the client's today.</summary>
public class PredictForecastRequest
{
    [AllowedValues(3, 6, 12, ErrorMessage = "Forecast 3, 6 or 12 months ahead.")]
    public int Months { get; init; }

    [Required]
    public DateOnly Today { get; init; }
}

/// <summary>
/// The Forecast tab (Session 96a): Mistral reads the user's past income and spending as patterns (each with a typical
/// monthly amount, a low–high range and a confidence); LifeOS adds those and the money already known to be coming to
/// today's balances. Saved per horizon (one row, rewritten by Predict again).
/// </summary>
public class ForecastPredictionDto
{
    public int Months { get; init; }
    public DateOnly From { get; init; }
    public DateOnly Until { get; init; }
    /// <summary>When Mistral was last asked (UTC).</summary>
    public DateTime PredictedAt { get; init; }
    public string BaseCurrency { get; init; } = string.Empty;
    /// <summary>The Mistral model that read the patterns.</summary>
    public string Model { get; init; } = string.Empty;
    public PredictedLineDto Overall { get; init; } = new();
    public List<PredictedLineDto> Accounts { get; init; } = [];
    public List<MoneyPatternDto> Patterns { get; init; } = [];
    /// <summary>Mistral's own estimate (0–100) of how likely your money turns out as predicted — within the low–high range.</summary>
    public int Confidence { get; init; }
    /// <summary>Mistral's reason for that figure.</summary>
    public string ConfidenceReason { get; init; } = string.Empty;
    public string Summary { get; init; } = string.Empty;
    /// <summary>The first and last month of history Mistral read (null: none recorded yet).</summary>
    public DateOnly? HistoryFrom { get; init; }
    public DateOnly? HistoryTo { get; init; }
    /// <summary>The money already known to be coming, soonest first.</summary>
    public List<ForecastItemDto> Items { get; init; } = [];
    public List<string> Unconverted { get; init; } = [];
    public List<SentItemDto> Sent { get; init; } = [];
}

public class PredictedPointDto
{
    public DateOnly Day { get; init; }
    /// <summary>Expected: known money + each pattern's typical amount.</summary>
    public decimal Balance { get; init; }
    /// <summary>Patterns at their worst (income low, spending high) and best.</summary>
    public decimal Low { get; init; }
    public decimal High { get; init; }
}

public class PredictedLineDto
{
    /// <summary>Null for the overall line (all accounts, in the base currency).</summary>
    public int? AccountId { get; init; }
    public string Name { get; init; } = string.Empty;
    public string Currency { get; init; } = string.Empty;
    public decimal Start { get; init; }
    public PredictedPointDto End { get; init; } = new();
    /// <summary>The first point with the lowest expected balance (today counts).</summary>
    public PredictedPointDto Lowest { get; init; } = new();
    /// <summary>Today, then one point a month.</summary>
    public List<PredictedPointDto> Points { get; init; } = [];
}

public class MoneyPatternDto
{
    public string Name { get; init; } = string.Empty;
    /// <summary>Income / Expense.</summary>
    public string Kind { get; init; } = string.Empty;
    /// <summary>The account it moves, or null (overall only).</summary>
    public int? AccountId { get; init; }
    public string LineName { get; init; } = string.Empty;
    /// <summary>A month, in the base currency — the average / quietest / busiest full month of its groups (LifeOS's figures, not Mistral's).</summary>
    public decimal Typical { get; init; }
    public decimal Low { get; init; }
    public decimal High { get; init; }
    /// <summary>0–100: how sure Mistral is that it carries on at this level.</summary>
    public int Confidence { get; init; }
    public string Basis { get; init; } = string.Empty;
    /// <summary>The history groups it was read from.</summary>
    public List<string> From { get; init; } = [];
}
