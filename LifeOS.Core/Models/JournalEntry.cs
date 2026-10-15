using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class JournalEntry
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public int? LifeAreaId { get; set; }

    public DateOnly EntryDate { get; set; }

    public string? Title { get; set; }

    public string? Content { get; set; }

    public byte? Mood { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual LifeArea? LifeArea { get; set; }

    public virtual User User { get; set; } = null!;
}
