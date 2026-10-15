using System.ComponentModel.DataAnnotations;

namespace LifeOS.Core.Calendar.DTOs;

public static class ReminderStatuses
{
    /// <summary>Not dismissed yet — due now or still upcoming.</summary>
    public const string Pending = "Pending";
    public const string Dismissed = "Dismissed";
}

/// <summary>
/// A moment at which something should surface. Optionally about another entity (EntityType/EntityId, the same type
/// strings as EntityLinks); EntityTitle is that entity's current title.
/// </summary>
public class ReminderDto
{
    public int Id { get; init; }
    public string Title { get; init; } = string.Empty;
    public string? Notes { get; init; }
    public DateTime RemindAt { get; init; }
    public DateTime? DismissedAt { get; init; }
    public string? EntityType { get; init; }
    public int? EntityId { get; init; }
    public string? EntityTitle { get; set; }
    public DateTime CreatedAt { get; init; }
}

public class ReminderRequest
{
    [Required]
    [StringLength(200)]
    public string Title { get; init; } = string.Empty;

    [StringLength(4000)]
    public string? Notes { get; init; }

    /// <summary>A moment with a "Z" or an offset.</summary>
    [Required]
    public DateTime? RemindAt { get; init; }

    /// <summary>What the reminder is about (both or neither). Ignored on update — a reminder keeps its target.</summary>
    [StringLength(50)]
    public string? EntityType { get; init; }

    public int? EntityId { get; init; }
}

public class SetReminderDismissedRequest
{
    public bool Dismissed { get; init; }
}

public class SnoozeReminderRequest
{
    /// <summary>A moment with a "Z" or an offset, in the future.</summary>
    [Required]
    public DateTime? Until { get; init; }
}
