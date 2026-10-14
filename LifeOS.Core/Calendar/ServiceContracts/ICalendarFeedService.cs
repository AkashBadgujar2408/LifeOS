using LifeOS.Core.Calendar.DTOs;
using LifeOS.Core.Shared.DTOs;

namespace LifeOS.Core.Calendar.ServiceContracts;

public interface ICalendarFeedService
{
    /// <summary>
    /// Everything dated between <paramref name="from"/> and <paramref name="to"/> (the user's local days, inclusive).
    /// <paramref name="fromUtc"/>/<paramref name="toUtc"/> are the same span as UTC instants — local midnight of
    /// <paramref name="from"/> to local midnight after <paramref name="to"/> — which only the client can work out;
    /// when omitted they default to UTC midnights (right for a UTC user, approximate for anyone else).
    /// </summary>
    Task<OperationResult<List<CalendarFeedItemDto>>> GetFeedAsync(DateOnly from, DateOnly to, DateTime? fromUtc, DateTime? toUtc);
}
