using LifeOS.Core.Goals.DTOs;
using LifeOS.Core.Goals.ServiceContracts;
using LifeOS.Core.Goals.Services;
using LifeOS.Core.Health.DTOs;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.ServiceContracts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace LifeOS.Core.Health.Services;

/// <summary>
/// Workouts counting toward goals (Session 71h): the steps, km or minutes of workouts of one kind (or any) — "Walk
/// 1,00,000 steps", "Run 500 km". Health data, so the reader only asks for amounts with the vault unlocked; locked, a
/// source is called just "Workouts". The source stores only the kind word and the figure, nothing from a workout.
/// Workouts are the record themselves: deleting one simply lowers the figure (nothing is carried over).
/// </summary>
public class WorkoutGoalSource(AppDbContext db, IServiceProvider services) : IGoalProgressSource
{
    public IReadOnlyCollection<string> Kinds { get; } = [GoalSourceKinds.Workouts];

    public bool IsSensitive => true;

    public string NeutralTitle => "Workouts";

    // Resolved per call, like the Health linkable providers: VaultService takes every linkable provider.
    private bool Unlocked => services.GetRequiredService<IVaultService>().IsUnlocked;

    public Task<Dictionary<int, SourceDescription>> DescribeAsync(IReadOnlyCollection<GoalSourceRef> sources)
    {
        var unlocked = Unlocked;
        return Task.FromResult(sources
            .Where(s => WorkoutGoalRules.Check(s.Filter, s.Metric) is null)
            .ToDictionary(s => s.Id, s => new SourceDescription(
                unlocked ? WorkoutGoalRules.Title(s.Filter, s.Metric!) : NeutralTitle,
                WorkoutGoalRules.UnitOf(s.Metric!))));
    }

    public async Task<List<SourceAmount>> AmountsAsync(IReadOnlyCollection<GoalSourceRef> sources, DateOnly today)
    {
        var valid = sources.Where(s => WorkoutGoalRules.Check(s.Filter, s.Metric) is null).ToList();
        if (valid.Count == 0)
        {
            return [];
        }

        var earliest = valid.Min(s => s.CountsFrom);
        var workouts = (await db.Workouts
                .Where(w => w.OccurredOn >= earliest && w.OccurredOn <= today)
                .Select(w => new { w.Kind, w.OccurredOn, w.Minutes, w.Steps, w.DistanceKm })
                .ToListAsync())
            .Select(w => new WorkoutFigures(w.Kind, w.OccurredOn, w.Minutes, w.Steps, w.DistanceKm))
            .ToList();

        return valid.SelectMany(s => WorkoutGoalRules.Amounts(s, workouts)).ToList();
    }

    public Task<List<GoalSourceOptionDto>> OptionsAsync() =>
        Task.FromResult(WorkoutGoalRules.Options
            .Select(o => new GoalSourceOptionDto
            {
                Kind = GoalSourceKinds.Workouts,
                Filter = o.Kind,
                Metric = o.Metric,
                // The kinds are LifeOS's fixed list, not anything logged, so the menu can name them while locked.
                Title = WorkoutGoalRules.Title(o.Kind, o.Metric),
                Unit = WorkoutGoalRules.UnitOf(o.Metric),
            })
            .ToList());

    public Task<string?> CheckAsync(GoalSourceRef source) =>
        Task.FromResult(WorkoutGoalRules.Check(source.Filter, source.Metric));
}

/// <summary>A workout's countable figures.</summary>
public sealed record WorkoutFigures(string Kind, DateOnly OccurredOn, int Minutes, int? Steps, decimal? DistanceKm);

/// <summary>
/// Which workout figures a goal can count and how they add up. Pure, xUnit-tested. Steps only for kinds on foot, km
/// for kinds that cover distance, minutes for every kind — "any workout" can count all three. A workout logged
/// without steps or km adds nothing to a steps/km goal (never a guess).
/// </summary>
public static class WorkoutGoalRules
{
    public const string StepsUnit = "steps";
    public const string KmUnit = "km";
    public const string MinutesUnit = "minutes";

    private static readonly string[] OnFoot = ["Walk", "Run"];
    private static readonly string[] Distance = ["Walk", "Run", "Cycle", "Swim"];

    /// <summary>Every kind (null = any) × figure a goal can count, in the picker's order.</summary>
    public static readonly IReadOnlyList<(string? Kind, string Metric)> Options =
    [
        .. new[] { (string?)null }.Concat(OnFoot).Select(k => (k, GoalSourceMetrics.Steps)),
        .. new[] { (string?)null }.Concat(Distance).Select(k => (k, GoalSourceMetrics.DistanceKm)),
        .. new[] { (string?)null }.Concat(HealthKinds.WorkoutKinds.Order()).Select(k => (k, GoalSourceMetrics.Minutes)),
    ];

    public static string? Check(string? kind, string? metric)
    {
        if (metric is null || !GoalSourceMetrics.All.Contains(metric))
        {
            return "Choose steps, km or minutes.";
        }

        if (kind is not null && !HealthKinds.WorkoutKinds.Contains(kind))
        {
            return "Choose a kind of workout.";
        }

        return Options.Contains((kind, metric))
            ? null
            : $"{kind} workouts don't record {UnitOf(metric)}.";
    }

    public static string UnitOf(string metric) => metric switch
    {
        GoalSourceMetrics.Steps => StepsUnit,
        GoalSourceMetrics.DistanceKm => KmUnit,
        _ => MinutesUnit,
    };

    /// <summary>"Walk workouts: steps", "Any workout: km".</summary>
    public static string Title(string? kind, string metric) =>
        $"{(kind is null ? "Any workout" : $"{kind} workouts")}: {UnitOf(metric)}";

    /// <summary>What a source counted per day: the figure of every matching workout from its CountsFrom on.</summary>
    public static IEnumerable<SourceAmount> Amounts(GoalSourceRef source, IEnumerable<WorkoutFigures> workouts) =>
        workouts
            .Where(w => w.OccurredOn >= source.CountsFrom && (source.Filter is null || w.Kind == source.Filter))
            .Select(w => (w.OccurredOn, Amount: Figure(w, source.Metric!)))
            .Where(w => w.Amount is > 0)
            .GroupBy(w => w.OccurredOn)
            .OrderBy(g => g.Key)
            .Select(g => new SourceAmount(source.Id, g.Key, g.Sum(w => w.Amount!.Value)));

    private static decimal? Figure(WorkoutFigures w, string metric) => metric switch
    {
        GoalSourceMetrics.Steps => w.Steps,
        GoalSourceMetrics.DistanceKm => w.DistanceKm,
        _ => w.Minutes,
    };
}
