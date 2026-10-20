using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class PointBatch
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public int BenefitId { get; set; }

    public DateOnly EarnedOn { get; set; }

    public int Points { get; set; }

    public DateOnly? ExpiresOn { get; set; }

    public int? PurchaseId { get; set; }

    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual Benefit Benefit { get; set; } = null!;

    public virtual Purchase? Purchase { get; set; }

    public virtual User User { get; set; } = null!;
}
