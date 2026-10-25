using LifeOS.Core.Assistant.Services;
using LifeOS.Core.Finance.DTOs;

namespace LifeOS.Core.Tests.Assistant;

public class ForecastPredictionRulesTests
{
    private static readonly DateOnly Today = new(2026, 10, 25);
    private const string In = ForecastPredictionRules.Income;
    private const string Out = ForecastPredictionRules.Expense;

    private static readonly List<PredictionLine> Lines =
    [
        new("all", null, "All accounts", "INR", 100_000m),
        new("a1", 7, "HDFC", "INR", 80_000m),
        new("a2", 9, "Wise", "USD", 500m),
    ];

    /// <summary>The scheduled bill the history's "MSEDCL electricity" is the same money as.</summary>
    private static readonly List<ForecastItemDto> Scheduled =
    [
        new() { Day = new(2026, 10, 27), Title = "MSEDCL bill", Amount = -2480, Currency = "INR", AmountInBase = -2480 },
        new() { Day = new(2026, 11, 2), Title = "Amazon Prime", Amount = -1499, Currency = "INR", AmountInBase = -1499 },
    ];

    /// <summary>
    /// Six months like the user describes: salary 50k every month, odd income of 500–3,000, spending that swings
    /// between 500 and 5,000 — plus an electricity bill that's scheduled ahead and Amazon shopping that isn't Prime.
    /// </summary>
    private static List<PastMoney> SixMonths()
    {
        var past = new List<PastMoney>();
        int[] odd = [500, 0, 3000, 1200, 0, 800];
        int[] food = [500, 5000, 1200, 3000, 700, 4000];
        for (var i = 0; i < 6; i++)
        {
            var month = new DateOnly(2026, 5, 1).AddMonths(i);
            past.Add(new PastMoney(month, In, "Acme Ltd — salary", "a1", 50_000));
            if (odd[i] > 0)
            {
                past.Add(new PastMoney(month.AddDays(10), In, "Freelance", "a1", odd[i]));
            }

            past.Add(new PastMoney(month.AddDays(12), Out, "Swiggy", "a1", food[i]));
            past.Add(new PastMoney(month.AddDays(14), Out, "MSEDCL electricity", "a1", 2400 + 10 * i));
            past.Add(new PastMoney(month.AddDays(15), Out, "Amazon", "a1", 2799));
        }

        past.Add(new PastMoney(new DateOnly(2026, 10, 3), Out, "swiggy", "all", 300)); // other line, other spelling
        return past;
    }

    private static HistoryMonths Months() => ForecastPredictionRules.Months(Today, SixMonths());

    private static List<HistoryGroup> Groups() => ForecastPredictionRules.Groups(SixMonths(), Months(), Scheduled);

    private static HistoryGroup Group(string name) => Groups().Single(g => g.Name == name);

    [Fact]
    public void History_starts_at_the_first_recorded_month_and_ends_with_this_partly_over_one()
    {
        var months = Months();
        Assert.Equal(new DateOnly(2026, 5, 1), months.Starts[0]);
        Assert.Equal(new DateOnly(2026, 10, 1), months.Starts[^1]);
        Assert.Equal((25, 31), (months.PartialDays!.Value, months.PartialOf!.Value));
        Assert.Empty(ForecastPredictionRules.Months(Today, []).Starts);
    }

    [Fact]
    public void Groups_are_numbered_biggest_first_and_add_up_each_month_by_name_any_case()
    {
        var salary = Group("Acme Ltd — salary");
        Assert.Equal("g1", salary.Id);
        Assert.Equal([50_000m, 50_000m, 50_000m, 50_000m, 50_000m, 50_000m], salary.Monthly);
        Assert.Equal("a1", salary.LineId);

        var food = Group("Swiggy");
        Assert.Equal(4300m, food.Monthly[^1]);
        Assert.Equal("all", food.LineId);
    }

    [Fact]
    public void A_group_that_is_a_scheduled_bill_is_marked_but_a_namesake_with_other_amounts_is_not()
    {
        Assert.True(Group("MSEDCL electricity").Scheduled);
        Assert.False(Group("Amazon").Scheduled);
        Assert.False(Group("Swiggy").Scheduled);
    }

