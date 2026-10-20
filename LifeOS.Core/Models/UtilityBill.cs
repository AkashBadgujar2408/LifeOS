using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class UtilityBill
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public int? PropertyId { get; set; }

    public string Kind { get; set; } = null!;

    public string? Provider { get; set; }

    public DateOnly? PeriodStart { get; set; }

    public DateOnly? PeriodEnd { get; set; }

    public DateOnly DueOn { get; set; }

    public decimal Amount { get; set; }

    public string Currency { get; set; } = null!;

    public decimal? UnitsUsed { get; set; }

    public DateOnly? PaidOn { get; set; }

    public int? TransactionId { get; set; }

    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual Property? Property { get; set; }

    public virtual Transaction? Transaction { get; set; }

    public virtual User User { get; set; } = null!;
}
