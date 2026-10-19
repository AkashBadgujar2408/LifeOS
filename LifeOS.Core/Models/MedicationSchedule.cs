using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class MedicationSchedule
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public int MedicationId { get; set; }

    public TimeOnly TimeOfDay { get; set; }

    public byte ScheduleDays { get; set; }

    public string? Dose { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual Medication Medication { get; set; } = null!;

    public virtual ICollection<MedicationDose> MedicationDoses { get; set; } = new List<MedicationDose>();

    public virtual User User { get; set; } = null!;
}
