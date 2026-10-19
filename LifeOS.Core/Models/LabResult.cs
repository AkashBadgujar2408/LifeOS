using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class LabResult
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public string TestName { get; set; } = null!;

    public DateOnly TakenOn { get; set; }

    public decimal? Value { get; set; }

    public string? ValueText { get; set; }

    public string? Unit { get; set; }

    public decimal? RangeLow { get; set; }

    public decimal? RangeHigh { get; set; }

    public string? Laboratory { get; set; }

    public int? VisitId { get; set; }

    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual User User { get; set; } = null!;

    public virtual DoctorVisit? Visit { get; set; }
}
