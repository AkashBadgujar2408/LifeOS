using LifeOS.Core.Finance.Services;

namespace LifeOS.Core.Home.Services;

/// <summary>One logged refuel, as <see cref="FuelEconomy"/> needs it (quantity already worked out from the rate).</summary>
public record FuelFill(int Id, DateOnly FilledOn, int OdometerKm, decimal Amount, string Currency, decimal Quantity, bool MissedFillBefore);

/// <summary>The overall average over the current run: distance ÷ fuel burnt, and what that fuel cost per km.</summary>
public record FuelAverage(decimal PerUnit, int DistanceKm, decimal FuelUsed, int Fills, decimal? CostPerKm, string? Currency);

/// <summary>The average as it stood after a fill (only fills that complete a run of two or more).</summary>
public record FuelTrendPoint(int FillId, DateOnly FilledOn, int OdometerKm, decimal PerUnit);

/// <summary>What was spent on fuel in one month, in one currency.</summary>
public record FuelMonth(DateOnly MonthStart, string Currency, decimal Amount);

/// <summary>
/// Mileage from partial fills (your method): most fills are partial and made when the tank is near empty, so per-fill
/// figures are noise. One overall average instead = (latest odometer − odometer at the first fill of the run) ÷ the
/// fuel of every fill in the run <b>except the latest</b> (that fuel is still in the tank). The unknown tank level at
/// either end fades as fills add up. A fill marked "missed a fill before this" starts a new run, so a forgotten fill
/// never makes the car look better than it is. Pure, never stored.
/// </summary>
public static class FuelEconomy
{
    /// <summary>A fill's quantity: given, or what was paid ÷ the price per unit.</summary>
    public static decimal Quantity(decimal amount, decimal? pricePerUnit, decimal? quantity) =>
        quantity ?? (pricePerUnit is > 0 ? amount / pricePerUnit.Value : 0);

    /// <summary>A fill's price per unit: given, or what was paid ÷ the quantity.</summary>
    public static decimal PricePerUnit(decimal amount, decimal? pricePerUnit, decimal? quantity) =>
        pricePerUnit ?? (quantity is > 0 ? amount / quantity.Value : 0);

    /// <summary>Fills in the order they happened: by day, then odometer (two fills on one day), then id.</summary>
    public static List<FuelFill> Ordered(IEnumerable<FuelFill> fills) =>
        fills.OrderBy(f => f.FilledOn).ThenBy(f => f.OdometerKm).ThenBy(f => f.Id).ToList();

    /// <summary>The current run: from the last fill marked "missed a fill before this" (or the first fill) to the latest.</summary>
    public static List<FuelFill> CurrentRun(IEnumerable<FuelFill> fills)
    {
        var ordered = Ordered(fills);
        var start = ordered.FindLastIndex(f => f.MissedFillBefore);
        return start <= 0 ? ordered : ordered[start..];
    }

    /// <summary>The overall average of the current run — null until it has two fills with distance between them.</summary>
    public static FuelAverage? Average(IEnumerable<FuelFill> fills) => AverageOf(CurrentRun(fills));

    /// <summary>
    /// The average after each fill, oldest first — how the estimate settled as fills were added. Each run starts
    /// again (a missed fill), so the points of an earlier run show what it said then.
    /// </summary>
    public static List<FuelTrendPoint> Trend(IEnumerable<FuelFill> fills)
    {
        var points = new List<FuelTrendPoint>();
        var run = new List<FuelFill>();
        foreach (var fill in Ordered(fills))
        {
            if (fill.MissedFillBefore)
            {
                run.Clear();
            }

            run.Add(fill);
            if (AverageOf(run) is { } average)
            {
                points.Add(new FuelTrendPoint(fill.Id, fill.FilledOn, fill.OdometerKm, Math.Round(average.PerUnit, 2)));
            }
        }

        return points;
    }

    /// <summary>What was paid for fuel per month and currency, latest month first.</summary>
    public static List<FuelMonth> Monthly(IEnumerable<FuelFill> fills) =>
        fills.GroupBy(f => (Month: new DateOnly(f.FilledOn.Year, f.FilledOn.Month, 1), f.Currency))
            .Select(g => new FuelMonth(g.Key.Month, g.Key.Currency, g.Sum(f => f.Amount)))
            .OrderByDescending(m => m.MonthStart).ThenBy(m => m.Currency, StringComparer.Ordinal)
            .ToList();

    /// <summary>
    /// A fill's own checks (mirroring the CHECKs): a day not ahead of today, a reading, an amount, and the price per
    /// unit <b>or</b> the quantity — not both, not neither.
    /// </summary>
    public static string? CheckFill(DateOnly filledOn, int odometerKm, decimal amount, string? currency, decimal? pricePerUnit, decimal? quantity, DateOnly today) =>
        filledOn == default ? "Say when you filled up."
        : filledOn > today ? "That can't be in the future."
        : odometerKm is < 0 or > 10_000_000 ? "That isn't an odometer reading."
        : amount <= 0 || amount > FinanceRules.MaxAmount ? "What you paid has to be more than zero."
        : currency is null ? "Choose the currency."
        : pricePerUnit is not null && quantity is not null ? "Give the price per unit or the quantity, not both — the other is worked out."
        : pricePerUnit is null && quantity is null ? "Give the price per unit or the quantity."
        : pricePerUnit is <= 0 || pricePerUnit > FinanceRules.MaxAmount ? "The price per unit has to be more than zero."
        : quantity is <= 0 or > 100_000 ? "The quantity has to be more than zero."
        : null;

    /// <summary>
    /// The odometer only goes up: an earlier fill must read less, a later one more, and another fill the same day
    /// can't read the same.
    /// </summary>
    public static string? CheckOdometer(DateOnly filledOn, int odometerKm, IEnumerable<(DateOnly FilledOn, int OdometerKm)> others)
    {
        foreach (var other in others)
        {
            if (other.FilledOn < filledOn && other.OdometerKm >= odometerKm)
            {
                return FormattableString.Invariant($"A fill on an earlier day already reads {other.OdometerKm:N0} km — the odometer only goes up.");
            }

            if (other.FilledOn > filledOn && other.OdometerKm <= odometerKm)
            {
                return FormattableString.Invariant($"A fill on a later day reads {other.OdometerKm:N0} km — this reading has to be lower.");
            }

            if (other.FilledOn == filledOn && other.OdometerKm == odometerKm)
            {
                return "Another fill that day has the same reading.";
            }
        }

        return null;
    }

    private static FuelAverage? AverageOf(List<FuelFill> run)
    {
        if (run.Count < 2)
        {
            return null;
        }

        var distance = run[^1].OdometerKm - run[0].OdometerKm;
        var burnt = run.Take(run.Count - 1).ToList();
        var fuel = burnt.Sum(f => f.Quantity);
        if (distance <= 0 || fuel <= 0)
        {
            return null;
        }

        // Cost per km only when the fuel burnt was all paid in one currency.
        var currencies = burnt.Select(f => f.Currency).Distinct(StringComparer.Ordinal).ToList();
        var costPerKm = currencies.Count == 1 ? burnt.Sum(f => f.Amount) / distance : (decimal?)null;
        return new FuelAverage(distance / fuel, distance, fuel, run.Count, costPerKm, currencies.Count == 1 ? currencies[0] : null);
    }
}
