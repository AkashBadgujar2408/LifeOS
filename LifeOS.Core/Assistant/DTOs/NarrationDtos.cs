using System.ComponentModel.DataAnnotations;

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
