using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class Narration
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public string Scope { get; set; } = null!;

    public int? Year { get; set; }

    public string Text { get; set; } = null!;

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual User User { get; set; } = null!;
}
