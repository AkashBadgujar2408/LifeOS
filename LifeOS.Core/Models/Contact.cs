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

    public virtual ICollection<GiftIdea> GiftIdeas { get; set; } = new List<GiftIdea>();

    public virtual ICollection<InsurancePolicy> InsurancePolicies { get; set; } = new List<InsurancePolicy>();

    public virtual ICollection<InteractionPerson> InteractionPeople { get; set; } = new List<InteractionPerson>();

    public virtual ICollection<JobApplication> JobApplications { get; set; } = new List<JobApplication>();

    public virtual KeepInTouch? KeepInTouch { get; set; }

    public virtual ICollection<Loan> Loans { get; set; } = new List<Loan>();

    public virtual ICollection<MaintenanceTask> MaintenanceTasks { get; set; } = new List<MaintenanceTask>();

    public virtual ICollection<Relationship> RelationshipPersonContacts { get; set; } = new List<Relationship>();

    public virtual ICollection<Relationship> RelationshipRelativeContacts { get; set; } = new List<Relationship>();

    public virtual ICollection<Responsibility> ResponsibilityContacts { get; set; } = new List<Responsibility>();

    public virtual ICollection<Responsibility> ResponsibilityHolderContacts { get; set; } = new List<Responsibility>();

    public virtual ICollection<SignificantDate> SignificantDateContacts { get; set; } = new List<SignificantDate>();

    public virtual ICollection<SignificantDate> SignificantDateOtherContacts { get; set; } = new List<SignificantDate>();

    public virtual User User { get; set; } = null!;

    public virtual ICollection<Warranty> Warranties { get; set; } = new List<Warranty>();
}
