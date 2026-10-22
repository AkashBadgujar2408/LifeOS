using System.Data;
using Dapper;
using LifeOS.Core.Calendar.Services;
using LifeOS.Core.Dashboard.DTOs;
using LifeOS.Core.Dashboard.ServiceContracts;
using LifeOS.Core.Family.ServiceContracts;
using LifeOS.Core.Finance.ServiceContracts;
using LifeOS.Core.Goals.DTOs;
using LifeOS.Core.Goals.ServiceContracts;
using LifeOS.Core.Goals.Services;
using LifeOS.Core.Habits.Services;
using LifeOS.Core.Home.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.Services;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Dashboard.Services;

/// <summary>
/// My Day comes from one stored procedure (database/procedures/dashboard.GetMyDay.sql) returning seven result sets,
/// read in order with Dapper's QueryMultiple — one round trip across five schemas. The procedure does its own
/// user/soft-delete filtering; this class only turns rows into DTOs and works out what's computed, never stored
/// (goal progress via GoalProgress, habit streaks via HabitStreaks).
/// </summary>
public class DashboardService(
    AppDbContext db, IBudgetsService budgetsService, IHomeAgendaService homeAgendaService, IForecastService forecastService,
    IGoalProgressService goalProgressService, ISignificantDatesService significantDatesService,
    IKeepInTouchService keepInTouchService) : IDashboardService
{
    // A local day is 23-25 hours (DST); anything much longer means the client sent the wrong span.
    private static readonly TimeSpan MaxDayLength = TimeSpan.FromHours(26);

    // A year is plenty for a balance view; beyond that the counts stop meaning "lately".
    private const int MaxBalanceDays = 366;

    // Birthdays and anniversaries show on My Day from a week before (Family, Session 73).
    private const int UpcomingDayWindow = 7;

    public async Task<OperationResult<MyDayDto>> GetMyDayAsync(DateOnly today, DateTime? dayStartUtc, DateTime? dayEndUtc)
    {
        var startUtc = dayStartUtc?.ToUniversalTime() ?? today.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
        var endUtc = dayEndUtc?.ToUniversalTime() ?? today.AddDays(1).ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
        if (endUtc <= startUtc)
        {
            return OperationResult<MyDayDto>.Fail("The end of the day must be after its start.");
        }

        if (endUtc - startUtc > MaxDayLength)
        {
            return OperationResult<MyDayDto>.Fail("The day's span can be at most 26 hours.");
        }

        // Before the My Day reader opens: one connection runs one command at a time.
        var overBudget = await budgetsService.OverBudgetAsync(today);
        var homeAgenda = await homeAgendaService.UpcomingAsync(today);
        var lowAhead = await forecastService.LowAheadAsync(today, DashboardInsights.LowBalanceDays);
        var goalProgress = await ActiveGoalProgressAsync(today);
        var upcomingDays = await significantDatesService.UpcomingAsync(today, UpcomingDayWindow);
        var keepInTouch = await keepInTouchService.GetAllAsync(today);
        var study = await StudyFactsAsync();
        var untagged = await UntaggedExpensesAsync(today);
        var workouts = await WorkoutFactsAsync(today);

        var parameters = new DynamicParameters();
        parameters.Add("UserId", db.CurrentUserId!.Value, DbType.Int32);
        parameters.Add("Today", today.ToDateTime(TimeOnly.MinValue), DbType.Date);
        parameters.Add("DayStartUtc", startUtc, DbType.DateTime2);
        parameters.Add("DayEndUtc", endUtc, DbType.DateTime2);

        var connection = db.Database.GetDbConnection();
        await using var reader = await connection.QueryMultipleAsync(
            "dashboard.GetMyDay", parameters, commandType: CommandType.StoredProcedure);

        // Read in exactly the order the procedure returns them.
        var tasks = (await reader.ReadAsync<TaskRow>()).ToList();
        var events = (await reader.ReadAsync<EventRow>()).ToList();
        var reminders = (await reader.ReadAsync<ReminderRow>()).ToList();
        var goals = (await reader.ReadAsync<GoalRow>()).ToList();
        var habits = (await reader.ReadAsync<HabitRow>()).ToList();
        var entries = (await reader.ReadAsync<HabitEntryRow>()).ToList();
        var journal = (await reader.ReadAsync<JournalRow>()).FirstOrDefault();
        var eventSeries = (await reader.ReadAsync<EventSeriesRow>()).ToList();
        var skippedDates = (await reader.ReadAsync<SkippedDateRow>()).ToList();
        var documents = (await reader.ReadAsync<DocumentRow>()).ToList();

        var doneByHabit = entries
            .GroupBy(e => e.HabitId)
            .ToDictionary(g => g.Key, g => g.Select(e => DateOnly.FromDateTime(e.EntryDate)).ToList());

        var myDay = new MyDayDto
        {
            Today = today,
            Tasks = tasks.Select(t => new MyDayTaskDto
            {
                Id = t.Id,
                Title = t.Title,
                DueDate = DateOnly.FromDateTime(t.DueDate),
                Priority = t.Priority,
                IsDone = t.IsDone,
                IsRecurring = t.IsRecurring,
                ProjectId = t.ProjectId,
                ProjectName = t.ProjectName,
            }).ToList(),
            Events = events.Select(e => new MyDayEventDto
            {
                Id = e.Id,
                Title = e.Title,
                IsAllDay = e.IsAllDay,
                StartDate = AsDate(e.StartDate),
                EndDate = AsDate(e.EndDate),
                StartsAt = AsUtc(e.StartsAt),
                EndsAt = AsUtc(e.EndsAt),
                Location = e.Location,
            })
            .Concat(RecurringEvents.Expand(eventSeries, skippedDates, today, today, startUtc, endUtc).Select(o => new MyDayEventDto
            {
                Id = o.Series.Id,
                Title = o.Series.Title,
                IsAllDay = o.Series.IsAllDay,
                StartDate = o.Occurrence.StartDate,
                EndDate = o.Occurrence.EndDate,
                StartsAt = o.Occurrence.StartsAt,
                EndsAt = o.Occurrence.EndsAt,
                Location = o.Series.Location,
                IsRecurring = true,
                OccurrenceDate = o.Occurrence.OccurrenceDate,
            }))
            // The procedure's order (all-day first, then timed by start), with occurrences mixed in.
            .OrderByDescending(e => e.IsAllDay)
            .ThenBy(e => e.StartsAt)
            .ThenBy(e => e.Title, StringComparer.Ordinal)
            .ThenBy(e => e.Id)
            .ToList(),
            Reminders = reminders.Select(r => new MyDayReminderDto
            {
                Id = r.Id,
                Title = r.Title,
                RemindAt = AsUtc(r.RemindAt)!.Value,
                EntityType = r.EntityType,
                EntityId = r.EntityId,
            }).ToList(),
            Goals = goals.Select(g =>
            {
                var progress = goalProgress.GetValueOrDefault(g.Id);
                return new MyDayGoalDto
            {
                Id = g.Id,
                Title = g.Title,
                GoalType = g.GoalType,
                TargetDate = AsDate(g.TargetDate),
                LifeAreaName = g.LifeAreaName,
                MilestoneCount = g.MilestoneCount,
                CompletedMilestoneCount = g.CompletedMilestoneCount,
                ProgressPercent = progress?.Percent
                    ?? GoalProgress.Percent(GoalStatuses.Active, g.MilestoneCount, g.CompletedMilestoneCount),
                ProgressKind = progress?.Kind ?? GoalProgressKinds.Milestones,
                ProgressLocked = progress?.Locked ?? false,
                MeasureCurrent = progress?.MeasureCurrent,
                MeasureTarget = progress?.MeasureTarget,
                MeasureUnit = progress?.MeasureUnit,
                MeasureSource = progress?.MeasureSource,
                NextMilestoneId = g.NextMilestoneId,
                NextMilestoneTitle = g.NextMilestoneTitle,
                NextMilestoneTargetDate = AsDate(g.NextMilestoneTargetDate),
                LastActivityAt = AsUtc(g.LastActivityAt)!.Value,
            };
            }).ToList(),
            Habits = habits.Select(h =>
            {
                var startDate = DateOnly.FromDateTime(h.StartDate);
                var done = doneByHabit.GetValueOrDefault(h.Id) ?? [];
                return new MyDayHabitDto
                {
                    Id = h.Id,
                    Title = h.Title,
                    ScheduleDays = h.ScheduleDays,
                    StartDate = startDate,
                    LifeAreaName = h.LifeAreaName,
                    TargetValue = h.TargetValue,
                    Unit = h.Unit,
                    Streak = HabitStreaks.Calculate(h.ScheduleDays, startDate, done, today),
                };
            }).ToList(),
            LatestJournalEntry = journal is null ? null : new MyDayJournalDto
            {
                Id = journal.Id,
                EntryDate = DateOnly.FromDateTime(journal.EntryDate),
                Title = journal.Title,
                Excerpt = journal.Excerpt,
                Mood = journal.Mood,
            },
            ExpiringDocuments = documents.Select(d => new MyDayDocumentDto
            {
                Id = d.Id,
                Title = d.Title,
                Kind = d.Kind,
                ExpiresOn = DateOnly.FromDateTime(d.ExpiresOn),
            }).ToList(),
            HomeAgenda = homeAgenda,
            UpcomingDays = upcomingDays,
        };

        myDay.Insights = DashboardInsights.Evaluate(new InsightInputs(
            today,
            DateTime.UtcNow,
            myDay.Habits
                .Select(h => new InsightHabit(h.Id, h.Title, h.ScheduleDays, h.StartDate, doneByHabit.GetValueOrDefault(h.Id)?.ToHashSet() ?? [], h.Streak))
                .ToList(),
            myDay.Goals.Select(g => new InsightGoal(g.Id, g.Title, g.LastActivityAt, g.ProgressKind, g.ProgressPercent,
                g.ProgressLocked, g.MeasureTarget, g.MeasureUnit, g.MeasureSource == GoalMeasureSources.Linked)).ToList(),
            myDay.LatestJournalEntry?.EntryDate,
            myDay.Tasks.Count(t => !t.IsDone && t.DueDate < today),
            myDay.ExpiringDocuments.Select(d => new InsightDocument(d.Id, d.Title, d.ExpiresOn)).ToList(),
            overBudget.Select(b => new InsightBudget(b.TagId, b.TagName, b.Spent, b.Budget!.Value, b.BudgetCurrency!)).ToList(),
            lowAhead.Select(l => new InsightLowBalance(l.AccountId, l.Name, l.Currency, l.Day, l.Balance)).ToList(),
            keepInTouch.Select(k => new InsightKeepInTouch(k.ContactId, k.Name, k.LastContactedOn, k.DueOn)).ToList(),
            study,
            untagged,
            workouts));

        // Dismissed insights stay hidden while their situation (the key) is unchanged.
        var keys = myDay.Insights.Select(i => i.Key).ToList();
        var dismissed = keys.Count == 0 ? [] : (await db.DismissedInsights
            .Where(d => keys.Contains(d.InsightKey))
            .Select(d => d.InsightKey)
            .ToListAsync()).ToHashSet(StringComparer.Ordinal);
        myDay.HiddenInsightCount = myDay.Insights.Count(i => dismissed.Contains(i.Key));
        myDay.Insights = myDay.Insights.Where(i => !dismissed.Contains(i.Key)).ToList();

        return OperationResult<MyDayDto>.Ok(myDay);
    }

    public async Task DismissInsightAsync(string key)
    {
        key = key.Trim();
        if (await db.DismissedInsights.AnyAsync(d => d.InsightKey == key))
        {
            return;
        }

        db.DismissedInsights.Add(new DismissedInsight { UserId = db.CurrentUserId!.Value, InsightKey = key });
        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            // Dismissed twice at once: the other request already did it.
        }
    }

    public async Task<int> RestoreInsightsAsync()
    {
        var now = DateTime.UtcNow;
        return await db.DismissedInsights
            .ExecuteUpdateAsync(s => s.SetProperty(d => d.IsDeleted, true).SetProperty(d => d.DeletedAt, now));
    }

    // ---- Insight facts (Session 93): read before the My Day reader opens, through EF (user + soft-delete filters apply) ----

    /// <summary>Is learning on the go (a course in progress, or a skill below its target), and when was the last study?</summary>
    private async Task<InsightStudy> StudyFactsAsync()
    {
        var onTheGo = await db.Courses.AnyAsync(c => c.Status == Learning.DTOs.CourseStatuses.InProgress)
            || await db.Skills.AnyAsync(s => s.TargetProficiency != null && s.Proficiency < s.TargetProficiency);
        var last = await db.StudySessions.MaxAsync(s => (DateOnly?)s.StudiedOn);
        return new InsightStudy(onTheGo, last);
    }

    /// <summary>This month's expenses with no tag at all.</summary>
    private async Task<InsightUntagged> UntaggedExpensesAsync(DateOnly today)
    {
        var monthStart = new DateOnly(today.Year, today.Month, 1);
        var count = await db.Transactions.CountAsync(t =>
            t.Kind == Finance.DTOs.TransactionKinds.Expense && t.OccurredOn >= monthStart && t.OccurredOn <= today && !t.TransactionTags.Any());
        return new InsightUntagged(count);
    }

    /// <summary>
    /// Health without the unlock: only the last workout's day and a count (listed in ARCHITECTURE.md's "What reads
    /// Health without the unlock") — the insight's wording names nothing else.
    /// </summary>
    private async Task<InsightWorkouts> WorkoutFactsAsync(DateOnly today)
    {
        var since = today.AddDays(-59);
        var last = await db.Workouts.Where(w => w.OccurredOn <= today).MaxAsync(w => (DateOnly?)w.OccurredOn);
        var recent = await db.Workouts.CountAsync(w => w.OccurredOn >= since && w.OccurredOn <= today);
        return new InsightWorkouts(last, recent);
    }

    public async Task<OperationResult<LifeBalanceDto>> GetLifeBalanceAsync(
        DateOnly from, DateOnly to, DateTime? fromUtc, DateTime? toUtc)
    {
        if (to < from)
        {
            return OperationResult<LifeBalanceDto>.Fail("The end date must be on or after the start date.");
        }

        if (to.DayNumber - from.DayNumber + 1 > MaxBalanceDays)
        {
            return OperationResult<LifeBalanceDto>.Fail($"Ask for at most {MaxBalanceDays} days at a time.");
        }

        var startUtc = fromUtc?.ToUniversalTime() ?? from.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
        var endUtc = toUtc?.ToUniversalTime() ?? to.AddDays(1).ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
        if (endUtc <= startUtc)
        {
            return OperationResult<LifeBalanceDto>.Fail("The end of the range must be after its start.");
        }

        var parameters = new DynamicParameters();
        parameters.Add("UserId", db.CurrentUserId!.Value, DbType.Int32);
        parameters.Add("FromDate", from.ToDateTime(TimeOnly.MinValue), DbType.Date);
        parameters.Add("ToDate", to.ToDateTime(TimeOnly.MinValue), DbType.Date);
        parameters.Add("FromUtc", startUtc, DbType.DateTime2);
        parameters.Add("ToUtc", endUtc, DbType.DateTime2);

        var rows = (await db.Database.GetDbConnection().QueryAsync<LifeBalanceRow>(
            "dashboard.GetLifeBalance", parameters, commandType: CommandType.StoredProcedure)).ToList();

        var points = rows
            .Select(r => LifeBalance.Points(r.ActiveGoals, r.GoalsCompleted, r.MilestonesCompleted, r.HabitTicks, r.JournalEntries))
            .ToList();
        var scores = LifeBalance.Scores(points);

        return OperationResult<LifeBalanceDto>.Ok(new LifeBalanceDto
        {
            From = from,
            To = to,
            Areas = rows.Select((r, i) => new LifeBalanceAreaDto
            {
                LifeAreaId = r.LifeAreaId,
                LifeAreaName = r.LifeAreaName,
                ActiveGoals = r.ActiveGoals,
                GoalsCompleted = r.GoalsCompleted,
                MilestonesCompleted = r.MilestonesCompleted,
                HabitTicks = r.HabitTicks,
                JournalEntries = r.JournalEntries,
                Points = points[i],
                Score = scores[i],
            }).ToList(),
        });
    }

    private sealed class LifeBalanceRow
    {
        public int LifeAreaId { get; init; }
        public string LifeAreaName { get; init; } = string.Empty;
        public int ActiveGoals { get; init; }
        public int GoalsCompleted { get; init; }
        public int MilestonesCompleted { get; init; }
        public int HabitTicks { get; init; }
        public int JournalEntries { get; init; }
    }

    // Row types take ADO.NET's shapes as they come (DATE → DateTime, DATETIME2 → Unspecified kind); the mapping above
    // gives them their real meaning, since EF's UTC value converter doesn't cover Dapper.
    private sealed class TaskRow
    {
        public int Id { get; init; }
        public string Title { get; init; } = string.Empty;
        public DateTime DueDate { get; init; }
        public string Priority { get; init; } = string.Empty;
        public bool IsDone { get; init; }
        public bool IsRecurring { get; init; }
        public int? ProjectId { get; init; }
        public string? ProjectName { get; init; }
    }

    private sealed class EventRow
    {
        public int Id { get; init; }
        public string Title { get; init; } = string.Empty;
        public bool IsAllDay { get; init; }
        public DateTime? StartDate { get; init; }
        public DateTime? EndDate { get; init; }
        public DateTime? StartsAt { get; init; }
        public DateTime? EndsAt { get; init; }
        public string? Location { get; init; }
    }

    private sealed class ReminderRow
    {
        public int Id { get; init; }
        public string Title { get; init; } = string.Empty;
        public DateTime RemindAt { get; init; }
        public string? EntityType { get; init; }
        public int? EntityId { get; init; }
    }

    /// <summary>
    /// Every active goal's progress through the one rule (My Day shows active goals only). Worked out before the My Day
    /// reader opens, since the rule runs its own queries.
    /// </summary>
    private async Task<Dictionary<int, ActiveGoalProgress>> ActiveGoalProgressAsync(DateOnly today)
    {
        var active = await db.Goals
            .Where(g => g.Status == GoalStatuses.Active)
            .Select(g => new
            {
                g.Id, g.MeasureTarget, g.MeasureUnit, g.MeasureSource,
                Milestones = g.GoalMilestones.Count,
                Done = g.GoalMilestones.Count(m => m.CompletedAt != null),
            })
            .ToListAsync();
        var progress = await goalProgressService.ForGoalsAsync(
            active.Select(g => new GoalProgressInput(g.Id, GoalStatuses.Active, g.Milestones, g.Done)).ToList(), today);
        return active.ToDictionary(g => g.Id, g =>
        {
            var p = progress[g.Id];
            return new ActiveGoalProgress(p.Percent, p.Kind, p.Locked, p.MeasureCurrent, g.MeasureTarget, g.MeasureUnit, g.MeasureSource);
        });
    }

    private sealed record ActiveGoalProgress(
        int Percent, string Kind, bool Locked, decimal? MeasureCurrent, decimal? MeasureTarget, string? MeasureUnit,
        string? MeasureSource);

    private sealed class GoalRow
    {
        public int Id { get; init; }
        public string Title { get; init; } = string.Empty;
        public string GoalType { get; init; } = string.Empty;
        public DateTime? TargetDate { get; init; }
        public string LifeAreaName { get; init; } = string.Empty;
        public int MilestoneCount { get; init; }
        public int CompletedMilestoneCount { get; init; }
        public int? NextMilestoneId { get; init; }
        public string? NextMilestoneTitle { get; init; }
        public DateTime? NextMilestoneTargetDate { get; init; }
        public DateTime LastActivityAt { get; init; }
    }

    private sealed class HabitRow
    {
        public int Id { get; init; }
        public string Title { get; init; } = string.Empty;
        public byte ScheduleDays { get; init; }
        public DateTime StartDate { get; init; }
        public string? LifeAreaName { get; init; }
        public decimal? TargetValue { get; init; }
        public string? Unit { get; init; }
    }

    private sealed class HabitEntryRow
    {
        public int HabitId { get; init; }
        public DateTime EntryDate { get; init; }
    }

    private sealed class JournalRow
    {
        public int Id { get; init; }
        public DateTime EntryDate { get; init; }
        public string? Title { get; init; }
        public string? Excerpt { get; init; }
        public byte? Mood { get; init; }
    }

    private sealed class DocumentRow
    {
        public int Id { get; init; }
        public string Title { get; init; } = string.Empty;
        public string Kind { get; init; } = string.Empty;
        public DateTime ExpiresOn { get; init; }
    }

    private static DateOnly? AsDate(DateTime? value) => value is null ? null : DateOnly.FromDateTime(value.Value);

    private static DateTime? AsUtc(DateTime? value) =>
        value is null ? null : DateTime.SpecifyKind(value.Value, DateTimeKind.Utc);
}
