using LifeOS.Core.Journal.Services;

namespace LifeOS.Core.Tests.Journal;

public class DecisionRulesTests
{
    [Fact]
    public void The_review_reminder_is_nine_in_the_morning_local_time_on_the_review_day()
    {
        var london = TimeZoneInfo.FindSystemTimeZoneById("Europe/London");

        // 09:00 BST in summer, 09:00 GMT after the clocks go back.
        Assert.Equal(new DateTime(2026, 10, 20, 8, 0, 0, DateTimeKind.Utc), DecisionRules.ReviewReminderAt(new DateOnly(2026, 10, 20), london));
        Assert.Equal(new DateTime(2026, 11, 20, 9, 0, 0, DateTimeKind.Utc), DecisionRules.ReviewReminderAt(new DateOnly(2026, 11, 20), london));
    }

    [Fact]
    public void A_long_decision_is_cut_to_fit_a_reminder_title()
    {
        Assert.Equal("Review your decision: Take the Berlin job", DecisionRules.ReviewReminderTitle("Take the Berlin job"));

        var title = DecisionRules.ReviewReminderTitle(new string('x', 300));
        Assert.Equal(200, title.Length);
        Assert.EndsWith("…", title);
    }

    [Fact]
    public void The_reminder_note_carries_the_day_and_what_was_expected()
    {
        Assert.Equal("Decided on 14/Oct/2026. How did it turn out?",
            DecisionRules.ReviewReminderNotes(new DateOnly(2026, 10, 14), "  "));
        Assert.Equal("Decided on 14/Oct/2026. You expected: More time with family",
            DecisionRules.ReviewReminderNotes(new DateOnly(2026, 10, 14), " More time with family "));
    }
}
