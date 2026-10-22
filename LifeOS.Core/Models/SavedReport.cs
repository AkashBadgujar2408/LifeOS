using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class SavedReport
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public string Name { get; set; } = null!;

    public string Metric { get; set; } = null!;

    public int? LifeAreaId { get; set; }

    public int? TagId { get; set; }

    public string Grouping { get; set; } = null!;

    public string Compare { get; set; } = null!;

    public string? RangePreset { get; set; }

    public DateOnly? FromDate { get; set; }

    public DateOnly? ToDate { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual LifeArea? LifeArea { get; set; }

    public virtual Tag? Tag { get; set; }

    public virtual User User { get; set; } = null!;
}
