using LifeOS.Core.Calendar.DTOs;
using LifeOS.Core.Shared.DTOs;

namespace LifeOS.Core.Calendar.ServiceContracts;

/// <summary>Calendar events (reading a range of them goes through ICalendarFeedService).</summary>
public interface IEventsService
{
    Task<OperationResult<EventDto>> GetAsync(int id);
    Task<OperationResult<EventDto>> CreateAsync(EventRequest request);

    /// <summary>Edits the event — for a series, every occurrence. Skipped dates survive unless the days it falls on change.</summary>
    Task<OperationResult<EventDto>> UpdateAsync(int id, EventRequest request);

    /// <summary>Soft-deletes the event (the whole series), its skipped dates, links and any reminders about it.</summary>
    Task<OperationResult<bool>> DeleteAsync(int id);

    /// <summary>Skips one occurrence of a series, or restores a skipped one. Returns the series.</summary>
    Task<OperationResult<EventDto>> SetSkippedAsync(int id, DateOnly occurrenceDate, bool skipped);

    /// <summary>"Change just this one": the occurrence becomes a one-off event and the series skips that day. Returns the new event.</summary>
    Task<OperationResult<EventDto>> DetachOccurrenceAsync(int id, DateOnly occurrenceDate, EventRequest request);

    /// <summary>"Delete this and following": the series ends the day before. True when that removed the whole series.</summary>
    Task<OperationResult<bool>> EndSeriesAsync(int id, DateOnly occurrenceDate);
}
