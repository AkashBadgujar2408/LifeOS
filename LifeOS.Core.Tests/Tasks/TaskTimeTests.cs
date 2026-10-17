using LifeOS.Core.Shared.Services;
using LifeOS.Core.Tasks.Services;

namespace LifeOS.Core.Tests.Tasks;

public class TaskTimeTests
{
    private static readonly DateTime Now = new(2026, 10, 17, 12, 0, 0, DateTimeKind.Utc);

    [Fact]
    public void A_finished_session_within_its_span_is_fine()
    {
        Assert.Null(TaskTime.CheckSession(Now.AddMinutes(-30), Now, 25, Now));
        Assert.Null(TaskTime.CheckSession(Now.AddMinutes(-25), Now, 25, Now));
    }

    [Theory]
    [InlineData(-10, -20, 5, "end after it starts")]
    [InlineData(-30, 5, 25, "future")]
    [InlineData(-30, 0, 45, "more focused minutes")]
    [InlineData(-700, 0, 650, "1 to 600")]
    public void Impossible_sessions_are_refused(int startOffset, int endOffset, int minutes, string message)
    {
        Assert.Contains(message, TaskTime.CheckSession(Now.AddMinutes(startOffset), Now.AddMinutes(endOffset), minutes, Now));
    }

    [Fact]
    public void The_dependency_loop_check_finds_direct_and_indirect_loops()
    {
        // 1 waits for 2, 2 waits for 3.
        (int, int)[] edges = [(1, 2), (2, 3)];

        Assert.True(DependencyGraph.WouldCreateCycle(edges, 3, 1));   // 3 → 1 → 2 → 3
        Assert.True(DependencyGraph.WouldCreateCycle(edges, 2, 1));   // direct
        Assert.True(DependencyGraph.WouldCreateCycle(edges, 4, 4));   // itself
        Assert.False(DependencyGraph.WouldCreateCycle(edges, 1, 3));  // already implied, no loop
        Assert.False(DependencyGraph.WouldCreateCycle(edges, 4, 1));
    }
}
