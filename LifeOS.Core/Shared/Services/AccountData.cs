using System.Globalization;
using System.Text;

namespace LifeOS.Core.Shared.Services;

/// <summary>
/// The pure parts of export / import / permanent deletion (Session 60), unit-tested: which tables take part, the order
/// rows can be inserted in (and deleted in, reversed), how a linkable type string finds its table, and CSV writing.
/// </summary>
public static class AccountData
{
    /// <summary>Written into manifest.json; an import refuses anything else.</summary>
    public const string Format = "lifeos-export";

    /// <summary>Bumped when the export's shape changes in a way an older import can't read.</summary>
    public const int Version = 1;

    /// <summary>Entities never written to an export: the login's own secrets.</summary>
    public static readonly IReadOnlySet<string> NotExported = new HashSet<string>(["RecoveryCode"], StringComparer.Ordinal);

    /// <summary>
    /// Entities exported (they're the user's) but never imported: the vault's access log belongs to the account it
    /// happened in, and recovery codes are made fresh at registration.
    /// </summary>
    public static readonly IReadOnlySet<string> NotImported = new HashSet<string>(["RecoveryCode", "VaultAccessLog"], StringComparer.Ordinal);

    /// <summary>
    /// The entity (model class) a linkable / attachable / reminder type string is stored in. Most are the same word;
    /// the two that aren't are named here. Checked against every registered provider by a unit test.
    /// </summary>
    public static string ModelTypeFor(string linkableType) => linkableType switch
    {
        "FinanceAccount" => "Account",
        "Task" => "TaskItem",
        _ => linkableType,
    };

    /// <summary>
    /// An order to insert the nodes in so every row's principal is already there (Kahn's algorithm, ties kept in the
    /// given order so the result is stable). Self-references are left to the caller (they're patched afterwards).
    /// Deleting goes in the reverse order. Throws on a cycle — the schema has none, and a new one needs a decision.
    /// </summary>
    public static List<T> InsertOrder<T>(IReadOnlyList<T> nodes, Func<T, IEnumerable<T>> principalsOf)
        where T : notnull
    {
        var waitingOn = nodes.ToDictionary(n => n, n => principalsOf(n).Where(p => !p.Equals(n) && nodes.Contains(p)).ToHashSet());
        var order = new List<T>(nodes.Count);
        while (order.Count < nodes.Count)
        {
            var ready = nodes.Where(n => !order.Contains(n) && waitingOn[n].All(order.Contains)).ToList();
            if (ready.Count == 0)
            {
                var stuck = string.Join(", ", nodes.Where(n => !order.Contains(n)));
                throw new InvalidOperationException($"The tables' foreign keys form a cycle: {stuck}.");
            }

            order.AddRange(ready);
        }

        return order;
    }

    /// <summary>
    /// One table as CSV (RFC 4180: quotes around anything with a comma, quote or line break; dates ISO; numbers
    /// invariant). Text starting with = + - @ gets a leading apostrophe so a spreadsheet doesn't run it as a formula —
    /// the JSON next to it keeps the exact text, and only the JSON is read back on import.
    /// </summary>
    public static string Csv(IReadOnlyList<string> columns, IEnumerable<IReadOnlyList<object?>> rows)
    {
        var csv = new StringBuilder();
        csv.AppendJoin(',', columns.Select(Cell)).Append("\r\n");
        foreach (var row in rows)
        {
            csv.AppendJoin(',', row.Select(value => Cell(Text(value)))).Append("\r\n");
        }

        return csv.ToString();
    }

    private static string Text(object? value) => value switch
    {
        null => string.Empty,
        string s => s.Length > 0 && "=+-@".Contains(s[0]) ? "'" + s : s,
        DateTime d => d.ToString("yyyy-MM-dd'T'HH:mm:ss.fffffff'Z'", CultureInfo.InvariantCulture),
        DateOnly d => d.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
        TimeOnly t => t.ToString("HH:mm:ss", CultureInfo.InvariantCulture),
        bool b => b ? "true" : "false",
        byte[] bytes => Convert.ToBase64String(bytes),
        IFormattable f => f.ToString(null, CultureInfo.InvariantCulture),
        _ => value.ToString() ?? string.Empty,
    };

    private static string Cell(string text) =>
        text.IndexOfAny([',', '"', '\r', '\n']) >= 0 ? "\"" + text.Replace("\"", "\"\"") + "\"" : text;
}
