using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class MedicalCondition
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public string Kind { get; set; } = null!;

    public string Name { get; set; } = null!;

    public string? Severity { get; set; }

    public DateOnly? StartedOn { get; set; }

    public DateOnly? EndedOn { get; set; }

    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual ICollection<DoctorVisit> DoctorVisits { get; set; } = new List<DoctorVisit>();

    public virtual ICollection<Medication> Medications { get; set; } = new List<Medication>();

    public virtual User User { get; set; } = null!;
}
