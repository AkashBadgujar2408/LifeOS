using System.Data;
using Dapper;
using LifeOS.Core.Calendar.Services;
using LifeOS.Core.Health.Services;
using LifeOS.Core.Learning.Services;
using LifeOS.Core.Models;
using LifeOS.Core.Reports.DTOs;
using LifeOS.Core.Reports.ServiceContracts;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Story.Services;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Reports.Services;

/// <summary>
/// Reports (Sessions 90–93): each reads its rows through a <c>reports.*</c> procedure with Dapper, puts moments on the
/// user's local days, and hands them to a pure builder (<see cref="GoalReport"/>, <see cref="HabitReport"/>,
/// <see cref="ProductivityReport"/>, <see cref="LearningReport"/>, <see cref="HealthReport"/>).
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

    public async Task<OperationResult<ProductivityReportDto>> GetProductivityReportAsync(DateOnly from, DateOnly to, DateOnly today, string? timeZone)
    {
        if (CheckRange(from, to, timeZone, out var zone) is { } error)
        {
            return OperationResult<ProductivityReportDto>.Fail(error);
        }

        var fromUtc = LocalMidnightUtc(from, zone);
        var toUtc = LocalMidnightUtc(to.AddDays(1), zone);
        var parameters = RangeParameters(from, to);
        parameters.Add("FromUtc", fromUtc, DbType.DateTime2);
        parameters.Add("ToUtc", toUtc, DbType.DateTime2);

        // Eight result sets, read in the procedure's order.
        using var reader = await db.Database.GetDbConnection().QueryMultipleAsync(
            "reports.GetProductivityReport", parameters, commandType: CommandType.StoredProcedure);
        var tasks = (await reader.ReadAsync<TaskRow>())
            .Select(t => new TaskFact(
                t.Id,
                t.Title,
                t.ProjectName,
                t.DueDate is { } due ? DateOnly.FromDateTime(due) : null,
                t.Status == "Done" && t.CompletedAt is { } completed ? LocalDay(completed, zone) : null,
                LocalDay(t.CreatedAt, zone),
                t.EstimateMinutes,
                t.FocusMinutes,
                t.LifeAreaId))
            .ToList();
        var focus = (await reader.ReadAsync<FocusRow>())
            .Select(f => new TimeFact(LocalDay(f.StartedAt, zone), f.Minutes, f.LifeAreaId))
            .ToList();
        var study = (await reader.ReadAsync<DayMinutesRow>())
            .Select(s => new TimeFact(DateOnly.FromDateTime(s.Day), s.Minutes, s.LifeAreaId))
            .ToList();
        var practice = (await reader.ReadAsync<DayMinutesRow>())
            .Select(p => new TimeFact(DateOnly.FromDateTime(p.Day), p.Minutes, p.LifeAreaId))
            .ToList();
        var oneOffs = (await reader.ReadAsync<BlockRow>())
            .Select(b => new BlockFact(AsUtc(b.StartsAt), AsUtc(b.EndsAt), b.LifeAreaId))
            .ToList();
        var series = (await reader.ReadAsync<EventSeriesRow>()).ToList();
        var skipped = (await reader.ReadAsync<SkippedDateRow>()).ToList();
        var areas = (await reader.ReadAsync<AreaRow>()).Select(a => new AreaFact(a.Id, a.Name)).ToList();

        var occurrences = RecurringEvents.Expand(series, skipped, from, to, fromUtc, toUtc)
            .Where(o => o.Occurrence.StartsAt is not null && o.Occurrence.EndsAt is not null)
            .Select(o => new BlockFact(o.Occurrence.StartsAt!.Value, o.Occurrence.EndsAt!.Value, o.Series.LifeAreaId));

        return OperationResult<ProductivityReportDto>.Ok(ProductivityReport.Build(
            tasks, focus, study, practice, [.. oneOffs, .. occurrences], areas, from, to, today, fromUtc, toUtc));
    }

    public async Task<OperationResult<LearningReportDto>> GetLearningReportAsync(DateOnly from, DateOnly to, DateOnly today, string? timeZone)
    {
        if (CheckRange(from, to, timeZone, out _) is { } error)
        {
            return OperationResult<LearningReportDto>.Fail(error);
        }

        // Three result sets, read in the procedure's order (the first is learning.GetStudyBySubject's).
        using var reader = await db.Database.GetDbConnection().QueryMultipleAsync(
            "reports.GetLearningReport", RangeParameters(from, to), commandType: CommandType.StoredProcedure);
        var weeks = (await reader.ReadAsync<StudyRow>())
            .Select(r => new StudyWeekRow(DateOnly.FromDateTime(r.WeekStart), r.SubjectKind, r.SubjectId, r.SubjectName, r.Minutes))
            .ToList();
        var days = (await reader.ReadAsync<StudyDayRow>())
            .Select(d => new StudyDayFact(DateOnly.FromDateTime(d.Day), d.Sessions, d.Minutes))
            .ToList();
        var reached = (await reader.ReadAsync<ReachedRow>())
            .Select(r => new LearningReachedDto
            {
                Kind = r.Kind,
                Id = r.Id,
                Title = r.Title,
                Day = DateOnly.FromDateTime(r.Day),
                Detail = r.Detail,
            })
            .ToList();

        return OperationResult<LearningReportDto>.Ok(LearningReport.Build(weeks, days, reached, from, to, today));
    }

    public async Task<OperationResult<HealthReportDto>> GetHealthReportAsync(DateOnly from, DateOnly to, DateOnly today, string? timeZone)
    {
        if (CheckRange(from, to, timeZone, out _) is { } error)
        {
            return OperationResult<HealthReportDto>.Fail(error);
        }

        // Five result sets, read in the procedure's order.
        using var reader = await db.Database.GetDbConnection().QueryMultipleAsync(
            "reports.GetHealthReport", RangeParameters(from, to), commandType: CommandType.StoredProcedure);
        var workouts = (await reader.ReadAsync<WorkoutRow>())
            .Select(w => new WorkoutFact(DateOnly.FromDateTime(w.OccurredOn), w.Kind, w.Minutes, w.Steps, w.DistanceKm))
            .ToList();
        var sleep = (await reader.ReadAsync<SleepRow>())
            .Select(s => new SleepFact(DateOnly.FromDateTime(s.WokeOn), HealthTrends.Minutes(s.StartedAt, s.EndedAt), s.Quality, s.IsNap))
            .ToList();
        var measurements = (await reader.ReadAsync<MeasurementRow>())
            .Select(m => new MeasurementFact(m.Kind, DateOnly.FromDateTime(m.MeasuredOn), m.Value, m.Value2))
            .ToList();
        var checkIns = (await reader.ReadAsync<CheckInRow>()).ToDictionary(c => DateOnly.FromDateTime(c.CheckInOn));
        var moods = (await reader.ReadAsync<MoodRow>()).ToDictionary(m => DateOnly.FromDateTime(m.EntryDate), m => m.Mood);
        var wellbeing = checkIns.Keys.Union(moods.Keys)
            .Order()
            .Select(day => new WellbeingFact(
                day,
                checkIns.GetValueOrDefault(day)?.StressLevel,
                checkIns.GetValueOrDefault(day)?.EnergyLevel,
                moods.TryGetValue(day, out var mood) ? mood : null))
            .ToList();

        return OperationResult<HealthReportDto>.Ok(HealthReport.Build(workouts, sleep, measurements, wellbeing, from, to, today));
    }

    private DynamicParameters RangeParameters(DateOnly from, DateOnly to)
    {
        var parameters = new DynamicParameters();
        parameters.Add("UserId", db.CurrentUserId!.Value, DbType.Int32);
        parameters.Add("FromDate", from.ToDateTime(TimeOnly.MinValue), DbType.Date);
        parameters.Add("ToDate", to.ToDateTime(TimeOnly.MinValue), DbType.Date);
        return parameters;
    }

    private static DateTime AsUtc(DateTime value) => DateTime.SpecifyKind(value, DateTimeKind.Utc);

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

    private sealed class TaskRow
    {
        public int Id { get; init; }
        public string Title { get; init; } = string.Empty;
        public string? ProjectName { get; init; }
        public DateTime? DueDate { get; init; }
        public string Status { get; init; } = string.Empty;
        public DateTime? CompletedAt { get; init; }
        public DateTime CreatedAt { get; init; }
        public int? EstimateMinutes { get; init; }
        public int FocusMinutes { get; init; }
        public int? LifeAreaId { get; init; }
    }

    private sealed class FocusRow
    {
        public int TaskItemId { get; init; }
        public DateTime StartedAt { get; init; }
        public int Minutes { get; init; }
        public int? LifeAreaId { get; init; }
    }

    private sealed class DayMinutesRow
    {
        public DateTime Day { get; init; }
        public int Minutes { get; init; }
        public int? LifeAreaId { get; init; }
    }

    private sealed class BlockRow
    {
        public int Id { get; init; }
        public DateTime StartsAt { get; init; }
        public DateTime EndsAt { get; init; }
        public int? LifeAreaId { get; init; }
    }

    private sealed class AreaRow
    {
        public int Id { get; init; }
        public string Name { get; init; } = string.Empty;
    }

    private sealed class StudyRow
    {
        public DateTime WeekStart { get; init; }
        public string SubjectKind { get; init; } = string.Empty;
        public int? SubjectId { get; init; }
        public string? SubjectName { get; init; }
        public int Minutes { get; init; }
    }

    private sealed class StudyDayRow
    {
        public DateTime Day { get; init; }
        public int Sessions { get; init; }
        public int Minutes { get; init; }
    }

    private sealed class ReachedRow
    {
        public string Kind { get; init; } = string.Empty;
        public int Id { get; init; }
        public string Title { get; init; } = string.Empty;
        public DateTime Day { get; init; }
        public string? Detail { get; init; }
    }

    private sealed class WorkoutRow
    {
        public DateTime OccurredOn { get; init; }
        public string Kind { get; init; } = string.Empty;
        public int Minutes { get; init; }
        public int? Steps { get; init; }
        public decimal? DistanceKm { get; init; }
        public int? Calories { get; init; }
    }

    private sealed class SleepRow
    {
        public DateTime WokeOn { get; init; }
        public DateTime StartedAt { get; init; }
        public DateTime EndedAt { get; init; }
        public byte? Quality { get; init; }
        public bool IsNap { get; init; }
    }

    private sealed class MeasurementRow
    {
        public string Kind { get; init; } = string.Empty;
        public DateTime MeasuredOn { get; init; }
        public decimal Value { get; init; }
        public decimal? Value2 { get; init; }
    }

    private sealed class CheckInRow
    {
        public DateTime CheckInOn { get; init; }
        public byte? StressLevel { get; init; }
        public byte? EnergyLevel { get; init; }
    }

    private sealed class MoodRow
    {
        public DateTime EntryDate { get; init; }
        public byte? Mood { get; init; }
    }
}
