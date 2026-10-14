using System.ComponentModel.DataAnnotations;

namespace LifeOS.Core.Shared.DTOs;

public class InboxItemDto
{
    public int Id { get; init; }
    public string Kind { get; init; } = string.Empty;
    public string Title { get; init; } = string.Empty;
    public string? Notes { get; init; }
    public DateTime CreatedAt { get; init; }
    public DateTime? ProcessedAt { get; init; }
}

public class CreateInboxItemRequest
{
    [Required]
    [AllowedValues("Task", "Note", "Journal", "Idea", ErrorMessage = "Kind must be Task, Note, Journal or Idea.")]
    public string Kind { get; init; } = string.Empty;

    [Required]
    [StringLength(300)]
    public string Title { get; init; } = string.Empty;

    [StringLength(4000)]
    public string? Notes { get; init; }
}

public class SetInboxItemProcessedRequest
{
    public bool Processed { get; init; }
}
