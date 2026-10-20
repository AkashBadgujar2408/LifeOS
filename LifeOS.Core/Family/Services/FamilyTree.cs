using LifeOS.Core.Family.DTOs;
using LifeOS.Core.Shared.Services;

namespace LifeOS.Core.Family.Services;

/// <summary>A relationship as the tree needs it: Relative is Person's Kind (either side null = you).</summary>
public sealed record FamilyEdge(int? Person, int? Relative, string Kind, string? Label);

/// <summary>Where someone sits relative to you: generations up (+) or down (−) and what they are to you.</summary>
public sealed record FamilyPlace(int? Generation, string Relation);

/// <summary>
/// The family tree, worked out from its edges (Session 73). Pure, xUnit-tested. Each person is reached from you by
/// the shortest chain of steps — up to a parent, down to a child, across to a partner or sibling — and named by it in
/// plain, gender-neutral words: "Parent", "Grandparent", "Parent's sibling", "Cousin", "Partner's parent". An "Other"
/// relationship to you is named by its label and has no generation; people the tree doesn't connect to you have no
/// place. Nothing here is stored.
/// </summary>
public static class FamilyTree
{
    private const int You = 0;

    private enum Step { Up, Down, Partner, Sibling }

    /// <summary>Each connected person's place (you aren't in it).</summary>
    public static Dictionary<int, FamilyPlace> Places(IReadOnlyCollection<FamilyEdge> edges)
    {
        var neighbours = new Dictionary<int, List<(int To, Step Step)>>();
        void Add(int from, int to, Step step) =>
            (neighbours.TryGetValue(from, out var list) ? list : neighbours[from] = []).Add((to, step));

        foreach (var e in edges.Where(e => e.Kind != RelationshipKinds.Other))
        {
            var person = e.Person ?? You;
            var relative = e.Relative ?? You;
            switch (e.Kind)
            {
                case RelationshipKinds.Parent:
                    Add(person, relative, Step.Up);
                    Add(relative, person, Step.Down);
                    break;
                case RelationshipKinds.Partner:
                    Add(person, relative, Step.Partner);
                    Add(relative, person, Step.Partner);
                    break;
                default:
                    Add(person, relative, Step.Sibling);
                    Add(relative, person, Step.Sibling);
                    break;
            }
        }

        // Breadth first: the fewest steps wins; among equals, up before down before partner before sibling, then id.
        var paths = new Dictionary<int, List<Step>> { [You] = [] };
        var queue = new Queue<int>([You]);
        while (queue.Count > 0)
        {
            var current = queue.Dequeue();
            if (!neighbours.TryGetValue(current, out var next))
            {
                continue;
            }

            foreach (var (to, step) in next.OrderBy(n => n.Step).ThenBy(n => n.To))
            {
                if (paths.ContainsKey(to))
                {
                    continue;
                }

                paths[to] = [.. paths[current], step];
                queue.Enqueue(to);
            }
        }

        var places = paths
            .Where(p => p.Key != You)
            .ToDictionary(p => p.Key, p => new FamilyPlace(
                p.Value.Count(s => s == Step.Up) - p.Value.Count(s => s == Step.Down),
                Words(Normalise(p.Value))));

        // "Other" relations to you ("Godmother") name people the tree doesn't otherwise reach.
        foreach (var e in edges.Where(e => e.Kind == RelationshipKinds.Other && e.Person is null && e.Relative is not null))
        {
            places.TryAdd(e.Relative!.Value, new FamilyPlace(null, e.Label ?? "Family"));
        }

        return places;
    }

    /// <summary>
    /// Would "<paramref name="parent"/> is <paramref name="child"/>'s parent" make someone their own ancestor? Uses the
    /// shared loop check over every parent edge (child → parent), you (null) as 0.
    /// </summary>
    public static bool WouldLoop(IEnumerable<FamilyEdge> edges, int? child, int? parent) =>
        DependencyGraph.WouldCreateCycle(
            edges.Where(e => e.Kind == RelationshipKinds.Parent).Select(e => (e.Person ?? You, e.Relative ?? You)),
            child ?? You, parent ?? You);

    /// <summary>A parent's child is a sibling; a sibling's sibling is a sibling.</summary>
    private static List<Step> Normalise(List<Step> path)
    {
        var steps = new List<Step>(path);
        var changed = true;
        while (changed)
        {
            changed = false;
            for (var i = 0; i < steps.Count - 1; i++)
            {
                if (steps[i] == Step.Up && steps[i + 1] == Step.Down)
                {
                    steps.RemoveAt(i + 1);
                    steps[i] = Step.Sibling;
                    changed = true;
                    break;
                }

                if (steps[i] == Step.Sibling && steps[i + 1] == Step.Sibling)
                {
                    steps.RemoveAt(i + 1);
                    changed = true;
                    break;
                }
            }
        }

        return steps;
    }

    private static string Words(List<Step> steps)
    {
        // A parent's sibling's child is a cousin; a grandparent's sibling's grandchild a second cousin.
        for (var n = 1; n <= 2; n++)
        {
            if (steps.Count == 2 * n + 1 && steps.Take(n).All(s => s == Step.Up) && steps[n] == Step.Sibling
                && steps.Skip(n + 1).All(s => s == Step.Down))
            {
                return n == 1 ? "Cousin" : "Second cousin";
            }
        }

        var parts = new List<string>();
        for (var i = 0; i < steps.Count;)
        {
            var run = 1;
            while (i + run < steps.Count && steps[i + run] == steps[i] && steps[i] is Step.Up or Step.Down)
            {
                run++;
            }

            parts.Add(steps[i] switch
            {
                Step.Up => Generations(run, "parent"),
                Step.Down => Generations(run, "child"),
                Step.Partner => "partner",
                _ => "sibling",
            });
            i += run;
        }

        var text = string.Join("'s ", parts);
        return char.ToUpperInvariant(text[0]) + text[1..];
    }

    /// <summary>parent, grandparent, great-grandparent, great-great-grandparent …</summary>
    private static string Generations(int run, string word) =>
        run == 1 ? word : string.Concat(Enumerable.Repeat("great-", run - 2)) + "grand" + word;
}