    [Fact]
    public void Past_the_cap_small_groups_become_other()
    {
        var past = Enumerable.Range(1, ForecastPredictionRules.MaxGroupsPerKind + 2)
            .Select(i => new PastMoney(new DateOnly(2026, 10, 1), Out, $"Shop {i}", "all", 1000 - i))
            .ToList();
        var groups = ForecastPredictionRules.Groups(past, ForecastPredictionRules.Months(Today, past), []);
        Assert.Equal(ForecastPredictionRules.MaxGroupsPerKind + 1, groups.Count);
        Assert.Equal(2000m - 31 - 32, groups.Single(g => g.Name == "Other spending").Total);
    }

    [Fact]
    public void Stats_are_the_average_quietest_and_busiest_full_month_of_the_groups_together()
    {
        // Freelance May–Sep (October is partly over): 500, 0, 3000, 1200, 0.
        Assert.Equal((940m, 0m, 3000m), ForecastPredictionRules.Stats([Group("Freelance")], Months()));
        // Swiggy + Amazon: 3299, 7799, 3999, 5799, 3499.
        Assert.Equal((4879m, 3299m, 7799m), ForecastPredictionRules.Stats([Group("Swiggy"), Group("Amazon")], Months()));

        // Only this month so far: scaled up to the whole month (31 of 25 days).
        var october = new List<PastMoney> { new(new DateOnly(2026, 10, 2), Out, "Zepto", "all", 1000) };
        var months = ForecastPredictionRules.Months(Today, october);
        var zepto = ForecastPredictionRules.Groups(october, months, []);
        Assert.Equal((1240m, 1240m, 1240m), ForecastPredictionRules.Stats(zepto, months));
    }

    [Fact]
    public void Input_shows_ids_marks_scheduled_groups_and_lists_what_is_scheduled()
    {
        var input = ForecastPredictionRules.Input(Today, 3, "INR", Months(), Groups(), Scheduled);

        Assert.Contains("2026-10 (partly over: 25 of 31 days)", input);
        Assert.Contains("- g1 · Acme Ltd — salary: 50000, 50000, 50000, 50000, 50000, 50000", input);
        Assert.Contains("MSEDCL electricity: 2400, 2410, 2420, 2430, 2440, 2450 — already scheduled, can't be used", input);
        Assert.Contains("- MSEDCL bill: -2480.00 INR, 1 time(s) from 2026-10-27", input);
    }

    private static string Answer(string salary = "g1", string summary = "Your pay is steady; food swings.") =>
        $$"""
        ```json
        {"patterns":[
          {"name":"Salary","kind":"income","from":["{{salary}}"],"confidence":95,"basis":"same every month"},
          {"name":"Side jobs","kind":"INCOME","from":["{{Group("Freelance").Id}}"],"confidence":"45"},
          {"name":"Food and shopping","kind":"expense","from":["{{Group("Swiggy").Id}}","{{Group("Amazon").Id}}"],"confidence":60}],
         "confidence":70,"confidenceReason":"Pay is steady but spending swings.","summary":" {{summary}} "}
        ```
        """;

    [Fact]
    public void A_good_answer_takes_its_amounts_and_lines_from_the_history_not_from_mistral()
    {
        var (parsed, problem) = ForecastPredictionRules.Parse(Answer(), Groups(), Months());

        Assert.Null(problem);
        Assert.Equal(70, parsed!.Confidence);
        Assert.Equal("Pay is steady but spending swings.", parsed.ConfidenceReason);
        Assert.Equal("Your pay is steady; food swings.", parsed.Summary);
        Assert.Equal(["a1", "a1", "all"], parsed.Patterns.Select(p => p.LineId));
        Assert.Equal((50_000m, 50_000m, 50_000m), (parsed.Patterns[0].Typical, parsed.Patterns[0].Low, parsed.Patterns[0].High));
        Assert.Equal(45, parsed.Patterns[1].Confidence);
        Assert.Equal(["Swiggy", "Amazon"], parsed.Patterns[2].From);
        Assert.Equal(4879m, parsed.Patterns[2].Typical);
    }

