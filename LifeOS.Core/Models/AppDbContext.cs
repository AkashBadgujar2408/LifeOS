using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Models;

public partial class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options)
        : base(options)
    {
    }

    public virtual DbSet<Chapter> Chapters { get; set; }

    public virtual DbSet<EntityLink> EntityLinks { get; set; }

    public virtual DbSet<Event> Events { get; set; }

    public virtual DbSet<Goal> Goals { get; set; }

    public virtual DbSet<GoalHistory> GoalHistories { get; set; }

    public virtual DbSet<GoalMilestone> GoalMilestones { get; set; }

    public virtual DbSet<GoalTag> GoalTags { get; set; }

    public virtual DbSet<Habit> Habits { get; set; }

    public virtual DbSet<HabitEntry> HabitEntries { get; set; }

    public virtual DbSet<InboxItem> InboxItems { get; set; }

    public virtual DbSet<JournalEntry> JournalEntries { get; set; }

    public virtual DbSet<LifeArea> LifeAreas { get; set; }

    public virtual DbSet<LifeAreaRating> LifeAreaRatings { get; set; }

    public virtual DbSet<MissionDebrief> MissionDebriefs { get; set; }

    public virtual DbSet<MissionPrerequisite> MissionPrerequisites { get; set; }

    public virtual DbSet<Project> Projects { get; set; }

    public virtual DbSet<Reminder> Reminders { get; set; }

    public virtual DbSet<Tag> Tags { get; set; }

    public virtual DbSet<TaskItem> TaskItems { get; set; }

    public virtual DbSet<TaskTag> TaskTags { get; set; }

    public virtual DbSet<User> Users { get; set; }

    public virtual DbSet<WeeklyReflection> WeeklyReflections { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Chapter>(entity =>
        {
            entity.ToTable("Chapters", "story");

            entity.HasIndex(e => e.UserId, "UX_Chapters_User_Open")
                .IsUnique()
                .HasFilter("([EndDate] IS NULL AND [IsDeleted]=(0))");

            entity.HasIndex(e => new { e.UserId, e.StartDate }, "UX_Chapters_User_Start")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_Chapters_CreatedAt");
            entity.Property(e => e.Title).HasMaxLength(200);

            entity.HasOne(d => d.User).WithOne(p => p.Chapter)
                .HasForeignKey<Chapter>(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Chapters_Users");
        });

        modelBuilder.Entity<EntityLink>(entity =>
        {
            entity.ToTable("EntityLinks", "shared");

            entity.HasIndex(e => new { e.UserId, e.SourceEntityType, e.SourceEntityId }, "IX_EntityLinks_Source").HasFilter("([IsDeleted]=(0))");

            entity.HasIndex(e => new { e.UserId, e.TargetEntityType, e.TargetEntityId }, "IX_EntityLinks_Target").HasFilter("([IsDeleted]=(0))");

            entity.HasIndex(e => new { e.UserId, e.SourceEntityType, e.SourceEntityId, e.TargetEntityType, e.TargetEntityId }, "UX_EntityLinks_Pair")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_EntityLinks_CreatedAt");
            entity.Property(e => e.SourceEntityType).HasMaxLength(100);
            entity.Property(e => e.TargetEntityType).HasMaxLength(100);

            entity.HasOne(d => d.User).WithMany(p => p.EntityLinks)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_EntityLinks_Users");
        });

        modelBuilder.Entity<Event>(entity =>
        {
            entity.ToTable("Events", "calendar");

            entity.HasIndex(e => new { e.UserId, e.StartDate }, "IX_Events_User_StartDate").HasFilter("([IsDeleted]=(0) AND [IsAllDay]=(1))");

            entity.HasIndex(e => new { e.UserId, e.StartsAt }, "IX_Events_User_StartsAt").HasFilter("([IsDeleted]=(0) AND [IsAllDay]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_Events_CreatedAt");
            entity.Property(e => e.Location).HasMaxLength(200);
            entity.Property(e => e.Title).HasMaxLength(200);

            entity.HasOne(d => d.User).WithMany(p => p.Events)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Events_Users");
        });

        modelBuilder.Entity<Goal>(entity =>
        {
            entity.ToTable("Goals", "goals");

            entity.HasIndex(e => e.LifeAreaId, "IX_Goals_LifeAreaId").HasFilter("([IsDeleted]=(0))");

            entity.HasIndex(e => new { e.UserId, e.Status }, "IX_Goals_User_Status").HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_Goals_CreatedAt");
            entity.Property(e => e.GoalType).HasMaxLength(20);
            entity.Property(e => e.Status)
                .HasMaxLength(20)
                .HasDefaultValue("Active", "DF_Goals_Status");
            entity.Property(e => e.Title).HasMaxLength(200);

            entity.HasOne(d => d.LifeArea).WithMany(p => p.Goals)
                .HasForeignKey(d => d.LifeAreaId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Goals_LifeAreas");

            entity.HasOne(d => d.User).WithMany(p => p.Goals)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Goals_Users");
        });

        modelBuilder.Entity<GoalHistory>(entity =>
        {
            entity.ToTable("GoalHistory", "goals");

            entity.HasIndex(e => new { e.GoalId, e.CreatedAt }, "IX_GoalHistory_Goal").HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.ChangedFields).HasMaxLength(200);
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_GoalHistory_CreatedAt");
            entity.Property(e => e.EventType).HasMaxLength(20);
            entity.Property(e => e.FromStatus).HasMaxLength(20);
            entity.Property(e => e.Note).HasMaxLength(1000);
            entity.Property(e => e.ToStatus).HasMaxLength(20);

            entity.HasOne(d => d.Goal).WithMany(p => p.GoalHistories)
                .HasForeignKey(d => d.GoalId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_GoalHistory_Goals");

            entity.HasOne(d => d.User).WithMany(p => p.GoalHistories)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_GoalHistory_Users");
        });

        modelBuilder.Entity<GoalMilestone>(entity =>
        {
            entity.ToTable("GoalMilestones", "goals");

            entity.HasIndex(e => new { e.GoalId, e.SortOrder }, "IX_GoalMilestones_Goal").HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_GoalMilestones_CreatedAt");
            entity.Property(e => e.Title).HasMaxLength(200);

            entity.HasOne(d => d.Goal).WithMany(p => p.GoalMilestones)
                .HasForeignKey(d => d.GoalId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_GoalMilestones_Goals");

            entity.HasOne(d => d.User).WithMany(p => p.GoalMilestones)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_GoalMilestones_Users");
        });

        modelBuilder.Entity<GoalTag>(entity =>
        {
            entity.ToTable("GoalTags", "goals");

            entity.HasIndex(e => e.TagId, "IX_GoalTags_Tag").HasFilter("([IsDeleted]=(0))");

            entity.HasIndex(e => new { e.GoalId, e.TagId }, "UX_GoalTags_Goal_Tag")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_GoalTags_CreatedAt");

            entity.HasOne(d => d.Goal).WithMany(p => p.GoalTags)
                .HasForeignKey(d => d.GoalId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_GoalTags_Goals");

            entity.HasOne(d => d.Tag).WithMany(p => p.GoalTags)
                .HasForeignKey(d => d.TagId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_GoalTags_Tags");

            entity.HasOne(d => d.User).WithMany(p => p.GoalTags)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_GoalTags_Users");
        });

        modelBuilder.Entity<Habit>(entity =>
        {
            entity.ToTable("Habits", "habits");

            entity.HasIndex(e => e.LifeAreaId, "IX_Habits_LifeAreaId").HasFilter("([IsDeleted]=(0))");

            entity.HasIndex(e => new { e.UserId, e.Title }, "UX_Habits_User_Title")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_Habits_CreatedAt");
            entity.Property(e => e.ScheduleDays).HasDefaultValue((byte)127, "DF_Habits_ScheduleDays");
            entity.Property(e => e.Status)
                .HasMaxLength(20)
                .HasDefaultValue("Active", "DF_Habits_Status");
            entity.Property(e => e.Title).HasMaxLength(200);

            entity.HasOne(d => d.LifeArea).WithMany(p => p.Habits)
                .HasForeignKey(d => d.LifeAreaId)
                .HasConstraintName("FK_Habits_LifeAreas");

            entity.HasOne(d => d.User).WithMany(p => p.Habits)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Habits_Users");
        });

        modelBuilder.Entity<HabitEntry>(entity =>
        {
            entity.ToTable("HabitEntries", "habits");

            entity.HasIndex(e => new { e.UserId, e.EntryDate }, "IX_HabitEntries_User_Date").HasFilter("([IsDeleted]=(0))");

            entity.HasIndex(e => new { e.HabitId, e.EntryDate }, "UX_HabitEntries_Habit_Date")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_HabitEntries_CreatedAt");

            entity.HasOne(d => d.Habit).WithMany(p => p.HabitEntries)
                .HasForeignKey(d => d.HabitId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_HabitEntries_Habits");

            entity.HasOne(d => d.User).WithMany(p => p.HabitEntries)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_HabitEntries_Users");
        });

        modelBuilder.Entity<InboxItem>(entity =>
        {
            entity.ToTable("InboxItems", "shared");

            entity.HasIndex(e => new { e.UserId, e.Kind, e.ProcessedAt }, "IX_InboxItems_User_Kind").HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_InboxItems_CreatedAt");
            entity.Property(e => e.Kind).HasMaxLength(20);
            entity.Property(e => e.Title).HasMaxLength(300);

            entity.HasOne(d => d.User).WithMany(p => p.InboxItems)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_InboxItems_Users");
        });

        modelBuilder.Entity<JournalEntry>(entity =>
        {
            entity.ToTable("JournalEntries", "journal");

            entity.HasIndex(e => e.LifeAreaId, "IX_JournalEntries_LifeAreaId").HasFilter("([IsDeleted]=(0))");

            entity.HasIndex(e => new { e.UserId, e.EntryDate }, "UX_JournalEntries_User_Date")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_JournalEntries_CreatedAt");
            entity.Property(e => e.Title).HasMaxLength(200);

            entity.HasOne(d => d.LifeArea).WithMany(p => p.JournalEntries)
                .HasForeignKey(d => d.LifeAreaId)
                .HasConstraintName("FK_JournalEntries_LifeAreas");

            entity.HasOne(d => d.User).WithMany(p => p.JournalEntries)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_JournalEntries_Users");
        });

        modelBuilder.Entity<LifeArea>(entity =>
        {
            entity.ToTable("LifeAreas", "shared");

            entity.HasIndex(e => e.Name, "UX_LifeAreas_Name")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_LifeAreas_CreatedAt");
            entity.Property(e => e.Name).HasMaxLength(100);
        });

        modelBuilder.Entity<LifeAreaRating>(entity =>
        {
            entity.ToTable("LifeAreaRatings", "story");

            entity.HasIndex(e => new { e.UserId, e.MonthStart }, "IX_LifeAreaRatings_User_Month").HasFilter("([IsDeleted]=(0))");

            entity.HasIndex(e => new { e.UserId, e.LifeAreaId, e.MonthStart }, "UX_LifeAreaRatings_User_Area_Month")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_LifeAreaRatings_CreatedAt");
            entity.Property(e => e.Note).HasMaxLength(500);

            entity.HasOne(d => d.LifeArea).WithMany(p => p.LifeAreaRatings)
                .HasForeignKey(d => d.LifeAreaId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_LifeAreaRatings_LifeAreas");

            entity.HasOne(d => d.User).WithMany(p => p.LifeAreaRatings)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_LifeAreaRatings_Users");
        });

        modelBuilder.Entity<MissionDebrief>(entity =>
        {
            entity.ToTable("MissionDebriefs", "story");

            entity.HasIndex(e => e.GoalId, "UX_MissionDebriefs_Goal")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_MissionDebriefs_CreatedAt");

            entity.HasOne(d => d.Goal).WithOne(p => p.MissionDebrief)
                .HasForeignKey<MissionDebrief>(d => d.GoalId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_MissionDebriefs_Goals");

            entity.HasOne(d => d.User).WithMany(p => p.MissionDebriefs)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_MissionDebriefs_Users");
        });

        modelBuilder.Entity<MissionPrerequisite>(entity =>
        {
            entity.ToTable("MissionPrerequisites", "story");

            entity.HasIndex(e => e.RequiresGoalId, "IX_MissionPrerequisites_Requires").HasFilter("([IsDeleted]=(0))");

            entity.HasIndex(e => new { e.GoalId, e.RequiresGoalId }, "UX_MissionPrerequisites_Pair")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_MissionPrerequisites_CreatedAt");

            entity.HasOne(d => d.Goal).WithMany(p => p.MissionPrerequisiteGoals)
                .HasForeignKey(d => d.GoalId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_MissionPrerequisites_Goal");

            entity.HasOne(d => d.RequiresGoal).WithMany(p => p.MissionPrerequisiteRequiresGoals)
                .HasForeignKey(d => d.RequiresGoalId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_MissionPrerequisites_RequiresGoal");

            entity.HasOne(d => d.User).WithMany(p => p.MissionPrerequisites)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_MissionPrerequisites_Users");
        });

        modelBuilder.Entity<Project>(entity =>
        {
            entity.ToTable("Projects", "tasks");

            entity.HasIndex(e => new { e.UserId, e.Name }, "UX_Projects_User_Name")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_Projects_CreatedAt");
            entity.Property(e => e.Name).HasMaxLength(200);
            entity.Property(e => e.Status)
                .HasMaxLength(20)
                .HasDefaultValue("Active", "DF_Projects_Status");

            entity.HasOne(d => d.User).WithMany(p => p.Projects)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Projects_Users");
        });

        modelBuilder.Entity<Reminder>(entity =>
        {
            entity.ToTable("Reminders", "calendar");

            entity.HasIndex(e => new { e.EntityType, e.EntityId }, "IX_Reminders_Entity").HasFilter("([IsDeleted]=(0) AND [EntityType] IS NOT NULL)");

            entity.HasIndex(e => new { e.UserId, e.RemindAt }, "IX_Reminders_User_Due").HasFilter("([IsDeleted]=(0) AND [DismissedAt] IS NULL)");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_Reminders_CreatedAt");
            entity.Property(e => e.EntityType).HasMaxLength(50);
            entity.Property(e => e.Title).HasMaxLength(200);

            entity.HasOne(d => d.User).WithMany(p => p.Reminders)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Reminders_Users");
        });

        modelBuilder.Entity<Tag>(entity =>
        {
            entity.ToTable("Tags", "shared");

            entity.HasIndex(e => new { e.UserId, e.Name }, "UX_Tags_UserId_Name")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_Tags_CreatedAt");
            entity.Property(e => e.Name).HasMaxLength(100);

            entity.HasOne(d => d.User).WithMany(p => p.Tags)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Tags_Users");
        });

        modelBuilder.Entity<TaskItem>(entity =>
        {
            entity.ToTable("TaskItems", "tasks");

            entity.HasIndex(e => e.ProjectId, "IX_TaskItems_ProjectId").HasFilter("([IsDeleted]=(0))");

            entity.HasIndex(e => new { e.UserId, e.Status, e.DueDate }, "IX_TaskItems_User_Status_DueDate").HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_TaskItems_CreatedAt");
            entity.Property(e => e.Priority)
                .HasMaxLength(10)
                .HasDefaultValue("None", "DF_TaskItems_Priority");
            entity.Property(e => e.RecurrenceFrequency).HasMaxLength(10);
            entity.Property(e => e.Status)
                .HasMaxLength(10)
                .HasDefaultValue("Open", "DF_TaskItems_Status");
            entity.Property(e => e.Title).HasMaxLength(300);

            entity.HasOne(d => d.NextOccurrenceTask).WithMany(p => p.InverseNextOccurrenceTask)
                .HasForeignKey(d => d.NextOccurrenceTaskId)
                .HasConstraintName("FK_TaskItems_NextOccurrence");

            entity.HasOne(d => d.Project).WithMany(p => p.TaskItems)
                .HasForeignKey(d => d.ProjectId)
                .HasConstraintName("FK_TaskItems_Projects");

            entity.HasOne(d => d.User).WithMany(p => p.TaskItems)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_TaskItems_Users");
        });

        modelBuilder.Entity<TaskTag>(entity =>
        {
            entity.ToTable("TaskTags", "tasks");

            entity.HasIndex(e => e.TagId, "IX_TaskTags_Tag").HasFilter("([IsDeleted]=(0))");

            entity.HasIndex(e => new { e.TaskItemId, e.TagId }, "UX_TaskTags_TaskItem_Tag")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_TaskTags_CreatedAt");

            entity.HasOne(d => d.Tag).WithMany(p => p.TaskTags)
                .HasForeignKey(d => d.TagId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_TaskTags_Tags");

            entity.HasOne(d => d.TaskItem).WithMany(p => p.TaskTags)
                .HasForeignKey(d => d.TaskItemId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_TaskTags_TaskItems");

            entity.HasOne(d => d.User).WithMany(p => p.TaskTags)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_TaskTags_Users");
        });

        modelBuilder.Entity<User>(entity =>
        {
            entity.ToTable("Users", "shared");

            entity.HasIndex(e => e.Email, "UX_Users_Email")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0))");

            entity.HasIndex(e => e.Username, "UX_Users_Username")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_Users_CreatedAt");
            entity.Property(e => e.DisplayName).HasMaxLength(200);
            entity.Property(e => e.Email).HasMaxLength(256);
            entity.Property(e => e.PasswordHash).HasMaxLength(500);
            entity.Property(e => e.Username).HasMaxLength(100);
        });

        modelBuilder.Entity<WeeklyReflection>(entity =>
        {
            entity.ToTable("WeeklyReflections", "journal");

            entity.HasIndex(e => new { e.UserId, e.WeekStartDate }, "UX_WeeklyReflections_User_Week")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_WeeklyReflections_CreatedAt");

            entity.HasOne(d => d.User).WithMany(p => p.WeeklyReflections)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_WeeklyReflections_Users");
        });

        OnModelCreatingPartial(modelBuilder);
    }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);
}
