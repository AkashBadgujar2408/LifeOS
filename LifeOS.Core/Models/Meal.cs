using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class Meal
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public DateOnly EatenOn { get; set; }

    public string MealType { get; set; } = null!;

    public string Description { get; set; } = null!;

    public int? Calories { get; set; }

    public decimal? ProteinG { get; set; }

    public decimal? CarbsG { get; set; }

    public decimal? FatG { get; set; }

    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual User User { get; set; } = null!;
}
