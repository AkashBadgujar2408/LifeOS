using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class Medication
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public string Name { get; set; } = null!;

    public string? Strength { get; set; }

    public DateOnly StartDate { get; set; }

    public DateOnly? EndDate { get; set; }

    public bool IsAsNeeded { get; set; }

    public int? ConditionId { get; set; }

    public int? PrescribedAtVisitId { get; set; }

    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual MedicalCondition? Condition { get; set; }

    public virtual ICollection<MedicationDose> MedicationDoses { get; set; } = new List<MedicationDose>();

    public virtual ICollection<MedicationSchedule> MedicationSchedules { get; set; } = new List<MedicationSchedule>();

    public virtual DoctorVisit? PrescribedAtVisit { get; set; }

    public virtual User User { get; set; } = null!;
}
