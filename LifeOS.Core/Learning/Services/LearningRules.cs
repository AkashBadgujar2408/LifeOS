using LifeOS.Core.Learning.DTOs;

namespace LifeOS.Core.Learning.Services;

/// <summary>A course's state once the rules have been applied (what gets stored).</summary>
public record CourseState(string Status, byte ProgressPercent, DateOnly? StartedOn, DateOnly? CompletedOn);

/// <summary>
/// The rules that keep a course consistent with the CHECK constraints in 10_learning.sql, applied the friendly way
/// where the intent is clear (marking a course Completed fills in today and 100%) and refused with a message where it
/// isn't. Pure, so tested. Books' rules moved to LeisureRules with the books (Session 78a).
/// </summary>
public static class LearningRules
{
    /// <summary>Returns the state to store, or an error message.</summary>
    public static (CourseState? State, string? Error) Course(
        string status, byte progressPercent, DateOnly? startedOn, DateOnly? completedOn, DateOnly today)
    {
        if (progressPercent > 100)
        {
            return (null, "Progress is 0 to 100%.");
        }

        switch (status)
        {
            case CourseStatuses.Completed:
                completedOn ??= today;
                progressPercent = 100;
                break;
            case CourseStatuses.InProgress:
                startedOn ??= today;
                completedOn = null;
                break;
            default:
                completedOn = null;
                break;
        }

        if (startedOn is { } started && completedOn is { } completed && completed < started)
        {
            return (null, "A course can't be completed before it started.");
        }

        return (new CourseState(status, progressPercent, startedOn, completedOn), null);
    }
}
