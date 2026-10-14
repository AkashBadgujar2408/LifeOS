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

    public virtual DbSet<EntityLink> EntityLinks { get; set; }

    public virtual DbSet<InboxItem> InboxItems { get; set; }

    public virtual DbSet<LifeArea> LifeAreas { get; set; }

    public virtual DbSet<Tag> Tags { get; set; }

    public virtual DbSet<User> Users { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
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

        modelBuilder.Entity<LifeArea>(entity =>
        {
            entity.ToTable("LifeAreas", "shared");

            entity.HasIndex(e => e.Name, "UX_LifeAreas_Name")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_LifeAreas_CreatedAt");
            entity.Property(e => e.Name).HasMaxLength(100);
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

        OnModelCreatingPartial(modelBuilder);
    }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);
}
