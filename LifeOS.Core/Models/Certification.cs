using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class Certification
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public int? SkillId { get; set; }

    public int? CourseId { get; set; }

    public string Name { get; set; } = null!;

    public string? Issuer { get; set; }

    public string? CredentialId { get; set; }

    public string? Url { get; set; }

    public DateOnly IssuedOn { get; set; }

    public DateOnly? ExpiresOn { get; set; }

    public int? RenewalReminderDays { get; set; }

    public int? RenewalReminderId { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual Course? Course { get; set; }

    public virtual Reminder? RenewalReminder { get; set; }

    public virtual Skill? Skill { get; set; }

    public virtual User User { get; set; } = null!;
}
