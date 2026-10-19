using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class BodyMeasurement
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public string Kind { get; set; } = null!;

    public DateOnly MeasuredOn { get; set; }

    public decimal Value { get; set; }

    public decimal? Value2 { get; set; }

    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual User User { get; set; } = null!;
}
