using LifeOS.Core.Documents.Services;

namespace LifeOS.Core.Tests.Documents;

public class DocumentRulesTests
{
    [Theory]
    [InlineData("P 123 456-789", "6789")]
    [InlineData("ab12", "AB12")]
    [InlineData("x9", "X9")]
    [InlineData("  -  ", null)]
    [InlineData(null, null)]
    public void Only_the_last_four_letters_or_digits_are_kept(string? typed, string? expected)
    {
        Assert.Equal(expected, DocumentRules.Last4(typed));
    }

    [Fact]
    public void The_expiry_reminder_is_at_nine_local_time_the_chosen_days_before()
    {
        var kolkata = TimeZoneInfo.FindSystemTimeZoneById("Asia/Kolkata");

        // 60 days before 14 Dec 2026 = 15 Oct 2026, 09:00 IST = 03:30Z.
        Assert.Equal(new DateTime(2026, 10, 15, 3, 30, 0, DateTimeKind.Utc),
            DocumentRules.ExpiryReminderAt(new DateOnly(2026, 12, 14), 60, kolkata));
    }

    [Fact]
    public void The_reminder_keeps_nine_oclock_across_a_clock_change()
    {
        var london = TimeZoneInfo.FindSystemTimeZoneById("Europe/London");

        // On the day (0) in summer: 09:00 BST = 08:00Z; in winter 09:00 GMT = 09:00Z.
        Assert.Equal(new DateTime(2026, 7, 1, 8, 0, 0, DateTimeKind.Utc), DocumentRules.ExpiryReminderAt(new DateOnly(2026, 7, 1), 0, london));
        Assert.Equal(new DateTime(2026, 12, 1, 9, 0, 0, DateTimeKind.Utc), DocumentRules.ExpiryReminderAt(new DateOnly(2026, 12, 1), 0, london));
    }

    [Fact]
    public void The_reminder_title_names_the_document_and_the_day()
    {
        Assert.Equal("Passport expires on 14/Dec/2026", DocumentRules.ExpiryReminderTitle("Passport", new DateOnly(2026, 12, 14)));

        var longTitle = DocumentRules.ExpiryReminderTitle(new string('x', 200), new DateOnly(2026, 12, 14));
        Assert.Equal(200, longTitle.Length);
        Assert.EndsWith("… expires on 14/Dec/2026", longTitle);
    }
}
