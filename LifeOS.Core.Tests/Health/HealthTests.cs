using LifeOS.Core.Health.DTOs;
using LifeOS.Core.Health.Services;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.ModelExtensions;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Tests.Health;

public class HealthTests
{
    private static readonly DateOnly Today = new(2026, 10, 19);

    [Fact]
    public void Only_the_notes_of_sensitive_schemas_are_encrypted()
    {
        using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlServer("Server=none;Database=none").Options);
        var encrypted = db.Model.GetEntityTypes()
            .SelectMany(e => e.GetProperties())
            .Where(p => p.GetValueConverter() is not null && p.ClrType == typeof(string))
            .Select(p => $"{p.DeclaringType.ClrType.Name}.{p.Name}")
            .Order(StringComparer.Ordinal)
            .ToList();

        Assert.Equal(
            ["BodyMeasurement.Notes", "DoctorVisit.Notes", "HealthProfile.Notes", "LabResult.Notes", "Meal.Notes",
             "MedicalCondition.Notes", "Medication.Notes", "SleepRecord.Notes", "Workout.Notes"],
            encrypted);
        // Notes elsewhere (a goal's, an account's) stay plain.
        Assert.Null(db.Model.FindEntityType(typeof(Account))!.FindProperty(nameof(Account.Notes))!.GetValueConverter());
    }

    [Fact]
    public void Notes_round_trip_and_are_stored_as_a_data_protection_payload()
    {
        var converter = SensitiveColumns.Converter(new EphemeralDataProtectionProvider().CreateProtector(SensitiveColumns.Purpose));

        var stored = (string)converter.ConvertToProvider("Penicillin — hives, 2019")!;

        Assert.StartsWith("CfDJ8", stored, StringComparison.Ordinal); // what CK_..._NotesEncrypted checks for
        Assert.DoesNotContain("Penicillin", stored, StringComparison.Ordinal);
        Assert.Equal("Penicillin — hives, 2019", converter.ConvertFromProvider(stored));
    }

    [Fact]
    public void Without_a_protector_nothing_is_written_in_plain_text()
    {
        var converter = SensitiveColumns.Converter(null);

        Assert.Throws<InvalidOperationException>(() => converter.ConvertToProvider("private"));
        Assert.Throws<InvalidOperationException>(() => converter.ConvertFromProvider("CfDJ8..."));
    }

    [Fact]
    public void A_profile_is_checked_like_the_database_checks_it()
    {
        Assert.Null(HealthRules.CheckProfile(new HealthProfileRequest { Today = Today }));
        Assert.Null(HealthRules.CheckProfile(new HealthProfileRequest
        {
            DateOfBirth = new DateOnly(1999, 4, 2), Sex = "Intersex", BloodGroup = "AB-", HeightCm = 172.5m, Today = Today,
        }));

        Assert.NotNull(HealthRules.CheckProfile(new HealthProfileRequest { DateOfBirth = Today.AddDays(1), Today = Today }));
        Assert.NotNull(HealthRules.CheckProfile(new HealthProfileRequest { DateOfBirth = new DateOnly(1870, 1, 1), Today = Today }));
        Assert.NotNull(HealthRules.CheckProfile(new HealthProfileRequest { Sex = "female", Today = Today }));
        Assert.NotNull(HealthRules.CheckProfile(new HealthProfileRequest { BloodGroup = "O", Today = Today }));
        Assert.NotNull(HealthRules.CheckProfile(new HealthProfileRequest { HeightCm = 29.9m, Today = Today }));
        Assert.NotNull(HealthRules.CheckProfile(new HealthProfileRequest { HeightCm = 273, Today = Today }));
    }

    [Theory]
    [InlineData("1999-10-19", 27)] // birthday today
    [InlineData("1999-10-20", 26)] // tomorrow
    [InlineData("2000-02-29", 26)]
    [InlineData("2026-10-19", 0)]
    public void Age_is_whole_years(string born, int age) =>
        Assert.Equal(age, HealthRules.Age(DateOnly.Parse(born), Today));

    [Fact]
    public void A_leap_day_birthday_counts_on_28_february()
    {
        var born = new DateOnly(2000, 2, 29);
        Assert.Equal(24, HealthRules.Age(born, new DateOnly(2025, 2, 27)));
        Assert.Equal(25, HealthRules.Age(born, new DateOnly(2025, 2, 28)));
    }

    [Fact]
    public void Blank_notes_are_no_notes() =>
        Assert.Equal([null, null, "Asthma"], new[] { null, "  \n ", " Asthma " }.Select(HealthRules.Text));

    [Fact]
    public void Every_measurement_kind_has_a_unit() =>
        Assert.Equal(8, HealthKinds.MeasurementUnits.Count);
}
