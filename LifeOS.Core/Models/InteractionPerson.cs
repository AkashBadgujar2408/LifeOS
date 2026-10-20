using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class InteractionPerson
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public int InteractionId { get; set; }

    public int ContactId { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual Contact Contact { get; set; } = null!;

    public virtual Interaction Interaction { get; set; } = null!;

    public virtual User User { get; set; } = null!;
}
