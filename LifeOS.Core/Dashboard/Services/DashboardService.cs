using System.Data;
using Dapper;
using LifeOS.Core.Dashboard.DTOs;
using LifeOS.Core.Dashboard.ServiceContracts;
using LifeOS.Core.Goals.DTOs;
using LifeOS.Core.Goals.Services;
using LifeOS.Core.Habits.Services;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Dashboard.Services;

/// <summary>
/// My Day comes from one stored procedure (database/procedures/dashboard.GetMyDay.sql) returning seven result sets,
/// read in order with Dapper's QueryMultiple — one round trip across five schemas. The procedure does its own
/// user/soft-delete filtering; this class only turns rows into DTOs and works out what's computed, never stored
/// (goal progress via GoalProgress, habit streaks via HabitStreaks).
/// </summary>
public class DashboardService(AppDbContext db) : IDashboardService
{
    // A local day is 23-25 hours (DST); anything much longer means the client sent the wrong span.
    private static readonly TimeSpan MaxDayLength = TimeSpan.FromHours(26);

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

        var doneByHabit = entries
            .GroupBy(e => e.HabitId)
            .ToDictionary(g => g.Key, g => g.Select(e => DateOnly.FromDateTime(e.EntryDate)).ToList());

        return OperationResult<MyDayDto>.Ok(new MyDayDto
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
            }).ToList(),
            Reminders = reminders.Select(r => new MyDayReminderDto
            {
                Id = r.Id,
                Title = r.Title,
                RemindAt = AsUtc(r.RemindAt)!.Value,
                EntityType = r.EntityType,
                EntityId = r.EntityId,
            }).ToList(),
            Goals = goals.Select(g => new MyDayGoalDto
            {
                Id = g.Id,
                Title = g.Title,
                GoalType = g.GoalType,
                TargetDate = AsDate(g.TargetDate),
                LifeAreaName = g.LifeAreaName,
                MilestoneCount = g.MilestoneCount,
                CompletedMilestoneCount = g.CompletedMilestoneCount,
                ProgressPercent = GoalProgress.Percent(GoalStatuses.Active, g.MilestoneCount, g.CompletedMilestoneCount),
                NextMilestoneId = g.NextMilestoneId,
                NextMilestoneTitle = g.NextMilestoneTitle,
                NextMilestoneTargetDate = AsDate(g.NextMilestoneTargetDate),
                LastActivityAt = AsUtc(g.LastActivityAt)!.Value,
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
        });
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

    private static DateOnly? AsDate(DateTime? value) => value is null ? null : DateOnly.FromDateTime(value.Value);

    private static DateTime? AsUtc(DateTime? value) =>
        value is null ? null : DateTime.SpecifyKind(value.Value, DateTimeKind.Utc);
}
