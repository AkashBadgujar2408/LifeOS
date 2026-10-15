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
}
