namespace LifeOS.Core.Story.Services;

/// <summary>A life area's level: where its XP puts it, and how far into the next level it is.</summary>
public record LifeAreaLevel(int Xp, int Level, int XpIntoLevel, int XpForNextLevel);

/// <summary>
/// Story Mode's stats: XP per life area from everything finished in it, all time — derived on every request, never
/// stored, and nothing decays (no penalties: a quiet month takes nothing away). Pure and unit-tested.
///
/// The weights keep Life Balance's proportions (finishing a goal 5, a milestone 3, a habit day or journal entry 1),
/// times ten so the numbers read like XP. Active goals earn nothing: aiming isn't doing. Study (Session 50) earns
/// 10 XP per full hour studied in the area, all sessions together — an hour of study weighs like a habit day.
///
/// Levels get steadily further apart: reaching level n takes 100 × (1 + 2 + … + (n − 1)) XP — level 2 at 100,
/// 3 at 300, 4 at 600, 5 at 1,000 — so early levels come quickly and later ones mean a lot of real activity.
/// </summary>
public static class LifeAreaLevels
{
    public const int GoalCompletedXp = 50;
    public const int MilestoneCompletedXp = 30;
    public const int HabitDayXp = 10;
    public const int JournalEntryXp = 10;
    public const int StudyHourXp = 10;

    /// <summary>The first step (level 1 → 2); each later step is this much longer than the one before.</summary>
    public const int StepXp = 100;

    public static int Xp(int goalsCompleted, int milestonesCompleted, int habitDays, int journalEntries, int studyMinutes = 0) =>
        goalsCompleted * GoalCompletedXp
        + milestonesCompleted * MilestoneCompletedXp
        + habitDays * HabitDayXp
        + journalEntries * JournalEntryXp
        + Math.Max(studyMinutes, 0) / 60 * StudyHourXp;

    /// <summary>Total XP needed to reach <paramref name="level"/> (level 1 = 0).</summary>
    public static int XpToReach(int level) => level <= 1 ? 0 : StepXp * (level - 1) * level / 2;

    public static LifeAreaLevel For(int xp)
    {
        xp = Math.Max(xp, 0);
        var level = 1;
        while (XpToReach(level + 1) <= xp)
        {
            level++;
        }

        var floor = XpToReach(level);
        return new LifeAreaLevel(xp, level, xp - floor, XpToReach(level + 1) - floor);
    }
}
