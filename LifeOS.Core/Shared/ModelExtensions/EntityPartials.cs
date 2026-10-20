using LifeOS.Core.Shared.ModelExtensions;

namespace LifeOS.Core.Models;

public partial class User : ISoftDeletable;

public partial class Tag : ISoftDeletable, IUserOwned;

public partial class EntityLink : ISoftDeletable, IUserOwned;

public partial class LifeArea : ISoftDeletable;

public partial class InboxItem : ISoftDeletable, IUserOwned;

public partial class Goal : ISoftDeletable, IUserOwned;

public partial class GoalMilestone : ISoftDeletable, IUserOwned;

public partial class GoalTag : ISoftDeletable, IUserOwned;

public partial class GoalHistory : ISoftDeletable, IUserOwned;

public partial class Project : ISoftDeletable, IUserOwned;

public partial class TaskItem : ISoftDeletable, IUserOwned;

public partial class TaskTag : ISoftDeletable, IUserOwned;

public partial class Event : ISoftDeletable, IUserOwned;

public partial class EventException : ISoftDeletable, IUserOwned;

public partial class Reminder : ISoftDeletable, IUserOwned;

public partial class Habit : ISoftDeletable, IUserOwned;

public partial class HabitEntry : ISoftDeletable, IUserOwned;

public partial class JournalEntry : ISoftDeletable, IUserOwned;

public partial class WeeklyReflection : ISoftDeletable, IUserOwned;

public partial class Chapter : ISoftDeletable, IUserOwned;

public partial class MissionPrerequisite : ISoftDeletable, IUserOwned;

public partial class MissionDebrief : ISoftDeletable, IUserOwned;

public partial class LifeAreaRating : ISoftDeletable, IUserOwned;

public partial class UserHiddenModule : ISoftDeletable, IUserOwned;

public partial class UserHiddenLifeArea : ISoftDeletable, IUserOwned;

// Password reset runs before anyone is logged in, so it reads these with IgnoreQueryFilters() and filters itself.
public partial class RecoveryCode : ISoftDeletable, IUserOwned;

public partial class Document : ISoftDeletable, IUserOwned;

public partial class DocumentFile : ISoftDeletable, IUserOwned;

public partial class DocumentTag : ISoftDeletable, IUserOwned;

public partial class Attachment : ISoftDeletable, IUserOwned;

public partial class VaultAccessLog : ISoftDeletable, IUserOwned;

public partial class JournalEntryTag : ISoftDeletable, IUserOwned;

public partial class JournalNote : ISoftDeletable, IUserOwned;

public partial class Decision : ISoftDeletable, IUserOwned;

public partial class MonthlyReflection : ISoftDeletable, IUserOwned;

public partial class HabitTag : ISoftDeletable, IUserOwned;

public partial class HabitChallenge : ISoftDeletable, IUserOwned;

public partial class Routine : ISoftDeletable, IUserOwned;

public partial class RoutineHabit : ISoftDeletable, IUserOwned;

public partial class TaskDependency : ISoftDeletable, IUserOwned;

public partial class FocusSession : ISoftDeletable, IUserOwned;

public partial class KpiTile : ISoftDeletable, IUserOwned;

public partial class DismissedInsight : ISoftDeletable, IUserOwned;

public partial class Skill : ISoftDeletable, IUserOwned;

public partial class SkillLevelChange : ISoftDeletable, IUserOwned;

public partial class SkillTag : ISoftDeletable, IUserOwned;

public partial class Course : ISoftDeletable, IUserOwned;

public partial class Book : ISoftDeletable, IUserOwned;

public partial class BookTag : ISoftDeletable, IUserOwned;

public partial class BookNote : ISoftDeletable, IUserOwned;

public partial class Certification : ISoftDeletable, IUserOwned;

public partial class StudySession : ISoftDeletable, IUserOwned;

public partial class Roadmap : ISoftDeletable, IUserOwned;

public partial class RoadmapStep : ISoftDeletable, IUserOwned;

public partial class KnowledgeNote : ISoftDeletable, IUserOwned;

public partial class KnowledgeNoteTag : ISoftDeletable, IUserOwned;

