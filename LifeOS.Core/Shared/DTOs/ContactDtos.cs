using System.ComponentModel.DataAnnotations;

namespace LifeOS.Core.Shared.DTOs;

/// <summary>A person in the one shared contact list (Career's network, Family, Safety, Community all use it).</summary>
public class ContactDto
{
    public int Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public string? Organisation { get; init; }
    public string? JobTitle { get; init; }
    public string? Email { get; init; }
    public string? Phone { get; init; }
    public string? Notes { get; init; }
    public DateOnly? LastContactedOn { get; init; }
    public List<TagDto> Tags { get; init; } = [];
}

public class ContactRequest
{
    [Required]
    [StringLength(200)]
    public string Name { get; init; } = string.Empty;

    [StringLength(200)]
    public string? Organisation { get; init; }

    [StringLength(200)]
    public string? JobTitle { get; init; }

    [StringLength(320)]
    [EmailAddress(ErrorMessage = "Enter a valid email address.")]
    public string? Email { get; init; }

    [StringLength(50)]
    public string? Phone { get; init; }

    [StringLength(4000)]
    public string? Notes { get; init; }

    public DateOnly? LastContactedOn { get; init; }

    /// <summary>The client's local today: "last contacted" can't be later.</summary>
    public DateOnly Today { get; init; }

    /// <summary>Replaced as a whole on every save.</summary>
    public List<int> TagIds { get; init; } = [];
}
