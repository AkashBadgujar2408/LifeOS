namespace LifeOS.Core.Shared.DTOs;

/// <summary>A file attached to an item (goal, task, …), oldest first.</summary>
public class AttachmentDto
{
    public int Id { get; init; }
    public string EntityType { get; init; } = string.Empty;
    public int EntityId { get; init; }
    public string OriginalName { get; init; } = string.Empty;
    public string ContentType { get; init; } = string.Empty;
    public long SizeBytes { get; init; }
    public string Sha256 { get; init; } = string.Empty;
    public DateTime CreatedAt { get; init; }
}

public static class AttachmentErrors
{
    public const string NotFound = "Attachment not found.";
    public const string TargetNotFound = "The item these files belong to was not found.";
}
