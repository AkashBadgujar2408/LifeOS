using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class JournalNote
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public DateOnly EntryDate { get; set; }

    public string Kind { get; set; } = null!;

    public string Text { get; set; } = null!;

    public int SortOrder { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual User User { get; set; } = null!;
}
