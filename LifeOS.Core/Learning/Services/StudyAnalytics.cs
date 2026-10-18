using LifeOS.Core.Learning.DTOs;

namespace LifeOS.Core.Learning.Services;

/// <summary>One row of learning.GetStudyBySubject: minutes in one week on one subject.</summary>
public record StudyWeekRow(DateOnly WeekStart, string SubjectKind, int? SubjectId, string? SubjectName, int Minutes);

/// <summary>
/// Learning analytics: turns the per-week, per-subject sums into chart series — every week of the window present
/// (zero when nothing was studied), the biggest subjects on their own, the rest folded into "Everything else" so the
/// chart keeps a handful of colours. Pure and unit-tested.
/// </summary>
public static class StudyAnalytics
{
    /// <summary>Subjects shown on their own; one more would only be shown instead of "Everything else".</summary>
    public const int MaxSubjects = 5;

    public const int MinWeeks = 4;
    public const int MaxWeeks = 52;

    public const string RemovedName = "Something since removed";
    public const string OtherName = "Everything else";

    /// <summary>The Mondays of the <paramref name="weeks"/> weeks ending with the one holding <paramref name="today"/>.</summary>
    public static List<DateOnly> WeekStarts(DateOnly today, int weeks)
    {
        var current = Journal.Services.JournalWeeks.WeekStart(today);
        return Enumerable.Range(0, weeks).Select(i => current.AddDays(-7 * (weeks - 1 - i))).ToList();
    }

    public static StudyAnalyticsDto Build(IReadOnlyList<DateOnly> weeks, IEnumerable<StudyWeekRow> rows)
    {
        var index = weeks.Select((w, i) => (w, i)).ToDictionary(x => x.w, x => x.i);
        var subjects = rows
            .Where(r => index.ContainsKey(r.WeekStart))
            .GroupBy(r => (r.SubjectKind, r.SubjectId, Name: r.SubjectKind == StudySubjectKinds.Topic ? r.SubjectName?.ToUpperInvariant() : null))
            .Select(g =>
            {
                var byWeek = new int[weeks.Count];
                foreach (var row in g)
                {
                    byWeek[index[row.WeekStart]] += row.Minutes;
                }

                return new StudySubjectSeriesDto
                {
                    Kind = g.Key.SubjectKind,
                    Id = g.Key.SubjectId,
                    Name = g.Select(r => r.SubjectName).FirstOrDefault(n => n is not null) ?? RemovedName,
                    TotalMinutes = byWeek.Sum(),
                    MinutesByWeek = [.. byWeek],
                };
            })
            .OrderByDescending(s => s.TotalMinutes).ThenBy(s => s.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();

        // Folding a single subject into "Everything else" would only hide its name.
        if (subjects.Count > MaxSubjects + 1)
        {
            var rest = subjects.Skip(MaxSubjects).ToList();
            var other = new StudySubjectSeriesDto
            {
                Kind = StudySubjectKinds.Other,
                Name = OtherName,
                TotalMinutes = rest.Sum(s => s.TotalMinutes),
                MinutesByWeek = Enumerable.Range(0, weeks.Count).Select(i => rest.Sum(s => s.MinutesByWeek[i])).ToList(),
            };
            subjects = [.. subjects.Take(MaxSubjects), other];
        }

        return new StudyAnalyticsDto
        {
            Weeks = [.. weeks],
            Subjects = subjects,
            TotalMinutes = subjects.Sum(s => s.TotalMinutes),
        };
    }
}
