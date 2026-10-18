using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class LifeArea
{
    public int Id { get; set; }

    public string Name { get; set; } = null!;

    public int SortOrder { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual ICollection<Book> Books { get; set; } = new List<Book>();

    public virtual ICollection<Course> Courses { get; set; } = new List<Course>();

    public virtual ICollection<Event> Events { get; set; } = new List<Event>();

    public virtual ICollection<Goal> Goals { get; set; } = new List<Goal>();

    public virtual ICollection<Habit> Habits { get; set; } = new List<Habit>();

    public virtual ICollection<JournalEntry> JournalEntries { get; set; } = new List<JournalEntry>();

    public virtual ICollection<LifeAreaRating> LifeAreaRatings { get; set; } = new List<LifeAreaRating>();

    public virtual ICollection<Skill> Skills { get; set; } = new List<Skill>();

    public virtual ICollection<UserHiddenLifeArea> UserHiddenLifeAreas { get; set; } = new List<UserHiddenLifeArea>();
}
