using System.ComponentModel.DataAnnotations;

namespace LifeOS.Core.Tasks.DTOs;

public static class ProjectStatuses
{
    public const string Active = "Active";
    public const string Completed = "Completed";
    public const string Archived = "Archived";
}

public class ProjectDto
{
    public int Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public string? Description { get; init; }
    public string Status { get; init; } = string.Empty;
    public int OpenTaskCount { get; init; }
    public int DoneTaskCount { get; init; }
    /// <summary>Earliest due date among the open tasks; null when none has one.</summary>
    public DateOnly? NextDueDate { get; init; }
    public DateTime CreatedAt { get; init; }
}

public class ProjectRequest
{
    [Required]
    [StringLength(200)]
    public string Name { get; init; } = string.Empty;

    [StringLength(4000)]
    public string? Description { get; init; }
}

public class SetProjectStatusRequest
{
    [Required]
    [AllowedValues(ProjectStatuses.Active, ProjectStatuses.Completed, ProjectStatuses.Archived,
        ErrorMessage = "Status must be Active, Completed or Archived.")]
    public string Status { get; init; } = string.Empty;
}
