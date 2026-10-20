using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class Project
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public string Name { get; set; } = null!;

    public string? Description { get; set; }

    public string Status { get; set; } = null!;

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual HouseholdProject? HouseholdProject { get; set; }

    public virtual ICollection<TaskItem> TaskItems { get; set; } = new List<TaskItem>();

    public virtual User User { get; set; } = null!;
}
