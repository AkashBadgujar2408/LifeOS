using LifeOS.Core.Learning.DTOs;
using LifeOS.Core.Learning.Services;
using LifeOS.Core.Reports.DTOs;

namespace LifeOS.Core.Reports.Services;

/// <summary>Study on one local day: how many sessions and minutes.</summary>
public record StudyDayFact(DateOnly Day, int Sessions, int Minutes);

/// <summary>
/// The learning report (Session 91), computed per request and never stored: study time by subject — grouped exactly as
/// the study page's "Hours by subject" chart (<see cref="StudyAnalytics"/>: same rows from learning.GetStudyBySubject,
/// same subject key) but with every subject listed — week by week, and what was reached (courses completed, books
/// finished, skill levels gained, certifications).
/// </summary>
public static class LearningReport
{
    public static LearningReportDto Build(
        IReadOnlyCollection<StudyWeekRow> rows,
        IReadOnlyCollection<StudyDayFact> days,
        IReadOnlyCollection<LearningReachedDto> reached,
        DateOnly from,
        DateOnly to,
        DateOnly today)
    {
        var total = rows.Sum(r => r.Minutes);
        var subjects = rows
            .GroupBy(r => (r.SubjectKind, r.SubjectId, Name: r.SubjectKind == StudySubjectKinds.Topic ? r.SubjectName?.ToUpperInvariant() : null))
            .Select(g =>
            {
                var minutes = g.Sum(r => r.Minutes);
                return new LearningSubjectDto
                {
                    Kind = g.Key.SubjectKind,
                    Id = g.Key.SubjectId,
                    Name = g.Select(r => r.SubjectName).FirstOrDefault(n => n is not null) ?? StudyAnalytics.RemovedName,
                    Minutes = minutes,
                    Percent = ReportMath.Percent(minutes, total),
                };
            })
            .OrderByDescending(s => s.Minutes).ThenBy(s => s.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();

        // Study logged ahead of today still counts in the totals; the weeks stop at today like every report's.
        return new LearningReportDto
        {
            From = from,
            To = to,
            TotalMinutes = total,
            Sessions = days.Sum(d => d.Sessions),
            ActiveDays = days.Count,
            Subjects = subjects,
            Weeks = ReportMath.Weeks(from, to, today)
                .Select(w => new LearningWeekDto
                {
                    WeekStart = w.WeekStart,
                    From = w.From,
                    To = w.To,
                    Minutes = days.Where(d => d.Day >= w.From && d.Day <= w.To).Sum(d => d.Minutes),
                })
                .ToList(),
            Reached = [.. reached.OrderBy(r => r.Day).ThenBy(r => r.Kind, StringComparer.Ordinal).ThenBy(r => r.Id)],
            CoursesCompleted = reached.Count(r => r.Kind == LearningReachedKinds.CourseCompleted),
            BooksFinished = reached.Count(r => r.Kind == LearningReachedKinds.BookFinished),
            LevelUps = reached.Count(r => r.Kind == LearningReachedKinds.SkillLevelUp),
            Certifications = reached.Count(r => r.Kind == LearningReachedKinds.Certification),
        };
    }
}
