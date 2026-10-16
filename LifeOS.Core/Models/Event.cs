using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class Event
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public string Title { get; set; } = null!;

    public string? Notes { get; set; }

    public string? Location { get; set; }

    public bool IsAllDay { get; set; }

    public DateOnly? StartDate { get; set; }

    public DateOnly? EndDate { get; set; }

    public DateTime? StartsAt { get; set; }

    public DateTime? EndsAt { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public string? RecurrenceFrequency { get; set; }

    public int? RecurrenceInterval { get; set; }

    public DateOnly? RecurrenceUntil { get; set; }

    public string? TimeZone { get; set; }

    public int? ReminderMinutesBefore { get; set; }

    public virtual ICollection<EventException> EventExceptions { get; set; } = new List<EventException>();

    public virtual User User { get; set; } = null!;
}
