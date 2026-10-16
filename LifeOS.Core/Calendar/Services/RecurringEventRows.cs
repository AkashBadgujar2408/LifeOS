namespace LifeOS.Core.Calendar.Services;

/// <summary>
/// A recurring series as calendar.GetCalendarFeed and dashboard.GetMyDay return it (same columns in both). ADO.NET
/// hands DATE back as DateTime and DATETIME2 as Unspecified; <see cref="ToSeries"/> gives them their real meaning.
/// </summary>
internal sealed class EventSeriesRow
{
    public int Id { get; init; }
    public string Title { get; init; } = string.Empty;
    public bool IsAllDay { get; init; }
    public DateTime? StartDate { get; init; }
    public DateTime? EndDate { get; init; }
    public DateTime? StartsAt { get; init; }
    public DateTime? EndsAt { get; init; }
    public string? Location { get; init; }
    public string RecurrenceFrequency { get; init; } = string.Empty;
    public int RecurrenceInterval { get; init; }
    public DateTime? RecurrenceUntil { get; init; }
    public string? TimeZone { get; init; }

    public EventSeries ToSeries() => new(
        IsAllDay,
        AsDate(StartDate),
        AsDate(EndDate),
        AsUtc(StartsAt),
        AsUtc(EndsAt),
        RecurrenceFrequency,
        RecurrenceInterval,
        AsDate(RecurrenceUntil),
        TimeZone);

    private static DateOnly? AsDate(DateTime? value) => value is null ? null : DateOnly.FromDateTime(value.Value);

    private static DateTime? AsUtc(DateTime? value) =>
        value is null ? null : DateTime.SpecifyKind(value.Value, DateTimeKind.Utc);
}

/// <summary>A skipped occurrence, as the same procedures return it.</summary>
internal sealed class SkippedDateRow
{
    public int EventId { get; init; }
    public DateTime OccurrenceDate { get; init; }
}

internal static class RecurringEvents
{
    /// <summary>Every occurrence of the series that overlaps the range, each with the series row it came from.</summary>
    public static List<(EventSeriesRow Series, EventOccurrence Occurrence)> Expand(
        IEnumerable<EventSeriesRow> series, IEnumerable<SkippedDateRow> skipped,
        DateOnly from, DateOnly to, DateTime fromUtc, DateTime toUtc)
    {
        var skippedBySeries = skipped
            .GroupBy(s => s.EventId)
            .ToDictionary(g => g.Key, g => (IReadOnlySet<DateOnly>)g.Select(s => DateOnly.FromDateTime(s.OccurrenceDate)).ToHashSet());

        return series
            .SelectMany(row => EventRecurrence.Expand(
                    row.ToSeries(),
                    skippedBySeries.GetValueOrDefault(row.Id, new HashSet<DateOnly>()),
                    from, to, fromUtc, toUtc)
                .Select(occurrence => (row, occurrence)))
            .ToList();
    }
}
