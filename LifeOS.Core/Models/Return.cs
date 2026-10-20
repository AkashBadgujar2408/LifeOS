using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class Return
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public int PurchaseId { get; set; }

    public string? Reason { get; set; }

    public DateOnly? ReturnBy { get; set; }

    public DateOnly? ReturnedOn { get; set; }

    public decimal? RefundAmount { get; set; }

    public DateOnly? RefundedOn { get; set; }

    public int? RefundTransactionId { get; set; }

    public int? ReminderDays { get; set; }

    public int? ReminderId { get; set; }

    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual Purchase Purchase { get; set; } = null!;

    public virtual Transaction? RefundTransaction { get; set; }

    public virtual Reminder? Reminder { get; set; }

    public virtual User User { get; set; } = null!;
}
