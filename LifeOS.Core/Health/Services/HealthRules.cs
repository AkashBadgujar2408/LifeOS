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

    public static string? CheckCondition(MedicalConditionRequest request)
    {
        if (!HealthKinds.ConditionKinds.Contains(request.Kind))
        {
            return "Choose a condition, a surgery or an allergy.";
        }

        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return "Give it a name.";
        }

        if (request.Severity is not null && (request.Kind != "Allergy" || !HealthKinds.Severities.Contains(request.Severity)))
        {
            return request.Kind == "Allergy" ? "Choose mild, moderate or severe." : "Only an allergy has a severity.";
        }

        if (request.StartedOn > request.Today || request.EndedOn > request.Today)
        {
            return "Medical history can't be dated in the future.";
        }

        if (request.EndedOn is { } ended)
        {
            if (request.Kind == "Surgery")
            {
                return "A surgery happens on a day — it has no end date.";
            }

            if (request.StartedOn is { } started && ended < started)
            {
                return "It can't have ended before it started.";
            }
        }

        return null;
    }

    /// <summary>The longest appointment the calendar entry may cover.</summary>
    public const int LongestAppointmentHours = 12;

    public static string? CheckVisit(DoctorVisitRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Reason))
        {
            return "Say what the visit is for.";
        }

        if (request.FollowUpOn is { } followUp && followUp < request.VisitOn)
        {
            return "The follow-up can't be before the visit.";
        }

        if ((request.StartsAt is null) != (request.EndsAt is null))
        {
            return "Give both a start and an end time, or neither.";
        }

        if (request.StartsAt is { } startsAt && request.EndsAt is { } endsAt)
        {
            if (startsAt.Kind == DateTimeKind.Unspecified || endsAt.Kind == DateTimeKind.Unspecified)
            {
                return "Give the times with a timezone.";
            }

            if (endsAt <= startsAt)
            {
                return "The appointment has to end after it starts.";
            }

            if (endsAt - startsAt > TimeSpan.FromHours(LongestAppointmentHours))
            {
                return $"An appointment can't be longer than {LongestAppointmentHours} hours.";
            }
        }

        return null;
    }

    /// <summary>The follow-up reminder's title: neutral on purpose (reminders show outside the vault).</summary>
    public static string FollowUpReminderTitle(DateOnly followUpOn) =>
        $"Book your follow-up visit (due {followUpOn.ToString("dd'/'MMM'/'yyyy", System.Globalization.CultureInfo.InvariantCulture)})";

    /// <summary>Days before the follow-up that its reminder comes, so there's time to book.</summary>
    public const int FollowUpReminderDays = 7;

    /// <summary>The calendar title of an appointment — the doctor, never the reason (the calendar isn't locked).</summary>
    public static string AppointmentTitle(string? doctor) =>
        string.IsNullOrWhiteSpace(doctor) ? "Doctor's appointment" : $"Doctor's appointment — {doctor.Trim()}";

    /// <summary>Whole years from <paramref name="born"/> to <paramref name="today"/> (a 29 Feb birthday counts on 28 Feb).</summary>
    public static int Age(DateOnly born, DateOnly today)
    {
        var age = today.Year - born.Year;
        return born.AddYears(age) > today ? age - 1 : age;
    }

    /// <summary>Blank text is no text (encrypted columns can't tell "  " from a note).</summary>
    public static string? Text(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
