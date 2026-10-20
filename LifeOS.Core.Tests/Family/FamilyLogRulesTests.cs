using LifeOS.Core.Family.DTOs;
using LifeOS.Core.Family.Services;

namespace LifeOS.Core.Tests.Family;

public class FamilyLogRulesTests
{
    private static readonly DateOnly Today = new(2026, 10, 21);

    [Theory]
    [InlineData("Call", "2026-10-21", 2, null)]
    [InlineData("Telepathy", "2026-10-21", 1, "Choose how you were in touch.")]
    [InlineData("Visit", "2026-10-22", 1, "That day hasn't come yet.")]
    [InlineData("Visit", "2026-10-20", 0, "Choose who it was with.")]
    [InlineData("Visit", "2026-10-20", 51, "Keep it to 50 people.")]
    public void Interactions_need_a_kind_a_day_that_has_come_and_someone(string kind, string day, int people, string? expected)
    {
        Assert.Equal(expected, FamilyLogRules.CheckInteraction(kind, DateOnly.Parse(day), people, Today));
    }

    [Theory]
    [InlineData("Shawl", "Idea", 2500d, "INR", "https://example.com/s", null, null, null)]
    [InlineData(" ", "Idea", null, null, null, null, null, "Say what the gift is.")]
    [InlineData("Shawl", "Wrapped", null, null, null, null, null, "Choose whether it's an idea, bought or given.")]
    [InlineData("Shawl", "Idea", 2500d, null, null, null, null, "Choose the currency.")]
    [InlineData("Shawl", "Idea", null, "INR", null, null, null, "Give the amount too, or leave the currency out.")]
    [InlineData("Shawl", "Idea", 2500d, "inr", null, null, null, "A currency is a three-letter code like INR.")]
    [InlineData("Shawl", "Idea", null, null, "ftp://x", null, null, "A link starts with http:// or https://.")]
    [InlineData("Shawl", "Idea", null, null, null, 5, null, "Only a bought or given gift has a purchase.")]
    [InlineData("Shawl", "Given", null, null, null, 5, null, "Say the day it was given.")]
    [InlineData("Shawl", "Given", null, null, null, null, "2026-10-22", "That day hasn't come yet.")]
    [InlineData("Shawl", "Bought", null, null, null, 5, "2026-10-01", "Only a given gift has a day it was given.")]
    [InlineData("Shawl", "Given", null, null, null, 5, "2026-10-01", null)]
    public void Gifts_move_from_idea_to_bought_to_given(string title, string status, double? amount, string? currency,
        string? link, int? purchaseId, string? givenOn, string? expected)
    {
        Assert.Equal(expected, FamilyLogRules.CheckGift(title, status, (decimal?)amount, currency, link, purchaseId,
            givenOn is null ? null : DateOnly.Parse(givenOn), Today));
    }

    [Theory]
    [InlineData("Dad's medicines", "Me", null, null)]
    [InlineData("Society bill", "Shared", null, null)]
    [InlineData("Society bill", "Shared", 4, null)]
    [InlineData("Grandma's visits", "Someone", 4, null)]
    [InlineData("X", "Me", 4, "It's yours — leave the other person out, or choose Shared.")]
    [InlineData("X", "Someone", null, "Choose who looks after it.")]
    [InlineData("X", "Robot", null, "Choose who looks after it.")]
    [InlineData(" ", "Me", null, "Say what the responsibility is.")]
    public void Someone_looks_after_each_responsibility(string title, string heldBy, int? holder, string? expected)
    {
        Assert.Equal(expected, FamilyLogRules.CheckResponsibility(title, heldBy, holder, null, null));
    }

    [Fact]
    public void A_responsibility_cant_end_before_it_started()
    {
        Assert.Equal("It can't end before it started.",
            FamilyLogRules.CheckResponsibility("X", "Me", null, new DateOnly(2026, 10, 2), new DateOnly(2026, 10, 1)));
    }

    [Theory]
    [InlineData(null, "2026-09-01", 30, "2026-10-01")] // never in touch: counted from when the cadence was set
    [InlineData("2026-10-01", "2026-01-01", 14, "2026-10-15")]
    public void The_next_touch_is_due_a_cadence_after_the_last(string? last, string setOn, int cadence, string expected)
    {
        Assert.Equal(DateOnly.Parse(expected),
            KeepInTouchRules.DueOn(last is null ? null : DateOnly.Parse(last), DateOnly.Parse(setOn), cadence));
    }

    [Theory]
    [InlineData(0, "Due today")]
    [InlineData(1, "Due tomorrow")]
    [InlineData(6, "Due in 6 days")]
    [InlineData(-1, "A day past")]
    [InlineData(-12, "12 days past")]
    public void Where_it_stands_reads_gently(int daysUntil, string expected)
    {
        Assert.Equal(expected, KeepInTouchRules.Describe(daysUntil));
    }

    [Theory]
    [InlineData(0, "Choose between 1 day and 2 years.")]
    [InlineData(731, "Choose between 1 day and 2 years.")]
    [InlineData(30, null)]
    public void A_cadence_is_a_day_to_two_years(int days, string? expected)
    {
        Assert.Equal(expected, KeepInTouchRules.CheckCadence(days));
    }

    [Theory]
    // Logging: moves forward to the latest interaction, never back past a later day set by hand.
    [InlineData(null, "2026-10-20", null, "2026-10-20")]
    [InlineData("2026-10-01", "2026-10-20", null, "2026-10-20")]
    [InlineData("2026-10-21", "2026-10-20", null, "2026-10-21")]
    // Removing the interaction that set it: back to the latest one left, or empty.
    [InlineData("2026-10-20", "2026-10-05", "2026-10-20", "2026-10-05")]
    [InlineData("2026-10-20", null, "2026-10-20", null)]
    // Removing an older one, or one that didn't set it (a later day set by hand): untouched.
    [InlineData("2026-10-20", "2026-10-20", "2026-10-02", "2026-10-20")]
    [InlineData("2026-10-21", "2026-10-05", "2026-10-20", "2026-10-21")]
    public void Last_contacted_follows_the_interactions(string? current, string? latest, string? removed, string? expected)
    {
        static DateOnly? D(string? s) => s is null ? null : DateOnly.Parse(s);

        Assert.Equal(D(expected), InteractionsService.LastContactedAfterChange(D(current), D(latest), D(removed)));
    }
}
