using LifeOS.Core.Assistant.Services;
using LifeOS.Core.Shared.DTOs;

namespace LifeOS.Core.Tests.Assistant;

public class AssistantActionsTests
{
    [Fact]
    public void The_assistant_has_no_destructive_action()
    {
        string[] verbs = ["create_", "update_", "add_", "tick_", "write_"];
        string[] destructive = ["delete", "remove", "archive", "abandon", "dispose", "purge", "undo", "take_back", "vault", "password", "account_"];
        foreach (var action in AssistantActions.All)
        {
            Assert.Contains(verbs, v => action.Name.StartsWith(v, StringComparison.Ordinal));
            Assert.DoesNotContain(destructive, d => action.Name.Contains(d, StringComparison.Ordinal));
        }
    }

    [Fact]
    public void Actions_have_unique_names_apart_from_the_lookups_and_known_modules()
    {
        var names = AssistantActions.All.Select(a => a.Name).ToList();
        Assert.Equal(names.Count, names.Distinct().Count());
        Assert.Empty(names.Intersect(AssistantTools.All.Select(t => t.Name)));
        Assert.All(AssistantActions.All, a => Assert.True(a.Module is null || ModuleKeys.All.Contains(a.Module), a.Name));
        // Health stays behind the vault: the assistant never writes it.
        Assert.DoesNotContain(AssistantActions.All, a => a.Module == ModuleKeys.Health);
    }

    [Fact]
    public void A_switched_off_module_offers_none_of_its_actions()
    {
        var hidden = new HashSet<string>([ModuleKeys.Finance, ModuleKeys.Goals]);
        var offered = AssistantActions.Available(hidden).Select(a => a.Name).ToList();
        Assert.DoesNotContain("create_transaction", offered);
        Assert.DoesNotContain("create_goal", offered);
        Assert.Contains("create_task", offered);
        // Contacts are shared by every module, so they're always there.
        Assert.Contains("create_contact", offered);
    }

    [Theory]
    [InlineData(new[] { "Mon", "wed", "Friday" }, 21)]
    [InlineData(new[] { "weekdays" }, 31)]
    [InlineData(new[] { "weekends" }, 96)]
    [InlineData(new[] { "every day" }, 127)]
    [InlineData(new[] { "Saturday", "sun" }, 96)]
    [InlineData(new[] { "tue", "Tues", "TUESDAY" }, 2)]
    public void Weekdays_become_the_habit_bitmask(string[] days, int mask)
    {
        Assert.Equal((byte)mask, AssistantActions.WeekdayMask(days));
    }

    [Fact]
    public void Bad_weekdays_are_refused_in_plain_words()
    {
        Assert.Null(AssistantActions.WeekdayMask(null));
        Assert.Contains("isn't a day of the week", Assert.Throws<ToolArgumentException>(() => AssistantActions.WeekdayMask(["Funday"])).Message);
        Assert.Contains("isn't a day of the week", Assert.Throws<ToolArgumentException>(() => AssistantActions.WeekdayMask(["mo"])).Message);
        Assert.Contains("at least one day", Assert.Throws<ToolArgumentException>(() => AssistantActions.WeekdayMask([])).Message);
    }

    [Theory]
    [InlineData(127, "Every day")]
    [InlineData(31, "Weekdays")]
    [InlineData(96, "Weekends")]
    [InlineData(21, "Mon, Wed, Fri")]
    [InlineData(64, "Sun")]
    public void The_bitmask_reads_back_in_words(int mask, string text)
    {
        Assert.Equal(text, AssistantActions.WeekdayText((byte)mask));
    }

    [Fact]
    public void Arguments_read_local_times_numbers_lists_and_presence()
    {
        var args = ToolArgs.Parse("""{"at":"2026-10-25 13:00","t":"9:30","amount":"450.5","done":false,"tags":"Food","none":null,"days":["Mon"," ","Mon"]}""");
        Assert.Equal(new DateTime(2026, 10, 25, 13, 0, 0), args.LocalTime("at"));
        Assert.Equal(new TimeOnly(9, 30), args.Time("t"));
        Assert.Equal(450.5m, args.Decimal("amount"));
        Assert.False(args.Bool("done"));
        Assert.Equal(["Food"], args.Strings("tags"));
        Assert.Equal(["Mon"], args.Strings("days"));
        Assert.True(args.Has("none"));
        Assert.Null(args.String("none"));
        Assert.False(args.Has("missing"));
        Assert.Contains("yyyy-MM-dd HH:mm", Assert.Throws<ToolArgumentException>(() => ToolArgs.Parse("""{"at":"tomorrow"}""").LocalTime("at")).Message);
        Assert.Contains("HH:mm", Assert.Throws<ToolArgumentException>(() => ToolArgs.Parse("""{"t":"1pm"}""").Time("t")).Message);
        Assert.Contains("number", Assert.Throws<ToolArgumentException>(() => ToolArgs.Parse("""{"n":true}""").Decimal("n")).Message);
    }

    [Fact]
    public void A_card_carries_its_arguments_back_unchanged()
    {
        const string json = """{"title":"Call the bank","dueDate":"2026-10-26"}""";
        Assert.Equal(json, ToolArgs.Parse(json).Json);
        Assert.Equal("{}", ToolArgs.Parse("").Json);
    }
}
