using LifeOS.Core.Shared.Services;

namespace LifeOS.Core.Tests.Shared;

/// <summary>
/// UX_EntityLinks_Pair only rejects a duplicate link if both directions are stored the same way, so the canonical
/// form has to be independent of which side the user linked from.
/// </summary>
public class EntityLinkCanonicalizeTests
{
    [Fact]
    public void Either_direction_gives_the_same_stored_pair()
    {
        var fromGoal = EntityLinksService.Canonicalize("Goal", 9, "Task", 3);
        var fromTask = EntityLinksService.Canonicalize("Task", 3, "Goal", 9);

        Assert.Equal(("Goal", 9, "Task", 3), fromGoal);
        Assert.Equal(fromGoal, fromTask);
    }

    [Fact]
    public void Same_type_orders_by_id()
    {
        Assert.Equal(("Task", 2, "Task", 7), EntityLinksService.Canonicalize("Task", 7, "Task", 2));
        Assert.Equal(("Task", 2, "Task", 7), EntityLinksService.Canonicalize("Task", 2, "Task", 7));
    }

    [Fact]
    public void Types_compare_ordinally_not_by_culture()
    {
        // Ordinal: "JournalEntry" < "Project" < "Task" by code point; culture rules must not reorder them.
        Assert.Equal(("JournalEntry", 50, "Project", 1), EntityLinksService.Canonicalize("Project", 1, "JournalEntry", 50));
        Assert.Equal(("InboxItem", 4, "Task", 1), EntityLinksService.Canonicalize("Task", 1, "InboxItem", 4));
    }
}
