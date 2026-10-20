namespace LifeOS.Core.Finance.Services;

/// <summary>Where a savings goal stands against its plan (computed).</summary>
public static class SavingsPlanStatuses
{
    public const string Reached = "Reached";
    public const string OnTrack = "OnTrack";
    public const string Behind = "Behind";
    /// <summary>No target date: nothing to pace against.</summary>
    public const string NoDate = "NoDate";
    /// <summary>The target date has passed without reaching it.</summary>
    public const string Overdue = "Overdue";
}

/// <summary>A savings goal's plan: what's needed each month from now, what actually went in lately, and whether that's enough.</summary>
public sealed record SavingsPlan(int MonthsLeft, decimal NeededPerMonth, decimal ActualPerMonth, string Status);

/// <summary>The corpus at one age: what you'd have, and what you'd need to retire then.</summary>
public sealed record RetirementPoint(int Age, decimal Projected, decimal Needed);

public sealed record RetirementPlan(
    int YearsToRetirement,
    decimal MonthlySpendingAtRetirement,
    decimal CorpusNeeded,
    decimal RuleOf25,
    decimal ProjectedCorpus,
    /// <summary>The first age the projected corpus covers what's needed then (null: not by 100).</summary>
    int? AgeReached,
    IReadOnlyList<RetirementPoint> Points);

/// <summary>
/// Savings and retirement projections (Session 71b) — the arithmetic a spreadsheet would do, with monthly compounding
/// at the expected return (r = annual % ÷ 12) and yearly inflation. Never stored; every figure recomputes when an
/// assumption changes. Pure and unit-tested.
/// <list type="bullet">
/// <item>Needed per month for a goal: what grows the money already saved plus equal monthly deposits (at the end of each
/// month) to the target by its date: (target − saved·(1+r)^n) · r / ((1+r)^n − 1), or ÷ n at 0%.</item>
/// <item>Corpus needed to retire: the yearly spending at retirement (today's monthly spending × 12, inflated to then),
/// paid at the start of each year in retirement, growing with inflation and discounted at the return:
/// Σ spending·((1+i)/(1+R))^k for k = 0 … years−1. The "25×" rule of thumb (25 × a year's spending then) is shown
/// alongside.</item>
/// <item>Projected corpus: today's investments grown at the return, plus the monthly saving as an annuity.</item>
/// </list>
/// </summary>
public static class FinancialPlan
{
    /// <summary>Whole months from <paramref name="today"/> until <paramref name="target"/> (0 once it's here or past).</summary>
    public static int MonthsUntil(DateOnly today, DateOnly target)
    {
        var months = (target.Year - today.Year) * 12 + target.Month - today.Month - (target.Day < today.Day ? 1 : 0);
        return Math.Max(0, months);
    }

    public static decimal NeededPerMonth(decimal target, decimal saved, int monthsLeft, decimal annualReturnPercent)
    {
        if (saved >= target)
        {
            return 0;
        }

        if (monthsLeft <= 0)
        {
            return Round(target - saved);
        }

        var r = annualReturnPercent / 1200m;
        var growth = Pow(1 + r, monthsLeft);
        var stillNeeded = target - saved * growth;
        if (stillNeeded <= 0)
        {
            return 0;
        }

        return Round(r == 0 ? stillNeeded / monthsLeft : stillNeeded * r / (growth - 1));
    }

