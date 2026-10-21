using System.Data;
using Dapper;
using LifeOS.Core.Calendar.Services;
using LifeOS.Core.Models;
using LifeOS.Core.Reports.DTOs;
using LifeOS.Core.Reports.ServiceContracts;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Story.Services;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Reports.Services;

/// <summary>
/// Reports (Sessions 90–93): each reads its rows through a <c>reports.*</c> procedure with Dapper, puts moments on the
/// user's local days, and hands them to a pure builder (<see cref="GoalReport"/>, <see cref="HabitReport"/>).
/// </summary>
public class ReportsService(AppDbContext db) : IReportsService
{
    public async Task<OperationResult<GoalReportDto>> GetGoalReportAsync(DateOnly from, DateOnly to, DateOnly today, string? timeZone)
    {
        if (CheckRange(from, to, timeZone, out var zone) is { } error)
        {
            return OperationResult<GoalReportDto>.Fail(error);
        }

        var parameters = new DynamicParameters();
        parameters.Add("UserId", db.CurrentUserId!.Value, DbType.Int32);
        parameters.Add("FromDate", from.ToDateTime(TimeOnly.MinValue), DbType.Date);
        parameters.Add("ToDate", to.ToDateTime(TimeOnly.MinValue), DbType.Date);
        parameters.Add("FromUtc", LocalMidnightUtc(from, zone), DbType.DateTime2);
        parameters.Add("ToUtc", LocalMidnightUtc(to.AddDays(1), zone), DbType.DateTime2);

        var rows = await db.Database.GetDbConnection().QueryAsync<GoalRow>(
            "reports.GetGoalReport", parameters, commandType: CommandType.StoredProcedure);

        var facts = rows.Select(r => new GoalFact(
                r.Id,
                r.Title,
                r.GoalType,
                r.Status,
                r.LifeAreaId,
                r.LifeAreaName,
                r.TargetDate is { } target ? DateOnly.FromDateTime(target) : null,
                LocalDay(r.CreatedAt, zone),
                r.CompletedAt is { } completed ? LocalDay(completed, zone) : null,
                r.AbandonedAt is { } abandoned ? LocalDay(abandoned, zone) : null,
                r.PushedBack))
            .ToList();

        return OperationResult<GoalReportDto>.Ok(GoalReport.Build(facts, from, to, today));
    }

    public async Task<OperationResult<HabitReportDto>> GetHabitReportAsync(DateOnly from, DateOnly to, DateOnly today, string? timeZone)
    {
        if (CheckRange(from, to, timeZone, out var zone) is { } error)
        {
            return OperationResult<HabitReportDto>.Fail(error);
        }

        var parameters = new DynamicParameters();
        parameters.Add("UserId", db.CurrentUserId!.Value, DbType.Int32);
        parameters.Add("FromDate", from.ToDateTime(TimeOnly.MinValue), DbType.Date);
        parameters.Add("ToDate", to.ToDateTime(TimeOnly.MinValue), DbType.Date);

        // Two result sets, read in the procedure's order.
        using var reader = await db.Database.GetDbConnection().QueryMultipleAsync(
            "reports.GetHabitReport", parameters, commandType: CommandType.StoredProcedure);
        var habits = (await reader.ReadAsync<HabitRow>())
            .Select(h => new HabitFact(
                h.Id,
                h.Title,
                h.Kind,
                h.Status,
                h.ScheduleDays,
                DateOnly.FromDateTime(h.StartDate),
                h.TargetValue,
                h.LifeAreaName,
                h.ArchivedAt is { } archived ? LocalDay(archived, zone) : null))
            .ToList();
        var entries = (await reader.ReadAsync<EntryRow>())
            .Select(e => new HabitEntryFact(e.HabitId, DateOnly.FromDateTime(e.EntryDate), e.Value))
            .ToList();

        return OperationResult<HabitReportDto>.Ok(HabitReport.Build(habits, entries, from, to, today));
    }

    private static string? CheckRange(DateOnly from, DateOnly to, string? timeZone, out TimeZoneInfo zone)
    {
        if (!LifeStoryService.TryFindZone(timeZone, out zone))
        {
            return LifeStoryService.UnknownZone(timeZone);
        }

        if (to < from)
        {
            return "The end date must be on or after the start date.";
        }

        return to.DayNumber - from.DayNumber + 1 > ReportMath.MaxDays
            ? "Ask for at most five years at a time."
            : null;
    }

    /// <summary>The UTC moment a local day begins (a midnight skipped by a clock change moves forward).</summary>
    private static DateTime LocalMidnightUtc(DateOnly day, TimeZoneInfo zone) =>
        EventRecurrence.LocalToUtc(day.ToDateTime(TimeOnly.MinValue), zone);

    /// <summary>A UTC moment from Dapper (Unspecified kind) as the user's local day.</summary>
    private static DateOnly LocalDay(DateTime utc, TimeZoneInfo zone) =>
        DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(utc, DateTimeKind.Utc), zone));

    // Row types take ADO.NET's shapes as they come (DATE → DateTime, DATETIME2 → Unspecified kind).
    private sealed class GoalRow
    {
        public int Id { get; init; }
        public string Title { get; init; } = string.Empty;
        public string GoalType { get; init; } = string.Empty;
        public string Status { get; init; } = string.Empty;
        public DateTime? TargetDate { get; init; }
        public DateTime? CompletedAt { get; init; }
        public DateTime CreatedAt { get; init; }
        public int LifeAreaId { get; init; }
        public string LifeAreaName { get; init; } = string.Empty;
        public DateTime? AbandonedAt { get; init; }
        public int PushedBack { get; init; }
    }

    private sealed class HabitRow
    {
        public int Id { get; init; }
        public string Title { get; init; } = string.Empty;
        public string Kind { get; init; } = string.Empty;
        public byte ScheduleDays { get; init; }
        public DateTime StartDate { get; init; }
        public string Status { get; init; } = string.Empty;
        public decimal? TargetValue { get; init; }
        public string? Unit { get; init; }
        public string? LifeAreaName { get; init; }
        public DateTime? ArchivedAt { get; init; }
    }

    private sealed class EntryRow
    {
        public int HabitId { get; init; }
        public DateTime EntryDate { get; init; }
        public decimal? Value { get; init; }
    }
}
