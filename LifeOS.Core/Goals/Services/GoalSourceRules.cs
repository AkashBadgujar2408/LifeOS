namespace LifeOS.Core.Goals.Services;

/// <summary>goals.GoalSources.Kind values — stable identifiers, never renamed once data exists.</summary>
public static class GoalSourceKinds
{
    public const string Habit = "Habit";
    public const string StudyTime = "StudyTime";
    public const string BooksFinished = "BooksFinished";
    public const string CoursesCompleted = "CoursesCompleted";
    public const string Roadmap = "Roadmap";
    public const string ProjectTasks = "ProjectTasks";
    public const string ProjectFocus = "ProjectFocus";
    public const string Workouts = "Workouts";

    public static readonly IReadOnlyList<string> All =
        [Habit, StudyTime, BooksFinished, CoursesCompleted, Roadmap, ProjectTasks, ProjectFocus, Workouts];
}

/// <summary>Workout figures a goal can count (goals.GoalSources.Metric).</summary>
public static class GoalSourceMetrics
{
    public const string Steps = "Steps";
    public const string DistanceKm = "DistanceKm";
    public const string Minutes = "Minutes";

    public static readonly IReadOnlyList<string> All = [Steps, DistanceKm, Minutes];
}

/// <summary>Checks for goal sources that mirror CK_GoalSources_Shape, so a wrong request gets a clean message. Pure.</summary>
public static class GoalSourceRules
{
    /// <summary>A roadmap source is a % on its own: the goal's only source, measured in "%".</summary>
    public const string PercentUnit = "%";

    public static string? CheckShape(string kind, string? entityType, int? entityId, string? filter, string? metric)
    {
        if (!GoalSourceKinds.All.Contains(kind))
        {
            return "Choose what the goal is counted from.";
        }

        if ((entityType is null) != (entityId is null))
        {
            return "Choose the item it's counted from.";
        }

        if (kind != GoalSourceKinds.Workouts && (filter is not null || metric is not null))
        {
            return "Only workouts take a kind and a figure.";
        }

        var ok = kind switch
        {
            GoalSourceKinds.Habit => entityType == "Habit",
            GoalSourceKinds.StudyTime => entityType is "Skill" or "Course" or "Book",
            GoalSourceKinds.BooksFinished or GoalSourceKinds.CoursesCompleted => entityType is null or "Skill",
            GoalSourceKinds.Roadmap => entityType == "Roadmap",
            GoalSourceKinds.ProjectTasks or GoalSourceKinds.ProjectFocus => entityType == "Project",
            GoalSourceKinds.Workouts => entityType is null && metric is not null && GoalSourceMetrics.All.Contains(metric),
            _ => false,
        };
        return ok ? null : "That item can't be counted that way.";
    }

    /// <summary>
    /// Whether a new source fits beside the goal's others: a roadmap's % can't be added to anything (or anything to it).
    /// </summary>
    public static string? CheckAlongside(string kind, IEnumerable<string> existingKinds)
    {
        var existing = existingKinds.ToList();
        if (existing.Contains(GoalSourceKinds.Roadmap))
        {
            return "This goal follows a roadmap's progress — remove the roadmap to count other things instead.";
        }

        if (kind == GoalSourceKinds.Roadmap && existing.Count > 0)
        {
            return "A roadmap's progress can't be added to other counts — it has to be the goal's only source.";
        }

        return null;
    }
}
