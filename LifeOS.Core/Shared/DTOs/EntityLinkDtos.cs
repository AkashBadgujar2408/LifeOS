using System.ComponentModel.DataAnnotations;

namespace LifeOS.Core.Shared.DTOs;

/// <summary>One end of a link as seen from the other end: what the current entity is linked to.</summary>
public class LinkedItemDto
{
    public int LinkId { get; init; }
    public string EntityType { get; init; } = string.Empty;
    public int EntityId { get; init; }
    public string Title { get; init; } = string.Empty;
}

/// <summary>An entity that can be picked as a link target.</summary>
public class LinkableItemDto
{
    public string EntityType { get; init; } = string.Empty;
    public int EntityId { get; init; }
    public string Title { get; init; } = string.Empty;
}

public class LinkableTypeDto
{
    public string EntityType { get; init; } = string.Empty;
    public string DisplayName { get; init; } = string.Empty;
}

public class CreateEntityLinkRequest
{
    [Required]
    public string SourceEntityType { get; init; } = string.Empty;

    [Range(1, int.MaxValue)]
    public int SourceEntityId { get; init; }

    [Required]
    public string TargetEntityType { get; init; } = string.Empty;

    [Range(1, int.MaxValue)]
    public int TargetEntityId { get; init; }
}
