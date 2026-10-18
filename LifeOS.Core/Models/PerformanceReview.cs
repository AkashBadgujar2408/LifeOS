using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class PerformanceReview
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public int? EmploymentId { get; set; }

    public DateOnly ReviewedOn { get; set; }

    public string? PeriodLabel { get; set; }

    public string? Rating { get; set; }

    public string? Strengths { get; set; }

    public string? Improvements { get; set; }

    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual Employment? Employment { get; set; }

    public virtual User User { get; set; } = null!;
}
