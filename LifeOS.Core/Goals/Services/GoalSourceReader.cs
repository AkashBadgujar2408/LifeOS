using LifeOS.Core.Goals.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.ServiceContracts;
using Microsoft.Extensions.DependencyInjection;

namespace LifeOS.Core.Goals.Services;

/// <summary>
/// Reads goal sources through their providers (<see cref="IGoalProgressSource"/>): what each one is called and what it
/// has counted. A sensitive (Health) source is only read with the vault unlocked; otherwise it comes back Locked.
/// Shared by the progress rule and the goal page so both count exactly the same way.
/// </summary>
public class GoalSourceReader(IEnumerable<IGoalProgressSource> providers, IServiceProvider services)
{
    private bool? unlocked;

    // Resolved per call, like the Health linkable providers: VaultService takes every linkable provider.
    private bool VaultUnlocked => unlocked ??= services.GetRequiredService<IVaultService>().IsUnlocked;

    public IEnumerable<IGoalProgressSource> Providers => providers;

    public IGoalProgressSource? ProviderFor(string kind) => providers.FirstOrDefault(p => p.Kinds.Contains(kind));

    public static GoalSourceRef ToRef(GoalSource s) =>
        new(s.Id, s.GoalId, s.Kind, s.EntityType, s.EntityId, s.Filter, s.Metric, s.CountsFrom);

    public async Task<Dictionary<int, SourceDescription>> DescribeAsync(IReadOnlyCollection<GoalSourceRef> sources)
    {
        var result = new Dictionary<int, SourceDescription>();
        foreach (var group in sources.GroupBy(s => ProviderFor(s.Kind)))
        {
            if (group.Key is null)
            {
                continue;
            }

            foreach (var (id, description) in await group.Key.DescribeAsync(group.ToList()))
            {
                result[id] = description;
            }
        }

        return result;
    }

    /// <summary>Each source's amounts by day (oldest first), and the sources that couldn't be read (locked).</summary>
    public async Task<SourceAmounts> AmountsAsync(IReadOnlyCollection<GoalSourceRef> sources, DateOnly today)
    {
        var byDay = new Dictionary<int, List<SourceAmount>>();
        var locked = new HashSet<int>();
        foreach (var group in sources.GroupBy(s => ProviderFor(s.Kind)))
        {
            if (group.Key is null)
            {
                continue;
            }

            if (group.Key.IsSensitive && !VaultUnlocked)
            {
                locked.UnionWith(group.Select(s => s.Id));
                continue;
            }

            foreach (var amount in await group.Key.AmountsAsync(group.ToList(), today))
            {
                (byDay.TryGetValue(amount.SourceId, out var list) ? list : byDay[amount.SourceId] = []).Add(amount);
            }
        }

        foreach (var list in byDay.Values)
        {
            list.Sort((a, b) => a.Day.CompareTo(b.Day));
        }

        return new SourceAmounts(byDay, locked);
    }
}

public sealed record SourceAmounts(Dictionary<int, List<SourceAmount>> ByDay, HashSet<int> Locked)
{
    public decimal Total(int sourceId) => ByDay.TryGetValue(sourceId, out var list) ? list.Sum(a => a.Amount) : 0;
}
