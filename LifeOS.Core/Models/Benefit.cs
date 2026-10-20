using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class Benefit
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public string Kind { get; set; } = null!;

    public string Name { get; set; } = null!;

    public string? Store { get; set; }

    public decimal? Value { get; set; }

    public string? Currency { get; set; }

    public decimal? DiscountPercent { get; set; }

    public decimal? MinSpend { get; set; }

    public decimal? ValuePerPoint { get; set; }

    public string? CodeSecret { get; set; }

    public string? PinSecret { get; set; }

    public DateOnly? ExpiresOn { get; set; }

    public int? ReminderDays { get; set; }

    public int? ReminderId { get; set; }

    public int? PurchaseId { get; set; }

    public int? AccountId { get; set; }

    public DateOnly? ExpectedBy { get; set; }

    public DateOnly? ReceivedOn { get; set; }

    public int? TransactionId { get; set; }

    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual Account? Account { get; set; }

    public virtual ICollection<BenefitRedemption> BenefitRedemptions { get; set; } = new List<BenefitRedemption>();

    public virtual ICollection<PointBatch> PointBatches { get; set; } = new List<PointBatch>();

    public virtual Purchase? Purchase { get; set; }

    public virtual Reminder? Reminder { get; set; }

    public virtual Transaction? Transaction { get; set; }

    public virtual User User { get; set; } = null!;
}
