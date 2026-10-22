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

    /// <summary>Tasks, focus time and planned vs tracked time by life area for the local days <paramref name="from"/>–<paramref name="to"/>.</summary>
    Task<OperationResult<ProductivityReportDto>> GetProductivityReportAsync(DateOnly from, DateOnly to, DateOnly today, string? timeZone);

    /// <summary>Study time by subject and week, and what was reached, for the local days <paramref name="from"/>–<paramref name="to"/>.</summary>
    Task<OperationResult<LearningReportDto>> GetLearningReportAsync(DateOnly from, DateOnly to, DateOnly today, string? timeZone);

    /// <summary>Workouts, sleep, body and wellbeing for the range — only call behind the vault unlock.</summary>
    Task<OperationResult<HealthReportDto>> GetHealthReportAsync(DateOnly from, DateOnly to, DateOnly today, string? timeZone);
}
