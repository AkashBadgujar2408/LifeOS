using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class CareerAchievement
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public int? EmploymentId { get; set; }

    public string Kind { get; set; } = null!;

    public string Title { get; set; } = null!;

    public DateOnly AchievedOn { get; set; }

    public string? Description { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual Employment? Employment { get; set; }

    public virtual User User { get; set; } = null!;
}
