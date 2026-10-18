using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class Interview
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public int JobApplicationId { get; set; }

    public int? EventId { get; set; }

    public string Title { get; set; } = null!;

    public string? PrepNotes { get; set; }

    public string? ReviewNotes { get; set; }

    public string? Outcome { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual Event? Event { get; set; }

    public virtual JobApplication JobApplication { get; set; } = null!;

    public virtual User User { get; set; } = null!;
}
