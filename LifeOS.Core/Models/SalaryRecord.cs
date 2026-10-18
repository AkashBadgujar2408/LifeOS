using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class SalaryRecord
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public int? EmploymentId { get; set; }

    public DateOnly EffectiveOn { get; set; }

    public decimal Amount { get; set; }

    public string Currency { get; set; } = null!;

    public string Period { get; set; } = null!;

    public string Reason { get; set; } = null!;

    public string? Note { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual Employment? Employment { get; set; }

    public virtual User User { get; set; } = null!;
}
