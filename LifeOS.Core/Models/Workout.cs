using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class Workout
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public string Kind { get; set; } = null!;

    public DateOnly OccurredOn { get; set; }

    public int Minutes { get; set; }

    public int? Steps { get; set; }

    public decimal? DistanceKm { get; set; }

    public int? Calories { get; set; }

    public string? Intensity { get; set; }

    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual User User { get; set; } = null!;
}
