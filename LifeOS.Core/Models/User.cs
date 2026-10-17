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

    public string? TimeZone { get; set; }

    public string? BaseCurrency { get; set; }

    public virtual ICollection<Attachment> Attachments { get; set; } = new List<Attachment>();

    public virtual Chapter? Chapter { get; set; }

    public virtual ICollection<Decision> Decisions { get; set; } = new List<Decision>();

    public virtual ICollection<DocumentFile> DocumentFiles { get; set; } = new List<DocumentFile>();

    public virtual ICollection<DocumentTag> DocumentTags { get; set; } = new List<DocumentTag>();

    public virtual ICollection<Document> Documents { get; set; } = new List<Document>();

    public virtual ICollection<EntityLink> EntityLinks { get; set; } = new List<EntityLink>();

    public virtual ICollection<EventException> EventExceptions { get; set; } = new List<EventException>();

    public virtual ICollection<Event> Events { get; set; } = new List<Event>();

    public virtual ICollection<FocusSession> FocusSessions { get; set; } = new List<FocusSession>();

    public virtual ICollection<GoalHistory> GoalHistories { get; set; } = new List<GoalHistory>();

    public virtual ICollection<GoalMilestone> GoalMilestones { get; set; } = new List<GoalMilestone>();

    public virtual ICollection<GoalTag> GoalTags { get; set; } = new List<GoalTag>();

    public virtual ICollection<Goal> Goals { get; set; } = new List<Goal>();

    public virtual ICollection<HabitChallenge> HabitChallenges { get; set; } = new List<HabitChallenge>();

    public virtual ICollection<HabitEntry> HabitEntries { get; set; } = new List<HabitEntry>();

    public virtual ICollection<HabitTag> HabitTags { get; set; } = new List<HabitTag>();

    public virtual ICollection<Habit> Habits { get; set; } = new List<Habit>();

    public virtual ICollection<InboxItem> InboxItems { get; set; } = new List<InboxItem>();

    public virtual ICollection<JournalEntry> JournalEntries { get; set; } = new List<JournalEntry>();

    public virtual ICollection<JournalEntryTag> JournalEntryTags { get; set; } = new List<JournalEntryTag>();

    public virtual ICollection<JournalNote> JournalNotes { get; set; } = new List<JournalNote>();

    public virtual ICollection<LifeAreaRating> LifeAreaRatings { get; set; } = new List<LifeAreaRating>();

    public virtual ICollection<MissionDebrief> MissionDebriefs { get; set; } = new List<MissionDebrief>();

    public virtual ICollection<MissionPrerequisite> MissionPrerequisites { get; set; } = new List<MissionPrerequisite>();

    public virtual ICollection<MonthlyReflection> MonthlyReflections { get; set; } = new List<MonthlyReflection>();

    public virtual ICollection<Project> Projects { get; set; } = new List<Project>();

    public virtual ICollection<RecoveryCode> RecoveryCodes { get; set; } = new List<RecoveryCode>();

    public virtual ICollection<Reminder> Reminders { get; set; } = new List<Reminder>();

    public virtual ICollection<RoutineHabit> RoutineHabits { get; set; } = new List<RoutineHabit>();

    public virtual ICollection<Routine> Routines { get; set; } = new List<Routine>();

    public virtual ICollection<Tag> Tags { get; set; } = new List<Tag>();

    public virtual ICollection<TaskDependency> TaskDependencies { get; set; } = new List<TaskDependency>();

    public virtual ICollection<TaskItem> TaskItems { get; set; } = new List<TaskItem>();

    public virtual ICollection<TaskTag> TaskTags { get; set; } = new List<TaskTag>();

    public virtual ICollection<UserHiddenLifeArea> UserHiddenLifeAreas { get; set; } = new List<UserHiddenLifeArea>();

    public virtual ICollection<UserHiddenModule> UserHiddenModules { get; set; } = new List<UserHiddenModule>();

    public virtual ICollection<VaultAccessLog> VaultAccessLogs { get; set; } = new List<VaultAccessLog>();

    public virtual ICollection<WeeklyReflection> WeeklyReflections { get; set; } = new List<WeeklyReflection>();
}
