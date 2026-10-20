namespace LifeOS.Core.Finance.Services;

/// <summary>Matches CK_ScenarioLines_Kind.</summary>
public static class ScenarioLineKinds
{
    public const string Purchase = "Purchase";
    public const string MonthlyCost = "MonthlyCost";
    public const string MonthlyIncome = "MonthlyIncome";
    public const string PayChange = "PayChange";
    public const string Loan = "Loan";

    public static readonly IReadOnlySet<string> All =
        new HashSet<string>([Purchase, MonthlyCost, MonthlyIncome, PayChange, Loan], StringComparer.Ordinal);

    public static readonly IReadOnlySet<string> Monthly = new HashSet<string>([MonthlyCost, MonthlyIncome, PayChange], StringComparer.Ordinal);
}

/// <summary>One what-if, in the base currency (see 12_finance.sql).</summary>
public sealed record ScenarioLineInput(
    string Kind, string Title, decimal Amount, DateOnly StartsOn, DateOnly? EndsOn, int? AccountId, decimal? AnnualRate, int? TermMonths);

/// <summary>A goal to pace: what it needs, what's in it, what goes in a month now.</summary>
public sealed record ScenarioGoal(int Id, string Title, decimal Target, decimal Saved, decimal PerMonth);

public sealed record GoalShift(int Id, string Title, int? MonthsBefore, int? MonthsAfter);

/// <summary>
/// "Can I afford it?" (Session 71c): what a scenario's lines do, applied in memory — never to real transactions, never
/// stored. The same money three ways: dated flows for the cash-flow forecast; month-by-month changes to what's saved
/// for the goals and retirement (simulated month by month at the expected return, so a loan that ends or a cost that
/// stops is counted only while it runs). Pure and unit-tested.
/// </summary>
public static class ScenarioMath
{
    /// <summary>The longest a goal or a retirement projection is simulated (100 years).</summary>
    private const int MaxMonths = 1200;

    public static string? Check(ScenarioLineInput line, DateOnly today)
    {
        if (!ScenarioLineKinds.All.Contains(line.Kind))
        {
            return "Choose what the line is.";
        }

        if (line.Title.Trim().Length == 0)
        {
            return "Say what each line is (e.g. New car).";
        }

        var amountError = line.Kind == ScenarioLineKinds.PayChange
            ? (line.Amount == 0 || Math.Abs(line.Amount) > FinanceRules.MaxAmount ? "A pay change can't be zero (use − for a drop)." : null)
            : (line.Amount <= 0 || line.Amount > FinanceRules.MaxAmount ? "Each amount has to be more than zero." : null);
        return amountError
            ?? (line.StartsOn == default ? "Say when each line starts."
                : line.StartsOn < today ? "A what-if starts today or later."
                : line.EndsOn is { } end && end < line.StartsOn ? "A line can't end before it starts."
                : line.EndsOn is not null && !ScenarioLineKinds.Monthly.Contains(line.Kind) ? "Only monthly lines have an end."
                : line.Kind == ScenarioLineKinds.Loan && (line.AnnualRate is not (>= 0 and <= 100) || line.TermMonths is not (>= 1 and <= 600))
                    ? "A loan needs its rate (0–100 %) and term (1–600 months)."
                : line.Kind != ScenarioLineKinds.Loan && (line.AnnualRate is not null || line.TermMonths is not null) ? "Only a loan has a rate and term."
                : null);
    }

    /// <summary>
    /// The lines as they'd land: real money dated today is already in today's balance (the forecast and
    /// <see cref="MonthlyChanges"/> start after today), but a what-if isn't — so one dated today counts tomorrow.
    /// </summary>
    public static List<ScenarioLineInput> Upcoming(IEnumerable<ScenarioLineInput> lines, DateOnly today) =>
        lines.Select(l => l.StartsOn > today ? l : l with
            {
                StartsOn = today.AddDays(1),
                EndsOn = l.EndsOn is { } end && end <= today ? today.AddDays(1) : l.EndsOn,
            })
            .ToList();

    /// <summary>
    /// The scenario as dated money for the forecast: purchases out, monthly lines each month, a loan's EMIs out. A loan
    /// pays for what it's taken for, so the borrowed money itself never lands in a balance (or counts as saving).
    /// </summary>
    public static List<ForecastFlow> Flows(IEnumerable<ScenarioLineInput> lines, DateOnly until, string currency)
    {
        var flows = new List<ForecastFlow>();
        foreach (var line in lines)
        {
            switch (line.Kind)
            {
                case ScenarioLineKinds.Purchase:
                    flows.Add(new ForecastFlow(line.StartsOn, line.AccountId, currency, -line.Amount, "Scenario", line.Title));
                    break;
                case ScenarioLineKinds.Loan:
                    foreach (var i in LoanSchedule.Build(line.Amount, line.AnnualRate!.Value, line.TermMonths!.Value, line.StartsOn).Where(i => i.DueOn <= until))
                    {
                        flows.Add(new ForecastFlow(i.DueOn, line.AccountId, currency, -i.Payment, "Scenario", $"{line.Title} EMI"));
                    }

                    break;
                default:
                    var sign = line.Kind == ScenarioLineKinds.MonthlyCost ? -1 : 1;
                    for (var k = 0; k < MaxMonths; k++)
                    {
                        var day = line.StartsOn.AddMonths(k);
                        if (day > until || (line.EndsOn is { } end && day > end))
                        {
                            break;
                        }

                        flows.Add(new ForecastFlow(day, line.AccountId, currency, sign * line.Amount, "Scenario", line.Title));
                    }

                    break;
            }
        }

        return flows;
    }

