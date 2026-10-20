using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class HouseholdProject
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public int ProjectId { get; set; }

    public int? PropertyId { get; set; }

    public decimal? Budget { get; set; }

    public string? Currency { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual Project Project { get; set; } = null!;

    public virtual Property? Property { get; set; }

    public virtual User User { get; set; } = null!;
}
