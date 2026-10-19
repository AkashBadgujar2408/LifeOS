using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class Contact
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public string Name { get; set; } = null!;

    public string? Organisation { get; set; }

    public string? JobTitle { get; set; }

    public string? Email { get; set; }

    public string? Phone { get; set; }

    public string? Notes { get; set; }

    public DateOnly? LastContactedOn { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual ICollection<ContactTag> ContactTags { get; set; } = new List<ContactTag>();

    public virtual ICollection<DoctorVisit> DoctorVisits { get; set; } = new List<DoctorVisit>();

    public virtual ICollection<InsurancePolicy> InsurancePolicies { get; set; } = new List<InsurancePolicy>();

    public virtual ICollection<JobApplication> JobApplications { get; set; } = new List<JobApplication>();

    public virtual ICollection<Loan> Loans { get; set; } = new List<Loan>();

    public virtual User User { get; set; } = null!;
}
