using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using LifeOS.Core.Finance.DTOs;

namespace LifeOS.Core.Finance.Services;

/// <summary>Insurance policies and tax items, mirroring CK_InsurancePolicies_* / CK_TaxItems_* (pure, unit-tested).</summary>
public static class ProtectionRules
{
    public static string? CheckPolicy(
        string kind, string? currency, decimal? sumAssured, decimal? premium, string? frequency,
        DateOnly? start, DateOnly? renews, DateOnly? ends, int? reminderDays) =>
        !PolicyKinds.All.Contains(kind) ? "Unknown kind of policy."
        : currency is null ? "Choose its currency."
        : sumAssured is <= 0 || sumAssured > FinanceRules.MaxAmount ? "The cover has to be more than zero (leave it blank if there's none)."
        : premium is <= 0 || premium > FinanceRules.MaxAmount ? "The premium has to be more than zero (leave it blank if there's none)."
        : premium is not null && frequency is null ? "Say how often the premium is paid."
        : premium is null && frequency is not null ? "Give the premium, or leave how often blank."
        : frequency is not null && !PolicyKinds.PerYear.ContainsKey(frequency) ? "Unknown premium frequency."
        : start is { } s && ends is { } e && e < s ? "It can't end before it starts."
        : start is { } s2 && renews is { } r && r < s2 ? "It can't renew before it starts."
        : renews is { } r2 && ends is { } e2 && r2 > e2 ? "It can't renew after it ends."
        : reminderDays is not null && renews is null ? "A renewal reminder needs a renewal date."
        : reminderDays is < 0 or > 365 ? "Remind 0 to 365 days before."
        : null;

    /// <summary>The premium over a year (null: none, or a single premium).</summary>
    public static decimal? AnnualPremium(decimal? premium, string? frequency) =>
        premium is { } p && frequency is not null && PolicyKinds.PerYear.TryGetValue(frequency, out var times) && times > 0
            ? p * times
            : null;

    /// <summary>"Car insurance renews on 14/Oct/2027" (at most 200 characters, like every reminder title).</summary>
    public static string RenewalReminderTitle(string policyName, DateOnly renewsOn)
    {
        var suffix = $" renews on {renewsOn.ToString("dd'/'MMM'/'yyyy", CultureInfo.InvariantCulture)}";
        var name = policyName.Length + suffix.Length > 200 ? policyName[..(200 - suffix.Length - 1)] + "…" : policyName;
        return name + suffix;
    }

    public static string? CheckTaxItem(string kind, decimal? amount, string? currency, DateOnly? doneOn, DateOnly today) =>
        !TaxItemKinds.All.Contains(kind) ? "Unknown kind of tax item."
        : amount is <= 0 || amount > FinanceRules.MaxAmount ? "The amount has to be more than zero (leave it blank if there's none)."
        : amount is not null && currency is null ? "Choose the amount's currency."
        : amount is null && currency is not null ? "Give the amount, or leave the currency blank."
        : doneOn is { } d && d > today ? "It can't be done in the future."
        : null;
}

/// <summary>One statement line ready to check: + money in, − money out.</summary>
public sealed record StatementLine(DateOnly OccurredOn, decimal Amount, string Description);

/// <summary>
/// Importing bank statements (pure, unit-tested). Each line gets a fingerprint — SHA-256 of the account, day, signed
/// amount, cleaned description and which repeat of that same line it is within the file — stored as
/// Transactions.ImportHash, so importing the same statement (or one that overlaps it) twice adds nothing the second
/// time. Two identical coffees on one day are repeats 0 and 1, so both are kept the first time.
/// </summary>
public static partial class StatementImport
{
    /// <summary>The most lines one import takes.</summary>
    public const int MaxLines = 5000;

    /// <summary>Trimmed, inner whitespace collapsed (banks pad descriptions differently between exports).</summary>
    public static string Clean(string? text) => Spaces().Replace(text?.Trim() ?? string.Empty, " ");

