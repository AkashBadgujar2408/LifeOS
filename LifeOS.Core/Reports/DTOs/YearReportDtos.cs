using LifeOS.Core.Finance.DTOs;
using LifeOS.Core.Leisure.DTOs;
using LifeOS.Core.Story.DTOs;

namespace LifeOS.Core.Reports.DTOs;

/// <summary>Money over the range, consolidated: cash flow (as the ledger counts it) and net worth before → after.</summary>
public class FinanceReportDto
{
    public DateOnly From { get; init; }
    public DateOnly To { get; init; }
    /// <summary>The base currency; null when none is chosen (nothing else is filled).</summary>
    public string? Currency { get; init; }
    public decimal Income { get; init; }
    public decimal Spending { get; init; }
    public decimal Net { get; init; }
    public decimal? SavingsRate { get; init; }
    /// <summary>Transactions left out of the totals for want of an exchange rate.</summary>
    public int Unconverted { get; init; }
    /// <summary>Calendar months touching the range (the first and last hold only their days inside it).</summary>
    public List<CashFlowMonthDto> Months { get; init; } = [];
    public List<CashFlowTagDto> Tags { get; init; } = [];
    public decimal UntaggedSpending { get; init; }
    /// <summary>Net worth at the end of the day before the range (null when the range is all ahead).</summary>
    public NetWorthPointDto? NetWorthStart { get; init; }
    /// <summary>Net worth at the end of the range, or today when it runs on past today.</summary>
    public NetWorthPointDto? NetWorthEnd { get; init; }
    public decimal? NetWorthChange { get; init; }
    /// <summary>Start, every month end inside the range, end — oldest first.</summary>
    public List<NetWorthPointDto> NetWorth { get; init; } = [];
}

/// <summary>Life balance month by month: activity points/scores (as My Day's card counts them) beside your own ratings.</summary>
public class LifeBalanceReportDto
{
    public DateOnly From { get; init; }
    public DateOnly To { get; init; }
    /// <summary>Every life area (taxonomy order) with its averages over the months.</summary>
    public List<LifeBalanceReportAreaDto> Areas { get; init; } = [];
    /// <summary>Calendar months touching the range up to today, oldest first.</summary>
    public List<LifeBalanceMonthDto> Months { get; init; } = [];
}

public class LifeBalanceReportAreaDto
{
    public int LifeAreaId { get; init; }
    public string LifeAreaName { get; init; } = string.Empty;
    /// <summary>The average of its monthly scores (0–10, relative to each month's busiest area).</summary>
    public decimal? AverageScore { get; init; }
    /// <summary>The average of your ratings (1–10) over the months you rated it.</summary>
    public decimal? AverageRating { get; init; }
    public int MonthsRated { get; init; }
    /// <summary>Activity points over all the months added up.</summary>
    public int Points { get; init; }
}

public class LifeBalanceMonthDto
{
    public DateOnly MonthStart { get; init; }
    public DateOnly From { get; init; }
    public DateOnly To { get; init; }
    public List<LifeBalanceCellDto> Areas { get; init; } = [];
}

public class LifeBalanceCellDto
{
    public int LifeAreaId { get; init; }
    public int Points { get; init; }
    public decimal Score { get; init; }
    public byte? Rating { get; init; }
}

/// <summary>
/// The Annual Life Review (Session 92): one year from every side — the Story (chapters, achievements, highlights) and
/// each report over Jan 1 – Dec 31, computed by the same code as the report tabs, so the figures agree with them.
/// Health stays out (it would need the vault unlock).
/// </summary>
public class AnnualReviewDto
{
    public int Year { get; init; }
    public DateOnly From { get; init; }
    public DateOnly To { get; init; }
    /// <summary>Chapters overlapping the year, oldest first.</summary>
    public List<ChapterDto> Chapters { get; init; } = [];
    /// <summary>Achievements earned during the year, in the order earned.</summary>
    public List<AchievementDto> Achievements { get; init; } = [];
    /// <summary>Every Life Story beat that happened in the year.</summary>
    public int StoryBeats { get; init; }
    /// <summary>The year's big moments (missions passed, roles, career highlights, memories, favourite media), oldest first.</summary>
    public List<StoryBeatDto> Highlights { get; init; } = [];
    public GoalReportCountsDto Goals { get; init; } = new();
    public HabitShareDto HabitsBuild { get; init; } = new();
    public HabitShareDto HabitsAvoid { get; init; } = new();
    public TaskReportCountsDto Tasks { get; init; } = new();
    public FocusReportDto Focus { get; init; } = new();
    public int StudyMinutes { get; init; }
    public int CoursesCompleted { get; init; }
    public int BooksFinished { get; init; }
    public int SkillLevelUps { get; init; }
    public int Certifications { get; init; }
    public FinanceReportDto Money { get; init; } = new();
    public YearInMediaDto Media { get; init; } = new();
    public List<LifeBalanceReportAreaDto> LifeBalance { get; init; } = [];
}
