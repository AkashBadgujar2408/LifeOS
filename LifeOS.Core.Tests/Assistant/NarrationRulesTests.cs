using LifeOS.Core.Assistant.DTOs;
using LifeOS.Core.Assistant.Services;

namespace LifeOS.Core.Tests.Assistant;

public class NarrationRulesTests
{
    private static readonly string[] Lines =
    [
        "Chapter 2: Starting over (since 01/Jan/2026)",
        "21/Oct/2026 — Mission passed: Run a half marathon",
        "Money: ₹1,00,000.00 in, ₹50,000.00 out (50% saved).",
        "3h 34m logged.",
    ];

    [Fact]
    public void Figures_from_the_lines_pass_however_they_are_written()
    {
        var narration = "Since 1 January 2026 — chapter 2 — you crossed the line on 21 October. ₹1,00,000 came in, 50,000.00 went out: 50% saved, and 3 hours 34 minutes logged.";
        Assert.Empty(NarrationRules.UnknownNumbers(narration, Lines));
    }

    [Fact]
    public void A_made_up_figure_is_caught()
    {
        var narration = "You passed 3 missions in 2026 and saved 60% of ₹1,20,000.";
        Assert.Equal(["60", "120000"], NarrationRules.UnknownNumbers(narration, Lines));
    }

    [Fact]
    public void A_narration_without_numbers_passes()
    {
        Assert.Empty(NarrationRules.UnknownNumbers("A new chapter, a finish line, and a calmer bank balance.", Lines));
    }

    [Theory]
    [InlineData(NarrationScopes.Recap, null, null)]
    [InlineData(NarrationScopes.Recap, 2026, "The recap has no year.")]
    [InlineData(NarrationScopes.Year, null, "Choose the year to narrate.")]
    [InlineData(NarrationScopes.Year, 2026, null)]
    [InlineData(NarrationScopes.Year, 2027, "Choose a year from 1960 to 2026.")]
    [InlineData(NarrationScopes.Year, 1959, "Choose a year from 1960 to 2026.")]
    [InlineData("Health", null, "Narrate the recap or a year.")]
    public void Scope_and_year_are_checked(string scope, int? year, string? error)
    {
        Assert.Equal(error, NarrationRules.CheckScope(scope, year, new DateOnly(2026, 10, 24)));
    }

    [Fact]
    public void Lines_are_trimmed_blanks_dropped_and_limited()
    {
        var shown = NarrationRules.Shown(["  one  ", "", "   ", "two"]);
        Assert.Equal(["one", "two"], shown);
        Assert.Null(NarrationRules.CheckLines(shown));
        Assert.Equal("There's nothing on the page to narrate yet.", NarrationRules.CheckLines(NarrationRules.Shown([" "])));
        Assert.NotNull(NarrationRules.CheckLines(Enumerable.Repeat("x", NarrationRules.MaxLines + 1).ToList()));
        Assert.NotNull(NarrationRules.CheckLines([new string('x', NarrationRules.MaxLineLength + 1)]));
    }

    [Fact]
    public void The_lines_are_the_only_data_sent()
    {
        var input = NarrationRules.Input(NarrationRules.Shown(Lines));
        Assert.Equal("The lines on the page:\n" + string.Join("\n", Lines.Select(l => "- " + l)), input);
    }
}
