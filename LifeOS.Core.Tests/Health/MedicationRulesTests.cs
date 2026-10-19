using LifeOS.Core.Health.DTOs;
using LifeOS.Core.Health.Services;

namespace LifeOS.Core.Tests.Health;

public class MedicationRulesTests
{
    // Monday 19 Oct 2026.
    private static readonly DateOnly Today = new(2026, 10, 19);
    private const byte Weekdays = 1 | 2 | 4 | 8 | 16;
    private const byte EveryDay = 127;

    private static MedicationPlan Plan(DateOnly start, DateOnly? end = null, bool asNeeded = false) => new(start, end, asNeeded);

    [Fact]
    public void A_dose_is_due_on_scheduled_days_while_the_medicine_is_current()
    {
        var plan = Plan(Today.AddDays(-10), Today.AddDays(5));

        Assert.True(MedicationRules.IsDue(plan, Weekdays, Today));
        Assert.False(MedicationRules.IsDue(plan, Weekdays, new DateOnly(2026, 10, 18))); // Sunday
        Assert.False(MedicationRules.IsDue(plan, EveryDay, Today.AddDays(-11))); // before it started
        Assert.True(MedicationRules.IsDue(plan, EveryDay, Today.AddDays(5))); // the last day counts
        Assert.False(MedicationRules.IsDue(plan, EveryDay, Today.AddDays(6)));
        Assert.False(MedicationRules.IsDue(Plan(Today, asNeeded: true), EveryDay, Today));
    }

    [Theory]
    [InlineData("08:00", 8, 0)]
    [InlineData("8:05", 8, 5)]
    [InlineData(" 21:30 ", 21, 30)]
    public void Times_are_hours_and_minutes(string text, int hour, int minute) =>
        Assert.Equal(new TimeOnly(hour, minute), MedicationRules.ParseTime(text));

    [Theory]
    [InlineData("8am")]
    [InlineData("25:00")]
    [InlineData("08:00:30")]
    [InlineData("")]
    [InlineData(null)]
    public void Anything_else_is_not_a_time(string? text) => Assert.Null(MedicationRules.ParseTime(text));

    private static MedicationRequest Request(bool asNeeded, params (string Time, byte Days)[] schedules) => new()
    {
        Name = "Metformin",
        StartDate = Today,
        IsAsNeeded = asNeeded,
        Schedules = schedules.Select(s => new MedicationScheduleRequest { TimeOfDay = s.Time, ScheduleDays = s.Days }).ToList(),
    };

    [Fact]
    public void A_medicine_is_scheduled_or_taken_as_needed_never_both()
    {
        Assert.Null(MedicationRules.CheckMedication(Request(false, ("08:00", EveryDay), ("20:00", Weekdays))));
        Assert.Null(MedicationRules.CheckMedication(Request(true)));

        Assert.NotNull(MedicationRules.CheckMedication(Request(true, ("08:00", EveryDay))));
        Assert.NotNull(MedicationRules.CheckMedication(Request(false)));
        Assert.NotNull(MedicationRules.CheckMedication(Request(false, ("08:00", EveryDay), ("8:00", Weekdays)))); // same time twice
        Assert.NotNull(MedicationRules.CheckMedication(Request(false, ("08:00", 0))));
        Assert.NotNull(MedicationRules.CheckMedication(Request(false, ("noon", EveryDay))));
        Assert.NotNull(MedicationRules.CheckMedication(new MedicationRequest
        {
            Name = "X", StartDate = Today, EndDate = Today.AddDays(-1), IsAsNeeded = true,
        }));
    }

    [Fact]
    public void A_dose_is_marked_only_on_a_day_it_was_due_and_not_ahead()
    {
        var plan = Plan(Today.AddDays(-3));

        Assert.Null(MedicationRules.CheckDose(plan, Weekdays, Today, Today));
        Assert.NotNull(MedicationRules.CheckDose(plan, Weekdays, Today.AddDays(1), Today)); // tomorrow
        Assert.NotNull(MedicationRules.CheckDose(plan, Weekdays, Today.AddDays(-1), Today)); // Sunday, not scheduled
        Assert.NotNull(MedicationRules.CheckDose(plan, EveryDay, Today.AddDays(-4), Today)); // before it started
    }

    [Fact]
    public void As_needed_doses_go_on_as_needed_medicines_only()
    {
        Assert.Null(MedicationRules.CheckAsNeeded(Plan(Today.AddDays(-3), asNeeded: true), Today, Today));
        Assert.NotNull(MedicationRules.CheckAsNeeded(Plan(Today.AddDays(-3)), Today, Today));
        Assert.NotNull(MedicationRules.CheckAsNeeded(Plan(Today.AddDays(-3), asNeeded: true), Today.AddDays(1), Today));
        Assert.NotNull(MedicationRules.CheckAsNeeded(Plan(Today, Today, asNeeded: true), Today.AddDays(-1), Today));
    }

