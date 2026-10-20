using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class Subscription
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public string Name { get; set; } = null!;

    public string? Provider { get; set; }

    public decimal Amount { get; set; }

    public string Currency { get; set; } = null!;

    public string RecurrenceFrequency { get; set; } = null!;

    public int RecurrenceInterval { get; set; }

    public DateOnly StartedOn { get; set; }

    public string Status { get; set; } = null!;

    public DateOnly? CancelledOn { get; set; }

    public DateOnly? CancelBy { get; set; }

    public int? AccountId { get; set; }

    public int? RecurringTransactionId { get; set; }

    public int? ReminderDays { get; set; }

    public int? ReminderId { get; set; }

    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual Account? Account { get; set; }

    public virtual RecurringTransaction? RecurringTransaction { get; set; }

    public virtual Reminder? Reminder { get; set; }

    public virtual User User { get; set; } = null!;
}
