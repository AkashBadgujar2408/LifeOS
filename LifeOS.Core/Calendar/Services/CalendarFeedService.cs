using System.Data;
using Dapper;
using LifeOS.Core.Calendar.DTOs;
using LifeOS.Core.Calendar.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Calendar.Services;

/// <summary>
/// The calendar feed comes from a stored procedure (database/procedures/calendar.GetCalendarFeed.sql) through Dapper,
/// not EF: a five-way UNION across three schemas, plus recurring series that are expanded here (EventRecurrence). The procedure does its own user/soft-delete filtering, since
/// EF's global query filters don't apply outside EF.
/// </summary>
public class CalendarFeedService(AppDbContext db) : ICalendarFeedService
{
    // A month view with leading/trailing weeks is 42 days; leave headroom, but stop someone asking for a decade.
    private const int MaxRangeDays = 92;

    public async Task<OperationResult<List<CalendarFeedItemDto>>> GetFeedAsync(
        DateOnly from, DateOnly to, DateTime? fromUtc, DateTime? toUtc)
    {
        if (to < from)
        {
            return OperationResult<List<CalendarFeedItemDto>>.Fail("The end date must be on or after the start date.");
        }

        if (to.DayNumber - from.DayNumber + 1 > MaxRangeDays)
        {
            return OperationResult<List<CalendarFeedItemDto>>.Fail($"Ask for at most {MaxRangeDays} days at a time.");
        }

        var startUtc = fromUtc?.ToUniversalTime() ?? from.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
        var endUtc = toUtc?.ToUniversalTime() ?? to.AddDays(1).ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
        if (endUtc <= startUtc)
        {
            return OperationResult<List<CalendarFeedItemDto>>.Fail("The end of the range must be after its start.");
        }

        // Explicit DbTypes: DATE for the calendar days, DATETIME2 (not DATETIME's 3 ms rounding) for the instants.
        var parameters = new DynamicParameters();
        parameters.Add("UserId", db.CurrentUserId!.Value, DbType.Int32);
        parameters.Add("FromDate", from.ToDateTime(TimeOnly.MinValue), DbType.Date);
        parameters.Add("ToDate", to.ToDateTime(TimeOnly.MinValue), DbType.Date);
        parameters.Add("FromUtc", startUtc, DbType.DateTime2);
        parameters.Add("ToUtc", endUtc, DbType.DateTime2);

        // Dapper uses (and opens/closes) the context's own connection, so there's one connection string and one
        // connection per request whichever path a query takes. Three result sets, read in the procedure's order.
        await using var reader = await db.Database.GetDbConnection().QueryMultipleAsync(
            "calendar.GetCalendarFeed", parameters, commandType: CommandType.StoredProcedure);
        var rows = (await reader.ReadAsync<FeedRow>()).ToList();
        var series = (await reader.ReadAsync<EventSeriesRow>()).ToList();
        var skipped = (await reader.ReadAsync<SkippedDateRow>()).ToList();

        var items = rows.Select(ToDto)
            .Concat(RecurringEvents.Expand(series, skipped, from, to, startUtc, endUtc).Select(o => ToDto(o.Series, o.Occurrence)))
            // The procedure's order, now with occurrences among the one-offs: date-based by date, then timed by start.
            .OrderByDescending(i => i.IsAllDay)
            .ThenBy(i => i.StartDate)
            .ThenBy(i => i.StartsAt)
            .ThenBy(i => i.SourceType, StringComparer.Ordinal)
            .ThenBy(i => i.Title, StringComparer.Ordinal)
            .ThenBy(i => i.SourceId)
            .ToList();

        return OperationResult<List<CalendarFeedItemDto>>.Ok(items);
    }

    private static CalendarFeedItemDto ToDto(EventSeriesRow series, EventOccurrence occurrence) => new()
    {
        SourceType = CalendarSourceTypes.Event,
        SourceId = series.Id,
        Title = series.Title,
        IsAllDay = series.IsAllDay,
        StartDate = occurrence.StartDate,
        EndDate = occurrence.EndDate,
        StartsAt = occurrence.StartsAt,
        EndsAt = occurrence.EndsAt,
        Location = series.Location,
        IsRecurring = true,
        OccurrenceDate = occurrence.OccurrenceDate,
    };

    // ADO.NET hands DATE back as DateTime and DATETIME2 as DateTimeKind.Unspecified; the row type takes them as they
    // come and ToDto gives them their real meaning (calendar date / UTC instant) — the job EF's value converter in
    // AppDbContext.SoftDelete.cs does for the EF path.
    private sealed class FeedRow
    {
        public string SourceType { get; init; } = string.Empty;
        public int SourceId { get; init; }
        public string Title { get; init; } = string.Empty;
        public bool IsAllDay { get; init; }
        public DateTime? StartDate { get; init; }
        public DateTime? EndDate { get; init; }
        public DateTime? StartsAt { get; init; }
        public DateTime? EndsAt { get; init; }
        public bool IsDone { get; init; }
        public string? Priority { get; init; }
        public int? ParentId { get; init; }
        public string? ParentTitle { get; init; }
        public string? Location { get; init; }
    }

    private static CalendarFeedItemDto ToDto(FeedRow row) => new()
    {
        SourceType = row.SourceType,
        SourceId = row.SourceId,
        Title = row.Title,
        IsAllDay = row.IsAllDay,
        StartDate = AsDate(row.StartDate),
        EndDate = AsDate(row.EndDate),
        StartsAt = AsUtc(row.StartsAt),
        EndsAt = AsUtc(row.EndsAt),
        IsDone = row.IsDone,
        Priority = row.Priority,
        ParentId = row.ParentId,
        ParentTitle = row.ParentTitle,
        Location = row.Location,
    };

    private static DateOnly? AsDate(DateTime? value) => value is null ? null : DateOnly.FromDateTime(value.Value);

    private static DateTime? AsUtc(DateTime? value) =>
        value is null ? null : DateTime.SpecifyKind(value.Value, DateTimeKind.Utc);
}
