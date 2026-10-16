using LifeOS.Core.Calendar.DTOs;
using LifeOS.Core.Shared.DTOs;

namespace LifeOS.Core.Calendar.ServiceContracts;

/// <summary>
/// Reminders. With no job server, "due" is simply RemindAt &lt;= now and not dismissed, asked for whenever the app
/// loads (and while it stays open).
/// </summary>
public interface IRemindersService
{
    /// <summary>Pending = not dismissed, soonest first; Dismissed = the latest 50, most recently dismissed first.</summary>
    Task<OperationResult<List<ReminderDto>>> ListAsync(string status, string? entityType, int? entityId);

    /// <summary>Pending reminders whose moment has come, oldest first.</summary>
    Task<List<ReminderDto>> GetDueAsync();

    Task<OperationResult<ReminderDto>> GetAsync(int id);
    Task<OperationResult<ReminderDto>> CreateAsync(ReminderRequest request);
    Task<OperationResult<ReminderDto>> UpdateAsync(int id, ReminderRequest request);
    Task<OperationResult<ReminderDto>> SetDismissedAsync(int id, bool dismissed);

    /// <summary>Moves the reminder to a later moment and makes it pending again.</summary>
    Task<OperationResult<ReminderDto>> SnoozeAsync(int id, DateTime until);

    Task<OperationResult<bool>> DeleteAsync(int id);

    /// <summary>
    /// Soft-deletes not-yet-dealt-with reminders written for occurrences of a recurring event (optionally only for
    /// occurrence days in a range), so they're written again from the event's current settings when due.
    /// </summary>
    Task RemovePendingOccurrenceRemindersAsync(int eventId, DateOnly? fromDate = null, DateOnly? toDate = null);

    /// <summary>Soft-deletes every reminder about an entity; call from a module's own delete (like links).</summary>
    Task RemoveAllForEntityAsync(string entityType, int entityId);
}