    [Fact]
    public void Adherence_counts_due_doses_taken_and_waits_for_today()
    {
        // Every day from Thursday 15 Oct, two times a day: 15-18 Oct = 8 due, today not marked yet.
        var plan = Plan(new DateOnly(2026, 10, 15));
        DoseSlot[] slots = [new(1, EveryDay), new(2, EveryDay)];
        var marked = new Dictionary<(int, DateOnly), string>
        {
            [(1, new DateOnly(2026, 10, 15))] = "Taken",
            [(2, new DateOnly(2026, 10, 15))] = "Taken",
            [(1, new DateOnly(2026, 10, 16))] = "Taken",
            [(2, new DateOnly(2026, 10, 16))] = "Skipped",
            [(1, new DateOnly(2026, 10, 17))] = "Taken",
            // 17th evening and the 18th: nothing marked = missed.
        };

        Assert.Equal(50, MedicationRules.Adherence(plan, slots, marked, Today)); // 4 of 8

        // Marking today's morning dose adds it: 5 of 9.
        marked[(1, Today)] = "Taken";
        Assert.Equal(55, MedicationRules.Adherence(plan, slots, marked, Today));
    }

    [Fact]
    public void Adherence_is_unknown_until_something_was_due()
    {
        Assert.Null(MedicationRules.Adherence(Plan(Today), [new(1, EveryDay)], new Dictionary<(int, DateOnly), string>(), Today));
        // Weekdays only, started Saturday: nothing due before today.
        Assert.Null(MedicationRules.Adherence(Plan(new DateOnly(2026, 10, 17)), [new(1, Weekdays)], new Dictionary<(int, DateOnly), string>(), Today));
    }

    [Fact]
    public void Adherence_looks_back_thirty_days_only()
    {
        var plan = Plan(Today.AddDays(-100));
        var marked = new Dictionary<(int, DateOnly), string>();
        for (var day = Today.AddDays(-29); day < Today; day = day.AddDays(1))
        {
            marked[(1, day)] = "Taken";
        }

        Assert.Equal(100, MedicationRules.Adherence(plan, [new(1, EveryDay)], marked, Today));
    }

    [Fact]
    public void Visits_conditions_and_their_wording()
    {
        var visit = new DoctorVisitRequest { Reason = "Knee pain", VisitOn = Today };
        Assert.Null(HealthRules.CheckVisit(visit));
        Assert.NotNull(HealthRules.CheckVisit(new DoctorVisitRequest { Reason = " ", VisitOn = Today }));
        Assert.NotNull(HealthRules.CheckVisit(new DoctorVisitRequest { Reason = "X", VisitOn = Today, FollowUpOn = Today.AddDays(-1) }));
        var start = new DateTime(2026, 10, 20, 4, 30, 0, DateTimeKind.Utc);
        Assert.Null(HealthRules.CheckVisit(new DoctorVisitRequest { Reason = "X", VisitOn = Today, StartsAt = start, EndsAt = start.AddMinutes(30) }));
        Assert.NotNull(HealthRules.CheckVisit(new DoctorVisitRequest { Reason = "X", VisitOn = Today, StartsAt = start }));
        Assert.NotNull(HealthRules.CheckVisit(new DoctorVisitRequest { Reason = "X", VisitOn = Today, StartsAt = start, EndsAt = start }));
        Assert.NotNull(HealthRules.CheckVisit(new DoctorVisitRequest { Reason = "X", VisitOn = Today, StartsAt = start, EndsAt = start.AddHours(13) }));
        Assert.NotNull(HealthRules.CheckVisit(new DoctorVisitRequest
        {
            Reason = "X", VisitOn = Today, StartsAt = DateTime.SpecifyKind(start, DateTimeKind.Unspecified), EndsAt = start.AddHours(1),
        }));

        Assert.Null(HealthRules.CheckCondition(new MedicalConditionRequest { Kind = "Allergy", Name = "Penicillin", Severity = "Severe", Today = Today }));
        Assert.NotNull(HealthRules.CheckCondition(new MedicalConditionRequest { Kind = "Condition", Name = "Asthma", Severity = "Mild", Today = Today }));
        Assert.NotNull(HealthRules.CheckCondition(new MedicalConditionRequest { Kind = "Surgery", Name = "Appendix", StartedOn = Today.AddDays(-9), EndedOn = Today, Today = Today }));
        Assert.NotNull(HealthRules.CheckCondition(new MedicalConditionRequest { Kind = "Condition", Name = "Flu", StartedOn = Today, EndedOn = Today.AddDays(-1), Today = Today }));
        Assert.NotNull(HealthRules.CheckCondition(new MedicalConditionRequest { Kind = "Condition", Name = "Flu", StartedOn = Today.AddDays(1), Today = Today }));
        Assert.NotNull(HealthRules.CheckCondition(new MedicalConditionRequest { Kind = "Illness", Name = "Flu", Today = Today }));

        // What shows outside the vault says nothing medical.
        Assert.Equal("Doctor's appointment — Dr Mehta", HealthRules.AppointmentTitle(" Dr Mehta "));
        Assert.Equal("Doctor's appointment", HealthRules.AppointmentTitle(null));
        Assert.Equal("Book your follow-up visit (due 02/Nov/2026)", HealthRules.FollowUpReminderTitle(new DateOnly(2026, 11, 2)));
    }
}
