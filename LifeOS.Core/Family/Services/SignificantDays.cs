using LifeOS.Core.Family.DTOs;

namespace LifeOS.Core.Family.Services;

/// <summary>
/// Days that come round every year (Session 73): where one falls in a year, the next one, how many years it marks and
/// how it reads. Pure, xUnit-tested. A 29 Feb date falls on 28 Feb in other years; nothing is shown before the year
/// it began (no birthday before the birth).
/// </summary>
public static class SignificantDays
{
    /// <summary>The checks people.SignificantDates' CHECKs make, in words.</summary>
    public static string? Check(int month, int day, int? year, DateOnly today)
    {
        if (month is < 1 or > 12)
        {
            return "Choose the month.";
        }

        var longest = month switch { 2 => 29, 4 or 6 or 9 or 11 => 30, _ => 31 };
        if (day < 1 || day > longest)
        {
            return $"That month has {longest} days.";
        }

        if (year is { } y)
        {
            if (y < 1850 || y > today.Year)
            {
                return "Give a year between 1850 and this year, or leave it out.";
            }

            if (month == 2 && day == 29 && !DateTime.IsLeapYear(y))
            {
                return $"{y} wasn't a leap year — there was no 29 Feb.";
            }

            if (new DateOnly(y, month, day) > today)
            {
                return "That day hasn't come yet — leave the year out if you're not sure.";
            }
        }

        return null;
    }

    /// <summary>Where the day falls in <paramref name="year"/> (29 Feb → 28 Feb outside leap years).</summary>
    public static DateOnly On(int month, int day, int year) =>
        month == 2 && day == 29 && !DateTime.IsLeapYear(year) ? new DateOnly(year, 2, 28) : new DateOnly(year, month, day);

    /// <summary>The next time it comes round: today if it's today.</summary>
    public static DateOnly Next(int month, int day, DateOnly today)
    {
        var thisYear = On(month, day, today.Year);
        return thisYear >= today ? thisYear : On(month, day, today.Year + 1);
    }

    /// <summary>Years it marks on an occurrence in <paramref name="occurrenceYear"/> — null without a year, or before it.</summary>
    public static int? YearsOn(int? startYear, int occurrenceYear) =>
        startYear is { } y && occurrenceYear > y ? occurrenceYear - y : null;

    /// <summary>Every occurrence from <paramref name="from"/> to <paramref name="to"/> (inclusive), none before its year.</summary>
    public static IEnumerable<DateOnly> Between(int month, int day, int? startYear, DateOnly from, DateOnly to)
    {
        for (var year = from.Year; year <= to.Year; year++)
        {
            var on = On(month, day, year);
            if (on >= from && on <= to && (startYear is null || year >= startYear))
            {
                yield return on;
            }
        }
    }

    /// <summary>
    /// How it reads: "Asha's birthday", "Asha turns 60", "Anniversary with Meera — 10 years", "Asha &amp; Ravi's
    /// anniversary — 41 years", "Asha — Name day".
    /// </summary>
    public static string Title(string kind, string? label, string name, string? otherName, int? years) => kind switch
    {
        SignificantDateKinds.Birthday => years is { } age ? $"{name} turns {age}" : $"{name}'s birthday",
        SignificantDateKinds.Anniversary =>
            (otherName is null ? $"Anniversary with {name}" : $"{name} & {otherName}'s anniversary")
            + (years is { } n ? $" — {n} {(n == 1 ? "year" : "years")}" : string.Empty),
        _ => $"{name} — {label}" + (years is { } n2 ? $" ({n2} {(n2 == 1 ? "year" : "years")})" : string.Empty),
    };
}
