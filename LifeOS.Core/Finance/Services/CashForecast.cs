namespace LifeOS.Core.Finance.Services;

/// <summary>Money held now, in one account's currency (a multi-currency account is one pocket per currency).</summary>
public sealed record ForecastPocket(int AccountId, string Name, string Currency, decimal Balance, bool CanGoNegative);

/// <summary>
/// Money known to be coming in (+) or going out (−) on a day. AccountId null: it will move, but from/to an account not
/// known yet (a bill, a premium) — it counts in the overall line only. IsEstimate: worked out from a pattern (expected
/// bills), not a fixed amount.
/// </summary>
public sealed record ForecastFlow(DateOnly Day, int? AccountId, string Currency, decimal Amount, string Source, string Title, bool IsEstimate = false);

public sealed record ForecastPoint(DateOnly Day, decimal Balance);

/// <summary>One line of the forecast: where it starts, where it goes, and its lowest point.</summary>
public sealed record ForecastLine(
    int? AccountId, string Name, string Currency, decimal Start, decimal End, ForecastPoint Lowest, IReadOnlyList<ForecastPoint> Points, bool CanGoNegative);

public sealed record ForecastResult(
    ForecastLine Overall, IReadOnlyList<ForecastLine> Accounts, IReadOnlyList<(ForecastFlow Flow, decimal? InBase)> Flows,
    IReadOnlyList<string> Unconverted);

/// <summary>
/// The cash-flow forecast (Session 71a): each account's balance carried forward day by day from today with the money
/// already known to be coming, and the overall line in the base currency (accounts plus money not tied to an account
/// yet). Points are kept only for days something moves (plus today and the last day), each balance after that day's
/// money. The lowest point is the first day the line is at its minimum (today counts). Never stored. Pure, unit-tested.
/// </summary>
public static class CashForecast
{
    public static ForecastResult Build(
        IReadOnlyList<ForecastPocket> pockets, IReadOnlyList<ForecastFlow> flows, DateOnly today, DateOnly until,
        string baseCurrency, Func<string, DateOnly, decimal?> rate)
    {
        var inRange = flows.Where(f => f.Day > today && f.Day <= until && f.Amount != 0)
            .OrderBy(f => f.Day).ThenBy(f => f.Amount).ThenBy(f => f.Title, StringComparer.Ordinal)
            .ToList();
        decimal? ToBase(decimal amount, string currency, DateOnly day) =>
            currency == baseCurrency ? amount : rate(currency, day) is { } r ? Math.Round(amount * r, 2, MidpointRounding.AwayFromZero) : null;

        var unconverted = new SortedSet<string>(StringComparer.Ordinal);
        var lines = new List<ForecastLine>();
        foreach (var pocket in pockets)
        {
            var own = inRange.Where(f => f.AccountId == pocket.AccountId && f.Currency == pocket.Currency).ToList();
            lines.Add(Line(pocket.AccountId, pocket.Name, pocket.Currency, pocket.Balance, own.Select(f => (f.Day, f.Amount)), today, until, pocket.CanGoNegative));
        }

        // Overall, in the base currency: every pocket today, then every flow (tied to an account or not).
        decimal overallStart = 0;
        foreach (var pocket in pockets)
        {
            if (ToBase(pocket.Balance, pocket.Currency, today) is { } value)
            {
                overallStart += value;
            }
            else
            {
                unconverted.Add(pocket.Currency);
            }
        }

        var converted = inRange.Select(f => (Flow: f, InBase: ToBase(f.Amount, f.Currency, f.Day))).ToList();
        foreach (var (flow, inBase) in converted.Where(c => c.InBase is null))
        {
            unconverted.Add(flow.Currency);
        }

        var overall = Line(null, "All accounts", baseCurrency, overallStart,
            converted.Where(c => c.InBase is not null).Select(c => (c.Flow.Day, c.InBase!.Value)), today, until, false);
        return new ForecastResult(overall, lines, converted, unconverted.ToList());
    }

