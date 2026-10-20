using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class SignificantDate
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public int ContactId { get; set; }

    public int? OtherContactId { get; set; }

    public string Kind { get; set; } = null!;

    public string? Label { get; set; }

    public byte Month { get; set; }

    public byte Day { get; set; }

    public short? Year { get; set; }

    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual Contact Contact { get; set; } = null!;

    public virtual ICollection<GiftIdea> GiftIdeas { get; set; } = new List<GiftIdea>();

    public virtual Contact? OtherContact { get; set; }

    public virtual User User { get; set; } = null!;
}
