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

    public string? LifeVision { get; set; }

    public virtual ICollection<AccountCurrency> AccountCurrencies { get; set; } = new List<AccountCurrency>();

    public virtual ICollection<Account> Accounts { get; set; } = new List<Account>();

    public virtual ICollection<ApplicationStageChange> ApplicationStageChanges { get; set; } = new List<ApplicationStageChange>();

    public virtual ICollection<AssetTag> AssetTags { get; set; } = new List<AssetTag>();

    public virtual ICollection<Asset> Assets { get; set; } = new List<Asset>();

    public virtual ICollection<Attachment> Attachments { get; set; } = new List<Attachment>();

    public virtual ICollection<BodyMeasurement> BodyMeasurements { get; set; } = new List<BodyMeasurement>();

    public virtual ICollection<BookNote> BookNotes { get; set; } = new List<BookNote>();

    public virtual ICollection<BookTag> BookTags { get; set; } = new List<BookTag>();

    public virtual ICollection<Book> Books { get; set; } = new List<Book>();

    public virtual ICollection<Budget> Budgets { get; set; } = new List<Budget>();

    public virtual ICollection<CareerAchievement> CareerAchievements { get; set; } = new List<CareerAchievement>();

    public virtual ICollection<Certification> Certifications { get; set; } = new List<Certification>();

    public virtual Chapter? Chapter { get; set; }

    public virtual ICollection<ContactTag> ContactTags { get; set; } = new List<ContactTag>();

    public virtual ICollection<Contact> Contacts { get; set; } = new List<Contact>();

    public virtual ICollection<Course> Courses { get; set; } = new List<Course>();

    public virtual ICollection<Decision> Decisions { get; set; } = new List<Decision>();

    public virtual ICollection<DismissedInsight> DismissedInsights { get; set; } = new List<DismissedInsight>();

    public virtual ICollection<DoctorVisit> DoctorVisits { get; set; } = new List<DoctorVisit>();

    public virtual ICollection<DocumentFile> DocumentFiles { get; set; } = new List<DocumentFile>();

    public virtual ICollection<DocumentTag> DocumentTags { get; set; } = new List<DocumentTag>();

    public virtual ICollection<Document> Documents { get; set; } = new List<Document>();

    public virtual ICollection<Employment> Employments { get; set; } = new List<Employment>();

    public virtual ICollection<EntityLink> EntityLinks { get; set; } = new List<EntityLink>();

    public virtual ICollection<EventException> EventExceptions { get; set; } = new List<EventException>();

    public virtual ICollection<Event> Events { get; set; } = new List<Event>();

    public virtual ICollection<ExchangeRate> ExchangeRates { get; set; } = new List<ExchangeRate>();

    public virtual ICollection<FocusSession> FocusSessions { get; set; } = new List<FocusSession>();

    public virtual ICollection<FuelLog> FuelLogs { get; set; } = new List<FuelLog>();

    public virtual ICollection<GoalHistory> GoalHistories { get; set; } = new List<GoalHistory>();

    public virtual ICollection<GoalMilestone> GoalMilestones { get; set; } = new List<GoalMilestone>();

    public virtual ICollection<GoalTag> GoalTags { get; set; } = new List<GoalTag>();

    public virtual ICollection<GoalTarget> GoalTargets { get; set; } = new List<GoalTarget>();

    public virtual ICollection<Goal> Goals { get; set; } = new List<Goal>();

    public virtual ICollection<HabitChallenge> HabitChallenges { get; set; } = new List<HabitChallenge>();

    public virtual ICollection<HabitEntry> HabitEntries { get; set; } = new List<HabitEntry>();

    public virtual ICollection<HabitTag> HabitTags { get; set; } = new List<HabitTag>();

    public virtual ICollection<Habit> Habits { get; set; } = new List<Habit>();

    public virtual HealthProfile? HealthProfile { get; set; }

    public virtual ICollection<HoldingValuation> HoldingValuations { get; set; } = new List<HoldingValuation>();

    public virtual ICollection<Holding> Holdings { get; set; } = new List<Holding>();

    public virtual ICollection<HouseholdProject> HouseholdProjects { get; set; } = new List<HouseholdProject>();

    public virtual ICollection<InboxItem> InboxItems { get; set; } = new List<InboxItem>();

    public virtual ICollection<InsurancePolicy> InsurancePolicies { get; set; } = new List<InsurancePolicy>();

    public virtual ICollection<InterviewQuestionTag> InterviewQuestionTags { get; set; } = new List<InterviewQuestionTag>();

    public virtual ICollection<InterviewQuestion> InterviewQuestions { get; set; } = new List<InterviewQuestion>();

    public virtual ICollection<Interview> Interviews { get; set; } = new List<Interview>();

    public virtual ICollection<JobApplication> JobApplications { get; set; } = new List<JobApplication>();

    public virtual ICollection<JournalEntry> JournalEntries { get; set; } = new List<JournalEntry>();

    public virtual ICollection<JournalEntryTag> JournalEntryTags { get; set; } = new List<JournalEntryTag>();

    public virtual ICollection<JournalNote> JournalNotes { get; set; } = new List<JournalNote>();

    public virtual ICollection<KnowledgeNoteTag> KnowledgeNoteTags { get; set; } = new List<KnowledgeNoteTag>();

    public virtual ICollection<KnowledgeNote> KnowledgeNotes { get; set; } = new List<KnowledgeNote>();

    public virtual ICollection<KpiTile> KpiTiles { get; set; } = new List<KpiTile>();

    public virtual ICollection<LabResult> LabResults { get; set; } = new List<LabResult>();

    public virtual ICollection<LifeAreaRating> LifeAreaRatings { get; set; } = new List<LifeAreaRating>();

    public virtual ICollection<Loan> Loans { get; set; } = new List<Loan>();

    public virtual ICollection<MaintenanceLog> MaintenanceLogs { get; set; } = new List<MaintenanceLog>();

    public virtual ICollection<MaintenanceTask> MaintenanceTasks { get; set; } = new List<MaintenanceTask>();

    public virtual ICollection<Meal> Meals { get; set; } = new List<Meal>();

    public virtual ICollection<MedicalCondition> MedicalConditions { get; set; } = new List<MedicalCondition>();

    public virtual ICollection<MedicationDose> MedicationDoses { get; set; } = new List<MedicationDose>();

    public virtual ICollection<MedicationSchedule> MedicationSchedules { get; set; } = new List<MedicationSchedule>();

    public virtual ICollection<Medication> Medications { get; set; } = new List<Medication>();

    public virtual ICollection<MissionDebrief> MissionDebriefs { get; set; } = new List<MissionDebrief>();

    public virtual ICollection<MissionPrerequisite> MissionPrerequisites { get; set; } = new List<MissionPrerequisite>();

    public virtual ICollection<MonthlyReflection> MonthlyReflections { get; set; } = new List<MonthlyReflection>();

    public virtual ICollection<PerformanceReview> PerformanceReviews { get; set; } = new List<PerformanceReview>();

    public virtual ICollection<Project> Projects { get; set; } = new List<Project>();

    public virtual ICollection<Property> Properties { get; set; } = new List<Property>();

    public virtual ICollection<RecoveryCode> RecoveryCodes { get; set; } = new List<RecoveryCode>();

    public virtual ICollection<RecurringTransactionTag> RecurringTransactionTags { get; set; } = new List<RecurringTransactionTag>();

    public virtual ICollection<RecurringTransaction> RecurringTransactions { get; set; } = new List<RecurringTransaction>();

    public virtual ICollection<Reminder> Reminders { get; set; } = new List<Reminder>();

    public virtual ICollection<ResumeVersion> ResumeVersions { get; set; } = new List<ResumeVersion>();

    public virtual ICollection<RoadmapStep> RoadmapSteps { get; set; } = new List<RoadmapStep>();

    public virtual ICollection<Roadmap> Roadmaps { get; set; } = new List<Roadmap>();

    public virtual ICollection<RoutineHabit> RoutineHabits { get; set; } = new List<RoutineHabit>();

    public virtual ICollection<Routine> Routines { get; set; } = new List<Routine>();

    public virtual ICollection<SalaryRecord> SalaryRecords { get; set; } = new List<SalaryRecord>();

    public virtual ICollection<SideIncomeSource> SideIncomeSources { get; set; } = new List<SideIncomeSource>();

    public virtual ICollection<SkillLevelChange> SkillLevelChanges { get; set; } = new List<SkillLevelChange>();

    public virtual ICollection<SkillTag> SkillTags { get; set; } = new List<SkillTag>();

    public virtual ICollection<Skill> Skills { get; set; } = new List<Skill>();

    public virtual ICollection<SleepRecord> SleepRecords { get; set; } = new List<SleepRecord>();

    public virtual ICollection<StudySession> StudySessions { get; set; } = new List<StudySession>();

    public virtual ICollection<Tag> Tags { get; set; } = new List<Tag>();

    public virtual ICollection<TaskDependency> TaskDependencies { get; set; } = new List<TaskDependency>();

    public virtual ICollection<TaskItem> TaskItems { get; set; } = new List<TaskItem>();

    public virtual ICollection<TaskTag> TaskTags { get; set; } = new List<TaskTag>();

    public virtual ICollection<TaxItem> TaxItems { get; set; } = new List<TaxItem>();

    public virtual ICollection<TransactionTag> TransactionTags { get; set; } = new List<TransactionTag>();

    public virtual ICollection<Transaction> Transactions { get; set; } = new List<Transaction>();

    public virtual ICollection<UserHiddenLifeArea> UserHiddenLifeAreas { get; set; } = new List<UserHiddenLifeArea>();

    public virtual ICollection<UserHiddenModule> UserHiddenModules { get; set; } = new List<UserHiddenModule>();

    public virtual ICollection<UtilityBill> UtilityBills { get; set; } = new List<UtilityBill>();

    public virtual ICollection<VaultAccessLog> VaultAccessLogs { get; set; } = new List<VaultAccessLog>();

    public virtual ICollection<Vehicle> Vehicles { get; set; } = new List<Vehicle>();

    public virtual ICollection<Warranty> Warranties { get; set; } = new List<Warranty>();

    public virtual ICollection<WaterIntake> WaterIntakes { get; set; } = new List<WaterIntake>();

    public virtual ICollection<WeeklyReflection> WeeklyReflections { get; set; } = new List<WeeklyReflection>();

    public virtual ICollection<WellnessCheckIn> WellnessCheckIns { get; set; } = new List<WellnessCheckIn>();

    public virtual ICollection<Workout> Workouts { get; set; } = new List<Workout>();
}
