using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class ApplicationStageChange
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public int JobApplicationId { get; set; }

    public string? FromStage { get; set; }

    public string ToStage { get; set; } = null!;

    public DateOnly ChangedOn { get; set; }

    public string? Note { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual JobApplication JobApplication { get; set; } = null!;

    public virtual User User { get; set; } = null!;
}
