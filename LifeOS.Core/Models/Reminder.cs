using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class Reminder
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public string Title { get; set; } = null!;

    public string? Notes { get; set; }

    public DateTime RemindAt { get; set; }

    public DateTime? DismissedAt { get; set; }

    public string? EntityType { get; set; }

    public int? EntityId { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public string? RecurrenceFrequency { get; set; }

    public int? RecurrenceInterval { get; set; }

    public DateOnly? RecurrenceUntil { get; set; }

    public DateTime? RecurrenceAnchorAt { get; set; }

    public string? TimeZone { get; set; }

    public DateOnly? OccurrenceDate { get; set; }

    public virtual ICollection<Certification> Certifications { get; set; } = new List<Certification>();

    public virtual ICollection<Decision> Decisions { get; set; } = new List<Decision>();

    public virtual ICollection<Document> Documents { get; set; } = new List<Document>();

    public virtual User User { get; set; } = null!;
}
