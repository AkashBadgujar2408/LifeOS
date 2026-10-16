using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Story.DTOs;

namespace LifeOS.Core.Story.ServiceContracts;

public interface IChaptersService
{
    /// <summary>All the user's chapters, oldest first.</summary>
    Task<List<ChapterDto>> ListAsync();

    Task<OperationResult<ChapterDto>> GetAsync(int id);

    /// <summary>Adds a chapter; a new current chapter (no end date) closes the previous current one the day before.</summary>
    Task<OperationResult<ChapterSaveResultDto>> CreateAsync(ChapterRequest request);

    Task<OperationResult<ChapterSaveResultDto>> UpdateAsync(int id, ChapterRequest request);

    Task<OperationResult<bool>> DeleteAsync(int id);
}

public interface ILifeStoryService
{
    /// <summary>
    /// The whole story, filed into chapters. <paramref name="timeZoneId"/> is the user's IANA zone ("Asia/Kolkata"),
    /// used to put each recorded moment on the right local day; null means UTC.
    /// </summary>
    Task<OperationResult<LifeStoryDto>> GetAsync(string? timeZoneId);

    /// <summary>
    /// The "Previously on…" recap: the current chapter, the latest beats up to today in that zone, and the mission to
    /// keep going with.
    /// </summary>
    Task<OperationResult<StoryRecapDto>> GetRecapAsync(string? timeZoneId);
}

public interface ILifeAreasStoryService
{
    /// <summary>Every life area with its all-time XP and level (computed, never stored).</summary>
    Task<List<LifeAreaStatsDto>> GetStatsAsync();

    /// <summary>Self-ratings for the months <paramref name="fromMonth"/>..<paramref name="toMonth"/> (first days, inclusive).</summary>
    Task<OperationResult<List<LifeAreaRatingDto>>> GetRatingsAsync(DateOnly fromMonth, DateOnly toMonth);

    /// <summary>Saves a month's ratings (a null rating clears that area); returns the month's ratings.</summary>
    Task<OperationResult<List<LifeAreaRatingDto>>> SaveRatingsAsync(DateOnly month, LifeAreaRatingsRequest request);
}

public interface IMissionsService
{
    /// <summary>Every goal as a mission (all statuses), oldest first; the page groups and filters.</summary>
    Task<List<MissionDto>> ListAsync();

    Task<OperationResult<MissionDto>> GetAsync(int goalId);

    /// <summary>Makes <paramref name="goalId"/> need <paramref name="requiresGoalId"/> first; rejects loops.</summary>
    Task<OperationResult<MissionDto>> AddPrerequisiteAsync(int goalId, int requiresGoalId);

    Task<OperationResult<MissionDto>> RemovePrerequisiteAsync(int goalId, int requiresGoalId);

    /// <summary>The "Mission passed" screen for a completed goal: the mission, what it unlocked, its debrief.</summary>
    Task<OperationResult<MissionPassedDto>> GetPassedAsync(int goalId);

    /// <summary>Writes (or rewrites) a passed mission's debrief; both prompts blank removes it (data: null).</summary>
    Task<OperationResult<MissionDebriefDto?>> SaveDebriefAsync(int goalId, MissionDebriefRequest request);
}