    /// <summary>
    /// What the scenario adds to (or takes from) saving in month k after today (k = 1 is the month ending a month from
    /// now): the money of every line falling in (today + k−1 months, today + k months].
    /// </summary>
    public static decimal[] MonthlyChanges(IEnumerable<ScenarioLineInput> lines, DateOnly today, int months)
    {
        var changes = new decimal[months + 1];
        foreach (var flow in Flows(lines, today.AddMonths(months), "XXX"))
        {
            if (flow.Day <= today)
            {
                continue;
            }

            // Month k covers (today + k−1 months, today + k months].
            var k = 1;
            while (today.AddMonths(k) < flow.Day)
            {
                k++;
            }

            if (k <= months)
            {
                changes[k] += flow.Amount;
            }
        }

        return changes;
    }

    /// <summary>
    /// Months until a goal is reached, saving <c>perMonth</c> plus <c>extra[k]</c> in month k (never below zero), at the
    /// expected return; 0 when already reached; null if not within 100 years.
    /// </summary>
    public static int? MonthsToReach(decimal target, decimal saved, decimal perMonth, decimal annualReturnPercent, decimal[]? extra = null)
    {
        if (saved >= target)
        {
            return 0;
        }

        var r = annualReturnPercent / 1200m;
        var balance = saved;
        for (var k = 1; k <= MaxMonths; k++)
        {
            var add = perMonth + (extra is not null && k < extra.Length ? extra[k] : 0);
            balance = balance * (1 + r) + Math.Max(0, add);
            if (balance >= target)
            {
                return k;
            }
        }

        return null;
    }

    /// <summary>
    /// Each goal's months to reach before and after: the scenario's monthly change is shared between the goals in
    /// proportion to what each gets now (all of it to the one goal when there's only one; equally when nothing goes in
    /// yet). One-offs and loans count in the month they happen.
    /// </summary>
    public static List<GoalShift> Goals(IReadOnlyList<ScenarioGoal> goals, decimal[] changes, decimal annualReturnPercent)
    {
        var total = goals.Sum(g => Math.Max(0, g.PerMonth));
        return goals.Select(g =>
        {
            var share = total > 0 ? Math.Max(0, g.PerMonth) / total : 1m / goals.Count;
            var mine = changes.Select(c => c * share).ToArray();
            return new GoalShift(g.Id, g.Title,
                MonthsToReach(g.Target, g.Saved, g.PerMonth, annualReturnPercent),
                MonthsToReach(g.Target, g.Saved, g.PerMonth, annualReturnPercent, mine));
        }).ToList();
    }

    /// <summary>
    /// The age the retirement projection covers what's needed, with the scenario's changes added month by month (a
    /// one-off or an EMI comes out of what's invested that month); the same simulation without
    /// changes gives "before", so the two always compare like for like.
    /// </summary>
    public static (int? AgeReached, decimal ProjectedAtRetirement) Retirement(
        int age, int retirementAge, int yearsInRetirement, decimal monthlySpendingToday, decimal investments, decimal monthlySaving,
        decimal returnPercent, decimal inflationPercent, decimal[]? changes = null)
    {
        var r = returnPercent / 1200m;
        var balance = investments;
        decimal projectedAtRetirement = age >= retirementAge ? investments : 0;
        int? reached = null;
        var spendingFactor = 1m;
        for (var a = age; a <= 100; a++)
        {
            if (a > age)
            {
                for (var m = 1; m <= 12; m++)
                {
                    var k = (a - age - 1) * 12 + m;
                    balance = balance * (1 + r) + monthlySaving + (changes is not null && k < changes.Length ? changes[k] : 0);
                }

                spendingFactor *= 1 + inflationPercent / 100m;
            }

            if (a == retirementAge)
            {
                projectedAtRetirement = Math.Round(balance, 2, MidpointRounding.AwayFromZero);
            }

            var needed = FinancialPlan.CorpusNeeded(monthlySpendingToday * spendingFactor * 12, yearsInRetirement, inflationPercent, returnPercent);
            if (reached is null && balance >= needed)
            {
                reached = a;
            }
        }

        return (reached, projectedAtRetirement);
    }
}