    /// <summary>
    /// Pockets to warn about: the first day each one (that shouldn't go negative) drops below zero within the window,
    /// with how low it is then.
    /// </summary>
    public static List<(ForecastLine Line, ForecastPoint Below)> GoesNegative(ForecastResult result, DateOnly within) =>
        result.Accounts.Where(l => !l.CanGoNegative)
            .Select(l => (Line: l, Below: l.Points.FirstOrDefault(p => p.Balance < 0 && p.Day <= within)))
            .Where(x => x.Below is not null && x.Line.Start >= 0)
            .Select(x => (x.Line, x.Below!))
            .ToList();

    /// <summary>
    /// Bills expected after the latest known one of a kind/provider: the average of its last three amounts (same
    /// currency as the latest), every average gap between them — a month (or 2 or 3) when the gap is about that, else
    /// the gap in days. Needs at least two bills and a gap of a week or more. An estimate, never stored.
    /// </summary>
    public static List<(DateOnly Day, decimal Amount, string Currency)> ExpectedBills(
        IReadOnlyList<(DateOnly DueOn, decimal Amount, string Currency)> bills, DateOnly today, DateOnly until)
    {
        var last = bills.OrderBy(b => b.DueOn).TakeLast(3).ToList();
        if (last.Count < 2)
        {
            return [];
        }

        var latest = last[^1];
        var gapDays = (latest.DueOn.DayNumber - last[0].DueOn.DayNumber) / (double)(last.Count - 1);
        if (gapDays < 7)
        {
            return [];
        }

        var amount = Math.Round(last.Where(b => b.Currency == latest.Currency).Average(b => b.Amount), 2, MidpointRounding.AwayFromZero);
        var months = gapDays switch
        {
            >= 26 and <= 35 => 1,
            >= 56 and <= 66 => 2,
            >= 85 and <= 95 => 3,
            _ => 0,
        };
        var expected = new List<(DateOnly, decimal, string)>();
        for (var k = 1; k < 1000; k++)
        {
            var day = months > 0 ? latest.DueOn.AddMonths(months * k) : latest.DueOn.AddDays((int)Math.Round(gapDays * k));
            if (day > until)
            {
                break;
            }

            if (day > today)
            {
                expected.Add((day, amount, latest.Currency));
            }
        }

        return expected;
    }

    /// <summary>
    /// When an insurance premium falls due: every 1/3/6/12 months from the anchor (the policy's start, else its renewal
    /// day), not after it ends; a single premium is paid once (already, by then) and never again.
    /// </summary>
    public static List<DateOnly> PremiumDays(string frequency, DateOnly anchor, DateOnly? endsOn, DateOnly today, DateOnly until)
    {
        var months = frequency switch { "Monthly" => 1, "Quarterly" => 3, "HalfYearly" => 6, "Yearly" => 12, _ => 0 };
        var days = new List<DateOnly>();
        if (months == 0)
        {
            return days;
        }

        for (var k = 0; k < 10_000; k++)
        {
            var day = anchor.AddMonths(months * k);
            if (day > until || (endsOn is { } end && day > end))
            {
                break;
            }

            if (day > today)
            {
                days.Add(day);
            }
        }

        return days;
    }

    private static ForecastLine Line(
        int? accountId, string name, string currency, decimal start, IEnumerable<(DateOnly Day, decimal Amount)> moves,
        DateOnly today, DateOnly until, bool canGoNegative)
    {
        var points = new List<ForecastPoint> { new(today, start) };
        var balance = start;
        foreach (var day in moves.GroupBy(m => m.Day).OrderBy(g => g.Key))
        {
            balance += day.Sum(m => m.Amount);
            points.Add(new ForecastPoint(day.Key, balance));
        }

        if (points[^1].Day != until)
        {
            points.Add(new ForecastPoint(until, balance));
        }

        var lowest = points.Aggregate((low, p) => p.Balance < low.Balance ? p : low);
        return new ForecastLine(accountId, name, currency, start, balance, lowest, points, canGoNegative);
    }
}
