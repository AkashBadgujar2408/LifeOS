using LifeOS.Core.Goals.DTOs;
using LifeOS.Core.Story.Services;

namespace LifeOS.Core.Tests.Story;

public class MissionsTests
{
    [Theory]
    [InlineData(GoalTypes.LongTerm, MissionKinds.Main)]
    [InlineData(GoalTypes.ShortTerm, MissionKinds.Side)]
    [InlineData(GoalTypes.BucketList, MissionKinds.Collectible)]
    public void Mission_kind_comes_from_the_goal_type(string goalType, string kind)
    {
        Assert.Equal(kind, MissionKinds.Of(goalType));
    }

    [Fact]
    public void An_unknown_goal_type_throws()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => MissionKinds.Of("Weekly"));
    }

    [Theory]
    [InlineData(GoalStatuses.Active, true)]
    [InlineData(GoalStatuses.Postponed, true)]
    [InlineData(GoalStatuses.Completed, false)]
    [InlineData(GoalStatuses.Abandoned, false)]
    public void Only_a_prerequisite_still_in_play_blocks(string status, bool blocks)
    {
        Assert.Equal(blocks, MissionGraph.Blocks(status));
    }

    [Fact]
    public void Blocked_by_lists_only_the_prerequisites_still_in_play()
    {
        // Visit Japan (1) needs passport (2, active), savings (3, completed) and visa (4, deleted — no status).
        (int, int)[] edges = [(1, 2), (1, 3), (1, 4), (5, 2)];
        var status = new Dictionary<int, string> { [1] = GoalStatuses.Active, [2] = GoalStatuses.Active, [3] = GoalStatuses.Completed };

        Assert.Equal([2], MissionGraph.BlockedBy(1, edges, status));
        Assert.Empty(MissionGraph.BlockedBy(3, edges, status));
    }

    [Fact]
    public void Self_and_direct_loops_are_cycles()
    {
        (int, int)[] edges = [(1, 2)];

        Assert.True(MissionGraph.WouldCreateCycle(edges, 3, 3));
        Assert.True(MissionGraph.WouldCreateCycle(edges, 2, 1)); // 1 needs 2, so 2 can't need 1
    }

    [Fact]
    public void Indirect_loops_are_cycles_but_shared_prerequisites_are_not()
    {
        // 1 needs 2, 2 needs 3.
        (int, int)[] edges = [(1, 2), (2, 3)];

        Assert.True(MissionGraph.WouldCreateCycle(edges, 3, 1));
        // A diamond is fine: 4 needs 3 too, and 1 also needs 3 directly.
        Assert.False(MissionGraph.WouldCreateCycle(edges, 4, 3));
        Assert.False(MissionGraph.WouldCreateCycle(edges, 1, 3));
    }

    [Fact]
    public void A_graph_that_already_branches_widely_terminates()
    {
        // A long chain 1 <- 2 <- ... <- 200 plus cross edges; asking about an unrelated pair must still finish.
        var edges = Enumerable.Range(1, 199).Select(i => (i + 1, i)).Concat(Enumerable.Range(1, 198).Select(i => (i + 2, i))).ToList();

        Assert.False(MissionGraph.WouldCreateCycle(edges, 500, 200));
        Assert.True(MissionGraph.WouldCreateCycle(edges, 1, 200));
    }
}
