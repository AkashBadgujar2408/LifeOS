using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class TaxItem
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public string Title { get; set; } = null!;

    public string Kind { get; set; } = null!;

    public string? TaxYear { get; set; }

    public DateOnly? DueOn { get; set; }

    public decimal? Amount { get; set; }

    public string? Currency { get; set; }

    public bool IsDeductible { get; set; }

    public int? TransactionId { get; set; }

    public DateOnly? DoneOn { get; set; }

    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual Transaction? Transaction { get; set; }

    public virtual User User { get; set; } = null!;
}
