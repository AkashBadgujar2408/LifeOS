using LifeOS.Core.Shared.DTOs;

namespace LifeOS.Core.Shared.Services;

/// <summary>
/// The module each linkable type belongs to (Session 97a), so search leaves out what Settings has switched off.
/// Null = shared, never hidden (the Inbox, the one contact list). A new linkable type needs an entry — a unit test
/// checks every provider has one.
/// </summary>
public static class LinkableModules
{
    public static readonly IReadOnlyDictionary<string, string?> ByType = new Dictionary<string, string?>(StringComparer.Ordinal)
    {
        ["InboxItem"] = null,
        ["Contact"] = null,
        ["Goal"] = ModuleKeys.Goals,
        ["Task"] = ModuleKeys.Tasks,
        ["Project"] = ModuleKeys.Projects,
        ["Event"] = ModuleKeys.Calendar,
        ["Habit"] = ModuleKeys.Habits,
        ["JournalEntry"] = ModuleKeys.Journal,
        ["Decision"] = ModuleKeys.Journal,
        ["Document"] = ModuleKeys.Documents,
        ["Skill"] = ModuleKeys.Learning,
        ["Course"] = ModuleKeys.Learning,
        ["Roadmap"] = ModuleKeys.Learning,
        ["Certification"] = ModuleKeys.Learning,
        ["KnowledgeNote"] = ModuleKeys.Learning,
        ["Employment"] = ModuleKeys.Career,
        ["CareerAchievement"] = ModuleKeys.Career,
        ["JobApplication"] = ModuleKeys.Career,
        ["InterviewQuestion"] = ModuleKeys.Career,
        ["MockInterview"] = ModuleKeys.Career,
        ["ResumeVersion"] = ModuleKeys.Career,
        ["FinanceAccount"] = ModuleKeys.Finance,
        ["Transaction"] = ModuleKeys.Finance,
        ["Holding"] = ModuleKeys.Finance,
        ["Loan"] = ModuleKeys.Finance,
        ["InsurancePolicy"] = ModuleKeys.Finance,
        ["TaxItem"] = ModuleKeys.Finance,
        ["DoctorVisit"] = ModuleKeys.Health,
        ["Medication"] = ModuleKeys.Health,
        ["MedicalCondition"] = ModuleKeys.Health,
        ["LabResult"] = ModuleKeys.Health,
        ["Property"] = ModuleKeys.Home,
        ["Asset"] = ModuleKeys.Home,
        ["Vehicle"] = ModuleKeys.Home,
        ["Warranty"] = ModuleKeys.Home,
        ["MaintenanceTask"] = ModuleKeys.Home,
        ["UtilityBill"] = ModuleKeys.Home,
        ["Purchase"] = ModuleKeys.Purchases,
        ["ShoppingList"] = ModuleKeys.Purchases,
        ["WishlistItem"] = ModuleKeys.Purchases,
        ["Return"] = ModuleKeys.Purchases,
        ["Benefit"] = ModuleKeys.Purchases,
        ["Subscription"] = ModuleKeys.Purchases,
        ["MediaItem"] = ModuleKeys.Leisure,
        ["Hobby"] = ModuleKeys.Leisure,
    };

    /// <summary>Whether items of this type show while these modules are switched off.</summary>
    public static bool IsVisible(string entityType, IReadOnlySet<string> hiddenModules) =>
        ByType.GetValueOrDefault(entityType) is not { } module || !hiddenModules.Contains(module);
}
