using System.Globalization;

namespace LifeOS.Core.Story.Services;

/// <summary>One money achievement's line in the base currency: the amount it unlocks at and how it's named.</summary>
public sealed record MoneyThreshold(string Key, decimal Inr, decimal Amount, string Label);

/// <summary>
/// The money achievements' thresholds, written once in INR (lakh/crore — the main case). Another base currency gets
/// the same set converted with the INR rate and rounded to a milestone-looking figure (1, 2, 2.5 or 5 × a power of
/// ten: ₹10 lakh ≈ $12,000 → $10,000), so the name reads naturally and small rate moves don't shift it. Pure.
/// </summary>
public static class AchievementThresholds
{
    public const string Inr = "INR";

    public static readonly IReadOnlyList<(string Key, decimal Inr)> NetWorth =
    [
        ("net-worth-10-lakh", 10_00_000m),
        ("net-worth-25-lakh", 25_00_000m),
        ("net-worth-50-lakh", 50_00_000m),
        ("net-worth-1-crore", 1_00_00_000m),
    ];

    public static readonly IReadOnlyList<(string Key, decimal Inr)> MonthIncome =
    [
        ("earned-1-lakh-month", 1_00_000m),
        ("earned-2-lakh-month", 2_00_000m),
    ];

    /// <summary>
    /// The thresholds in <paramref name="baseCurrency"/>; <paramref name="inrRate"/> is one INR in it (ignored for
    /// INR). Null when another currency has no INR rate — those achievements can't be judged yet.
    /// </summary>
    public static IReadOnlyList<MoneyThreshold>? For(IReadOnlyList<(string Key, decimal Inr)> set, string baseCurrency, decimal? inrRate)
    {
        if (baseCurrency == Inr)
        {
            return set.Select(t => new MoneyThreshold(t.Key, t.Inr, t.Inr, Label(t.Inr, Inr))).ToList();
        }

        if (inrRate is not > 0)
        {
            return null;
        }

        return set.Select(t =>
        {
            var amount = Milestone(t.Inr * inrRate.Value);
            return new MoneyThreshold(t.Key, t.Inr, amount, Label(amount, baseCurrency));
        }).ToList();
    }

    /// <summary>The nearest of 1, 2, 2.5, 5 (× a power of ten) to <paramref name="amount"/>, nearest by ratio.</summary>
    public static decimal Milestone(decimal amount)
    {
        if (amount <= 0)
        {
            return 0;
        }

        var power = (decimal)Math.Pow(10, Math.Floor(Math.Log10((double)amount)));
        var candidates = new[] { 1m, 2m, 2.5m, 5m, 10m }.Select(m => m * power);
        return candidates.MinBy(c => Math.Abs(Math.Log((double)(c / amount))));
    }

    /// <summary>"₹10 lakh", "₹1 crore", "₹50,000" in INR; "$10,000" (or "CHF 10,000" without a symbol) otherwise.</summary>
    public static string Label(decimal amount, string currency)
    {
        if (currency == Inr)
        {
            return amount >= 1_00_00_000m ? $"₹{(amount / 1_00_00_000m).ToString("0.##", CultureInfo.InvariantCulture)} crore"
                : amount >= 1_00_000m ? $"₹{(amount / 1_00_000m).ToString("0.##", CultureInfo.InvariantCulture)} lakh"
                : $"₹{amount.ToString("#,0.##", CultureInfo.InvariantCulture)}";
        }

        var number = amount.ToString("#,0.##", CultureInfo.InvariantCulture);
        return Symbol(currency) is { } symbol ? symbol + number : $"{currency} {number}";
    }

    /// <summary>A currency's symbol where it's a short, unambiguous one ("$", "€", "£"), else null.</summary>
    private static string? Symbol(string currency) => Symbols.Value.GetValueOrDefault(currency);

    private static readonly Lazy<Dictionary<string, string>> Symbols = new(() =>
        CultureInfo.GetCultures(CultureTypes.SpecificCultures)
            .Select(c =>
            {
                try
                {
                    return new RegionInfo(c.Name);
                }
                catch (ArgumentException)
                {
                    return null;
                }
            })
            .OfType<RegionInfo>()
            .Where(r => r.CurrencySymbol is { Length: > 0 and <= 2 } s && !s.Any(char.IsLetter))
            .GroupBy(r => r.ISOCurrencySymbol)
            .ToDictionary(g => g.Key, g => g.First().CurrencySymbol));
}
