namespace LifeOS.Core.Tasks.Services;

/// <summary>Pure rules for focus sessions (unit-tested).</summary>
public static class TaskTime
{
    /// <summary>The longest one session can be: ten hours.</summary>
    public const int MaxSessionMinutes = 600;

    /// <summary>
    /// A focus session must have ended after it started, not in the future (a minute's grace for clocks), and its
    /// focused minutes can't be more than the time between start and end (pauses make them fewer). Returns an error or null.
    /// </summary>
    public static string? CheckSession(DateTime startedUtc, DateTime endedUtc, int minutes, DateTime nowUtc)
    {
        if (endedUtc <= startedUtc)
        {
            return "A focus session has to end after it starts.";
        }

        if (endedUtc > nowUtc.AddMinutes(1))
        {
            return "A focus session can't end in the future.";
        }

        if (minutes is < 1 or > MaxSessionMinutes)
        {
            return $"A focus session is 1 to {MaxSessionMinutes} minutes.";
        }

        // Rounding up to the next minute on the client is fine; more than the span plus that isn't.
        return minutes > Math.Ceiling((endedUtc - startedUtc).TotalMinutes) + 1
            ? "That's more focused minutes than the session lasted."
            : null;
    }
}