    /// <summary>
    /// A goal's plan: needed per month from now, the last three months' actual average (saved now − saved then, ÷ 3),
    /// and the verdict — reached, on track (putting in at least what's needed), behind, overdue or no date to pace.
    /// </summary>
    public static SavingsPlan Savings(decimal target, decimal savedNow, decimal savedThreeMonthsAgo, DateOnly? targetDate, DateOnly today, decimal annualReturnPercent)
    {
        var actual = Round((savedNow - savedThreeMonthsAgo) / 3);
        if (savedNow >= target)
        {
            return new SavingsPlan(targetDate is { } d ? MonthsUntil(today, d) : 0, 0, actual, SavingsPlanStatuses.Reached);
        }

        if (targetDate is not { } date)
        {
            return new SavingsPlan(0, 0, actual, SavingsPlanStatuses.NoDate);
        }

        var months = MonthsUntil(today, date);
        var needed = NeededPerMonth(target, savedNow, months, annualReturnPercent);
        var status = date < today ? SavingsPlanStatuses.Overdue
            : actual >= needed ? SavingsPlanStatuses.OnTrack
            : SavingsPlanStatuses.Behind;
        return new SavingsPlan(months, needed, actual, status);
    }

    /// <summary>Age in whole years on <paramref name="today"/>.</summary>
    public static int Age(DateOnly birthDate, DateOnly today) =>
        today.Year - birthDate.Year - (today < birthDate.AddYears(today.Year - birthDate.Year) ? 1 : 0);

    /// <summary>What's needed at the start of retirement to fund <paramref name="years"/> years of the yearly spending then.</summary>
    public static decimal CorpusNeeded(decimal yearlySpendingAtStart, int years, decimal inflationPercent, decimal returnPercent)
    {
        var ratio = (1 + inflationPercent / 100m) / (1 + returnPercent / 100m);
        decimal total = 0, factor = 1;
        for (var k = 0; k < years; k++)
        {
            total += yearlySpendingAtStart * factor;
            factor *= ratio;
        }

        return Round(total);
    }

    /// <summary>Today's investments grown for <paramref name="months"/> months, plus a monthly saving as an annuity.</summary>
    public static decimal Projected(decimal investments, decimal monthlySaving, int months, decimal annualReturnPercent)
    {
        var r = annualReturnPercent / 1200m;
        var growth = Pow(1 + r, months);
        return Round(investments * growth + (r == 0 ? monthlySaving * months : monthlySaving * (growth - 1) / r));
    }

    /// <summary>
    /// The retirement projection: needed and projected at the retirement age, and year by year from today's age (to
    /// five years past retirement, at most 100) — the first age the projection covers what's needed then is the age
    /// it's reached.
    /// </summary>
    public static RetirementPlan Retirement(
        int age, int retirementAge, int yearsInRetirement, decimal monthlySpendingToday, decimal investments, decimal monthlySaving,
        decimal returnPercent, decimal inflationPercent)
    {
        RetirementPoint At(int a)
        {
            var years = Math.Max(0, a - age);
            var spendingThen = monthlySpendingToday * Pow(1 + inflationPercent / 100m, years);
            return new RetirementPoint(a, Projected(investments, monthlySaving, years * 12, returnPercent),
                CorpusNeeded(spendingThen * 12, yearsInRetirement, inflationPercent, returnPercent));
        }

        int? reached = null;
        for (var a = age; a <= 100; a++)
        {
            var point = At(a);
            if (point.Projected >= point.Needed)
            {
                reached = a;
                break;
            }
        }

        var yearsToRetire = Math.Max(0, retirementAge - age);
        var spendingAtRetirement = Round(monthlySpendingToday * Pow(1 + inflationPercent / 100m, yearsToRetire));
        var atRetirement = At(Math.Max(age, retirementAge));
        var points = Enumerable.Range(age, Math.Max(1, Math.Min(100, Math.Max(retirementAge, age) + 5) - age + 1)).Select(At).ToList();
        return new RetirementPlan(yearsToRetire, spendingAtRetirement, atRetirement.Needed, Round(25 * spendingAtRetirement * 12),
            atRetirement.Projected, reached, points);
    }

    private static decimal Pow(decimal value, int exponent)
    {
        var result = 1m;
        for (var k = 0; k < exponent; k++)
        {
            result *= value;
        }

        return result;
    }

    private static decimal Round(decimal value) => Math.Round(value, 2, MidpointRounding.AwayFromZero);
}
