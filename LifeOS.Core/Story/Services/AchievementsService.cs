using System.Data;
using Dapper;
using LifeOS.Core.Finance.DTOs;
using LifeOS.Core.Finance.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Story.DTOs;
using LifeOS.Core.Story.ServiceContracts;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Story.Services;

/// <summary>
/// Achievements: the facts come from story.GetAchievementFacts (twenty result sets, one round trip, read in order with
/// Dapper QueryMultiple), UTC moments go onto the user's local days with their timezone, and the pure
/// Achievements.Evaluate decides what's unlocked. Money facts (Session 96b) come from Finance's own services — net
/// worth by <c>NetWorth.At</c>, months as the cash-flow report counts them, budgets as the budget page does — read
/// after the procedure's reader is closed. Achievements of switched-off modules are left out. Nothing is stored.
/// </summary>
public class AchievementsService(
    AppDbContext db,
    IWealthService wealthService,
    IFinanceReportsService financeReportsService,
    IBudgetsService budgetsService,
    ILoansService loansService,
    IRecurringTransactionsService recurringService) : IAchievementsService
{
    public async Task<OperationResult<List<AchievementDto>>> GetAsync(string? timeZoneId)
    {
        if (!LifeStoryService.TryFindZone(timeZoneId, out var zone))
        {
            return OperationResult<List<AchievementDto>>.Fail(LifeStoryService.UnknownZone(timeZoneId));
        }

        var achievements = await EvaluateAsync(zone);
        return OperationResult<List<AchievementDto>>.Ok(achievements.Select(a => new AchievementDto
        {
            Key = a.Key,
            Title = a.Title,
            Description = a.Description,
            Icon = a.Icon,
            Progress = a.Progress,
            Target = a.Target,
            UnlockedOn = a.UnlockedOn,
            Module = a.Module,
            Currency = a.Currency,
            NeedsRate = a.NeedsRate,
        }).ToList());
    }

    public async Task<IReadOnlyList<Achievement>> EvaluateAsync(TimeZoneInfo zone)
    {
        DateOnly Local(DateTime utc) =>
            DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(utc, DateTimeKind.Utc), zone));
        static DateOnly Day(DateTime date) => DateOnly.FromDateTime(date);

        var today = Local(DateTime.UtcNow);
        var hidden = (await db.UserHiddenModules.Select(m => m.ModuleKey).ToListAsync()).ToHashSet(StringComparer.Ordinal);

        var parameters = new DynamicParameters();
        parameters.Add("UserId", db.CurrentUserId!.Value, DbType.Int32);
        List<GoalRow> goals;
        List<MomentRow> objectives;
        List<HabitRow> habits;
        List<HabitDayRow> habitDays;
        List<DayRow> journal;
        List<ChapterRow> chapters;
        List<DateTime> debriefs;
        List<RatingRow> ratings;
        int lifeAreaCount;
        List<ChallengeRow> challenges;
        ILookup<int, DateOnly> slips;
        ProgressFacts progress;
        await using (var reader = await db.Database.GetDbConnection().QueryMultipleAsync(
            "story.GetAchievementFacts", parameters, commandType: CommandType.StoredProcedure))
        {
            // Read in exactly the order the procedure returns them.
            goals = (await reader.ReadAsync<GoalRow>()).ToList();
            objectives = (await reader.ReadAsync<MomentRow>()).ToList();
            habits = (await reader.ReadAsync<HabitRow>()).ToList();
            habitDays = (await reader.ReadAsync<HabitDayRow>()).ToList();
            journal = (await reader.ReadAsync<DayRow>()).ToList();
            chapters = (await reader.ReadAsync<ChapterRow>()).ToList();
            debriefs = (await reader.ReadAsync<DateTime>()).ToList();
            ratings = (await reader.ReadAsync<RatingRow>()).ToList();
            lifeAreaCount = await reader.ReadSingleAsync<int>();
            challenges = (await reader.ReadAsync<ChallengeRow>()).ToList();
            slips = (await reader.ReadAsync<HabitDayRow>()).ToLookup(s => s.HabitId, s => Day(s.EntryDate));
            progress = new ProgressFacts(
                (await reader.ReadAsync<DateTime>()).Select(Day).ToList(),
                (await reader.ReadAsync<DateTime>()).Select(Day).ToList(),
                (await reader.ReadAsync<DateTime>()).Select(Day).ToList(),
                (await reader.ReadAsync<DateTime>()).Select(Day).ToList(),
                (await reader.ReadAsync<MinutesRow>()).Select(s => new MinutesFact(Day(s.Day), s.Minutes)).ToList(),
                (await reader.ReadAsync<DateTime>()).Select(Day).ToList(),
                (await reader.ReadAsync<MediaRow>()).Select(m => new MediaFinishedFact(m.Kind, Day(m.Day))).ToList(),
                (await reader.ReadAsync<DateTime>()).Select(Local).ToList(),
                (await reader.ReadAsync<FocusRow>()).Select(f => new MinutesFact(Local(f.StartedAt), f.Minutes)).ToList());
        }

        // Finance's own services run their own commands, so only once the reader above is closed.
        var money = hidden.Contains(ModuleKeys.Finance) ? null : await MoneyFactsAsync(today);

        var daysByHabit = habitDays.ToLookup(d => d.HabitId, d => DateOnly.FromDateTime(d.EntryDate));
        var areaByHabit = habitDays.GroupBy(d => d.HabitId).ToDictionary(g => g.Key, g => g.First().LifeAreaId);

        var facts = new AchievementFacts(
            today,
            lifeAreaCount,
            goals.Select(g => new PassedGoalFact(g.GoalType, g.LifeAreaId, Local(g.CompletedAt))).ToList(),
            objectives.Select(o => new AreaDay(o.LifeAreaId, Local(o.CompletedAt))).ToList(),
            habits.Select(h => new HabitFact(
                h.Id, h.ScheduleDays, DateOnly.FromDateTime(h.StartDate), areaByHabit.GetValueOrDefault(h.Id), daysByHabit[h.Id].ToList()))
                .ToList(),
            journal.Select(j => new AreaDay(j.LifeAreaId, DateOnly.FromDateTime(j.EntryDate))).ToList(),
            chapters.Select(c => new ChapterFact(
                DateOnly.FromDateTime(c.StartDate), c.EndDate is { } end ? DateOnly.FromDateTime(end) : null, Local(c.CreatedAt)))
                .ToList(),
            debriefs.Select(Local).ToList(),
            ratings.Select(r => new RatingFact(r.LifeAreaId, DateOnly.FromDateTime(r.MonthStart), Local(r.CreatedAt))).ToList(),
            challenges.Select(c => new ChallengeFact(c.HabitId, c.Days, DateOnly.FromDateTime(c.StartDate), c.Kind == "Avoid",
                c.ScheduleDays, DateOnly.FromDateTime(c.HabitStartDate), slips[c.HabitId].ToList())).ToList(),
            progress,
            money);

        return Achievements.Evaluate(facts).Where(a => a.Module is null || !hidden.Contains(a.Module)).ToList();
    }

    /// <summary>
    /// Net worth and money in accounts for every day since the first account/loan/investment, months as the cash-flow
    /// report counts them (with whether every budget was kept), loans you borrowed, and the day each month-income
    /// threshold was first crossed. Null without a base currency (nothing can be added up).
    /// </summary>
    private async Task<MoneyFacts?> MoneyFactsAsync(DateOnly today)
    {
        // Repeating transactions due by today are written first, like every Finance read that shows money.
        await recurringService.GenerateDueAsync(today);
        var inrRate = await wealthService.RateToBaseAsync(AchievementThresholds.Inr, today);
        var starts = new List<DateOnly>();
        starts.AddRange(await db.Accounts.Select(a => a.OpeningDate).ToListAsync());
        starts.AddRange(await db.Loans.Select(l => l.StartDate).ToListAsync());
        starts.AddRange((await db.Holdings.Where(h => h.AcquiredOn != null).Select(h => h.AcquiredOn).ToListAsync()).Select(d => d!.Value));
        var first = starts.Where(d => d <= today).DefaultIfEmpty(today).Min();

        var days = Enumerable.Range(0, today.DayNumber - first.DayNumber + 1).Select(first.AddDays).ToList();
        var points = await wealthService.GetNetWorthOnAsync(days);
        if (points.Currency is null)
        {
            return null;
        }

        var flow = await financeReportsService.GetCashFlowAsync(new DateOnly(first.Year, first.Month, 1), today);
        var budgetMonths = (await db.Budgets.Select(b => b.MonthStart).Distinct().ToListAsync()).ToHashSet();
        var months = new List<MoneyMonthFact>();
        foreach (var month in flow.Months)
        {
            bool? kept = null;
            if (budgetMonths.Contains(month.MonthStart) && month.MonthStart.AddMonths(1) <= today)
            {
                var summary = await budgetsService.GetMonthAsync(month.MonthStart);
                var budgeted = summary.Data?.Lines.Where(l => l.Budget is not null).ToList() ?? [];
                kept = budgeted.Count > 0 ? budgeted.All(l => !l.IsOver) : null;
            }

            months.Add(new MoneyMonthFact(month.MonthStart, month.Income, month.Spending, kept));
        }

        var debts = (await loansService.GetAllAsync(today))
            .Where(l => l.Direction == LoanKinds.Borrowed)
            .Select(l => new DebtFact(l.Outstanding, l.Outstanding <= 0 ? l.ClosedOn ?? l.LastPaidOn ?? l.StartDate : null))
            .ToList();

        var crossedOn = new Dictionary<decimal, DateOnly>();
        foreach (var threshold in AchievementThresholds.For(AchievementThresholds.MonthIncome, points.Currency, inrRate) ?? [])
        {
            if (months.FirstOrDefault(m => m.Income >= threshold.Amount) is { } month)
            {
                var last = month.MonthStart.AddMonths(1).AddDays(-1);
                crossedOn[threshold.Amount] = await FirstDayReachingAsync(month.MonthStart, last < today ? last : today, threshold.Amount,
                    async day => (await financeReportsService.GetCashFlowAsync(month.MonthStart, day)).Total.Income);
            }
        }

        return new MoneyFacts(
            points.Currency,
            inrRate,
            points.Points.Select(p => new WealthDayFact(p.Day, p.Net, p.Cash)).ToList(),
            months,
            debts,
            crossedOn);
    }

    /// <summary>
    /// The first day from <paramref name="from"/> to <paramref name="to"/> on which the running total reaches
    /// <paramref name="amount"/> (binary search — a month's income so far only grows); <paramref name="to"/> when it
    /// only gets there at the end.
    /// </summary>
    internal static async Task<DateOnly> FirstDayReachingAsync(DateOnly from, DateOnly to, decimal amount, Func<DateOnly, Task<decimal>> totalThrough)
    {
        var low = from;
        var high = to;
        while (low < high)
        {
            var middle = low.AddDays((high.DayNumber - low.DayNumber) / 2);
            if (await totalThrough(middle) >= amount)
            {
                high = middle;
            }
            else
            {
                low = middle.AddDays(1);
            }
        }

        return low;
    }

    // ADO.NET shapes as they come: DATE → DateTime, DATETIME2 → unspecified kind (treated as UTC above).
    private sealed class GoalRow
    {
        public string GoalType { get; init; } = string.Empty;
        public int LifeAreaId { get; init; }
        public DateTime CompletedAt { get; init; }
    }

    private sealed class MomentRow
    {
        public int? LifeAreaId { get; init; }
        public DateTime CompletedAt { get; init; }
    }

    private sealed class HabitRow
    {
        public int Id { get; init; }
        public byte ScheduleDays { get; init; }
        public DateTime StartDate { get; init; }
    }

    private sealed class HabitDayRow
    {
        public int HabitId { get; init; }
        public int? LifeAreaId { get; init; }
        public DateTime EntryDate { get; init; }
    }

    private sealed class DayRow
    {
        public int? LifeAreaId { get; init; }
        public DateTime EntryDate { get; init; }
    }

    private sealed class ChapterRow
    {
        public DateTime StartDate { get; init; }
        public DateTime? EndDate { get; init; }
        public DateTime CreatedAt { get; init; }
    }

    private sealed class ChallengeRow
    {
        public int HabitId { get; init; }
        public int Days { get; init; }
        public DateTime StartDate { get; init; }
        public string Kind { get; init; } = string.Empty;
        public byte ScheduleDays { get; init; }
        public DateTime HabitStartDate { get; init; }
    }

    private sealed class MinutesRow
    {
        public DateTime Day { get; init; }
        public int Minutes { get; init; }
    }

    private sealed class MediaRow
    {
        public string Kind { get; init; } = string.Empty;
        public DateTime Day { get; init; }
    }

    private sealed class FocusRow
    {
        public DateTime StartedAt { get; init; }
        public int Minutes { get; init; }
    }

    private sealed class RatingRow
    {
        public int LifeAreaId { get; init; }
        public DateTime MonthStart { get; init; }
        public DateTime CreatedAt { get; init; }
    }
}
