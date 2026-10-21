using LifeOS.Core.Leisure.DTOs;
using LifeOS.Core.Shared.DTOs;

namespace LifeOS.Core.Leisure.ServiceContracts;

public interface IMediaItemsService
{
    /// <summary>The backlog, optionally one kind / status: in progress first, then up next, wanted, finished, dropped.</summary>
    Task<List<MediaItemDto>> GetAllAsync(string? kind, string? status);
    Task<OperationResult<MediaItemDetailDto>> GetAsync(int id);
    Task<OperationResult<MediaItemDetailDto>> CreateAsync(MediaItemRequest request);
    /// <summary>Turns a captured inbox idea into a media item (links move to it, the inbox item is marked processed).</summary>
    Task<OperationResult<MediaItemDetailDto>> CreateFromInboxAsync(int inboxItemId, MediaItemRequest request);
    /// <summary>The year in media (LeisureFigures.YearInMedia).</summary>
    Task<YearInMediaDto> YearInMediaAsync(int year);
    Task<OperationResult<MediaItemDetailDto>> UpdateAsync(int id, MediaItemRequest request);
    Task<OperationResult<MediaItemDetailDto>> SetProgressAsync(int id, MediaProgressRequest request);
    Task<OperationResult<bool>> DeleteAsync(int id);

    Task<OperationResult<MediaNoteDto>> AddNoteAsync(int itemId, MediaNoteRequest request);
    Task<OperationResult<MediaNoteDto>> UpdateNoteAsync(int itemId, int noteId, MediaNoteRequest request);
    Task<OperationResult<bool>> DeleteNoteAsync(int itemId, int noteId);

    Task<OperationResult<MediaLogDto>> AddLogAsync(int itemId, MediaLogRequest request);
    Task<OperationResult<MediaLogDto>> UpdateLogAsync(int itemId, int logId, MediaLogRequest request);
    Task<OperationResult<bool>> DeleteLogAsync(int itemId, int logId);
}

public interface IHobbiesService
{
    Task<List<HobbyDto>> GetAllAsync();
    /// <summary>Minutes per hobby for the <paramref name="months"/> months up to the one <paramref name="today"/> is in.</summary>
    Task<List<HobbyMonthDto>> TimeByMonthAsync(DateOnly today, int months);
    Task<OperationResult<HobbyDetailDto>> GetAsync(int id);
    Task<OperationResult<HobbyDetailDto>> CreateAsync(HobbyRequest request);
    Task<OperationResult<HobbyDetailDto>> UpdateAsync(int id, HobbyRequest request);
    Task<OperationResult<bool>> DeleteAsync(int id);

    Task<OperationResult<HobbySessionDto>> AddSessionAsync(int hobbyId, HobbySessionRequest request);
    Task<OperationResult<HobbySessionDto>> UpdateSessionAsync(int hobbyId, int sessionId, HobbySessionRequest request);
    Task<OperationResult<bool>> DeleteSessionAsync(int hobbyId, int sessionId);
}
