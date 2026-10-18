using LifeOS.Core.Dashboard.DTOs;
using LifeOS.Core.Shared.DTOs;

namespace LifeOS.Core.Dashboard.ServiceContracts;

public interface IDashboardService
{
    /// <summary>
    /// The My Day snapshot for the user's local <paramref name="today"/>. <paramref name="dayStartUtc"/>/
    /// <paramref name="dayEndUtc"/> are that day's local midnights as UTC instants (only the client knows the
    /// timezone); when omitted they default to UTC midnights.
    /// </summary>
    Task<OperationResult<MyDayDto>> GetMyDayAsync(DateOnly today, DateTime? dayStartUtc, DateTime? dayEndUtc);

    /// <summary>
    /// Activity per life area over the user's local days <paramref name="from"/>..<paramref name="to"/> (inclusive);
    /// <paramref name="fromUtc"/>/<paramref name="toUtc"/> are the same span as UTC instants, defaulting to UTC midnights.
    /// </summary>
    Task<OperationResult<LifeBalanceDto>> GetLifeBalanceAsync(DateOnly from, DateOnly to, DateTime? fromUtc, DateTime? toUtc);

    /// <summary>Hides an insight until its situation (its key) changes. Dismissing twice is fine.</summary>
    Task DismissInsightAsync(string key);

    /// <summary>Brings back every dismissed insight; returns how many dismissals were undone.</summary>
    Task<int> RestoreInsightsAsync();
}
