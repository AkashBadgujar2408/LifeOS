using LifeOS.Core.Health.DTOs;

namespace LifeOS.Core.Health.Services;

/// <summary>The health checks the database also enforces, run first so the user gets a plain message.</summary>
public static class HealthRules
{
    public const int OldestAge = 150;

    public static string? CheckProfile(HealthProfileRequest request)
    {
        if (request.DateOfBirth is { } born)
        {
            if (born > request.Today)
            {
                return "A date of birth can't be in the future.";
            }

            if (born < request.Today.AddYears(-OldestAge))
            {
                return $"A date of birth can't be more than {OldestAge} years ago.";
            }
        }

        if (request.Sex is not null && !HealthKinds.Sexes.Contains(request.Sex))
        {
            return "Choose Female, Male or Intersex, or leave it blank.";
        }

        if (request.BloodGroup is not null && !HealthKinds.BloodGroups.Contains(request.BloodGroup))
        {
            return "Choose a blood group from the list.";
        }

        if (request.HeightCm is { } height && (height < 30 || height > 272))
        {
            return "Height should be between 30 and 272 cm.";
        }

        return null;
    }

    /// <summary>Whole years from <paramref name="born"/> to <paramref name="today"/> (a 29 Feb birthday counts on 28 Feb).</summary>
    public static int Age(DateOnly born, DateOnly today)
    {
        var age = today.Year - born.Year;
        return born.AddYears(age) > today ? age - 1 : age;
    }

    /// <summary>Blank text is no text (encrypted columns can't tell "  " from a note).</summary>
    public static string? Text(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
