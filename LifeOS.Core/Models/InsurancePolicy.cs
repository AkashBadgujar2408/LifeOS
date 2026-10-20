using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class InsurancePolicy
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public string Name { get; set; } = null!;

    public string Kind { get; set; } = null!;

    public string? Insurer { get; set; }

    public string? PolicyNumberLast4 { get; set; }

    public string Currency { get; set; } = null!;

    public decimal? SumAssured { get; set; }

    public decimal? Premium { get; set; }

    public string? PremiumFrequency { get; set; }

    public DateOnly? StartDate { get; set; }

    public DateOnly? RenewsOn { get; set; }

    public DateOnly? EndsOn { get; set; }

    public int? ContactId { get; set; }

    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public int? RenewalReminderDays { get; set; }

    public int? RenewalReminderId { get; set; }

    public virtual Contact? Contact { get; set; }

    public virtual Reminder? RenewalReminder { get; set; }

    public virtual User User { get; set; } = null!;

    public virtual ICollection<Vehicle> Vehicles { get; set; } = new List<Vehicle>();
}
