using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class User
{
    public int Id { get; set; }

    public string Email { get; set; } = null!;

    public string PasswordHash { get; set; } = null!;

    public string DisplayName { get; set; } = null!;

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public string Username { get; set; } = null!;

    public virtual ICollection<EntityLink> EntityLinks { get; set; } = new List<EntityLink>();

    public virtual ICollection<Event> Events { get; set; } = new List<Event>();

    public virtual ICollection<GoalHistory> GoalHistories { get; set; } = new List<GoalHistory>();

    public virtual ICollection<GoalMilestone> GoalMilestones { get; set; } = new List<GoalMilestone>();

    public virtual ICollection<GoalTag> GoalTags { get; set; } = new List<GoalTag>();

    public virtual ICollection<Goal> Goals { get; set; } = new List<Goal>();

    public virtual ICollection<HabitEntry> HabitEntries { get; set; } = new List<HabitEntry>();

    public virtual ICollection<Habit> Habits { get; set; } = new List<Habit>();

    public virtual ICollection<InboxItem> InboxItems { get; set; } = new List<InboxItem>();

    public virtual ICollection<JournalEntry> JournalEntries { get; set; } = new List<JournalEntry>();

    public virtual ICollection<Project> Projects { get; set; } = new List<Project>();

    public virtual ICollection<Reminder> Reminders { get; set; } = new List<Reminder>();

    public virtual ICollection<Tag> Tags { get; set; } = new List<Tag>();

    public virtual ICollection<TaskItem> TaskItems { get; set; } = new List<TaskItem>();

    public virtual ICollection<TaskTag> TaskTags { get; set; } = new List<TaskTag>();

    public virtual ICollection<WeeklyReflection> WeeklyReflections { get; set; } = new List<WeeklyReflection>();
}
