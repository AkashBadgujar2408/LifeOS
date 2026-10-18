using LifeOS.Core.Career.DTOs;
using LifeOS.Core.Career.Services;

namespace LifeOS.Core.Tests.Career;

public class ApplicationRulesTests
{
    private static readonly DateOnly Today = new(2026, 10, 18);

    [Fact]
    public void A_new_application_gets_the_dates_its_stage_needs()
    {
        var saved = ApplicationRules.Start(ApplicationStages.Saved, Today, Today).State!.Value;
        Assert.Null(saved.AppliedOn);
        Assert.Null(saved.ClosedOn);

        var applied = ApplicationRules.Start(ApplicationStages.Applied, Today.AddDays(-3), Today).State!.Value;
        Assert.Equal(Today.AddDays(-3), applied.AppliedOn);
        Assert.Null(applied.ClosedOn);

        var rejected = ApplicationRules.Start(ApplicationStages.Rejected, Today, Today).State!.Value;
        Assert.Null(rejected.AppliedOn);
        Assert.Equal(Today, rejected.ClosedOn);
    }

    [Fact]
    public void A_new_application_cant_start_in_the_future_or_at_an_unknown_stage()
    {
        Assert.NotNull(ApplicationRules.Start(ApplicationStages.Applied, Today.AddDays(1), Today).Error);
        Assert.NotNull(ApplicationRules.Start("Ghosted", Today, Today).Error);
    }

    [Fact]
    public void Reaching_an_applied_for_stage_fills_the_applied_day_once()
    {
        var saved = new ApplicationState(ApplicationStages.Saved, null, null);
        var interview = ApplicationRules.Move(saved, Today.AddDays(-5), ApplicationStages.Interview, Today.AddDays(-2), Today).State!.Value;
        Assert.Equal(Today.AddDays(-2), interview.AppliedOn);

        var offer = ApplicationRules.Move(interview, Today.AddDays(-2), ApplicationStages.Offer, Today, Today).State!.Value;
        Assert.Equal(Today.AddDays(-2), offer.AppliedOn);
    }

    [Fact]
    public void Closing_sets_the_closed_day_and_reopening_clears_it()
    {
        var applied = new ApplicationState(ApplicationStages.Applied, Today.AddDays(-10), null);
        var rejected = ApplicationRules.Move(applied, Today.AddDays(-10), ApplicationStages.Rejected, Today.AddDays(-1), Today).State!.Value;
        Assert.Equal(Today.AddDays(-1), rejected.ClosedOn);
        Assert.Equal(Today.AddDays(-10), rejected.AppliedOn);

        var reopened = ApplicationRules.Move(rejected, Today.AddDays(-1), ApplicationStages.Interview, Today, Today).State!.Value;
        Assert.Null(reopened.ClosedOn);
        Assert.Equal(Today.AddDays(-10), reopened.AppliedOn);
    }

    [Fact]
    public void Back_to_saved_means_not_applied_yet()
    {
        var applied = new ApplicationState(ApplicationStages.Applied, Today.AddDays(-1), null);
        var saved = ApplicationRules.Move(applied, Today.AddDays(-1), ApplicationStages.Saved, Today, Today).State!.Value;
        Assert.Null(saved.AppliedOn);
    }

    [Fact]
    public void Moves_are_to_another_stage_in_order_and_not_ahead_of_today()
    {
        var applied = new ApplicationState(ApplicationStages.Applied, Today.AddDays(-3), null);
        Assert.NotNull(ApplicationRules.Move(applied, Today.AddDays(-3), ApplicationStages.Applied, Today, Today).Error);
        Assert.NotNull(ApplicationRules.Move(applied, Today.AddDays(-3), ApplicationStages.Offer, Today.AddDays(-4), Today).Error);
        Assert.NotNull(ApplicationRules.Move(applied, Today.AddDays(-3), ApplicationStages.Offer, Today.AddDays(1), Today).Error);
        Assert.NotNull(ApplicationRules.Move(applied, Today.AddDays(-3), "Hired", Today, Today).Error);
        Assert.Null(ApplicationRules.Move(applied, Today.AddDays(-3), ApplicationStages.Offer, Today.AddDays(-3), Today).Error);
    }

    [Fact]
    public void A_round_has_both_times_or_neither_and_ends_after_it_starts()
    {
        var start = new DateTime(2026, 10, 20, 4, 30, 0, DateTimeKind.Utc);
        Assert.Null(ApplicationRules.CheckInterviewTime(null, null));
        Assert.Null(ApplicationRules.CheckInterviewTime(start, start.AddHours(1)));
        Assert.NotNull(ApplicationRules.CheckInterviewTime(start, null));
        Assert.NotNull(ApplicationRules.CheckInterviewTime(null, start));
        Assert.NotNull(ApplicationRules.CheckInterviewTime(start, start));
        Assert.NotNull(ApplicationRules.CheckInterviewTime(start, start.AddHours(25)));
    }

    [Fact]
    public void The_calendar_title_names_the_round_and_the_organisation()
    {
        Assert.Equal("Interview: Technical round — Globex", ApplicationRules.EventTitle("Technical round", "Globex"));
        Assert.Equal(200, ApplicationRules.EventTitle(new string('x', 150), new string('y', 150)).Length);
    }
}
