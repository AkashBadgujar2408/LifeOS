using LifeOS.Core.Goals.DTOs;
using LifeOS.Core.Story.DTOs;

namespace LifeOS.Core.Story.Services;

/// <summary>
/// The "Previously on…" recap on My Day: which beats count as the latest, and which mission is "the one you're on".
/// Pure and unit-tested; LifeStoryService supplies the story's beats and the missions.
/// </summary>
public static class StoryRecap
{
    public const int RecentBeatCount = 3;

    /// <summary>
    /// The latest beats up to <paramref name="today"/>, newest first. Future-dated beats (a habit set to start next
    /// week) haven't happened yet. Within a day, recorded moments come before day-only beats, latest moment first.
    /// </summary>
    public static List<StoryBeatDto> Recent(IEnumerable<StoryBeatDto> beats, DateOnly today, int count = RecentBeatCount) =>
        beats
            .Where(b => b.Day <= today)
            .OrderByDescending(b => b.Day)
            .ThenByDescending(b => b.At.HasValue)
            .ThenByDescending(b => b.At)
            .Take(count)
            .ToList();

    /// <summary>
    /// The mission to show as current: an active, unlocked one — a main mission if there is one, else a side mission,
    /// else a collectible — with the nearest target date (undated last), then the oldest. Null if nothing's in play.
    /// </summary>
    public static MissionDto? CurrentMission(IEnumerable<MissionDto> missions)
    {
        int KindRank(string kind) => kind switch
        {
            MissionKinds.Main => 0,
            MissionKinds.Side => 1,
            _ => 2,
        };

        return missions
            .Where(m => m.Status == GoalStatuses.Active && !m.IsLocked)
            .OrderBy(m => KindRank(m.Kind))
            .ThenBy(m => m.TargetDate ?? DateOnly.MaxValue)
            .ThenBy(m => m.CreatedAt)
            .FirstOrDefault();
    }
}
