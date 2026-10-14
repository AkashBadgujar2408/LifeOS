using LifeOS.Core.Calendar.DTOs;
using LifeOS.Core.Shared.DTOs;

namespace LifeOS.Core.Calendar.ServiceContracts;

/// <summary>Calendar events (reading a range of them goes through ICalendarFeedService).</summary>
public interface IEventsService
{
    Task<OperationResult<EventDto>> GetAsync(int id);
    Task<OperationResult<EventDto>> CreateAsync(EventRequest request);
    Task<OperationResult<EventDto>> UpdateAsync(int id, EventRequest request);

    /// <summary>Soft-deletes the event, its links and any reminders about it.</summary>
    Task<OperationResult<bool>> DeleteAsync(int id);
}
