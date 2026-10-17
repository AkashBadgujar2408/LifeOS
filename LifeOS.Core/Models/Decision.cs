using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class Decision
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public DateOnly DecidedOn { get; set; }

    public string Title { get; set; } = null!;

    public string? Reasons { get; set; }

    public string? ExpectedOutcome { get; set; }

    public DateOnly? ReviewOn { get; set; }

    public int? ReviewReminderId { get; set; }

    public string? ActualOutcome { get; set; }

    public string? Verdict { get; set; }

    public DateOnly? ReviewedOn { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual Reminder? ReviewReminder { get; set; }

    public virtual User User { get; set; } = null!;
}