public partial class Contact : ISoftDeletable, IUserOwned;

public partial class ContactTag : ISoftDeletable, IUserOwned;

public partial class Employment : ISoftDeletable, IUserOwned;

public partial class SalaryRecord : ISoftDeletable, IUserOwned;

public partial class CareerAchievement : ISoftDeletable, IUserOwned;

public partial class PerformanceReview : ISoftDeletable, IUserOwned;

public partial class ResumeVersion : ISoftDeletable, IUserOwned;

public partial class JobApplication : ISoftDeletable, IUserOwned;

public partial class ApplicationStageChange : ISoftDeletable, IUserOwned;

public partial class Interview : ISoftDeletable, IUserOwned;

public partial class InterviewQuestion : ISoftDeletable, IUserOwned;

public partial class InterviewQuestionTag : ISoftDeletable, IUserOwned;

public partial class SideIncomeSource : ISoftDeletable, IUserOwned;

public partial class Account : ISoftDeletable, IUserOwned;

public partial class Transaction : ISoftDeletable, IUserOwned;

public partial class TransactionTag : ISoftDeletable, IUserOwned;

public partial class RecurringTransaction : ISoftDeletable, IUserOwned;

public partial class RecurringTransactionTag : ISoftDeletable, IUserOwned;

public partial class Budget : ISoftDeletable, IUserOwned;

public partial class Holding : ISoftDeletable, IUserOwned;

public partial class HoldingValuation : ISoftDeletable, IUserOwned;

public partial class Loan : ISoftDeletable, IUserOwned;

public partial class InsurancePolicy : ISoftDeletable, IUserOwned;

public partial class TaxItem : ISoftDeletable, IUserOwned;

public partial class AccountCurrency : ISoftDeletable, IUserOwned;

public partial class ExchangeRate : ISoftDeletable, IUserOwned;

public partial class HealthProfile : ISoftDeletable, IUserOwned;

public partial class MedicalCondition : ISoftDeletable, IUserOwned;

public partial class DoctorVisit : ISoftDeletable, IUserOwned;

public partial class Medication : ISoftDeletable, IUserOwned;

public partial class MedicationSchedule : ISoftDeletable, IUserOwned;

public partial class MedicationDose : ISoftDeletable, IUserOwned;

public partial class Workout : ISoftDeletable, IUserOwned;

public partial class Meal : ISoftDeletable, IUserOwned;

public partial class WaterIntake : ISoftDeletable, IUserOwned;

public partial class SleepRecord : ISoftDeletable, IUserOwned;

public partial class BodyMeasurement : ISoftDeletable, IUserOwned;

public partial class LabResult : ISoftDeletable, IUserOwned;

public partial class WellnessCheckIn : ISoftDeletable, IUserOwned;

public partial class GoalTarget : ISoftDeletable, IUserOwned;

public partial class Property : ISoftDeletable, IUserOwned;

public partial class Asset : ISoftDeletable, IUserOwned;

public partial class AssetTag : ISoftDeletable, IUserOwned;

public partial class Vehicle : ISoftDeletable, IUserOwned;

public partial class Warranty : ISoftDeletable, IUserOwned;

public partial class MaintenanceTask : ISoftDeletable, IUserOwned;

public partial class MaintenanceLog : ISoftDeletable, IUserOwned;

public partial class UtilityBill : ISoftDeletable, IUserOwned;

public partial class HouseholdProject : ISoftDeletable, IUserOwned;

public partial class FuelLog : ISoftDeletable, IUserOwned;

public partial class ShoppingList : ISoftDeletable, IUserOwned;

public partial class ShoppingListItem : ISoftDeletable, IUserOwned;

public partial class WishlistItem : ISoftDeletable, IUserOwned;

public partial class Purchase : ISoftDeletable, IUserOwned;

public partial class PurchaseTag : ISoftDeletable, IUserOwned;

public partial class Subscription : ISoftDeletable, IUserOwned;

public partial class Return : ISoftDeletable, IUserOwned;

public partial class Benefit : ISoftDeletable, IUserOwned;

public partial class BenefitRedemption : ISoftDeletable, IUserOwned;

public partial class PointBatch : ISoftDeletable, IUserOwned;
