namespace LifeOS.Core.Shared.Services;

/// <summary>
/// "A needs B first" graphs (mission prerequisites, task blockers): the one loop check. Pure and unit-tested; callers
/// load their live edges and ask before adding one.
/// </summary>
public static class DependencyGraph
{
    /// <summary>
    /// Would adding "<paramref name="from"/> needs <paramref name="to"/>" close a loop? True when <paramref name="to"/>
    /// already (directly or through others) needs <paramref name="from"/> — or is the same item.
    /// </summary>
    public static bool WouldCreateCycle(IEnumerable<(int From, int To)> edges, int from, int to)
    {
        if (from == to)
        {
            return true;
        }

        var needs = edges
            .GroupBy(e => e.From)
            .ToDictionary(g => g.Key, g => g.Select(e => e.To).ToList());

        // Walk everything `to` depends on; reaching `from` means the new edge would close a loop.
        var seen = new HashSet<int>();
        var stack = new Stack<int>([to]);
        while (stack.Count > 0)
        {
            var current = stack.Pop();
            if (current == from)
            {
                return true;
            }

            if (!seen.Add(current) || !needs.TryGetValue(current, out var next))
            {
                continue;
            }

            foreach (var n in next)
            {
                stack.Push(n);
            }
        }

        return false;
    }
}
