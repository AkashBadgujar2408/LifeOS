namespace LifeOS.Core.Reports.DTOs;

/// <summary>Kinds of things reached in the learning report (reports.GetLearningReport set 3).</summary>
public static class LearningReachedKinds
{
    public const string CourseCompleted = "CourseCompleted";
    public const string BookFinished = "BookFinished";
    public const string SkillLevelUp = "SkillLevelUp";
    public const string Certification = "Certification";
}

public class LearningReportDto
{
    public DateOnly From { get; init; }
    public DateOnly To { get; init; }
    public int TotalMinutes { get; init; }
    public int Sessions { get; init; }
    /// <summary>Days with any study.</summary>
    public int ActiveDays { get; init; }
    /// <summary>Every subject studied (grouped as the study page's chart groups them), most time first.</summary>
    public List<LearningSubjectDto> Subjects { get; init; } = [];
    /// <summary>ISO weeks overlapping the range up to today, oldest first (empty weeks kept).</summary>
    public List<LearningWeekDto> Weeks { get; init; } = [];
    /// <summary>Courses completed, books finished, skill levels gained, certifications — oldest first.</summary>
    public List<LearningReachedDto> Reached { get; init; } = [];
    public int CoursesCompleted { get; init; }
    public int BooksFinished { get; init; }
    public int LevelUps { get; init; }
    public int Certifications { get; init; }
}

public class LearningSubjectDto
{
    /// <summary>Skill / Course / MediaItem / Topic.</summary>
    public string Kind { get; init; } = string.Empty;
    public int? Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public int Minutes { get; init; }
    /// <summary>Share of all study time in the range, whole percent.</summary>
    public int? Percent { get; init; }
}

public class LearningWeekDto
{
    public DateOnly WeekStart { get; init; }
    public DateOnly From { get; init; }
    public DateOnly To { get; init; }
    public int Minutes { get; init; }
}

public class LearningReachedDto
{
    public string Kind { get; init; } = string.Empty;
    public int Id { get; init; }
    public string Title { get; init; } = string.Empty;
    public DateOnly Day { get; init; }
    public string? Detail { get; init; }
}
