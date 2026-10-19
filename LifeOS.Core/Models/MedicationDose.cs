using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class MedicationDose
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public int MedicationId { get; set; }

    public int? ScheduleId { get; set; }

    public DateOnly DoseDate { get; set; }

    public string Status { get; set; } = null!;

    public DateTime? TakenAt { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual Medication Medication { get; set; } = null!;

    public virtual MedicationSchedule? Schedule { get; set; }

    public virtual User User { get; set; } = null!;
}
