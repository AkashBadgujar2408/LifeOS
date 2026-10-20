using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class Relationship
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public int? PersonContactId { get; set; }

    public int? RelativeContactId { get; set; }

    public string Kind { get; set; } = null!;

    public string? Label { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual Contact? PersonContact { get; set; }

    public virtual Contact? RelativeContact { get; set; }

    public virtual User User { get; set; } = null!;
}
