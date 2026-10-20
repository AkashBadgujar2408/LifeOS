using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class Interaction
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public DateOnly OccurredOn { get; set; }

    public string Kind { get; set; } = null!;

    public string? Summary { get; set; }

    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual ICollection<InteractionPerson> InteractionPeople { get; set; } = new List<InteractionPerson>();

    public virtual User User { get; set; } = null!;
}
