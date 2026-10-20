using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class Responsibility
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public string Title { get; set; } = null!;

    public int? ContactId { get; set; }

    public string HeldBy { get; set; } = null!;

    public int? HolderContactId { get; set; }

    public int? TaskItemId { get; set; }

    public DateOnly? StartedOn { get; set; }

    public DateOnly? EndedOn { get; set; }

    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual Contact? Contact { get; set; }

    public virtual Contact? HolderContact { get; set; }

    public virtual TaskItem? TaskItem { get; set; }

    public virtual User User { get; set; } = null!;
}
