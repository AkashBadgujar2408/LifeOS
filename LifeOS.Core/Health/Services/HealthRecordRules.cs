using LifeOS.Core.Health.DTOs;

namespace LifeOS.Core.Health.Services;

/// <summary>Lab results, wellness check-ins and health goals: the checks and the figures (never stored).</summary>
public static class HealthRecordRules
{
    /// <summary>Kinds a goal can aim at — everything but blood pressure, which has two numbers.</summary>
    public static readonly IReadOnlySet<string> GoalKinds = new HashSet<string>(
        ["Weight", "BodyFat", "Waist", "Chest", "Hips", "RestingHeartRate", "BloodSugar"], StringComparer.Ordinal);

    /// <summary>Low / Normal / High against the lab's range (either end may be open); null without a number or a range.</summary>
    public static string? Flag(decimal? value, decimal? low, decimal? high)
    {
        if (value is not { } v || (low is null && high is null))
        {
            return null;
        }

        if (low is { } l && v < l)
        {
            return LabFlags.Low;
        }

        return high is { } h && v > h ? LabFlags.High : LabFlags.Normal;
    }

    public static string? CheckLab(LabResultRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.TestName))
        {
            return "Name the test (as on the report).";
        }

        if (request.TakenOn > request.Today)
        {
            return "A result can't be dated in the future.";
        }

        var hasText = !string.IsNullOrWhiteSpace(request.ValueText);
        if ((request.Value is null) == !hasText)
        {
            return request.Value is null ? "Give the result — a number, or a word like Negative." : "Give a number or a word, not both.";
        }

        if (request.Value is null && (request.RangeLow is not null || request.RangeHigh is not null))
        {
            return "A reference range needs a number result.";
        }

        return request.RangeLow is { } low && request.RangeHigh is { } high && low > high
            ? "The low end of the range can't be above the high end."
            : null;
    }

    /// <summary>The key one test's results are grouped under: its name, trimmed, any case.</summary>
    public static string TestKey(string testName) => testName.Trim().ToUpperInvariant();

    public static string? CheckCheckIn(WellnessCheckInRequest request, DateOnly day)
    {
        if (day > request.Today)
        {
            return "A check-in can't be ahead of the day.";
        }

        return request.StressLevel is < 1 or > 5 || request.EnergyLevel is < 1 or > 5 ? "Levels go from 1 to 5." : null;
    }

    public static bool IsBlank(WellnessCheckInRequest request) =>
        request.StressLevel is null && request.EnergyLevel is null && string.IsNullOrWhiteSpace(request.Notes);

    public static string? CheckGoalTarget(string kind, decimal start, decimal target)
    {
        if (!GoalKinds.Contains(kind))
        {
            return "Choose what the goal measures.";
        }

        if (!HealthLogRules.MeasurementBounds.TryGetValue(kind, out var bounds) || start < bounds.Min || start > bounds.Max
            || target < bounds.Min || target > bounds.Max)
        {
            return $"That looks off — expected {bounds.Min:0.##} to {bounds.Max:0.##} {HealthKinds.MeasurementUnits[kind]}.";
        }

        return start == target ? "The target is where you already are — pick where you want to get to." : null;
    }

    /// <summary>
    /// How far from <paramref name="start"/> toward <paramref name="target"/> the latest reading is, as a whole %
    /// (works going down or up; moving the wrong way is 0, reaching or passing it is 100; no reading yet is 0).
    /// </summary>
    public static int GoalPercent(decimal start, decimal target, decimal? latest)
    {
        if (latest is not { } current || start == target)
        {
            return 0;
        }

        var done = (start - current) / (start - target);
        return (int)Math.Floor(Math.Clamp(done, 0m, 1m) * 100);
    }
}
