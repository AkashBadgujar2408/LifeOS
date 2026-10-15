using LifeOS.Core.Journal.DTOs;
using LifeOS.Core.Shared.DTOs;

namespace LifeOS.Core.Journal.ServiceContracts;

public interface IJournalService
{
    /// <summary>Entries from <paramref name="from"/> to <paramref name="to"/>, newest first.</summary>
    Task<OperationResult<List<JournalEntryDto>>> ListAsync(DateOnly from, DateOnly to);

    Task<OperationResult<JournalEntryDto>> GetAsync(int id);

    /// <summary>The entry for one day, or null data when nothing was written that day (not a failure).</summary>
    Task<JournalEntryDto?> GetForDayAsync(DateOnly day);

    /// <summary>Creates the day's entry, or rewrites it if the day already has one (one entry per day).</summary>
    Task<OperationResult<JournalEntryDto>> SaveForDayAsync(DateOnly day, JournalEntryRequest request);

    /// <summary>Deletes the day's entry with its links and reminders.</summary>
    Task<OperationResult<bool>> DeleteForDayAsync(DateOnly day);

    /// <summary>
    /// Turns a captured Journal inbox item into that day's entry — appended to it if the day already has one — and
    /// marks the item processed, moving its links across.
    /// </summary>
    Task<OperationResult<JournalEntryDto>> CreateFromInboxAsync(int inboxItemId, DateOnly day);

    Task<OperationResult<List<MoodPointDto>>> GetMoodsAsync(DateOnly from, DateOnly to);

    Task<OperationResult<WeeklyReviewDto>> GetWeekAsync(DateOnly weekStart);

    /// <summary>Saves the week's answers; all three blank removes a saved reflection.</summary>
    Task<OperationResult<WeeklyReviewDto>> SaveWeekAsync(DateOnly weekStart, WeeklyReflectionRequest request);
}
