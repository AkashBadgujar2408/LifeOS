using LifeOS.Core.Career.DTOs;

namespace LifeOS.Core.Career.Services;

/// <summary>Where an application stands: its stage and the two dates the CHECKs tie to it.</summary>
public readonly record struct ApplicationState(string Stage, DateOnly? AppliedOn, DateOnly? ClosedOn);

/// <summary>
/// Job applications' stage rules, mirroring CK_JobApplications_Applied/_Closed/_Dates so a refusal reads as a
/// sentence. Every move is a row in the stage history, so moves are dated, never in the future and never before the
/// last one (the history stays in order). Pure and unit-tested.
/// </summary>
public static class ApplicationRules
{
    /// <summary>Where a new application starts: <paramref name="stage"/>, reached on <paramref name="on"/>.</summary>
    public static (ApplicationState? State, string? Error) Start(string stage, DateOnly on, DateOnly today)
    {
        if (!ApplicationStages.All.Contains(stage))
        {
            return (null, "Unknown stage.");
        }

        if (on > today)
        {
            return (null, "That day hasn't come yet.");
        }

        return (new ApplicationState(
            stage,
            ApplicationStages.AppliedFor.Contains(stage) ? on : null,
            ApplicationStages.Closed.Contains(stage) ? on : null), null);
    }

    /// <summary>
    /// Moving to <paramref name="to"/> on <paramref name="on"/>. Reaching an applied-for stage fills AppliedOn if it's
    /// missing (skipping Applied is fine — an interview means you applied); back to Saved clears it. Closing sets
    /// ClosedOn; moving out of a closed stage reopens it.
    /// </summary>
    public static (ApplicationState? State, string? Error) Move(
        ApplicationState current, DateOnly? lastChangedOn, string to, DateOnly on, DateOnly today)
    {
        if (!ApplicationStages.All.Contains(to))
        {
            return (null, "Unknown stage.");
        }

        if (to == current.Stage)
        {
            return (null, "It's already at that stage.");
        }

        if (on > today)
        {
            return (null, "That day hasn't come yet.");
        }

        if (lastChangedOn is { } last && on < last)
        {
            return (null, "That's before its last move — moves are kept in order.");
        }

        var appliedOn = to == ApplicationStages.Saved ? null
            : ApplicationStages.AppliedFor.Contains(to) ? current.AppliedOn ?? on
            : current.AppliedOn;
        var closedOn = ApplicationStages.Closed.Contains(to) ? on : (DateOnly?)null;
        if (appliedOn is { } applied && closedOn is { } closed && closed < applied)
        {
            return (null, "It can't close before it was applied for.");
        }

        return (new ApplicationState(to, appliedOn, closedOn), null);
    }

    /// <summary>An interview round is scheduled with both times (end after start, within a day) or neither.</summary>
    public static string? CheckInterviewTime(DateTime? startsAt, DateTime? endsAt) =>
        startsAt is null != endsAt is null ? "Give the round a start and an end time, or neither."
        : startsAt is { } start && endsAt is { } end && end <= start ? "The round has to end after it starts."
        : startsAt is { } s && endsAt is { } e && e - s > TimeSpan.FromHours(24) ? "A round can't run longer than a day."
        : null;

    /// <summary>The calendar entry's title: "Interview: Technical round — Acme Corp".</summary>
    public static string EventTitle(string roundTitle, string organisation)
    {
        var title = $"Interview: {roundTitle} — {organisation}";
        return title.Length <= 200 ? title : title[..199] + "…";
    }
}