    [Theory]
    [InlineData("g99", null, "\"Salary\" names \"g99\", which isn't a group id.")]
    [InlineData("Acme Ltd", null, "\"Salary\" names \"Acme Ltd\", which isn't a group id.")]
    [InlineData("SCHEDULED", null, "is already scheduled ahead, so it can't be in a pattern.")]
    [InlineData("SWIGGY", null, "\"Salary\" is income but")]
    [InlineData("g1", "You'll have about 1,50,000 left.", "the summary or confidenceReason has figures in it")]
    public void Answers_that_do_not_fit_the_history_are_refused_with_the_reason(string salary, string? summary, string expected)
    {
        var id = salary switch
        {
            "SCHEDULED" => Group("MSEDCL electricity").Id,
            "SWIGGY" => Group("Swiggy").Id,
            _ => salary,
        };
        var answer = summary is null ? Answer(id) : Answer(id, summary);
        if (salary == "SWIGGY")
        {
            // Swiggy is then in two patterns too; the kind check comes first.
            answer = answer.Replace($"\"{Group("Swiggy").Id}\",\"{Group("Amazon").Id}\"", $"\"{Group("Amazon").Id}\"");
        }

        var (parsed, problem) = ForecastPredictionRules.Parse(answer, Groups(), Months());
        Assert.Null(parsed);
        Assert.Contains(expected, problem);
    }

    [Theory]
    [InlineData("""{"patterns":[{"name":"A","kind":"income","from":["g1"],"confidence":50},{"name":"B","kind":"income","from":["G1"],"confidence":50}],"confidence":50}""",
        "g1 is in more than one pattern.")]
    [InlineData("""{"patterns":[{"name":"A","kind":"income","from":["g1"],"confidence":150}],"confidence":50}""",
        "\"A\" needs a confidence from 0 to 100.")]
    [InlineData("""{"patterns":[],"summary":"none"}""", "it needs a top-level \"confidence\" from 0 to 100.")]
    [InlineData("nope", "it wasn't valid JSON.")]
    public void Malformed_answers_are_refused_with_the_reason(string content, string expected)
    {
        var (parsed, problem) = ForecastPredictionRules.Parse(content, Groups(), Months());
        Assert.Null(parsed);
        Assert.Equal(expected, problem);
    }

    [Fact]
    public void Balances_are_today_plus_known_money_plus_each_pattern_once_a_month()
    {
        var (parsed, _) = ForecastPredictionRules.Parse(Answer(), Groups(), Months());
        var marks = ForecastPredictionRules.Marks(Today, 3);
        var items = new List<ForecastItemDto>
        {
            new() { Day = new(2026, 11, 5), Title = "Netflix", AccountId = null, Amount = -649, Currency = "INR", AmountInBase = -649 },
            new() { Day = new(2026, 12, 1), Title = "Rent", AccountId = 7, Amount = -20_000, Currency = "INR", AmountInBase = -20_000 },
            new() { Day = new(2027, 2, 1), Title = "After the horizon", AccountId = 7, Amount = -1, Currency = "INR", AmountInBase = -1 },
        };

        var overall = ForecastPredictionRules.Project(Lines[0], "INR", marks, items, parsed!.Patterns, Today);
        // A month: expected +50,000 +940 −4,879 = +46,061; worst +50,000 +0 −7,799; best +50,000 +3,000 −3,299.
        Assert.Equal([100_000m, 145_412m, 171_473m, 217_534m], overall.Points.Select(p => p.Balance));
        Assert.Equal(141_552m, overall.Points[1].Low);
        Assert.Equal(228_454m, overall.End.High);
        Assert.Equal(Today, overall.Lowest.Day);

        // HDFC: its own known money (rent) and its own patterns (salary, side jobs) — not the overall-only food/Netflix.
        var hdfc = ForecastPredictionRules.Project(Lines[1], "INR", marks, items, parsed.Patterns, Today);
        Assert.Equal([80_000m, 130_940m, 161_880m, 212_820m], hdfc.Points.Select(p => p.Balance));

        // An account in another currency gets no base-currency patterns.
        var wise = ForecastPredictionRules.Project(Lines[2], "INR", marks, items, parsed.Patterns, Today);
        Assert.All(wise.Points, p => Assert.Equal(500m, p.Balance));
    }
}
