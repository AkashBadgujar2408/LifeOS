namespace LifeOS.Core.Dashboard.DTOs;

/// <summary>The Life Balance Wheel: one spoke per life area, for a window of the user's local days.</summary>
public class LifeBalanceDto
{
    public DateOnly From { get; init; }
    public DateOnly To { get; init; }
    /// <summary>Every life area, in the taxonomy's order — including ones with nothing in them.</summary>
    public List<LifeBalanceAreaDto> Areas { get; init; } = [];
}

public class LifeBalanceAreaDto
{
    public int LifeAreaId { get; init; }
    public string LifeAreaName { get; init; } = string.Empty;
    public int ActiveGoals { get; init; }
    public int GoalsCompleted { get; init; }
    public int MilestonesCompleted { get; init; }
    public int HabitTicks { get; init; }
    public int JournalEntries { get; init; }
    /// <summary>Weighted activity (LifeBalance.Points).</summary>
    public int Points { get; init; }
    /// <summary>0-10, relative to the busiest area in the window (LifeBalance.Score).</summary>
    public decimal Score { get; init; }
}
