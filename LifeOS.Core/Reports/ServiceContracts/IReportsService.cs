using LifeOS.Core.Reports.DTOs;
using LifeOS.Core.Shared.DTOs;

namespace LifeOS.Core.Reports.ServiceContracts;

public interface IReportsService
{
    /// <summary>
    /// The goal achievement report for the local days <paramref name="from"/>–<paramref name="to"/>, moments put on
    /// days in <paramref name="timeZone"/> (an IANA id from the browser; empty = UTC).
    /// </summary>
    Task<OperationResult<GoalReportDto>> GetGoalReportAsync(DateOnly from, DateOnly to, DateOnly today, string? timeZone);

    /// <summary>The habit consistency report for the local days <paramref name="from"/>–<paramref name="to"/>.</summary>
    Task<OperationResult<HabitReportDto>> GetHabitReportAsync(DateOnly from, DateOnly to, DateOnly today, string? timeZone);
}
