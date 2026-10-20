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

    public virtual DbSet<Account> Accounts { get; set; }

    public virtual DbSet<AccountCurrency> AccountCurrencies { get; set; }

    public virtual DbSet<ApplicationStageChange> ApplicationStageChanges { get; set; }

    public virtual DbSet<Asset> Assets { get; set; }

    public virtual DbSet<AssetTag> AssetTags { get; set; }

    public virtual DbSet<Attachment> Attachments { get; set; }

    public virtual DbSet<Benefit> Benefits { get; set; }

    public virtual DbSet<BenefitRedemption> BenefitRedemptions { get; set; }

    public virtual DbSet<BodyMeasurement> BodyMeasurements { get; set; }

    public virtual DbSet<Book> Books { get; set; }

    public virtual DbSet<BookNote> BookNotes { get; set; }

    public virtual DbSet<BookTag> BookTags { get; set; }

    public virtual DbSet<Budget> Budgets { get; set; }

    public virtual DbSet<CareerAchievement> CareerAchievements { get; set; }

    public virtual DbSet<Certification> Certifications { get; set; }

    public virtual DbSet<Chapter> Chapters { get; set; }

    public virtual DbSet<Contact> Contacts { get; set; }

    public virtual DbSet<ContactTag> ContactTags { get; set; }

    public virtual DbSet<Course> Courses { get; set; }

    public virtual DbSet<Decision> Decisions { get; set; }

    public virtual DbSet<DismissedInsight> DismissedInsights { get; set; }

    public virtual DbSet<DoctorVisit> DoctorVisits { get; set; }

    public virtual DbSet<Document> Documents { get; set; }

    public virtual DbSet<DocumentFile> DocumentFiles { get; set; }

    public virtual DbSet<DocumentTag> DocumentTags { get; set; }

    public virtual DbSet<Employment> Employments { get; set; }

    public virtual DbSet<EntityLink> EntityLinks { get; set; }

    public virtual DbSet<Event> Events { get; set; }

    public virtual DbSet<EventException> EventExceptions { get; set; }

    public virtual DbSet<ExchangeRate> ExchangeRates { get; set; }

    public virtual DbSet<FocusSession> FocusSessions { get; set; }

    public virtual DbSet<FuelLog> FuelLogs { get; set; }

    public virtual DbSet<Goal> Goals { get; set; }

    public virtual DbSet<GoalHistory> GoalHistories { get; set; }

    public virtual DbSet<GoalMeasureEntry> GoalMeasureEntries { get; set; }

    public virtual DbSet<GoalMilestone> GoalMilestones { get; set; }

    public virtual DbSet<GoalSource> GoalSources { get; set; }

    public virtual DbSet<GoalTag> GoalTags { get; set; }

    public virtual DbSet<GoalTarget> GoalTargets { get; set; }

    public virtual DbSet<Habit> Habits { get; set; }

    public virtual DbSet<HabitChallenge> HabitChallenges { get; set; }

    public virtual DbSet<HabitEntry> HabitEntries { get; set; }

    public virtual DbSet<HabitTag> HabitTags { get; set; }

    public virtual DbSet<HealthProfile> HealthProfiles { get; set; }

    public virtual DbSet<Holding> Holdings { get; set; }

    public virtual DbSet<HoldingValuation> HoldingValuations { get; set; }

    public virtual DbSet<HouseholdProject> HouseholdProjects { get; set; }

    public virtual DbSet<InboxItem> InboxItems { get; set; }

    public virtual DbSet<InsurancePolicy> InsurancePolicies { get; set; }

    public virtual DbSet<Interview> Interviews { get; set; }

    public virtual DbSet<InterviewQuestion> InterviewQuestions { get; set; }

    public virtual DbSet<InterviewQuestionTag> InterviewQuestionTags { get; set; }

    public virtual DbSet<JobApplication> JobApplications { get; set; }

    public virtual DbSet<JournalEntry> JournalEntries { get; set; }

    public virtual DbSet<JournalEntryTag> JournalEntryTags { get; set; }

    public virtual DbSet<JournalNote> JournalNotes { get; set; }

    public virtual DbSet<KnowledgeNote> KnowledgeNotes { get; set; }

    public virtual DbSet<KnowledgeNoteTag> KnowledgeNoteTags { get; set; }

    public virtual DbSet<KpiTile> KpiTiles { get; set; }

    public virtual DbSet<LabResult> LabResults { get; set; }

    public virtual DbSet<LifeArea> LifeAreas { get; set; }

    public virtual DbSet<LifeAreaRating> LifeAreaRatings { get; set; }

    public virtual DbSet<Loan> Loans { get; set; }

    public virtual DbSet<MaintenanceLog> MaintenanceLogs { get; set; }

    public virtual DbSet<MaintenanceTask> MaintenanceTasks { get; set; }

    public virtual DbSet<Meal> Meals { get; set; }

    public virtual DbSet<MedicalCondition> MedicalConditions { get; set; }

    public virtual DbSet<Medication> Medications { get; set; }

    public virtual DbSet<MedicationDose> MedicationDoses { get; set; }

    public virtual DbSet<MedicationSchedule> MedicationSchedules { get; set; }

    public virtual DbSet<MissionDebrief> MissionDebriefs { get; set; }

    public virtual DbSet<MissionPrerequisite> MissionPrerequisites { get; set; }

    public virtual DbSet<MonthlyReflection> MonthlyReflections { get; set; }

    public virtual DbSet<PerformanceReview> PerformanceReviews { get; set; }

    public virtual DbSet<PlanAssumption> PlanAssumptions { get; set; }

    public virtual DbSet<PointBatch> PointBatches { get; set; }

    public virtual DbSet<Project> Projects { get; set; }

    public virtual DbSet<Property> Properties { get; set; }

    public virtual DbSet<Purchase> Purchases { get; set; }

    public virtual DbSet<PurchaseTag> PurchaseTags { get; set; }

    public virtual DbSet<RecoveryCode> RecoveryCodes { get; set; }

    public virtual DbSet<RecurringTransaction> RecurringTransactions { get; set; }

    public virtual DbSet<RecurringTransactionTag> RecurringTransactionTags { get; set; }

    public virtual DbSet<Reminder> Reminders { get; set; }

    public virtual DbSet<ResumeVersion> ResumeVersions { get; set; }

    public virtual DbSet<Return> Returns { get; set; }

    public virtual DbSet<Roadmap> Roadmaps { get; set; }

    public virtual DbSet<RoadmapStep> RoadmapSteps { get; set; }

    public virtual DbSet<Routine> Routines { get; set; }

    public virtual DbSet<RoutineHabit> RoutineHabits { get; set; }

    public virtual DbSet<SalaryRecord> SalaryRecords { get; set; }

    public virtual DbSet<Scenario> Scenarios { get; set; }

    public virtual DbSet<ScenarioLine> ScenarioLines { get; set; }

    public virtual DbSet<ShoppingList> ShoppingLists { get; set; }

    public virtual DbSet<ShoppingListItem> ShoppingListItems { get; set; }

    public virtual DbSet<SideIncomeSource> SideIncomeSources { get; set; }

    public virtual DbSet<Skill> Skills { get; set; }

    public virtual DbSet<SkillLevelChange> SkillLevelChanges { get; set; }

    public virtual DbSet<SkillTag> SkillTags { get; set; }

    public virtual DbSet<SleepRecord> SleepRecords { get; set; }

    public virtual DbSet<StudySession> StudySessions { get; set; }

    public virtual DbSet<Subscription> Subscriptions { get; set; }

    public virtual DbSet<Tag> Tags { get; set; }

    public virtual DbSet<TaskDependency> TaskDependencies { get; set; }

    public virtual DbSet<TaskItem> TaskItems { get; set; }

    public virtual DbSet<TaskTag> TaskTags { get; set; }

    public virtual DbSet<TaxItem> TaxItems { get; set; }

    public virtual DbSet<Transaction> Transactions { get; set; }

    public virtual DbSet<TransactionTag> TransactionTags { get; set; }

    public virtual DbSet<User> Users { get; set; }

    public virtual DbSet<UserHiddenLifeArea> UserHiddenLifeAreas { get; set; }

    public virtual DbSet<UserHiddenModule> UserHiddenModules { get; set; }

    public virtual DbSet<UtilityBill> UtilityBills { get; set; }

    public virtual DbSet<VaultAccessLog> VaultAccessLogs { get; set; }

    public virtual DbSet<Vehicle> Vehicles { get; set; }

    public virtual DbSet<Warranty> Warranties { get; set; }

    public virtual DbSet<WaterIntake> WaterIntakes { get; set; }

    public virtual DbSet<WeeklyReflection> WeeklyReflections { get; set; }

    public virtual DbSet<WellnessCheckIn> WellnessCheckIns { get; set; }

    public virtual DbSet<WishlistItem> WishlistItems { get; set; }

    public virtual DbSet<Workout> Workouts { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Account>(entity =>
        {
            entity.ToTable("Accounts", "finance");

            entity.HasIndex(e => new { e.UserId, e.Name }, "UX_Accounts_User_Name")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_Accounts_CreatedAt");
            entity.Property(e => e.Currency)
                .HasMaxLength(3)
                .IsUnicode(false)
                .IsFixedLength();
            entity.Property(e => e.ImportKey).HasDefaultValueSql("(newid())", "DF_Accounts_ImportKey");
            entity.Property(e => e.Institution).HasMaxLength(200);
            entity.Property(e => e.Kind).HasMaxLength(10);
            entity.Property(e => e.Name).HasMaxLength(200);
            entity.Property(e => e.Notes).HasMaxLength(2000);
            entity.Property(e => e.NumberLast4)
                .HasMaxLength(4)
                .IsUnicode(false)
                .IsFixedLength();
            entity.Property(e => e.OpeningBalance).HasColumnType("decimal(19, 4)");

            entity.HasOne(d => d.User).WithMany(p => p.Accounts)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Accounts_Users");
        });

        modelBuilder.Entity<AccountCurrency>(entity =>
        {
            entity.ToTable("AccountCurrencies", "finance");

            entity.HasIndex(e => new { e.AccountId, e.Currency }, "UX_AccountCurrencies_Account_Currency")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_AccountCurrencies_CreatedAt");
            entity.Property(e => e.Currency)
                .HasMaxLength(3)
                .IsUnicode(false)
                .IsFixedLength();
            entity.Property(e => e.OpeningBalance).HasColumnType("decimal(19, 4)");

            entity.HasOne(d => d.Account).WithMany(p => p.AccountCurrencies)
                .HasForeignKey(d => d.AccountId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_AccountCurrencies_Accounts");

            entity.HasOne(d => d.User).WithMany(p => p.AccountCurrencies)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_AccountCurrencies_Users");
        });

        modelBuilder.Entity<ApplicationStageChange>(entity =>
        {
            entity.ToTable("ApplicationStageChanges", "career");

            entity.HasIndex(e => new { e.JobApplicationId, e.ChangedOn }, "IX_ApplicationStageChanges_Application").HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_ApplicationStageChanges_CreatedAt");
            entity.Property(e => e.FromStage).HasMaxLength(20);
            entity.Property(e => e.Note).HasMaxLength(1000);
            entity.Property(e => e.ToStage).HasMaxLength(20);

            entity.HasOne(d => d.JobApplication).WithMany(p => p.ApplicationStageChanges)
                .HasForeignKey(d => d.JobApplicationId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_ApplicationStageChanges_JobApplications");

            entity.HasOne(d => d.User).WithMany(p => p.ApplicationStageChanges)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_ApplicationStageChanges_Users");
        });

        modelBuilder.Entity<Asset>(entity =>
        {
            entity.ToTable("Assets", "home");

            entity.HasIndex(e => new { e.UserId, e.PropertyId }, "IX_Assets_User_Property").HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.Brand).HasMaxLength(100);
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_Assets_CreatedAt");
            entity.Property(e => e.Currency)
                .HasMaxLength(3)
                .IsUnicode(false)
                .IsFixedLength();
            entity.Property(e => e.DisposalAmount).HasColumnType("decimal(19, 4)");
            entity.Property(e => e.DisposalKind).HasMaxLength(10);
            entity.Property(e => e.Model).HasMaxLength(100);
            entity.Property(e => e.Name).HasMaxLength(200);
            entity.Property(e => e.Notes).HasMaxLength(2000);
            entity.Property(e => e.PurchasePrice).HasColumnType("decimal(19, 4)");
            entity.Property(e => e.Quantity).HasDefaultValue(1, "DF_Assets_Quantity");
            entity.Property(e => e.Room).HasMaxLength(100);
            entity.Property(e => e.SerialNumber).HasMaxLength(100);

            entity.HasOne(d => d.Property).WithMany(p => p.Assets)
                .HasForeignKey(d => d.PropertyId)
                .HasConstraintName("FK_Assets_Properties");

            entity.HasOne(d => d.User).WithMany(p => p.Assets)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Assets_Users");
        });

        modelBuilder.Entity<AssetTag>(entity =>
        {
            entity.ToTable("AssetTags", "home");

            entity.HasIndex(e => new { e.AssetId, e.TagId }, "UX_AssetTags_Asset_Tag")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_AssetTags_CreatedAt");

            entity.HasOne(d => d.Asset).WithMany(p => p.AssetTags)
                .HasForeignKey(d => d.AssetId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_AssetTags_Assets");

            entity.HasOne(d => d.Tag).WithMany(p => p.AssetTags)
                .HasForeignKey(d => d.TagId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_AssetTags_Tags");

            entity.HasOne(d => d.User).WithMany(p => p.AssetTags)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_AssetTags_Users");
        });

        modelBuilder.Entity<Attachment>(entity =>
        {
            entity.ToTable("Attachments", "shared");

            entity.HasIndex(e => new { e.UserId, e.EntityType, e.EntityId }, "IX_Attachments_Entity").HasFilter("([IsDeleted]=(0))");

            entity.HasIndex(e => e.StoredName, "UX_Attachments_StoredName").IsUnique();

            entity.Property(e => e.ContentType).HasMaxLength(100);
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_Attachments_CreatedAt");
            entity.Property(e => e.EntityType).HasMaxLength(100);
            entity.Property(e => e.OriginalName).HasMaxLength(255);
            entity.Property(e => e.Sha256)
                .HasMaxLength(64)
                .IsUnicode(false)
                .IsFixedLength();
            entity.Property(e => e.StoredName).HasMaxLength(50);

            entity.HasOne(d => d.User).WithMany(p => p.Attachments)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Attachments_Users");
        });

        modelBuilder.Entity<Benefit>(entity =>
        {
            entity.ToTable("Benefits", "shopping");

            entity.HasIndex(e => e.TransactionId, "UX_Benefits_Transaction")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0) AND [TransactionId] IS NOT NULL)");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_Benefits_CreatedAt");
            entity.Property(e => e.Currency)
                .HasMaxLength(3)
                .IsUnicode(false)
                .IsFixedLength();
            entity.Property(e => e.DiscountPercent).HasColumnType("decimal(5, 2)");
            entity.Property(e => e.Kind).HasMaxLength(15);
            entity.Property(e => e.MinSpend).HasColumnType("decimal(19, 4)");
            entity.Property(e => e.Name).HasMaxLength(200);
            entity.Property(e => e.Notes).HasMaxLength(2000);
            entity.Property(e => e.Store).HasMaxLength(200);
            entity.Property(e => e.Value).HasColumnType("decimal(19, 4)");
            entity.Property(e => e.ValuePerPoint).HasColumnType("decimal(19, 6)");

            entity.HasOne(d => d.Account).WithMany(p => p.Benefits)
                .HasForeignKey(d => d.AccountId)
                .HasConstraintName("FK_Benefits_Accounts");

            entity.HasOne(d => d.Purchase).WithMany(p => p.Benefits)
                .HasForeignKey(d => d.PurchaseId)
                .HasConstraintName("FK_Benefits_Purchases");

            entity.HasOne(d => d.Reminder).WithMany(p => p.Benefits)
                .HasForeignKey(d => d.ReminderId)
                .HasConstraintName("FK_Benefits_Reminders");

            entity.HasOne(d => d.Transaction).WithOne(p => p.Benefit)
                .HasForeignKey<Benefit>(d => d.TransactionId)
                .HasConstraintName("FK_Benefits_Transactions");

            entity.HasOne(d => d.User).WithMany(p => p.Benefits)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Benefits_Users");
        });

        modelBuilder.Entity<BenefitRedemption>(entity =>
        {
            entity.ToTable("BenefitRedemptions", "shopping");

            entity.HasIndex(e => new { e.BenefitId, e.RedeemedOn }, "IX_BenefitRedemptions_Benefit").HasFilter("([IsDeleted]=(0))");

            entity.HasIndex(e => e.TransactionId, "UX_BenefitRedemptions_Transaction")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0) AND [TransactionId] IS NOT NULL)");

            entity.Property(e => e.Amount).HasColumnType("decimal(19, 4)");
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_BenefitRedemptions_CreatedAt");
            entity.Property(e => e.Notes).HasMaxLength(500);

            entity.HasOne(d => d.Benefit).WithMany(p => p.BenefitRedemptions)
                .HasForeignKey(d => d.BenefitId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_BenefitRedemptions_Benefits");

            entity.HasOne(d => d.Purchase).WithMany(p => p.BenefitRedemptions)
                .HasForeignKey(d => d.PurchaseId)
                .HasConstraintName("FK_BenefitRedemptions_Purchases");

            entity.HasOne(d => d.Transaction).WithOne(p => p.BenefitRedemption)
                .HasForeignKey<BenefitRedemption>(d => d.TransactionId)
                .HasConstraintName("FK_BenefitRedemptions_Transactions");

            entity.HasOne(d => d.User).WithMany(p => p.BenefitRedemptions)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_BenefitRedemptions_Users");
        });

        modelBuilder.Entity<BodyMeasurement>(entity =>
        {
            entity.ToTable("BodyMeasurements", "health");

            entity.HasIndex(e => new { e.UserId, e.Kind, e.MeasuredOn }, "IX_BodyMeasurements_User_Kind_MeasuredOn").HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_BodyMeasurements_CreatedAt");
            entity.Property(e => e.Kind).HasMaxLength(20);
            entity.Property(e => e.Value).HasColumnType("decimal(7, 2)");
            entity.Property(e => e.Value2).HasColumnType("decimal(7, 2)");

            entity.HasOne(d => d.User).WithMany(p => p.BodyMeasurements)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_BodyMeasurements_Users");
        });

        modelBuilder.Entity<Book>(entity =>
        {
            entity.ToTable("Books", "learning");

            entity.HasIndex(e => new { e.UserId, e.Status }, "IX_Books_User_Status").HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.Author).HasMaxLength(200);
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_Books_CreatedAt");
            entity.Property(e => e.Status)
                .HasMaxLength(20)
                .HasDefaultValue("WantToRead", "DF_Books_Status");
            entity.Property(e => e.Title).HasMaxLength(200);

            entity.HasOne(d => d.LifeArea).WithMany(p => p.Books)
                .HasForeignKey(d => d.LifeAreaId)
                .HasConstraintName("FK_Books_LifeAreas");

            entity.HasOne(d => d.Skill).WithMany(p => p.Books)
                .HasForeignKey(d => d.SkillId)
                .HasConstraintName("FK_Books_Skills");

            entity.HasOne(d => d.User).WithMany(p => p.Books)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Books_Users");
        });

        modelBuilder.Entity<BookNote>(entity =>
        {
            entity.ToTable("BookNotes", "learning");

            entity.HasIndex(e => new { e.BookId, e.Page }, "IX_BookNotes_Book").HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_BookNotes_CreatedAt");
            entity.Property(e => e.Kind).HasMaxLength(20);
            entity.Property(e => e.Text).HasMaxLength(4000);

            entity.HasOne(d => d.Book).WithMany(p => p.BookNotes)
                .HasForeignKey(d => d.BookId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_BookNotes_Books");

            entity.HasOne(d => d.User).WithMany(p => p.BookNotes)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_BookNotes_Users");
        });

        modelBuilder.Entity<BookTag>(entity =>
        {
            entity.ToTable("BookTags", "learning");

            entity.HasIndex(e => new { e.BookId, e.TagId }, "UX_BookTags_Book_Tag")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_BookTags_CreatedAt");

            entity.HasOne(d => d.Book).WithMany(p => p.BookTags)
                .HasForeignKey(d => d.BookId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_BookTags_Books");

            entity.HasOne(d => d.Tag).WithMany(p => p.BookTags)
                .HasForeignKey(d => d.TagId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_BookTags_Tags");

            entity.HasOne(d => d.User).WithMany(p => p.BookTags)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_BookTags_Users");
        });

        modelBuilder.Entity<Budget>(entity =>
        {
            entity.ToTable("Budgets", "finance");

            entity.HasIndex(e => new { e.UserId, e.TagId, e.MonthStart }, "UX_Budgets_User_Tag_Month")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.Amount).HasColumnType("decimal(19, 4)");
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_Budgets_CreatedAt");
            entity.Property(e => e.Currency)
                .HasMaxLength(3)
                .IsUnicode(false)
                .IsFixedLength();

            entity.HasOne(d => d.Tag).WithMany(p => p.Budgets)
                .HasForeignKey(d => d.TagId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Budgets_Tags");

            entity.HasOne(d => d.User).WithMany(p => p.Budgets)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Budgets_Users");
        });

        modelBuilder.Entity<CareerAchievement>(entity =>
        {
            entity.ToTable("CareerAchievements", "career");

            entity.HasIndex(e => new { e.UserId, e.AchievedOn }, "IX_CareerAchievements_User_Day").HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_CareerAchievements_CreatedAt");
            entity.Property(e => e.Description).HasMaxLength(4000);
            entity.Property(e => e.Kind).HasMaxLength(20);
            entity.Property(e => e.Title).HasMaxLength(200);

            entity.HasOne(d => d.Employment).WithMany(p => p.CareerAchievements)
                .HasForeignKey(d => d.EmploymentId)
                .HasConstraintName("FK_CareerAchievements_Employments");

            entity.HasOne(d => d.User).WithMany(p => p.CareerAchievements)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_CareerAchievements_Users");
        });

        modelBuilder.Entity<Certification>(entity =>
        {
            entity.ToTable("Certifications", "learning");

            entity.HasIndex(e => new { e.UserId, e.ExpiresOn }, "IX_Certifications_User_ExpiresOn").HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_Certifications_CreatedAt");
            entity.Property(e => e.CredentialId).HasMaxLength(100);
            entity.Property(e => e.Issuer).HasMaxLength(200);
            entity.Property(e => e.Name).HasMaxLength(200);
            entity.Property(e => e.Url).HasMaxLength(500);

            entity.HasOne(d => d.Course).WithMany(p => p.Certifications)
                .HasForeignKey(d => d.CourseId)
                .HasConstraintName("FK_Certifications_Courses");

            entity.HasOne(d => d.RenewalReminder).WithMany(p => p.Certifications)
                .HasForeignKey(d => d.RenewalReminderId)
                .HasConstraintName("FK_Certifications_Reminders");

            entity.HasOne(d => d.Skill).WithMany(p => p.Certifications)
                .HasForeignKey(d => d.SkillId)
                .HasConstraintName("FK_Certifications_Skills");

            entity.HasOne(d => d.User).WithMany(p => p.Certifications)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Certifications_Users");
        });

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

        modelBuilder.Entity<Contact>(entity =>
        {
            entity.ToTable("Contacts", "shared");

            entity.HasIndex(e => new { e.UserId, e.Name }, "IX_Contacts_User_Name").HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_Contacts_CreatedAt");
            entity.Property(e => e.Email).HasMaxLength(320);
            entity.Property(e => e.JobTitle).HasMaxLength(200);
            entity.Property(e => e.Name).HasMaxLength(200);
            entity.Property(e => e.Notes).HasMaxLength(4000);
            entity.Property(e => e.Organisation).HasMaxLength(200);
            entity.Property(e => e.Phone).HasMaxLength(50);

            entity.HasOne(d => d.User).WithMany(p => p.Contacts)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Contacts_Users");
        });

        modelBuilder.Entity<ContactTag>(entity =>
        {
            entity.ToTable("ContactTags", "shared");

            entity.HasIndex(e => new { e.ContactId, e.TagId }, "UX_ContactTags_Contact_Tag")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_ContactTags_CreatedAt");

            entity.HasOne(d => d.Contact).WithMany(p => p.ContactTags)
                .HasForeignKey(d => d.ContactId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_ContactTags_Contacts");

            entity.HasOne(d => d.Tag).WithMany(p => p.ContactTags)
                .HasForeignKey(d => d.TagId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_ContactTags_Tags");

            entity.HasOne(d => d.User).WithMany(p => p.ContactTags)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_ContactTags_Users");
        });

        modelBuilder.Entity<Course>(entity =>
        {
            entity.ToTable("Courses", "learning");

            entity.HasIndex(e => new { e.UserId, e.Status }, "IX_Courses_User_Status").HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_Courses_CreatedAt");
            entity.Property(e => e.Provider).HasMaxLength(200);
            entity.Property(e => e.Status)
                .HasMaxLength(20)
                .HasDefaultValue("Planned", "DF_Courses_Status");
            entity.Property(e => e.Title).HasMaxLength(200);
            entity.Property(e => e.Url).HasMaxLength(500);

            entity.HasOne(d => d.LifeArea).WithMany(p => p.Courses)
                .HasForeignKey(d => d.LifeAreaId)
                .HasConstraintName("FK_Courses_LifeAreas");

            entity.HasOne(d => d.Skill).WithMany(p => p.Courses)
                .HasForeignKey(d => d.SkillId)
                .HasConstraintName("FK_Courses_Skills");

            entity.HasOne(d => d.User).WithMany(p => p.Courses)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Courses_Users");
        });

        modelBuilder.Entity<Decision>(entity =>
        {
            entity.ToTable("Decisions", "journal");

            entity.HasIndex(e => new { e.UserId, e.DecidedOn }, "IX_Decisions_User_DecidedOn").HasFilter("([IsDeleted]=(0))");

            entity.HasIndex(e => new { e.UserId, e.ReviewOn }, "IX_Decisions_User_ReviewOn").HasFilter("([IsDeleted]=(0) AND [ReviewedOn] IS NULL)");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_Decisions_CreatedAt");
            entity.Property(e => e.Title).HasMaxLength(300);
            entity.Property(e => e.Verdict).HasMaxLength(20);

            entity.HasOne(d => d.ReviewReminder).WithMany(p => p.Decisions)
                .HasForeignKey(d => d.ReviewReminderId)
                .HasConstraintName("FK_Decisions_ReviewReminder");

            entity.HasOne(d => d.User).WithMany(p => p.Decisions)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Decisions_Users");
        });

        modelBuilder.Entity<DismissedInsight>(entity =>
        {
            entity.ToTable("DismissedInsights", "dashboard");

            entity.HasIndex(e => new { e.UserId, e.InsightKey }, "UX_DismissedInsights_User_Key")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_DismissedInsights_CreatedAt");
            entity.Property(e => e.InsightKey).HasMaxLength(200);

            entity.HasOne(d => d.User).WithMany(p => p.DismissedInsights)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_DismissedInsights_Users");
        });

        modelBuilder.Entity<DoctorVisit>(entity =>
        {
            entity.ToTable("DoctorVisits", "health");

            entity.HasIndex(e => new { e.UserId, e.VisitOn }, "IX_DoctorVisits_User_VisitOn").HasFilter("([IsDeleted]=(0))");

            entity.HasIndex(e => e.EventId, "UX_DoctorVisits_Event")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0) AND [EventId] IS NOT NULL)");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_DoctorVisits_CreatedAt");
            entity.Property(e => e.Place).HasMaxLength(200);
            entity.Property(e => e.Reason).HasMaxLength(200);
            entity.Property(e => e.Specialty).HasMaxLength(100);

            entity.HasOne(d => d.Condition).WithMany(p => p.DoctorVisits)
                .HasForeignKey(d => d.ConditionId)
                .HasConstraintName("FK_DoctorVisits_MedicalConditions");

            entity.HasOne(d => d.Contact).WithMany(p => p.DoctorVisits)
                .HasForeignKey(d => d.ContactId)
                .HasConstraintName("FK_DoctorVisits_Contacts");

            entity.HasOne(d => d.Event).WithOne(p => p.DoctorVisit)
                .HasForeignKey<DoctorVisit>(d => d.EventId)
                .HasConstraintName("FK_DoctorVisits_Events");

            entity.HasOne(d => d.FollowUpReminder).WithMany(p => p.DoctorVisits)
                .HasForeignKey(d => d.FollowUpReminderId)
                .HasConstraintName("FK_DoctorVisits_Reminders");

            entity.HasOne(d => d.User).WithMany(p => p.DoctorVisits)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_DoctorVisits_Users");
        });

        modelBuilder.Entity<Document>(entity =>
        {
            entity.ToTable("Documents", "documents");

            entity.HasIndex(e => new { e.UserId, e.ExpiresOn }, "IX_Documents_User_ExpiresOn").HasFilter("([IsDeleted]=(0) AND [ExpiresOn] IS NOT NULL)");

            entity.HasIndex(e => new { e.UserId, e.Kind }, "IX_Documents_User_Kind").HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_Documents_CreatedAt");
            entity.Property(e => e.Issuer).HasMaxLength(200);
            entity.Property(e => e.Kind).HasMaxLength(20);
            entity.Property(e => e.NumberLast4).HasMaxLength(4);
            entity.Property(e => e.Title).HasMaxLength(200);

            entity.HasOne(d => d.ExpiryReminder).WithMany(p => p.Documents)
                .HasForeignKey(d => d.ExpiryReminderId)
                .HasConstraintName("FK_Documents_ExpiryReminder");

            entity.HasOne(d => d.User).WithMany(p => p.Documents)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Documents_Users");
        });

        modelBuilder.Entity<DocumentFile>(entity =>
        {
            entity.ToTable("DocumentFiles", "documents");

            entity.HasIndex(e => e.DocumentId, "IX_DocumentFiles_Document").HasFilter("([IsDeleted]=(0))");

            entity.HasIndex(e => e.StoredName, "UX_DocumentFiles_StoredName").IsUnique();

            entity.Property(e => e.ContentType).HasMaxLength(100);
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_DocumentFiles_CreatedAt");
            entity.Property(e => e.OriginalName).HasMaxLength(255);
            entity.Property(e => e.Sha256)
                .HasMaxLength(64)
                .IsUnicode(false)
                .IsFixedLength();
            entity.Property(e => e.StoredName).HasMaxLength(50);

            entity.HasOne(d => d.Document).WithMany(p => p.DocumentFiles)
                .HasForeignKey(d => d.DocumentId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_DocumentFiles_Documents");

            entity.HasOne(d => d.User).WithMany(p => p.DocumentFiles)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_DocumentFiles_Users");
        });

        modelBuilder.Entity<DocumentTag>(entity =>
        {
            entity.ToTable("DocumentTags", "documents");

            entity.HasIndex(e => e.TagId, "IX_DocumentTags_Tag").HasFilter("([IsDeleted]=(0))");

            entity.HasIndex(e => new { e.DocumentId, e.TagId }, "UX_DocumentTags_Document_Tag")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_DocumentTags_CreatedAt");

            entity.HasOne(d => d.Document).WithMany(p => p.DocumentTags)
                .HasForeignKey(d => d.DocumentId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_DocumentTags_Documents");

            entity.HasOne(d => d.Tag).WithMany(p => p.DocumentTags)
                .HasForeignKey(d => d.TagId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_DocumentTags_Tags");

            entity.HasOne(d => d.User).WithMany(p => p.DocumentTags)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_DocumentTags_Users");
        });

        modelBuilder.Entity<Employment>(entity =>
        {
            entity.ToTable("Employments", "career");

            entity.HasIndex(e => new { e.UserId, e.StartDate }, "IX_Employments_User_Start").HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_Employments_CreatedAt");
            entity.Property(e => e.Description).HasMaxLength(4000);
            entity.Property(e => e.EmploymentType)
                .HasMaxLength(20)
                .HasDefaultValue("FullTime", "DF_Employments_EmploymentType");
            entity.Property(e => e.Location).HasMaxLength(200);
            entity.Property(e => e.Organisation).HasMaxLength(200);
            entity.Property(e => e.Role).HasMaxLength(200);

            entity.HasOne(d => d.User).WithMany(p => p.Employments)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Employments_Users");
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

            entity.HasIndex(e => e.LifeAreaId, "IX_Events_LifeAreaId").HasFilter("([IsDeleted]=(0) AND [LifeAreaId] IS NOT NULL)");

            entity.HasIndex(e => e.UserId, "IX_Events_User_Recurring").HasFilter("([IsDeleted]=(0) AND [RecurrenceFrequency] IS NOT NULL)");

            entity.HasIndex(e => new { e.UserId, e.StartDate }, "IX_Events_User_StartDate").HasFilter("([IsDeleted]=(0) AND [IsAllDay]=(1))");

            entity.HasIndex(e => new { e.UserId, e.StartsAt }, "IX_Events_User_StartsAt").HasFilter("([IsDeleted]=(0) AND [IsAllDay]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_Events_CreatedAt");
            entity.Property(e => e.Location).HasMaxLength(200);
            entity.Property(e => e.RecurrenceFrequency).HasMaxLength(10);
            entity.Property(e => e.TimeZone).HasMaxLength(64);
            entity.Property(e => e.Title).HasMaxLength(200);

            entity.HasOne(d => d.LifeArea).WithMany(p => p.Events)
                .HasForeignKey(d => d.LifeAreaId)
                .HasConstraintName("FK_Events_LifeAreas");

            entity.HasOne(d => d.User).WithMany(p => p.Events)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Events_Users");
        });

        modelBuilder.Entity<EventException>(entity =>
        {
            entity.ToTable("EventExceptions", "calendar");

            entity.HasIndex(e => new { e.EventId, e.OccurrenceDate }, "UX_EventExceptions_Event_Date")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_EventExceptions_CreatedAt");

            entity.HasOne(d => d.Event).WithMany(p => p.EventExceptions)
                .HasForeignKey(d => d.EventId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_EventExceptions_Events");

            entity.HasOne(d => d.User).WithMany(p => p.EventExceptions)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_EventExceptions_Users");
        });

        modelBuilder.Entity<ExchangeRate>(entity =>
        {
            entity.ToTable("ExchangeRates", "finance");

            entity.HasIndex(e => new { e.UserId, e.Currency, e.BaseCurrency, e.EffectiveOn }, "UX_ExchangeRates_User_Pair_Day")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.BaseCurrency)
                .HasMaxLength(3)
                .IsUnicode(false)
                .IsFixedLength();
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_ExchangeRates_CreatedAt");
            entity.Property(e => e.Currency)
                .HasMaxLength(3)
                .IsUnicode(false)
                .IsFixedLength();
            entity.Property(e => e.Rate).HasColumnType("decimal(19, 8)");

            entity.HasOne(d => d.User).WithMany(p => p.ExchangeRates)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_ExchangeRates_Users");
        });

        modelBuilder.Entity<FocusSession>(entity =>
        {
            entity.ToTable("FocusSessions", "tasks");

            entity.HasIndex(e => e.TaskItemId, "IX_FocusSessions_Task").HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_FocusSessions_CreatedAt");

            entity.HasOne(d => d.TaskItem).WithMany(p => p.FocusSessions)
                .HasForeignKey(d => d.TaskItemId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_FocusSessions_Task");

            entity.HasOne(d => d.User).WithMany(p => p.FocusSessions)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_FocusSessions_Users");
        });

        modelBuilder.Entity<FuelLog>(entity =>
        {
            entity.ToTable("FuelLogs", "home");

            entity.HasIndex(e => new { e.VehicleId, e.FilledOn, e.OdometerKm }, "IX_FuelLogs_Vehicle_FilledOn").HasFilter("([IsDeleted]=(0))");

            entity.HasIndex(e => e.TransactionId, "UX_FuelLogs_Transaction")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0) AND [TransactionId] IS NOT NULL)");

            entity.Property(e => e.Amount).HasColumnType("decimal(19, 4)");
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_FuelLogs_CreatedAt");
            entity.Property(e => e.Currency)
                .HasMaxLength(3)
                .IsUnicode(false)
                .IsFixedLength();
            entity.Property(e => e.Notes).HasMaxLength(500);
            entity.Property(e => e.PricePerUnit).HasColumnType("decimal(19, 4)");
            entity.Property(e => e.Quantity).HasColumnType("decimal(19, 4)");

            entity.HasOne(d => d.Transaction).WithOne(p => p.FuelLog)
                .HasForeignKey<FuelLog>(d => d.TransactionId)
                .HasConstraintName("FK_FuelLogs_Transactions");

            entity.HasOne(d => d.User).WithMany(p => p.FuelLogs)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_FuelLogs_Users");

            entity.HasOne(d => d.Vehicle).WithMany(p => p.FuelLogs)
                .HasForeignKey(d => d.VehicleId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_FuelLogs_Vehicles");
        });

        modelBuilder.Entity<Goal>(entity =>
        {
            entity.ToTable("Goals", "goals");

            entity.HasIndex(e => e.LifeAreaId, "IX_Goals_LifeAreaId").HasFilter("([IsDeleted]=(0))");

            entity.HasIndex(e => new { e.UserId, e.Status }, "IX_Goals_User_Status").HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_Goals_CreatedAt");
            entity.Property(e => e.GoalType).HasMaxLength(20);
            entity.Property(e => e.MeasureSource).HasMaxLength(10);
            entity.Property(e => e.MeasureStart).HasColumnType("decimal(19, 4)");
            entity.Property(e => e.MeasureTarget).HasColumnType("decimal(19, 4)");
            entity.Property(e => e.MeasureUnit).HasMaxLength(30);
            entity.Property(e => e.Status)
                .HasMaxLength(20)
                .HasDefaultValue("Active", "DF_Goals_Status");
            entity.Property(e => e.TargetAmount).HasColumnType("decimal(19, 4)");
            entity.Property(e => e.TargetCurrency)
                .HasMaxLength(3)
                .IsUnicode(false)
                .IsFixedLength();
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

        modelBuilder.Entity<GoalMeasureEntry>(entity =>
        {
            entity.ToTable("GoalMeasureEntries", "goals");

            entity.HasIndex(e => new { e.GoalId, e.EntryDate }, "IX_GoalMeasureEntries_Goal").HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_GoalMeasureEntries_CreatedAt");
            entity.Property(e => e.Kind)
                .HasMaxLength(12)
                .HasDefaultValue("Logged", "DF_GoalMeasureEntries_Kind");
            entity.Property(e => e.Note).HasMaxLength(200);
            entity.Property(e => e.Value).HasColumnType("decimal(19, 4)");

            entity.HasOne(d => d.Goal).WithMany(p => p.GoalMeasureEntries)
                .HasForeignKey(d => d.GoalId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_GoalMeasureEntries_Goals");

            entity.HasOne(d => d.User).WithMany(p => p.GoalMeasureEntries)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_GoalMeasureEntries_Users");
        });

        modelBuilder.Entity<GoalMilestone>(entity =>
        {
            entity.ToTable("GoalMilestones", "goals");

            entity.HasIndex(e => new { e.GoalId, e.SortOrder }, "IX_GoalMilestones_Goal").HasFilter("([IsDeleted]=(0))");

            entity.HasIndex(e => e.ProjectId, "IX_GoalMilestones_Project").HasFilter("([IsDeleted]=(0) AND [ProjectId] IS NOT NULL)");

            entity.HasIndex(e => e.TaskItemId, "IX_GoalMilestones_TaskItem").HasFilter("([IsDeleted]=(0) AND [TaskItemId] IS NOT NULL)");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_GoalMilestones_CreatedAt");
            entity.Property(e => e.Title).HasMaxLength(200);

            entity.HasOne(d => d.Goal).WithMany(p => p.GoalMilestones)
                .HasForeignKey(d => d.GoalId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_GoalMilestones_Goals");

            entity.HasOne(d => d.Project).WithMany(p => p.GoalMilestones)
                .HasForeignKey(d => d.ProjectId)
                .HasConstraintName("FK_GoalMilestones_Projects");

            entity.HasOne(d => d.TaskItem).WithMany(p => p.GoalMilestones)
                .HasForeignKey(d => d.TaskItemId)
                .HasConstraintName("FK_GoalMilestones_TaskItems");

            entity.HasOne(d => d.User).WithMany(p => p.GoalMilestones)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_GoalMilestones_Users");
        });

        modelBuilder.Entity<GoalSource>(entity =>
        {
            entity.ToTable("GoalSources", "goals");

            entity.HasIndex(e => new { e.EntityType, e.EntityId }, "IX_GoalSources_Entity").HasFilter("([IsDeleted]=(0))");

            entity.HasIndex(e => e.GoalId, "IX_GoalSources_Goal").HasFilter("([IsDeleted]=(0))");

            entity.HasIndex(e => new { e.GoalId, e.Kind, e.EntityType, e.EntityId, e.Filter, e.Metric }, "UX_GoalSources_Same")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_GoalSources_CreatedAt");
            entity.Property(e => e.EntityType).HasMaxLength(50);
            entity.Property(e => e.Filter).HasMaxLength(30);
            entity.Property(e => e.Kind).HasMaxLength(20);
            entity.Property(e => e.Metric).HasMaxLength(20);

            entity.HasOne(d => d.Goal).WithMany(p => p.GoalSources)
                .HasForeignKey(d => d.GoalId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_GoalSources_Goals");

            entity.HasOne(d => d.User).WithMany(p => p.GoalSources)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_GoalSources_Users");
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

        modelBuilder.Entity<GoalTarget>(entity =>
        {
            entity.ToTable("GoalTargets", "health");

            entity.HasIndex(e => e.GoalId, "UX_GoalTargets_Goal")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_GoalTargets_CreatedAt");
            entity.Property(e => e.Kind).HasMaxLength(20);
            entity.Property(e => e.StartValue).HasColumnType("decimal(7, 2)");
            entity.Property(e => e.TargetValue).HasColumnType("decimal(7, 2)");

            entity.HasOne(d => d.Goal).WithOne(p => p.GoalTarget)
                .HasForeignKey<GoalTarget>(d => d.GoalId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_GoalTargets_Goals");

            entity.HasOne(d => d.User).WithMany(p => p.GoalTargets)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_GoalTargets_Users");
        });

        modelBuilder.Entity<Habit>(entity =>
        {
            entity.ToTable("Habits", "habits");

            entity.HasIndex(e => e.LifeAreaId, "IX_Habits_LifeAreaId").HasFilter("([IsDeleted]=(0))");

            entity.HasIndex(e => new { e.UserId, e.Title }, "UX_Habits_User_Title")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_Habits_CreatedAt");
            entity.Property(e => e.Kind)
                .HasMaxLength(10)
                .HasDefaultValue("Build", "DF_Habits_Kind");
            entity.Property(e => e.ScheduleDays).HasDefaultValue((byte)127, "DF_Habits_ScheduleDays");
            entity.Property(e => e.Status)
                .HasMaxLength(20)
                .HasDefaultValue("Active", "DF_Habits_Status");
            entity.Property(e => e.TargetValue).HasColumnType("decimal(9, 2)");
            entity.Property(e => e.Title).HasMaxLength(200);
            entity.Property(e => e.Unit).HasMaxLength(30);

            entity.HasOne(d => d.LifeArea).WithMany(p => p.Habits)
                .HasForeignKey(d => d.LifeAreaId)
                .HasConstraintName("FK_Habits_LifeAreas");

            entity.HasOne(d => d.User).WithMany(p => p.Habits)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Habits_Users");
        });

        modelBuilder.Entity<HabitChallenge>(entity =>
        {
            entity.ToTable("HabitChallenges", "habits");

            entity.HasIndex(e => new { e.HabitId, e.StartDate }, "IX_HabitChallenges_Habit").HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_HabitChallenges_CreatedAt");

            entity.HasOne(d => d.Habit).WithMany(p => p.HabitChallenges)
                .HasForeignKey(d => d.HabitId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_HabitChallenges_Habits");

            entity.HasOne(d => d.User).WithMany(p => p.HabitChallenges)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_HabitChallenges_Users");
        });

        modelBuilder.Entity<HabitEntry>(entity =>
        {
            entity.ToTable("HabitEntries", "habits");

            entity.HasIndex(e => new { e.UserId, e.EntryDate }, "IX_HabitEntries_User_Date").HasFilter("([IsDeleted]=(0))");

            entity.HasIndex(e => new { e.HabitId, e.EntryDate }, "UX_HabitEntries_Habit_Date")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_HabitEntries_CreatedAt");
            entity.Property(e => e.Value).HasColumnType("decimal(9, 2)");

            entity.HasOne(d => d.Habit).WithMany(p => p.HabitEntries)
                .HasForeignKey(d => d.HabitId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_HabitEntries_Habits");

            entity.HasOne(d => d.User).WithMany(p => p.HabitEntries)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_HabitEntries_Users");
        });

        modelBuilder.Entity<HabitTag>(entity =>
        {
            entity.ToTable("HabitTags", "habits");

            entity.HasIndex(e => e.TagId, "IX_HabitTags_Tag").HasFilter("([IsDeleted]=(0))");

            entity.HasIndex(e => new { e.HabitId, e.TagId }, "UX_HabitTags_Habit_Tag")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_HabitTags_CreatedAt");

            entity.HasOne(d => d.Habit).WithMany(p => p.HabitTags)
                .HasForeignKey(d => d.HabitId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_HabitTags_Habits");

            entity.HasOne(d => d.Tag).WithMany(p => p.HabitTags)
                .HasForeignKey(d => d.TagId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_HabitTags_Tags");

            entity.HasOne(d => d.User).WithMany(p => p.HabitTags)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_HabitTags_Users");
        });

        modelBuilder.Entity<HealthProfile>(entity =>
        {
            entity.ToTable("HealthProfiles", "health");

            entity.HasIndex(e => e.UserId, "UX_HealthProfiles_User")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.BloodGroup).HasMaxLength(3);
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_HealthProfiles_CreatedAt");
            entity.Property(e => e.HeightCm).HasColumnType("decimal(4, 1)");
            entity.Property(e => e.Sex).HasMaxLength(10);

            entity.HasOne(d => d.User).WithOne(p => p.HealthProfile)
                .HasForeignKey<HealthProfile>(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_HealthProfiles_Users");
        });

        modelBuilder.Entity<Holding>(entity =>
        {
            entity.ToTable("Holdings", "finance");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_Holdings_CreatedAt");
            entity.Property(e => e.Currency)
                .HasMaxLength(3)
                .IsUnicode(false)
                .IsFixedLength();
            entity.Property(e => e.InterestRate).HasColumnType("decimal(7, 4)");
            entity.Property(e => e.InvestedAmount).HasColumnType("decimal(19, 4)");
            entity.Property(e => e.Kind).HasMaxLength(20);
            entity.Property(e => e.Name).HasMaxLength(200);
            entity.Property(e => e.Notes).HasMaxLength(2000);
            entity.Property(e => e.Units).HasColumnType("decimal(19, 6)");

            entity.HasOne(d => d.Account).WithMany(p => p.Holdings)
                .HasForeignKey(d => d.AccountId)
                .HasConstraintName("FK_Holdings_Accounts");

            entity.HasOne(d => d.User).WithMany(p => p.Holdings)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Holdings_Users");
        });

        modelBuilder.Entity<HoldingValuation>(entity =>
        {
            entity.ToTable("HoldingValuations", "finance");

            entity.HasIndex(e => new { e.HoldingId, e.ValuedOn }, "UX_HoldingValuations_Holding_Day")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_HoldingValuations_CreatedAt");
            entity.Property(e => e.Note).HasMaxLength(1000);
            entity.Property(e => e.Value).HasColumnType("decimal(19, 4)");

            entity.HasOne(d => d.Holding).WithMany(p => p.HoldingValuations)
                .HasForeignKey(d => d.HoldingId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_HoldingValuations_Holdings");

            entity.HasOne(d => d.User).WithMany(p => p.HoldingValuations)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_HoldingValuations_Users");
        });

        modelBuilder.Entity<HouseholdProject>(entity =>
        {
            entity.ToTable("HouseholdProjects", "home");

            entity.HasIndex(e => e.ProjectId, "UX_HouseholdProjects_Project")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.Budget).HasColumnType("decimal(19, 4)");
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_HouseholdProjects_CreatedAt");
            entity.Property(e => e.Currency)
                .HasMaxLength(3)
                .IsUnicode(false)
                .IsFixedLength();

            entity.HasOne(d => d.Project).WithOne(p => p.HouseholdProject)
                .HasForeignKey<HouseholdProject>(d => d.ProjectId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_HouseholdProjects_Projects");

            entity.HasOne(d => d.Property).WithMany(p => p.HouseholdProjects)
                .HasForeignKey(d => d.PropertyId)
                .HasConstraintName("FK_HouseholdProjects_Properties");

            entity.HasOne(d => d.User).WithMany(p => p.HouseholdProjects)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_HouseholdProjects_Users");
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

        modelBuilder.Entity<InsurancePolicy>(entity =>
        {
            entity.ToTable("InsurancePolicies", "finance");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_InsurancePolicies_CreatedAt");
            entity.Property(e => e.Currency)
                .HasMaxLength(3)
                .IsUnicode(false)
                .IsFixedLength();
            entity.Property(e => e.Insurer).HasMaxLength(200);
            entity.Property(e => e.Kind).HasMaxLength(20);
            entity.Property(e => e.Name).HasMaxLength(200);
            entity.Property(e => e.Notes).HasMaxLength(2000);
            entity.Property(e => e.PolicyNumberLast4)
                .HasMaxLength(4)
                .IsUnicode(false)
                .IsFixedLength();
            entity.Property(e => e.Premium).HasColumnType("decimal(19, 4)");
            entity.Property(e => e.PremiumFrequency).HasMaxLength(10);
            entity.Property(e => e.SumAssured).HasColumnType("decimal(19, 4)");

            entity.HasOne(d => d.Contact).WithMany(p => p.InsurancePolicies)
                .HasForeignKey(d => d.ContactId)
                .HasConstraintName("FK_InsurancePolicies_Contacts");

            entity.HasOne(d => d.RenewalReminder).WithMany(p => p.InsurancePolicies)
                .HasForeignKey(d => d.RenewalReminderId)
                .HasConstraintName("FK_InsurancePolicies_Reminders");

            entity.HasOne(d => d.User).WithMany(p => p.InsurancePolicies)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_InsurancePolicies_Users");
        });

        modelBuilder.Entity<Interview>(entity =>
        {
            entity.ToTable("Interviews", "career");

            entity.HasIndex(e => e.JobApplicationId, "IX_Interviews_Application").HasFilter("([IsDeleted]=(0))");

            entity.HasIndex(e => e.EventId, "UX_Interviews_Event")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0) AND [EventId] IS NOT NULL)");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_Interviews_CreatedAt");
            entity.Property(e => e.Outcome).HasMaxLength(10);
            entity.Property(e => e.PrepNotes).HasMaxLength(4000);
            entity.Property(e => e.ReviewNotes).HasMaxLength(4000);
            entity.Property(e => e.Title).HasMaxLength(200);

            entity.HasOne(d => d.Event).WithOne(p => p.Interview)
                .HasForeignKey<Interview>(d => d.EventId)
                .HasConstraintName("FK_Interviews_Events");

            entity.HasOne(d => d.JobApplication).WithMany(p => p.Interviews)
                .HasForeignKey(d => d.JobApplicationId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Interviews_JobApplications");

            entity.HasOne(d => d.User).WithMany(p => p.Interviews)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Interviews_Users");
        });

        modelBuilder.Entity<InterviewQuestion>(entity =>
        {
            entity.ToTable("InterviewQuestions", "career");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_InterviewQuestions_CreatedAt");
            entity.Property(e => e.Question).HasMaxLength(1000);
            entity.Property(e => e.ReviewNotes).HasMaxLength(4000);

            entity.HasOne(d => d.JobApplication).WithMany(p => p.InterviewQuestions)
                .HasForeignKey(d => d.JobApplicationId)
                .HasConstraintName("FK_InterviewQuestions_JobApplications");

            entity.HasOne(d => d.User).WithMany(p => p.InterviewQuestions)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_InterviewQuestions_Users");
        });

        modelBuilder.Entity<InterviewQuestionTag>(entity =>
        {
            entity.ToTable("InterviewQuestionTags", "career");

            entity.HasIndex(e => new { e.InterviewQuestionId, e.TagId }, "UX_InterviewQuestionTags_Question_Tag")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_InterviewQuestionTags_CreatedAt");

            entity.HasOne(d => d.InterviewQuestion).WithMany(p => p.InterviewQuestionTags)
                .HasForeignKey(d => d.InterviewQuestionId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_InterviewQuestionTags_InterviewQuestions");

            entity.HasOne(d => d.Tag).WithMany(p => p.InterviewQuestionTags)
                .HasForeignKey(d => d.TagId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_InterviewQuestionTags_Tags");

            entity.HasOne(d => d.User).WithMany(p => p.InterviewQuestionTags)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_InterviewQuestionTags_Users");
        });

        modelBuilder.Entity<JobApplication>(entity =>
        {
            entity.ToTable("JobApplications", "career");

            entity.HasIndex(e => new { e.UserId, e.Stage }, "IX_JobApplications_User_Stage").HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_JobApplications_CreatedAt");
            entity.Property(e => e.Notes).HasMaxLength(4000);
            entity.Property(e => e.Organisation).HasMaxLength(200);
            entity.Property(e => e.Role).HasMaxLength(200);
            entity.Property(e => e.Source).HasMaxLength(200);
            entity.Property(e => e.Stage)
                .HasMaxLength(20)
                .HasDefaultValue("Saved", "DF_JobApplications_Stage");
            entity.Property(e => e.Url).HasMaxLength(2000);

            entity.HasOne(d => d.Contact).WithMany(p => p.JobApplications)
                .HasForeignKey(d => d.ContactId)
                .HasConstraintName("FK_JobApplications_Contacts");

            entity.HasOne(d => d.ResumeVersion).WithMany(p => p.JobApplications)
                .HasForeignKey(d => d.ResumeVersionId)
                .HasConstraintName("FK_JobApplications_ResumeVersions");

            entity.HasOne(d => d.User).WithMany(p => p.JobApplications)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_JobApplications_Users");
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

        modelBuilder.Entity<JournalEntryTag>(entity =>
        {
            entity.ToTable("JournalEntryTags", "journal");

            entity.HasIndex(e => e.TagId, "IX_JournalEntryTags_Tag").HasFilter("([IsDeleted]=(0))");

            entity.HasIndex(e => new { e.JournalEntryId, e.TagId }, "UX_JournalEntryTags_Entry_Tag")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_JournalEntryTags_CreatedAt");

            entity.HasOne(d => d.JournalEntry).WithMany(p => p.JournalEntryTags)
                .HasForeignKey(d => d.JournalEntryId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_JournalEntryTags_JournalEntries");

            entity.HasOne(d => d.Tag).WithMany(p => p.JournalEntryTags)
                .HasForeignKey(d => d.TagId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_JournalEntryTags_Tags");

            entity.HasOne(d => d.User).WithMany(p => p.JournalEntryTags)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_JournalEntryTags_Users");
        });

        modelBuilder.Entity<JournalNote>(entity =>
        {
            entity.ToTable("JournalNotes", "journal");

            entity.HasIndex(e => new { e.UserId, e.EntryDate }, "IX_JournalNotes_User_Date").HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_JournalNotes_CreatedAt");
            entity.Property(e => e.Kind).HasMaxLength(20);
            entity.Property(e => e.Text).HasMaxLength(500);

            entity.HasOne(d => d.User).WithMany(p => p.JournalNotes)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_JournalNotes_Users");
        });

        modelBuilder.Entity<KnowledgeNote>(entity =>
        {
            entity.ToTable("KnowledgeNotes", "learning");

            entity.HasIndex(e => new { e.UserId, e.NextReviewOn }, "IX_KnowledgeNotes_User_NextReview").HasFilter("([IsDeleted]=(0) AND [NextReviewOn] IS NOT NULL)");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_KnowledgeNotes_CreatedAt");
            entity.Property(e => e.Title).HasMaxLength(200);

            entity.HasOne(d => d.Skill).WithMany(p => p.KnowledgeNotes)
                .HasForeignKey(d => d.SkillId)
                .HasConstraintName("FK_KnowledgeNotes_Skills");

            entity.HasOne(d => d.User).WithMany(p => p.KnowledgeNotes)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_KnowledgeNotes_Users");
        });

        modelBuilder.Entity<KnowledgeNoteTag>(entity =>
        {
            entity.ToTable("KnowledgeNoteTags", "learning");

            entity.HasIndex(e => new { e.KnowledgeNoteId, e.TagId }, "UX_KnowledgeNoteTags_Note_Tag")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_KnowledgeNoteTags_CreatedAt");

            entity.HasOne(d => d.KnowledgeNote).WithMany(p => p.KnowledgeNoteTags)
                .HasForeignKey(d => d.KnowledgeNoteId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_KnowledgeNoteTags_KnowledgeNotes");

            entity.HasOne(d => d.Tag).WithMany(p => p.KnowledgeNoteTags)
                .HasForeignKey(d => d.TagId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_KnowledgeNoteTags_Tags");

            entity.HasOne(d => d.User).WithMany(p => p.KnowledgeNoteTags)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_KnowledgeNoteTags_Users");
        });

        modelBuilder.Entity<KpiTile>(entity =>
        {
            entity.ToTable("KpiTiles", "dashboard");

            entity.HasIndex(e => new { e.UserId, e.KpiKey }, "UX_KpiTiles_User_Key")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_KpiTiles_CreatedAt");
            entity.Property(e => e.KpiKey).HasMaxLength(40);

            entity.HasOne(d => d.User).WithMany(p => p.KpiTiles)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_KpiTiles_Users");
        });

        modelBuilder.Entity<LabResult>(entity =>
        {
            entity.ToTable("LabResults", "health");

            entity.HasIndex(e => new { e.UserId, e.TestName, e.TakenOn }, "IX_LabResults_User_Test_TakenOn").HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_LabResults_CreatedAt");
            entity.Property(e => e.Laboratory).HasMaxLength(200);
            entity.Property(e => e.RangeHigh).HasColumnType("decimal(19, 4)");
            entity.Property(e => e.RangeLow).HasColumnType("decimal(19, 4)");
            entity.Property(e => e.TestName).HasMaxLength(200);
            entity.Property(e => e.Unit).HasMaxLength(30);
            entity.Property(e => e.Value).HasColumnType("decimal(19, 4)");
            entity.Property(e => e.ValueText).HasMaxLength(100);

            entity.HasOne(d => d.User).WithMany(p => p.LabResults)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_LabResults_Users");

            entity.HasOne(d => d.Visit).WithMany(p => p.LabResults)
                .HasForeignKey(d => d.VisitId)
                .HasConstraintName("FK_LabResults_DoctorVisits");
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

        modelBuilder.Entity<Loan>(entity =>
        {
            entity.ToTable("Loans", "finance");

            entity.Property(e => e.AnnualRate).HasColumnType("decimal(7, 4)");
            entity.Property(e => e.Counterparty).HasMaxLength(200);
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_Loans_CreatedAt");
            entity.Property(e => e.Currency)
                .HasMaxLength(3)
                .IsUnicode(false)
                .IsFixedLength();
            entity.Property(e => e.Direction)
                .HasMaxLength(10)
                .HasDefaultValue("Borrowed", "DF_Loans_Direction");
            entity.Property(e => e.EmiAmount).HasColumnType("decimal(19, 4)");
            entity.Property(e => e.Kind).HasMaxLength(20);
            entity.Property(e => e.Name).HasMaxLength(200);
            entity.Property(e => e.Notes).HasMaxLength(2000);
            entity.Property(e => e.Principal).HasColumnType("decimal(19, 4)");
            entity.Property(e => e.RepaymentKind)
                .HasMaxLength(10)
                .HasDefaultValue("Emi", "DF_Loans_RepaymentKind");

            entity.HasOne(d => d.Account).WithMany(p => p.Loans)
                .HasForeignKey(d => d.AccountId)
                .HasConstraintName("FK_Loans_Accounts");

            entity.HasOne(d => d.Contact).WithMany(p => p.Loans)
                .HasForeignKey(d => d.ContactId)
                .HasConstraintName("FK_Loans_Contacts");

            entity.HasOne(d => d.User).WithMany(p => p.Loans)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Loans_Users");
        });

        modelBuilder.Entity<MaintenanceLog>(entity =>
        {
            entity.ToTable("MaintenanceLogs", "home");

            entity.HasIndex(e => new { e.MaintenanceTaskId, e.DoneOn }, "IX_MaintenanceLogs_Task_DoneOn").HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.Cost).HasColumnType("decimal(19, 4)");
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_MaintenanceLogs_CreatedAt");
            entity.Property(e => e.Currency)
                .HasMaxLength(3)
                .IsUnicode(false)
                .IsFixedLength();
            entity.Property(e => e.Notes).HasMaxLength(2000);

            entity.HasOne(d => d.MaintenanceTask).WithMany(p => p.MaintenanceLogs)
                .HasForeignKey(d => d.MaintenanceTaskId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_MaintenanceLogs_MaintenanceTasks");

            entity.HasOne(d => d.Transaction).WithMany(p => p.MaintenanceLogs)
                .HasForeignKey(d => d.TransactionId)
                .HasConstraintName("FK_MaintenanceLogs_Transactions");

            entity.HasOne(d => d.User).WithMany(p => p.MaintenanceLogs)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_MaintenanceLogs_Users");
        });

        modelBuilder.Entity<MaintenanceTask>(entity =>
        {
            entity.ToTable("MaintenanceTasks", "home");

            entity.HasIndex(e => e.UserId, "IX_MaintenanceTasks_User").HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_MaintenanceTasks_CreatedAt");
            entity.Property(e => e.Notes).HasMaxLength(2000);
            entity.Property(e => e.RecurrenceFrequency).HasMaxLength(10);
            entity.Property(e => e.Title).HasMaxLength(200);

            entity.HasOne(d => d.Asset).WithMany(p => p.MaintenanceTasks)
                .HasForeignKey(d => d.AssetId)
                .HasConstraintName("FK_MaintenanceTasks_Assets");

            entity.HasOne(d => d.Contact).WithMany(p => p.MaintenanceTasks)
                .HasForeignKey(d => d.ContactId)
                .HasConstraintName("FK_MaintenanceTasks_Contacts");

            entity.HasOne(d => d.Property).WithMany(p => p.MaintenanceTasks)
                .HasForeignKey(d => d.PropertyId)
                .HasConstraintName("FK_MaintenanceTasks_Properties");

            entity.HasOne(d => d.Reminder).WithMany(p => p.MaintenanceTasks)
                .HasForeignKey(d => d.ReminderId)
                .HasConstraintName("FK_MaintenanceTasks_Reminders");

            entity.HasOne(d => d.User).WithMany(p => p.MaintenanceTasks)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_MaintenanceTasks_Users");

            entity.HasOne(d => d.Vehicle).WithMany(p => p.MaintenanceTasks)
                .HasForeignKey(d => d.VehicleId)
                .HasConstraintName("FK_MaintenanceTasks_Vehicles");
        });

        modelBuilder.Entity<Meal>(entity =>
        {
            entity.ToTable("Meals", "health");

            entity.HasIndex(e => new { e.UserId, e.EatenOn }, "IX_Meals_User_EatenOn").HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CarbsG).HasColumnType("decimal(5, 1)");
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_Meals_CreatedAt");
            entity.Property(e => e.Description).HasMaxLength(500);
            entity.Property(e => e.FatG).HasColumnType("decimal(5, 1)");
            entity.Property(e => e.MealType).HasMaxLength(10);
            entity.Property(e => e.ProteinG).HasColumnType("decimal(5, 1)");

            entity.HasOne(d => d.User).WithMany(p => p.Meals)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Meals_Users");
        });

        modelBuilder.Entity<MedicalCondition>(entity =>
        {
            entity.ToTable("MedicalConditions", "health");

            entity.HasIndex(e => new { e.UserId, e.Kind }, "IX_MedicalConditions_User_Kind").HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_MedicalConditions_CreatedAt");
            entity.Property(e => e.Kind).HasMaxLength(10);
            entity.Property(e => e.Name).HasMaxLength(200);
            entity.Property(e => e.Severity).HasMaxLength(10);

            entity.HasOne(d => d.User).WithMany(p => p.MedicalConditions)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_MedicalConditions_Users");
        });

        modelBuilder.Entity<Medication>(entity =>
        {
            entity.ToTable("Medications", "health");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_Medications_CreatedAt");
            entity.Property(e => e.Name).HasMaxLength(200);
            entity.Property(e => e.Strength).HasMaxLength(100);

            entity.HasOne(d => d.Condition).WithMany(p => p.Medications)
                .HasForeignKey(d => d.ConditionId)
                .HasConstraintName("FK_Medications_MedicalConditions");

            entity.HasOne(d => d.PrescribedAtVisit).WithMany(p => p.Medications)
                .HasForeignKey(d => d.PrescribedAtVisitId)
                .HasConstraintName("FK_Medications_DoctorVisits");

            entity.HasOne(d => d.User).WithMany(p => p.Medications)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Medications_Users");
        });

        modelBuilder.Entity<MedicationDose>(entity =>
        {
            entity.ToTable("MedicationDoses", "health");

            entity.HasIndex(e => new { e.UserId, e.DoseDate }, "IX_MedicationDoses_User_Date").HasFilter("([IsDeleted]=(0))");

            entity.HasIndex(e => new { e.ScheduleId, e.DoseDate }, "UX_MedicationDoses_Schedule_Date")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0) AND [ScheduleId] IS NOT NULL)");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_MedicationDoses_CreatedAt");
            entity.Property(e => e.Status).HasMaxLength(10);

            entity.HasOne(d => d.Medication).WithMany(p => p.MedicationDoses)
                .HasForeignKey(d => d.MedicationId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_MedicationDoses_Medications");

            entity.HasOne(d => d.Schedule).WithMany(p => p.MedicationDoses)
                .HasForeignKey(d => d.ScheduleId)
                .HasConstraintName("FK_MedicationDoses_MedicationSchedules");

            entity.HasOne(d => d.User).WithMany(p => p.MedicationDoses)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_MedicationDoses_Users");
        });

        modelBuilder.Entity<MedicationSchedule>(entity =>
        {
            entity.ToTable("MedicationSchedules", "health");

            entity.HasIndex(e => new { e.MedicationId, e.TimeOfDay }, "UX_MedicationSchedules_Medication_Time")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_MedicationSchedules_CreatedAt");
            entity.Property(e => e.Dose).HasMaxLength(100);
            entity.Property(e => e.ScheduleDays).HasDefaultValue((byte)127, "DF_MedicationSchedules_ScheduleDays");
            entity.Property(e => e.TimeOfDay).HasPrecision(0);

            entity.HasOne(d => d.Medication).WithMany(p => p.MedicationSchedules)
                .HasForeignKey(d => d.MedicationId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_MedicationSchedules_Medications");

            entity.HasOne(d => d.User).WithMany(p => p.MedicationSchedules)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_MedicationSchedules_Users");
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

        modelBuilder.Entity<MonthlyReflection>(entity =>
        {
            entity.ToTable("MonthlyReflections", "journal");

            entity.HasIndex(e => new { e.UserId, e.MonthStart }, "UX_MonthlyReflections_User_Month")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_MonthlyReflections_CreatedAt");

            entity.HasOne(d => d.User).WithMany(p => p.MonthlyReflections)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_MonthlyReflections_Users");
        });

        modelBuilder.Entity<PerformanceReview>(entity =>
        {
            entity.ToTable("PerformanceReviews", "career");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_PerformanceReviews_CreatedAt");
            entity.Property(e => e.Improvements).HasMaxLength(4000);
            entity.Property(e => e.Notes).HasMaxLength(4000);
            entity.Property(e => e.PeriodLabel).HasMaxLength(100);
            entity.Property(e => e.Rating).HasMaxLength(100);
            entity.Property(e => e.Strengths).HasMaxLength(4000);

            entity.HasOne(d => d.Employment).WithMany(p => p.PerformanceReviews)
                .HasForeignKey(d => d.EmploymentId)
                .HasConstraintName("FK_PerformanceReviews_Employments");

            entity.HasOne(d => d.User).WithMany(p => p.PerformanceReviews)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_PerformanceReviews_Users");
        });

        modelBuilder.Entity<PlanAssumption>(entity =>
        {
            entity.ToTable("PlanAssumptions", "finance");

            entity.HasIndex(e => e.UserId, "UX_PlanAssumptions_User")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_PlanAssumptions_CreatedAt");
            entity.Property(e => e.ExpectedReturnPercent).HasColumnType("decimal(5, 2)");
            entity.Property(e => e.InflationPercent).HasColumnType("decimal(5, 2)");
            entity.Property(e => e.MonthlySaving).HasColumnType("decimal(19, 4)");
            entity.Property(e => e.MonthlySpending).HasColumnType("decimal(19, 4)");

            entity.HasOne(d => d.User).WithOne(p => p.PlanAssumption)
                .HasForeignKey<PlanAssumption>(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_PlanAssumptions_Users");
        });

        modelBuilder.Entity<PointBatch>(entity =>
        {
            entity.ToTable("PointBatches", "shopping");

            entity.HasIndex(e => new { e.BenefitId, e.EarnedOn }, "IX_PointBatches_Benefit").HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_PointBatches_CreatedAt");
            entity.Property(e => e.Notes).HasMaxLength(500);

            entity.HasOne(d => d.Benefit).WithMany(p => p.PointBatches)
                .HasForeignKey(d => d.BenefitId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_PointBatches_Benefits");

            entity.HasOne(d => d.Purchase).WithMany(p => p.PointBatches)
                .HasForeignKey(d => d.PurchaseId)
                .HasConstraintName("FK_PointBatches_Purchases");

            entity.HasOne(d => d.User).WithMany(p => p.PointBatches)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_PointBatches_Users");
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

        modelBuilder.Entity<Property>(entity =>
        {
            entity.ToTable("Properties", "home");

            entity.HasIndex(e => new { e.UserId, e.Name }, "UX_Properties_User_Name")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.Address).HasMaxLength(500);
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_Properties_CreatedAt");
            entity.Property(e => e.Currency)
                .HasMaxLength(3)
                .IsUnicode(false)
                .IsFixedLength();
            entity.Property(e => e.Kind).HasMaxLength(20);
            entity.Property(e => e.Name).HasMaxLength(200);
            entity.Property(e => e.Notes).HasMaxLength(2000);
            entity.Property(e => e.Ownership).HasMaxLength(10);
            entity.Property(e => e.PurchasePrice).HasColumnType("decimal(19, 4)");

            entity.HasOne(d => d.User).WithMany(p => p.Properties)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Properties_Users");
        });

        modelBuilder.Entity<Purchase>(entity =>
        {
            entity.ToTable("Purchases", "shopping");

            entity.HasIndex(e => new { e.UserId, e.PurchasedOn }, "IX_Purchases_User_On").HasFilter("([IsDeleted]=(0))");

            entity.HasIndex(e => e.TransactionId, "UX_Purchases_Transaction")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0) AND [TransactionId] IS NOT NULL)");

            entity.Property(e => e.Amount).HasColumnType("decimal(19, 4)");
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_Purchases_CreatedAt");
            entity.Property(e => e.Currency)
                .HasMaxLength(3)
                .IsUnicode(false)
                .IsFixedLength();
            entity.Property(e => e.EstimatedAmount).HasColumnType("decimal(19, 4)");
            entity.Property(e => e.Notes).HasMaxLength(2000);
            entity.Property(e => e.Store).HasMaxLength(200);
            entity.Property(e => e.Title).HasMaxLength(200);

            entity.HasOne(d => d.Asset).WithMany(p => p.Purchases)
                .HasForeignKey(d => d.AssetId)
                .HasConstraintName("FK_Purchases_Assets");

            entity.HasOne(d => d.Transaction).WithOne(p => p.Purchase)
                .HasForeignKey<Purchase>(d => d.TransactionId)
                .HasConstraintName("FK_Purchases_Transactions");

            entity.HasOne(d => d.User).WithMany(p => p.Purchases)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Purchases_Users");
        });

        modelBuilder.Entity<PurchaseTag>(entity =>
        {
            entity.ToTable("PurchaseTags", "shopping");

            entity.HasIndex(e => new { e.PurchaseId, e.TagId }, "UX_PurchaseTags_Purchase_Tag")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_PurchaseTags_CreatedAt");

            entity.HasOne(d => d.Purchase).WithMany(p => p.PurchaseTags)
                .HasForeignKey(d => d.PurchaseId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_PurchaseTags_Purchases");

            entity.HasOne(d => d.Tag).WithMany(p => p.PurchaseTags)
                .HasForeignKey(d => d.TagId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_PurchaseTags_Tags");

            entity.HasOne(d => d.User).WithMany(p => p.PurchaseTags)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_PurchaseTags_Users");
        });

        modelBuilder.Entity<RecoveryCode>(entity =>
        {
            entity.ToTable("RecoveryCodes", "shared");

            entity.HasIndex(e => new { e.UserId, e.CodeHash }, "IX_RecoveryCodes_User_Hash").HasFilter("([IsDeleted]=(0) AND [UsedAt] IS NULL)");

            entity.Property(e => e.CodeHash)
                .HasMaxLength(64)
                .IsUnicode(false)
                .IsFixedLength();
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_RecoveryCodes_CreatedAt");

            entity.HasOne(d => d.User).WithMany(p => p.RecoveryCodes)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_RecoveryCodes_Users");
        });

        modelBuilder.Entity<RecurringTransaction>(entity =>
        {
            entity.ToTable("RecurringTransactions", "finance");

            entity.Property(e => e.Amount).HasColumnType("decimal(19, 4)");
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_RecurringTransactions_CreatedAt");
            entity.Property(e => e.Currency)
                .HasMaxLength(3)
                .IsUnicode(false)
                .IsFixedLength();
            entity.Property(e => e.ExchangeRate).HasColumnType("decimal(19, 8)");
            entity.Property(e => e.Kind).HasMaxLength(10);
            entity.Property(e => e.Name).HasMaxLength(200);
            entity.Property(e => e.Note).HasMaxLength(1000);
            entity.Property(e => e.Payee).HasMaxLength(200);
            entity.Property(e => e.RecurrenceFrequency).HasMaxLength(10);
            entity.Property(e => e.RecurrenceInterval).HasDefaultValue(1, "DF_RecurringTransactions_Interval");
            entity.Property(e => e.ToAmount).HasColumnType("decimal(19, 4)");
            entity.Property(e => e.ToCurrency)
                .HasMaxLength(3)
                .IsUnicode(false)
                .IsFixedLength();

            entity.HasOne(d => d.FromAccount).WithMany(p => p.RecurringTransactionFromAccounts)
                .HasForeignKey(d => d.FromAccountId)
                .HasConstraintName("FK_RecurringTransactions_FromAccount");

            entity.HasOne(d => d.ToAccount).WithMany(p => p.RecurringTransactionToAccounts)
                .HasForeignKey(d => d.ToAccountId)
                .HasConstraintName("FK_RecurringTransactions_ToAccount");

            entity.HasOne(d => d.User).WithMany(p => p.RecurringTransactions)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_RecurringTransactions_Users");
        });

        modelBuilder.Entity<RecurringTransactionTag>(entity =>
        {
            entity.ToTable("RecurringTransactionTags", "finance");

            entity.HasIndex(e => new { e.RecurringTransactionId, e.TagId }, "UX_RecurringTransactionTags_Recurring_Tag")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_RecurringTransactionTags_CreatedAt");

            entity.HasOne(d => d.RecurringTransaction).WithMany(p => p.RecurringTransactionTags)
                .HasForeignKey(d => d.RecurringTransactionId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_RecurringTransactionTags_RecurringTransactions");

            entity.HasOne(d => d.Tag).WithMany(p => p.RecurringTransactionTags)
                .HasForeignKey(d => d.TagId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_RecurringTransactionTags_Tags");

            entity.HasOne(d => d.User).WithMany(p => p.RecurringTransactionTags)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_RecurringTransactionTags_Users");
        });

        modelBuilder.Entity<Reminder>(entity =>
        {
            entity.ToTable("Reminders", "calendar");

            entity.HasIndex(e => new { e.EntityType, e.EntityId }, "IX_Reminders_Entity").HasFilter("([IsDeleted]=(0) AND [EntityType] IS NOT NULL)");

            entity.HasIndex(e => new { e.UserId, e.RemindAt }, "IX_Reminders_User_Due").HasFilter("([IsDeleted]=(0) AND [DismissedAt] IS NULL)");

            entity.HasIndex(e => new { e.EntityId, e.OccurrenceDate }, "UX_Reminders_EventOccurrence")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0) AND [OccurrenceDate] IS NOT NULL)");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_Reminders_CreatedAt");
            entity.Property(e => e.EntityType).HasMaxLength(50);
            entity.Property(e => e.RecurrenceFrequency).HasMaxLength(10);
            entity.Property(e => e.TimeZone).HasMaxLength(64);
            entity.Property(e => e.Title).HasMaxLength(200);

            entity.HasOne(d => d.User).WithMany(p => p.Reminders)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Reminders_Users");
        });

        modelBuilder.Entity<ResumeVersion>(entity =>
        {
            entity.ToTable("ResumeVersions", "career");

            entity.HasIndex(e => new { e.UserId, e.Name }, "UX_ResumeVersions_User_Name")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_ResumeVersions_CreatedAt");
            entity.Property(e => e.Name).HasMaxLength(200);
            entity.Property(e => e.Notes).HasMaxLength(2000);
            entity.Property(e => e.TargetRole).HasMaxLength(200);

            entity.HasOne(d => d.User).WithMany(p => p.ResumeVersions)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_ResumeVersions_Users");
        });

        modelBuilder.Entity<Return>(entity =>
        {
            entity.ToTable("Returns", "shopping");

            entity.HasIndex(e => new { e.PurchaseId, e.IsDeleted }, "UX_Returns_Purchase")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0))");

            entity.HasIndex(e => e.RefundTransactionId, "UX_Returns_RefundTransaction")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0) AND [RefundTransactionId] IS NOT NULL)");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_Returns_CreatedAt");
            entity.Property(e => e.Notes).HasMaxLength(2000);
            entity.Property(e => e.Reason).HasMaxLength(500);
            entity.Property(e => e.RefundAmount).HasColumnType("decimal(19, 4)");

            entity.HasOne(d => d.Purchase).WithMany(p => p.Returns)
                .HasForeignKey(d => d.PurchaseId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Returns_Purchases");

            entity.HasOne(d => d.RefundTransaction).WithOne(p => p.Return)
                .HasForeignKey<Return>(d => d.RefundTransactionId)
                .HasConstraintName("FK_Returns_Transactions");

            entity.HasOne(d => d.Reminder).WithMany(p => p.Returns)
                .HasForeignKey(d => d.ReminderId)
                .HasConstraintName("FK_Returns_Reminders");

            entity.HasOne(d => d.User).WithMany(p => p.Returns)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Returns_Users");
        });

        modelBuilder.Entity<Roadmap>(entity =>
        {
            entity.ToTable("Roadmaps", "learning");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_Roadmaps_CreatedAt");
            entity.Property(e => e.Description).HasMaxLength(2000);
            entity.Property(e => e.Status)
                .HasMaxLength(20)
                .HasDefaultValue("Active", "DF_Roadmaps_Status");
            entity.Property(e => e.Title).HasMaxLength(200);

            entity.HasOne(d => d.Goal).WithMany(p => p.Roadmaps)
                .HasForeignKey(d => d.GoalId)
                .HasConstraintName("FK_Roadmaps_Goals");

            entity.HasOne(d => d.User).WithMany(p => p.Roadmaps)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Roadmaps_Users");
        });

        modelBuilder.Entity<RoadmapStep>(entity =>
        {
            entity.ToTable("RoadmapSteps", "learning");

            entity.HasIndex(e => new { e.RoadmapId, e.SortOrder }, "IX_RoadmapSteps_Roadmap").HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_RoadmapSteps_CreatedAt");
            entity.Property(e => e.Title).HasMaxLength(200);

            entity.HasOne(d => d.Book).WithMany(p => p.RoadmapSteps)
                .HasForeignKey(d => d.BookId)
                .HasConstraintName("FK_RoadmapSteps_Books");

            entity.HasOne(d => d.Course).WithMany(p => p.RoadmapSteps)
                .HasForeignKey(d => d.CourseId)
                .HasConstraintName("FK_RoadmapSteps_Courses");

            entity.HasOne(d => d.Goal).WithMany(p => p.RoadmapSteps)
                .HasForeignKey(d => d.GoalId)
                .HasConstraintName("FK_RoadmapSteps_Goals");

            entity.HasOne(d => d.Roadmap).WithMany(p => p.RoadmapSteps)
                .HasForeignKey(d => d.RoadmapId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_RoadmapSteps_Roadmaps");

            entity.HasOne(d => d.User).WithMany(p => p.RoadmapSteps)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_RoadmapSteps_Users");
        });

        modelBuilder.Entity<Routine>(entity =>
        {
            entity.ToTable("Routines", "habits");

            entity.HasIndex(e => new { e.UserId, e.Name }, "UX_Routines_User_Name")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_Routines_CreatedAt");
            entity.Property(e => e.Name).HasMaxLength(100);

            entity.HasOne(d => d.User).WithMany(p => p.Routines)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Routines_Users");
        });

        modelBuilder.Entity<RoutineHabit>(entity =>
        {
            entity.ToTable("RoutineHabits", "habits");

            entity.HasIndex(e => e.HabitId, "IX_RoutineHabits_Habit").HasFilter("([IsDeleted]=(0))");

            entity.HasIndex(e => new { e.RoutineId, e.HabitId }, "UX_RoutineHabits_Routine_Habit")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_RoutineHabits_CreatedAt");

            entity.HasOne(d => d.Habit).WithMany(p => p.RoutineHabits)
                .HasForeignKey(d => d.HabitId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_RoutineHabits_Habits");

            entity.HasOne(d => d.Routine).WithMany(p => p.RoutineHabits)
                .HasForeignKey(d => d.RoutineId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_RoutineHabits_Routines");

            entity.HasOne(d => d.User).WithMany(p => p.RoutineHabits)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_RoutineHabits_Users");
        });

        modelBuilder.Entity<SalaryRecord>(entity =>
        {
            entity.ToTable("SalaryRecords", "career");

            entity.HasIndex(e => new { e.UserId, e.EffectiveOn }, "IX_SalaryRecords_User_Effective").HasFilter("([IsDeleted]=(0))");

            entity.HasIndex(e => new { e.EmploymentId, e.EffectiveOn }, "UX_SalaryRecords_Employment_Day")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0) AND [EmploymentId] IS NOT NULL)");

            entity.Property(e => e.Amount).HasColumnType("decimal(19, 4)");
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_SalaryRecords_CreatedAt");
            entity.Property(e => e.Currency)
                .HasMaxLength(3)
                .IsUnicode(false)
                .IsFixedLength();
            entity.Property(e => e.Note).HasMaxLength(1000);
            entity.Property(e => e.Period)
                .HasMaxLength(10)
                .HasDefaultValue("Year", "DF_SalaryRecords_Period");
            entity.Property(e => e.Reason)
                .HasMaxLength(20)
                .HasDefaultValue("Starting", "DF_SalaryRecords_Reason");

            entity.HasOne(d => d.Employment).WithMany(p => p.SalaryRecords)
                .HasForeignKey(d => d.EmploymentId)
                .HasConstraintName("FK_SalaryRecords_Employments");

            entity.HasOne(d => d.User).WithMany(p => p.SalaryRecords)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_SalaryRecords_Users");
        });

        modelBuilder.Entity<Scenario>(entity =>
        {
            entity.ToTable("Scenarios", "finance");

            entity.HasIndex(e => new { e.UserId, e.Name }, "UX_Scenarios_User_Name")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_Scenarios_CreatedAt");
            entity.Property(e => e.Name).HasMaxLength(200);
            entity.Property(e => e.Notes).HasMaxLength(2000);

            entity.HasOne(d => d.User).WithMany(p => p.Scenarios)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Scenarios_Users");
        });

        modelBuilder.Entity<ScenarioLine>(entity =>
        {
            entity.ToTable("ScenarioLines", "finance");

            entity.HasIndex(e => new { e.ScenarioId, e.SortOrder }, "IX_ScenarioLines_Scenario").HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.Amount).HasColumnType("decimal(19, 4)");
            entity.Property(e => e.AnnualRate).HasColumnType("decimal(7, 4)");
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_ScenarioLines_CreatedAt");
            entity.Property(e => e.Kind).HasMaxLength(15);
            entity.Property(e => e.Title).HasMaxLength(200);

            entity.HasOne(d => d.Account).WithMany(p => p.ScenarioLines)
                .HasForeignKey(d => d.AccountId)
                .HasConstraintName("FK_ScenarioLines_Accounts");

            entity.HasOne(d => d.Scenario).WithMany(p => p.ScenarioLines)
                .HasForeignKey(d => d.ScenarioId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_ScenarioLines_Scenarios");

            entity.HasOne(d => d.User).WithMany(p => p.ScenarioLines)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_ScenarioLines_Users");
        });

        modelBuilder.Entity<ShoppingList>(entity =>
        {
            entity.ToTable("ShoppingLists", "shopping");

            entity.HasIndex(e => new { e.UserId, e.Name }, "UX_ShoppingLists_User_Name")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_ShoppingLists_CreatedAt");
            entity.Property(e => e.Name).HasMaxLength(200);
            entity.Property(e => e.Notes).HasMaxLength(2000);

            entity.HasOne(d => d.User).WithMany(p => p.ShoppingLists)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_ShoppingLists_Users");
        });

        modelBuilder.Entity<ShoppingListItem>(entity =>
        {
            entity.ToTable("ShoppingListItems", "shopping");

            entity.HasIndex(e => new { e.ListId, e.SortOrder }, "IX_ShoppingListItems_List").HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_ShoppingListItems_CreatedAt");
            entity.Property(e => e.Currency)
                .HasMaxLength(3)
                .IsUnicode(false)
                .IsFixedLength();
            entity.Property(e => e.EstimatedPrice).HasColumnType("decimal(19, 4)");
            entity.Property(e => e.Name).HasMaxLength(200);
            entity.Property(e => e.Quantity).HasMaxLength(50);

            entity.HasOne(d => d.List).WithMany(p => p.ShoppingListItems)
                .HasForeignKey(d => d.ListId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_ShoppingListItems_Lists");

            entity.HasOne(d => d.Purchase).WithMany(p => p.ShoppingListItems)
                .HasForeignKey(d => d.PurchaseId)
                .HasConstraintName("FK_ShoppingListItems_Purchases");

            entity.HasOne(d => d.User).WithMany(p => p.ShoppingListItems)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_ShoppingListItems_Users");
        });

        modelBuilder.Entity<SideIncomeSource>(entity =>
        {
            entity.ToTable("SideIncomeSources", "career");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_SideIncomeSources_CreatedAt");
            entity.Property(e => e.Kind).HasMaxLength(20);
            entity.Property(e => e.Name).HasMaxLength(200);
            entity.Property(e => e.Notes).HasMaxLength(4000);
            entity.Property(e => e.Status)
                .HasMaxLength(10)
                .HasDefaultValue("Active", "DF_SideIncomeSources_Status");
            entity.Property(e => e.Url).HasMaxLength(2000);

            entity.HasOne(d => d.User).WithMany(p => p.SideIncomeSources)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_SideIncomeSources_Users");
        });

        modelBuilder.Entity<Skill>(entity =>
        {
            entity.ToTable("Skills", "learning");

            entity.HasIndex(e => new { e.UserId, e.Name }, "UX_Skills_User_Name")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_Skills_CreatedAt");
            entity.Property(e => e.Description).HasMaxLength(2000);
            entity.Property(e => e.Name).HasMaxLength(200);

            entity.HasOne(d => d.LifeArea).WithMany(p => p.Skills)
                .HasForeignKey(d => d.LifeAreaId)
                .HasConstraintName("FK_Skills_LifeAreas");

            entity.HasOne(d => d.User).WithMany(p => p.Skills)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Skills_Users");
        });

        modelBuilder.Entity<SkillLevelChange>(entity =>
        {
            entity.ToTable("SkillLevelChanges", "learning");

            entity.HasIndex(e => new { e.SkillId, e.ChangedOn }, "IX_SkillLevelChanges_Skill").HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_SkillLevelChanges_CreatedAt");
            entity.Property(e => e.Note).HasMaxLength(1000);

            entity.HasOne(d => d.Skill).WithMany(p => p.SkillLevelChanges)
                .HasForeignKey(d => d.SkillId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_SkillLevelChanges_Skills");

            entity.HasOne(d => d.User).WithMany(p => p.SkillLevelChanges)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_SkillLevelChanges_Users");
        });

        modelBuilder.Entity<SkillTag>(entity =>
        {
            entity.ToTable("SkillTags", "learning");

            entity.HasIndex(e => new { e.SkillId, e.TagId }, "UX_SkillTags_Skill_Tag")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_SkillTags_CreatedAt");

            entity.HasOne(d => d.Skill).WithMany(p => p.SkillTags)
                .HasForeignKey(d => d.SkillId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_SkillTags_Skills");

            entity.HasOne(d => d.Tag).WithMany(p => p.SkillTags)
                .HasForeignKey(d => d.TagId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_SkillTags_Tags");

            entity.HasOne(d => d.User).WithMany(p => p.SkillTags)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_SkillTags_Users");
        });

        modelBuilder.Entity<SleepRecord>(entity =>
        {
            entity.ToTable("SleepRecords", "health");

            entity.HasIndex(e => new { e.UserId, e.WokeOn }, "IX_SleepRecords_User_WokeOn").HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_SleepRecords_CreatedAt");

            entity.HasOne(d => d.User).WithMany(p => p.SleepRecords)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_SleepRecords_Users");
        });

        modelBuilder.Entity<StudySession>(entity =>
        {
            entity.ToTable("StudySessions", "learning");

            entity.HasIndex(e => new { e.UserId, e.StudiedOn }, "IX_StudySessions_User_Day").HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_StudySessions_CreatedAt");
            entity.Property(e => e.Notes).HasMaxLength(2000);
            entity.Property(e => e.Topic).HasMaxLength(200);

            entity.HasOne(d => d.Book).WithMany(p => p.StudySessions)
                .HasForeignKey(d => d.BookId)
                .HasConstraintName("FK_StudySessions_Books");

            entity.HasOne(d => d.Course).WithMany(p => p.StudySessions)
                .HasForeignKey(d => d.CourseId)
                .HasConstraintName("FK_StudySessions_Courses");

            entity.HasOne(d => d.Skill).WithMany(p => p.StudySessions)
                .HasForeignKey(d => d.SkillId)
                .HasConstraintName("FK_StudySessions_Skills");

            entity.HasOne(d => d.User).WithMany(p => p.StudySessions)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_StudySessions_Users");
        });

        modelBuilder.Entity<Subscription>(entity =>
        {
            entity.ToTable("Subscriptions", "shopping");

            entity.HasIndex(e => e.RecurringTransactionId, "UX_Subscriptions_RecurringTransaction")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0) AND [RecurringTransactionId] IS NOT NULL)");

            entity.Property(e => e.Amount).HasColumnType("decimal(19, 4)");
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_Subscriptions_CreatedAt");
            entity.Property(e => e.Currency)
                .HasMaxLength(3)
                .IsUnicode(false)
                .IsFixedLength();
            entity.Property(e => e.Name).HasMaxLength(200);
            entity.Property(e => e.Notes).HasMaxLength(2000);
            entity.Property(e => e.Provider).HasMaxLength(200);
            entity.Property(e => e.RecurrenceFrequency).HasMaxLength(10);
            entity.Property(e => e.RecurrenceInterval).HasDefaultValue(1, "DF_Subscriptions_Interval");
            entity.Property(e => e.Status)
                .HasMaxLength(10)
                .HasDefaultValue("Active", "DF_Subscriptions_Status");

            entity.HasOne(d => d.Account).WithMany(p => p.Subscriptions)
                .HasForeignKey(d => d.AccountId)
                .HasConstraintName("FK_Subscriptions_Accounts");

            entity.HasOne(d => d.RecurringTransaction).WithOne(p => p.Subscription)
                .HasForeignKey<Subscription>(d => d.RecurringTransactionId)
                .HasConstraintName("FK_Subscriptions_RecurringTransactions");

            entity.HasOne(d => d.Reminder).WithMany(p => p.Subscriptions)
                .HasForeignKey(d => d.ReminderId)
                .HasConstraintName("FK_Subscriptions_Reminders");

            entity.HasOne(d => d.User).WithMany(p => p.Subscriptions)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Subscriptions_Users");
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

        modelBuilder.Entity<TaskDependency>(entity =>
        {
            entity.ToTable("TaskDependencies", "tasks");

            entity.HasIndex(e => e.BlockedByTaskId, "IX_TaskDependencies_BlockedBy").HasFilter("([IsDeleted]=(0))");

            entity.HasIndex(e => new { e.TaskItemId, e.BlockedByTaskId }, "UX_TaskDependencies_Pair")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_TaskDependencies_CreatedAt");

            entity.HasOne(d => d.BlockedByTask).WithMany(p => p.TaskDependencyBlockedByTasks)
                .HasForeignKey(d => d.BlockedByTaskId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_TaskDependencies_BlockedBy");

            entity.HasOne(d => d.TaskItem).WithMany(p => p.TaskDependencyTaskItems)
                .HasForeignKey(d => d.TaskItemId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_TaskDependencies_Task");

            entity.HasOne(d => d.User).WithMany(p => p.TaskDependencies)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_TaskDependencies_Users");
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

        modelBuilder.Entity<TaxItem>(entity =>
        {
            entity.ToTable("TaxItems", "finance");

            entity.HasIndex(e => new { e.UserId, e.DueOn }, "IX_TaxItems_User_Due").HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.Amount).HasColumnType("decimal(19, 4)");
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_TaxItems_CreatedAt");
            entity.Property(e => e.Currency)
                .HasMaxLength(3)
                .IsUnicode(false)
                .IsFixedLength();
            entity.Property(e => e.Kind).HasMaxLength(20);
            entity.Property(e => e.Notes).HasMaxLength(2000);
            entity.Property(e => e.TaxYear).HasMaxLength(20);
            entity.Property(e => e.Title).HasMaxLength(200);

            entity.HasOne(d => d.Transaction).WithMany(p => p.TaxItems)
                .HasForeignKey(d => d.TransactionId)
                .HasConstraintName("FK_TaxItems_Transactions");

            entity.HasOne(d => d.User).WithMany(p => p.TaxItems)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_TaxItems_Users");
        });

        modelBuilder.Entity<Transaction>(entity =>
        {
            entity.ToTable("Transactions", "finance");

            entity.HasIndex(e => e.FromAccountId, "IX_Transactions_FromAccount").HasFilter("([IsDeleted]=(0) AND [FromAccountId] IS NOT NULL)");

            entity.HasIndex(e => new { e.LoanId, e.OccurredOn }, "IX_Transactions_Loan").HasFilter("([IsDeleted]=(0) AND [LoanId] IS NOT NULL)");

            entity.HasIndex(e => e.ToAccountId, "IX_Transactions_ToAccount").HasFilter("([IsDeleted]=(0) AND [ToAccountId] IS NOT NULL)");

            entity.HasIndex(e => new { e.UserId, e.OccurredOn }, "IX_Transactions_User_Day").HasFilter("([IsDeleted]=(0))");

            entity.HasIndex(e => new { e.LoanId, e.IsLoanDisbursement }, "UX_Transactions_LoanDisbursement")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0) AND [IsLoanDisbursement]=(1))");

            entity.HasIndex(e => new { e.RecurringTransactionId, e.OccurrenceDate }, "UX_Transactions_Occurrence")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0) AND [RecurringTransactionId] IS NOT NULL)");

            entity.HasIndex(e => new { e.UserId, e.ImportHash }, "UX_Transactions_User_ImportHash")
                .IsUnique()
                .HasFilter("([ImportHash] IS NOT NULL)");

            entity.Property(e => e.Amount).HasColumnType("decimal(19, 4)");
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_Transactions_CreatedAt");
            entity.Property(e => e.Currency)
                .HasMaxLength(3)
                .IsUnicode(false)
                .IsFixedLength();
            entity.Property(e => e.ExchangeRate).HasColumnType("decimal(19, 8)");
            entity.Property(e => e.ImportHash)
                .HasMaxLength(64)
                .IsUnicode(false)
                .IsFixedLength();
            entity.Property(e => e.Kind).HasMaxLength(10);
            entity.Property(e => e.Note).HasMaxLength(1000);
            entity.Property(e => e.Payee).HasMaxLength(200);
            entity.Property(e => e.Reference).HasMaxLength(100);
            entity.Property(e => e.ToAmount).HasColumnType("decimal(19, 4)");
            entity.Property(e => e.ToCurrency)
                .HasMaxLength(3)
                .IsUnicode(false)
                .IsFixedLength();

            entity.HasOne(d => d.Employment).WithMany(p => p.Transactions)
                .HasForeignKey(d => d.EmploymentId)
                .HasConstraintName("FK_Transactions_Employments");

            entity.HasOne(d => d.FromAccount).WithMany(p => p.TransactionFromAccounts)
                .HasForeignKey(d => d.FromAccountId)
                .HasConstraintName("FK_Transactions_FromAccount");

            entity.HasOne(d => d.Loan).WithMany(p => p.Transactions)
                .HasForeignKey(d => d.LoanId)
                .HasConstraintName("FK_Transactions_Loans");

            entity.HasOne(d => d.RecurringTransaction).WithMany(p => p.Transactions)
                .HasForeignKey(d => d.RecurringTransactionId)
                .HasConstraintName("FK_Transactions_RecurringTransactions");

            entity.HasOne(d => d.SideIncomeSource).WithMany(p => p.Transactions)
                .HasForeignKey(d => d.SideIncomeSourceId)
                .HasConstraintName("FK_Transactions_SideIncomeSources");

            entity.HasOne(d => d.ToAccount).WithMany(p => p.TransactionToAccounts)
                .HasForeignKey(d => d.ToAccountId)
                .HasConstraintName("FK_Transactions_ToAccount");

            entity.HasOne(d => d.User).WithMany(p => p.Transactions)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Transactions_Users");
        });

        modelBuilder.Entity<TransactionTag>(entity =>
        {
            entity.ToTable("TransactionTags", "finance");

            entity.HasIndex(e => e.TagId, "IX_TransactionTags_Tag").HasFilter("([IsDeleted]=(0))");

            entity.HasIndex(e => new { e.TransactionId, e.TagId }, "UX_TransactionTags_Transaction_Tag")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_TransactionTags_CreatedAt");

            entity.HasOne(d => d.Tag).WithMany(p => p.TransactionTags)
                .HasForeignKey(d => d.TagId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_TransactionTags_Tags");

            entity.HasOne(d => d.Transaction).WithMany(p => p.TransactionTags)
                .HasForeignKey(d => d.TransactionId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_TransactionTags_Transactions");

            entity.HasOne(d => d.User).WithMany(p => p.TransactionTags)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_TransactionTags_Users");
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

            entity.Property(e => e.BaseCurrency)
                .HasMaxLength(3)
                .IsUnicode(false)
                .IsFixedLength();
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_Users_CreatedAt");
            entity.Property(e => e.DisplayName).HasMaxLength(200);
            entity.Property(e => e.Email).HasMaxLength(256);
            entity.Property(e => e.LifeVision).HasMaxLength(2000);
            entity.Property(e => e.PasswordHash).HasMaxLength(500);
            entity.Property(e => e.TimeZone).HasMaxLength(64);
            entity.Property(e => e.Username).HasMaxLength(100);
        });

        modelBuilder.Entity<UserHiddenLifeArea>(entity =>
        {
            entity.ToTable("UserHiddenLifeAreas", "shared");

            entity.HasIndex(e => new { e.UserId, e.LifeAreaId }, "UX_UserHiddenLifeAreas_User_Area")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_UserHiddenLifeAreas_CreatedAt");

            entity.HasOne(d => d.LifeArea).WithMany(p => p.UserHiddenLifeAreas)
                .HasForeignKey(d => d.LifeAreaId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_UserHiddenLifeAreas_LifeAreas");

            entity.HasOne(d => d.User).WithMany(p => p.UserHiddenLifeAreas)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_UserHiddenLifeAreas_Users");
        });

        modelBuilder.Entity<UserHiddenModule>(entity =>
        {
            entity.ToTable("UserHiddenModules", "shared");

            entity.HasIndex(e => new { e.UserId, e.ModuleKey }, "UX_UserHiddenModules_User_Module")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_UserHiddenModules_CreatedAt");
            entity.Property(e => e.ModuleKey).HasMaxLength(30);

            entity.HasOne(d => d.User).WithMany(p => p.UserHiddenModules)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_UserHiddenModules_Users");
        });

        modelBuilder.Entity<UtilityBill>(entity =>
        {
            entity.ToTable("UtilityBills", "home");

            entity.HasIndex(e => new { e.UserId, e.DueOn }, "IX_UtilityBills_User_DueOn").HasFilter("([IsDeleted]=(0))");

            entity.HasIndex(e => e.TransactionId, "UX_UtilityBills_Transaction")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0) AND [TransactionId] IS NOT NULL)");

            entity.Property(e => e.Amount).HasColumnType("decimal(19, 4)");
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_UtilityBills_CreatedAt");
            entity.Property(e => e.Currency)
                .HasMaxLength(3)
                .IsUnicode(false)
                .IsFixedLength();
            entity.Property(e => e.Kind).HasMaxLength(20);
            entity.Property(e => e.Notes).HasMaxLength(2000);
            entity.Property(e => e.Provider).HasMaxLength(200);
            entity.Property(e => e.UnitsUsed).HasColumnType("decimal(19, 4)");

            entity.HasOne(d => d.Property).WithMany(p => p.UtilityBills)
                .HasForeignKey(d => d.PropertyId)
                .HasConstraintName("FK_UtilityBills_Properties");

            entity.HasOne(d => d.Transaction).WithOne(p => p.UtilityBill)
                .HasForeignKey<UtilityBill>(d => d.TransactionId)
                .HasConstraintName("FK_UtilityBills_Transactions");

            entity.HasOne(d => d.User).WithMany(p => p.UtilityBills)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_UtilityBills_Users");
        });

        modelBuilder.Entity<VaultAccessLog>(entity =>
        {
            entity.ToTable("VaultAccessLog", "shared");

            entity.HasIndex(e => new { e.UserId, e.CreatedAt }, "IX_VaultAccessLog_User_CreatedAt")
                .IsDescending(false, true)
                .HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.Action).HasMaxLength(20);
            entity.Property(e => e.ClientAddress).HasMaxLength(45);
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_VaultAccessLog_CreatedAt");
            entity.Property(e => e.Detail).HasMaxLength(255);
            entity.Property(e => e.EntityType).HasMaxLength(100);

            entity.HasOne(d => d.User).WithMany(p => p.VaultAccessLogs)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_VaultAccessLog_Users");
        });

        modelBuilder.Entity<Vehicle>(entity =>
        {
            entity.ToTable("Vehicles", "home");

            entity.HasIndex(e => new { e.UserId, e.Name }, "UX_Vehicles_User_Name")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_Vehicles_CreatedAt");
            entity.Property(e => e.Currency)
                .HasMaxLength(3)
                .IsUnicode(false)
                .IsFixedLength();
            entity.Property(e => e.DisposalAmount).HasColumnType("decimal(19, 4)");
            entity.Property(e => e.DisposalKind).HasMaxLength(10);
            entity.Property(e => e.FuelUnit)
                .HasMaxLength(5)
                .HasDefaultValue("Litre", "DF_Vehicles_FuelUnit");
            entity.Property(e => e.Kind).HasMaxLength(20);
            entity.Property(e => e.Make).HasMaxLength(100);
            entity.Property(e => e.Model).HasMaxLength(100);
            entity.Property(e => e.Name).HasMaxLength(200);
            entity.Property(e => e.Notes).HasMaxLength(2000);
            entity.Property(e => e.PurchasePrice).HasColumnType("decimal(19, 4)");
            entity.Property(e => e.RegistrationNumber).HasMaxLength(20);

            entity.HasOne(d => d.InsurancePolicy).WithMany(p => p.Vehicles)
                .HasForeignKey(d => d.InsurancePolicyId)
                .HasConstraintName("FK_Vehicles_InsurancePolicies");

            entity.HasOne(d => d.PucReminder).WithMany(p => p.VehiclePucReminders)
                .HasForeignKey(d => d.PucReminderId)
                .HasConstraintName("FK_Vehicles_PucReminder");

            entity.HasOne(d => d.RegistrationReminder).WithMany(p => p.VehicleRegistrationReminders)
                .HasForeignKey(d => d.RegistrationReminderId)
                .HasConstraintName("FK_Vehicles_RegistrationReminder");

            entity.HasOne(d => d.User).WithMany(p => p.Vehicles)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Vehicles_Users");
        });

        modelBuilder.Entity<Warranty>(entity =>
        {
            entity.ToTable("Warranties", "home");

            entity.HasIndex(e => new { e.UserId, e.ExpiresOn }, "IX_Warranties_User_ExpiresOn").HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.Cost).HasColumnType("decimal(19, 4)");
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_Warranties_CreatedAt");
            entity.Property(e => e.Currency)
                .HasMaxLength(3)
                .IsUnicode(false)
                .IsFixedLength();
            entity.Property(e => e.Kind).HasMaxLength(10);
            entity.Property(e => e.Notes).HasMaxLength(2000);
            entity.Property(e => e.Provider).HasMaxLength(200);

            entity.HasOne(d => d.Asset).WithMany(p => p.Warranties)
                .HasForeignKey(d => d.AssetId)
                .HasConstraintName("FK_Warranties_Assets");

            entity.HasOne(d => d.Contact).WithMany(p => p.Warranties)
                .HasForeignKey(d => d.ContactId)
                .HasConstraintName("FK_Warranties_Contacts");

            entity.HasOne(d => d.Property).WithMany(p => p.Warranties)
                .HasForeignKey(d => d.PropertyId)
                .HasConstraintName("FK_Warranties_Properties");

            entity.HasOne(d => d.Reminder).WithMany(p => p.Warranties)
                .HasForeignKey(d => d.ReminderId)
                .HasConstraintName("FK_Warranties_Reminders");

            entity.HasOne(d => d.User).WithMany(p => p.Warranties)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Warranties_Users");

            entity.HasOne(d => d.Vehicle).WithMany(p => p.Warranties)
                .HasForeignKey(d => d.VehicleId)
                .HasConstraintName("FK_Warranties_Vehicles");
        });

        modelBuilder.Entity<WaterIntake>(entity =>
        {
            entity.ToTable("WaterIntakes", "health");

            entity.HasIndex(e => new { e.UserId, e.DrunkOn }, "IX_WaterIntakes_User_DrunkOn").HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_WaterIntakes_CreatedAt");

            entity.HasOne(d => d.User).WithMany(p => p.WaterIntakes)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_WaterIntakes_Users");
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

        modelBuilder.Entity<WellnessCheckIn>(entity =>
        {
            entity.ToTable("WellnessCheckIns", "health");

            entity.HasIndex(e => new { e.UserId, e.CheckInOn }, "UX_WellnessCheckIns_User_Day")
                .IsUnique()
                .HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_WellnessCheckIns_CreatedAt");

            entity.HasOne(d => d.User).WithMany(p => p.WellnessCheckIns)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_WellnessCheckIns_Users");
        });

        modelBuilder.Entity<WishlistItem>(entity =>
        {
            entity.ToTable("WishlistItems", "shopping");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_WishlistItems_CreatedAt");
            entity.Property(e => e.Currency)
                .HasMaxLength(3)
                .IsUnicode(false)
                .IsFixedLength();
            entity.Property(e => e.Name).HasMaxLength(200);
            entity.Property(e => e.Notes).HasMaxLength(2000);
            entity.Property(e => e.Price).HasColumnType("decimal(19, 4)");
            entity.Property(e => e.Priority)
                .HasMaxLength(10)
                .HasDefaultValue("Medium", "DF_WishlistItems_Priority");
            entity.Property(e => e.Store).HasMaxLength(200);
            entity.Property(e => e.TargetPrice).HasColumnType("decimal(19, 4)");
            entity.Property(e => e.Url).HasMaxLength(500);

            entity.HasOne(d => d.Purchase).WithMany(p => p.WishlistItems)
                .HasForeignKey(d => d.PurchaseId)
                .HasConstraintName("FK_WishlistItems_Purchases");

            entity.HasOne(d => d.User).WithMany(p => p.WishlistItems)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_WishlistItems_Users");
        });

        modelBuilder.Entity<Workout>(entity =>
        {
            entity.ToTable("Workouts", "health");

            entity.HasIndex(e => new { e.UserId, e.OccurredOn }, "IX_Workouts_User_OccurredOn").HasFilter("([IsDeleted]=(0))");

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())", "DF_Workouts_CreatedAt");
            entity.Property(e => e.DistanceKm).HasColumnType("decimal(6, 2)");
            entity.Property(e => e.Intensity).HasMaxLength(10);
            entity.Property(e => e.Kind).HasMaxLength(10);

            entity.HasOne(d => d.User).WithMany(p => p.Workouts)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Workouts_Users");
        });

        OnModelCreatingPartial(modelBuilder);
    }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);
}
