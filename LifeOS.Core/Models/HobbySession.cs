using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class HobbySession
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public int HobbyId { get; set; }

    public DateOnly PracticedOn { get; set; }

    public int Minutes { get; set; }

    public DateTime? StartedAt { get; set; }

    public string? Note { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual Hobby Hobby { get; set; } = null!;

    public virtual User User { get; set; } = null!;
}
