using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class DoctorVisit
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public string Reason { get; set; } = null!;

    public DateOnly VisitOn { get; set; }

    public int? ContactId { get; set; }

    public string? Specialty { get; set; }

    public string? Place { get; set; }

    public int? ConditionId { get; set; }

    public int? EventId { get; set; }

    public DateOnly? FollowUpOn { get; set; }

    public int? FollowUpReminderId { get; set; }

    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual MedicalCondition? Condition { get; set; }

    public virtual Contact? Contact { get; set; }

    public virtual Event? Event { get; set; }

    public virtual Reminder? FollowUpReminder { get; set; }

    public virtual ICollection<LabResult> LabResults { get; set; } = new List<LabResult>();

    public virtual ICollection<Medication> Medications { get; set; } = new List<Medication>();

    public virtual User User { get; set; } = null!;
}
