using LifeOS.Core.Shared.Services;

namespace LifeOS.Core.Tests.Shared;

public class SearchSnippetsTests
{
    private const string Long =
        "Woke up early and went for a run along the river before work. The meeting about the Lisbon trip went well, " +
        "and we finally booked the flights for March. In the evening I read two chapters and made soup.";

    [Fact]
    public void Short_text_comes_back_whole_on_one_line()
    {
        Assert.Equal("Booked the flights. Then soup.", SearchSnippets.Around("Booked the flights.\n\n  Then soup.", "soup"));
    }

    [Fact]
    public void Long_text_is_cut_around_the_match_at_word_boundaries()
    {
        var snippet = SearchSnippets.Around(Long, "lisbon", 60)!;

        Assert.Contains("Lisbon", snippet);
        Assert.StartsWith("…", snippet);
        Assert.EndsWith("…", snippet);
        // Whole words only: what's between the ellipses starts and ends on a word of the original text.
        var inner = snippet.Trim('…');
        Assert.Contains(inner, Long);
        Assert.Contains(" " + inner.Split(' ')[0] + " ", " " + Long + " ");
        Assert.InRange(inner.Length, 40, 70);
    }

    [Fact]
    public void A_match_near_the_start_has_no_leading_ellipsis()
    {
        var snippet = SearchSnippets.Around(Long, "woke", 60)!;

        Assert.StartsWith("Woke up early", snippet);
        Assert.EndsWith("…", snippet);
    }

    [Fact]
    public void A_match_at_the_end_has_no_trailing_ellipsis()
    {
        var snippet = SearchSnippets.Around(Long, "made soup", 60)!;

        Assert.StartsWith("…", snippet);
        Assert.EndsWith("made soup.", snippet);
    }

    [Fact]
    public void No_match_in_the_text_gives_its_start()
    {
        var snippet = SearchSnippets.Around(Long, "zebra", 60)!;

        Assert.StartsWith("Woke up early", snippet);
        Assert.EndsWith("…", snippet);
    }

    [Fact]
    public void No_text_gives_null()
    {
        Assert.Null(SearchSnippets.Around(null, "x"));
        Assert.Null(SearchSnippets.Around("   ", "x"));
    }
}
