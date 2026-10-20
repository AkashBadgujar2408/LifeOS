using System.ComponentModel.DataAnnotations;

namespace LifeOS.Core.Family.DTOs;

/// <summary>people.Interactions.Kind values — stable, never renamed once data exists.</summary>
public static class InteractionKinds
{
    public static readonly IReadOnlySet<string> All =
        new HashSet<string>(["Call", "Video", "Message", "Meeting", "Visit", "Event", "Other"], StringComparer.Ordinal);
}

/// <summary>people.GiftIdeas.Status values.</summary>
public static class GiftStatuses
{
    public const string Idea = "Idea";
    public const string Bought = "Bought";
    public const string Given = "Given";

    public static readonly IReadOnlySet<string> All = new HashSet<string>([Idea, Bought, Given], StringComparer.Ordinal);
}

/// <summary>people.Responsibilities.HeldBy values.</summary>
public static class ResponsibilityHolders
{
    public const string Me = "Me";
    public const string Shared = "Shared";
    public const string Someone = "Someone";

    public static readonly IReadOnlySet<string> All = new HashSet<string>([Me, Shared, Someone], StringComparer.Ordinal);
}

public class FamilyPersonRefDto
{
    public int ContactId { get; init; }
    public string Name { get; init; } = string.Empty;
}

/// <summary>Being in touch on a day, with one or more people.</summary>
public class InteractionDto
{
    public int Id { get; init; }
    public DateOnly OccurredOn { get; init; }
    public string Kind { get; init; } = string.Empty;
    public string? Summary { get; init; }
    public string? Notes { get; init; }
    public List<FamilyPersonRefDto> People { get; init; } = [];
}

public class InteractionRequest
{
    public DateOnly OccurredOn { get; init; }

    [Required]
    public string Kind { get; init; } = string.Empty;

    [StringLength(500)]
    public string? Summary { get; init; }

    [StringLength(4000)]
    public string? Notes { get; init; }

    /// <summary>Everyone it was with (replaced as a whole on every save).</summary>
    public List<int> ContactIds { get; init; } = [];

    /// <summary>The client's today: an interaction can't be for a later day.</summary>
    public DateOnly Today { get; init; }
}

/// <summary>A keep-in-touch cadence with where it stands today (computed, never stored).</summary>
public class KeepInTouchDto
{
    public int ContactId { get; init; }
    public string Name { get; init; } = string.Empty;
    public int CadenceDays { get; init; }
    public DateOnly? LastContactedOn { get; init; }
    public DateOnly DueOn { get; init; }
    /// <summary>Negative = that many days past.</summary>
    public int DaysUntil { get; init; }
}

public class KeepInTouchRequest
{
    public int CadenceDays { get; init; }

    public DateOnly Today { get; init; }
}

public class GiftIdeaDto
{
    public int Id { get; init; }
    public int ContactId { get; init; }
    public string ContactName { get; init; } = string.Empty;
    public string Title { get; init; } = string.Empty;
    public int? SignificantDateId { get; init; }
    /// <summary>The significant date's title ("Asha's birthday") or the free-text occasion.</summary>
    public string? OccasionTitle { get; init; }
    public string? Occasion { get; init; }
    public string Status { get; init; } = string.Empty;
    public decimal? EstimatedAmount { get; init; }
    public string? Currency { get; init; }
    public string? Link { get; init; }
    public int? PurchaseId { get; init; }
    public string? PurchaseTitle { get; init; }
    public DateOnly? GivenOn { get; init; }
    public string? Notes { get; init; }
}

public class GiftIdeaRequest
{
    public int ContactId { get; init; }

    [Required]
    [StringLength(200)]
    public string Title { get; init; } = string.Empty;

    public int? SignificantDateId { get; init; }

    [StringLength(100)]
    public string? Occasion { get; init; }

    [Required]
    public string Status { get; init; } = GiftStatuses.Idea;

    public decimal? EstimatedAmount { get; init; }

    [StringLength(3)]
    public string? Currency { get; init; }

    [StringLength(2000)]
    public string? Link { get; init; }

    public int? PurchaseId { get; init; }

    public DateOnly? GivenOn { get; init; }

    [StringLength(2000)]
    public string? Notes { get; init; }

    public DateOnly Today { get; init; }
}

public class ResponsibilityDto
{
    public int Id { get; init; }
    public string Title { get; init; } = string.Empty;
    public int? ContactId { get; init; }
    public string? ContactName { get; init; }
    public string HeldBy { get; init; } = string.Empty;
    public int? HolderContactId { get; init; }
    public string? HolderName { get; init; }
    /// <summary>The task that keeps it going — for a repeating task, its latest occurrence.</summary>
    public int? TaskItemId { get; init; }
    public string? TaskTitle { get; init; }
    public DateOnly? TaskDueDate { get; init; }
    public bool TaskDone { get; init; }
    public DateOnly? StartedOn { get; init; }
    public DateOnly? EndedOn { get; init; }
    public string? Notes { get; init; }
}

public class ResponsibilityRequest
{
    [Required]
    [StringLength(200)]
    public string Title { get; init; } = string.Empty;

    public int? ContactId { get; init; }

    [Required]
    public string HeldBy { get; init; } = ResponsibilityHolders.Me;

    public int? HolderContactId { get; init; }

    public int? TaskItemId { get; init; }

    public DateOnly? StartedOn { get; init; }

    public DateOnly? EndedOn { get; init; }

    [StringLength(2000)]
    public string? Notes { get; init; }
}