    /// <summary>The fingerprints of a statement's lines, in order.</summary>
    public static List<string> Hashes(int accountId, IReadOnlyList<StatementLine> lines)
    {
        var seen = new Dictionary<string, int>(StringComparer.Ordinal);
        var hashes = new List<string>(lines.Count);
        foreach (var line in lines)
        {
            var key = string.Join(
                '|',
                accountId.ToString(CultureInfo.InvariantCulture),
                line.OccurredOn.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                line.Amount.ToString("0.0000", CultureInfo.InvariantCulture),
                Clean(line.Description).ToUpperInvariant());
            var repeat = seen.TryGetValue(key, out var count) ? count : 0;
            seen[key] = repeat + 1;
            var bytes = SHA256.HashData(Encoding.UTF8.GetBytes($"{key}|{repeat.ToString(CultureInfo.InvariantCulture)}"));
            hashes.Add(Convert.ToHexStringLower(bytes));
        }

        return hashes;
    }

    /// <summary>Text cut to fit a column (an imported description longer than Payee holds is shortened, not refused).</summary>
    public static string? Fit(string? text, int max)
    {
        var cleaned = Clean(text);
        return cleaned.Length == 0 ? null : cleaned.Length <= max ? cleaned : cleaned[..(max - 1)] + "…";
    }

    [GeneratedRegex(@"\s+")]
    private static partial Regex Spaces();
}

/// <summary>A month's income and spending in the base currency, as finance.GetCashFlow returns it.</summary>
public sealed record CashFlowRow(DateOnly MonthStart, decimal Income, decimal Spending, int Unconverted);

/// <summary>Cash flow and savings rate month by month (pure, unit-tested).</summary>
public static class CashFlowReport
{
    /// <summary>(income − spending) ÷ income as a %, one decimal; null without income to save from.</summary>
    public static decimal? SavingsRate(decimal income, decimal spending) =>
        income > 0 ? Math.Round((income - spending) / income * 100, 1, MidpointRounding.AwayFromZero) : null;

    /// <summary>Every month from <paramref name="firstMonth"/> to <paramref name="lastMonth"/> (first days), empty ones as zero.</summary>
    public static List<CashFlowMonthDto> Months(IEnumerable<CashFlowRow> rows, DateOnly firstMonth, DateOnly lastMonth)
    {
        var byMonth = rows.ToDictionary(r => r.MonthStart);
        var months = new List<CashFlowMonthDto>();
        for (var month = firstMonth; month <= lastMonth; month = month.AddMonths(1))
        {
            var row = byMonth.GetValueOrDefault(month) ?? new CashFlowRow(month, 0, 0, 0);
            months.Add(Month(month, row.Income, row.Spending, row.Unconverted));
        }

        return months;
    }

    /// <summary>The months added up (labelled with the first month).</summary>
    public static CashFlowMonthDto Total(IReadOnlyList<CashFlowMonthDto> months) =>
        Month(
            months.Count > 0 ? months[0].MonthStart : default,
            months.Sum(m => m.Income),
            months.Sum(m => m.Spending),
            months.Sum(m => m.Unconverted));

    /// <summary>The first day of the month <paramref name="count"/> − 1 months before today's (count 12 = the last year).</summary>
    public static DateOnly FirstMonth(DateOnly today, int count) => new DateOnly(today.Year, today.Month, 1).AddMonths(1 - count);

    private static CashFlowMonthDto Month(DateOnly monthStart, decimal income, decimal spending, int unconverted)
    {
        income = Math.Round(income, 4);
        spending = Math.Round(spending, 4);
        return new CashFlowMonthDto
        {
            MonthStart = monthStart,
            Income = income,
            Spending = spending,
            Net = income - spending,
            SavingsRate = SavingsRate(income, spending),
            Unconverted = unconverted,
        };
    }
}
