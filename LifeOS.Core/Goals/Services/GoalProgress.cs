namespace LifeOS.Core.Goals.Services;

/// <summary>
/// The one place goal progress is calculated. Progress is never stored: it's derived from milestones, except that
/// a Completed goal is always 100% (you can finish a goal without ticking every milestone, or without any).
/// </summary>
public static class GoalProgress
{
    public static int Percent(string status, int milestoneCount, int completedMilestoneCount)
    {
        if (status == DTOs.GoalStatuses.Completed)
        {
            return 100;
        }

        if (milestoneCount == 0)
        {
            return 0;
        }

        // Floor, not round: 199 of 200 milestones done must never show as 100%.
        return completedMilestoneCount * 100 / milestoneCount;
    }
}
