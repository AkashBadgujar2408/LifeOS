using AutoMapper;
using AutoMapper.QueryableExtensions;
using LifeOS.Core.Calendar.ServiceContracts;
using LifeOS.Core.Goals.ServiceContracts;
using LifeOS.Core.Habits.DTOs;
using LifeOS.Core.Habits.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using LifeOS.Core.Shared.Services;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Habits.Services;

public class HabitsService(AppDbContext db, IMapper mapper, IEntityLinksService entityLinksService,
    IRemindersService remindersService, IGoalMeasureService goalMeasureService) : IHabitsService
{
    private const string NotFound = HabitErrors.NotFound;
    private const string DuplicateTitle = "A habit with this name already exists.";

    /// <summary>How far back a window of done days may reach: a year of history, plus a little for a full-week grid.</summary>
    private const int MaxWindowDays = 400;

    /// <summary>The window mutation responses carry: the week ending today, what the habits grid shows by default.</summary>
    private const int DefaultWindowDays = 7;

    public async Task<OperationResult<List<HabitDto>>> GetAllAsync(DateOnly today, DateOnly from)
    {
        var windowError = ValidateWindow(today, from);
        if (windowError is not null)
        {
            return OperationResult<List<HabitDto>>.Fail(windowError);
        }

        var habits = await db.Habits
            .OrderBy(h => h.Title)
            .ProjectTo<HabitDto>(mapper.ConfigurationProvider)
            .ToListAsync();

        await FillEntriesAsync(habits, today, from);
        return OperationResult<List<HabitDto>>.Ok(habits);
    }

    public async Task<OperationResult<HabitDto>> GetAsync(int id, DateOnly today, DateOnly from)
    {
        var windowError = ValidateWindow(today, from);
        if (windowError is not null)
        {
            return OperationResult<HabitDto>.Fail(windowError);
        }

        var habit = await db.Habits
            .Where(h => h.Id == id)
            .ProjectTo<HabitDto>(mapper.ConfigurationProvider)
            .FirstOrDefaultAsync();
        if (habit is null)
        {
            return OperationResult<HabitDto>.Fail(NotFound);
        }

        await FillEntriesAsync([habit], today, from);
        return OperationResult<HabitDto>.Ok(habit);
    }

    public async Task<OperationResult<HabitDto>> CreateAsync(HabitRequest request, DateOnly today)
    {
        var error = await ValidateAsync(request, null);
        if (error is not null)
        {
            return OperationResult<HabitDto>.Fail(error);
        }

        var habit = new Habit
        {
            UserId = db.CurrentUserId!.Value,
            Status = HabitStatuses.Active,
        };
        Apply(habit, request);
        foreach (var tagId in request.TagIds.Distinct())
        {
            habit.HabitTags.Add(new HabitTag { UserId = habit.UserId, TagId = tagId });
        }

        db.Habits.Add(habit);

        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            return OperationResult<HabitDto>.Fail(DuplicateTitle);
        }

        return await GetAsync(habit.Id, today, today.AddDays(1 - DefaultWindowDays));
    }

    public async Task<OperationResult<HabitDto>> UpdateAsync(int id, HabitRequest request, DateOnly today)
    {
        var habit = await db.Habits.FindAsync(id);
        if (habit is null)
        {
            return OperationResult<HabitDto>.Fail(NotFound);
        }

        var error = await ValidateAsync(request, id);
        if (error is not null)
        {
            return OperationResult<HabitDto>.Fail(error);
        }

        // Its logged days mean different things for the two kinds (done vs slipped), so the kind is fixed once used.
        if (request.Kind != habit.Kind && await db.HabitEntries.AnyAsync(e => e.HabitId == id))
        {
            return OperationResult<HabitDto>.Fail("A habit's kind can't change once days are logged. Start a new habit instead.");
        }

        // Days already ticked stay as they are: a new schedule, start or target only changes which of them count.
        Apply(habit, request);
        habit.UpdatedAt = DateTime.UtcNow;

        var now = DateTime.UtcNow;
        var wanted = request.TagIds.ToHashSet();
        var current = await db.HabitTags.Where(t => t.HabitId == id).ToListAsync();
        foreach (var tag in current.Where(t => !wanted.Contains(t.TagId)))
        {
            tag.IsDeleted = true;
            tag.DeletedAt = now;
        }

        foreach (var tagId in wanted.Except(current.Select(t => t.TagId)))
        {
            db.HabitTags.Add(new HabitTag { UserId = habit.UserId, HabitId = id, TagId = tagId });
        }

        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            return OperationResult<HabitDto>.Fail(DuplicateTitle);
        }

        return await GetAsync(id, today, today.AddDays(1 - DefaultWindowDays));
    }

    public async Task<OperationResult<HabitDto>> SetStatusAsync(int id, string status, DateOnly today)
    {
        var habit = await db.Habits.FindAsync(id);
        if (habit is null)
        {
            return OperationResult<HabitDto>.Fail(NotFound);
        }

        habit.Status = status;
        habit.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        return await GetAsync(id, today, today.AddDays(1 - DefaultWindowDays));
    }

    public async Task<OperationResult<HabitEntryResultDto>> SetEntryAsync(int id, DateOnly date, bool done, decimal? value, DateOnly today)
    {
        var habit = await db.Habits.FindAsync(id);
        if (habit is null)
        {
            return OperationResult<HabitEntryResultDto>.Fail(NotFound);
        }

        if (habit.Status != HabitStatuses.Active)
        {
            return OperationResult<HabitEntryResultDto>.Fail("This habit is archived. Restore it to tick off days.");
        }

        if (date > today)
        {
            return OperationResult<HabitEntryResultDto>.Fail("That day hasn't happened yet.");
        }

        var avoid = habit.Kind == HabitKinds.Avoid;
        // Logging 0 on a measurable habit is the same as clearing the day.
        if (habit.TargetValue is not null && value == 0)
        {
            done = false;
        }

        // Only logging is restricted: a day logged before the start date or schedule changed can still be cleared.
        if (done && date < habit.StartDate)
        {
            return OperationResult<HabitEntryResultDto>.Fail("That's before the habit started.");
        }

        // An avoid habit runs every day, so a slip can be logged on any day.
        if (done && !avoid && !HabitStreaks.IsScheduled(habit.ScheduleDays, date))
        {
            return OperationResult<HabitEntryResultDto>.Fail("That day isn't on this habit's schedule.");
        }

        // Plain and avoid habits store no value; a measurable one stores what was done (the target when not given).
        decimal? stored = habit.TargetValue is null ? null : value ?? habit.TargetValue;

        var entry = await db.HabitEntries.FirstOrDefaultAsync(e => e.HabitId == id && e.EntryDate == date);
        if (done && entry is null)
        {
            db.HabitEntries.Add(new HabitEntry { UserId = habit.UserId, HabitId = id, EntryDate = date, Value = stored });
            try
            {
                await db.SaveChangesAsync();
            }
            catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
            {
                // Logged by a concurrent request (a double click): the day is logged either way.
                db.ChangeTracker.Clear();
            }
        }
        else if (done && entry is not null && entry.Value != stored)
        {
            entry.Value = stored;
            entry.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
        }
        else if (!done && entry is not null)
        {
            // Clearing soft-deletes the row; the filtered unique index lets the day be logged again later.
            entry.IsDeleted = true;
            entry.DeletedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
        }

        var entries = await db.HabitEntries
            .Where(e => e.HabitId == id)
            .Select(e => new LoggedDay(e.EntryDate, e.Value))
            .ToListAsync();
        var logged = entries.FirstOrDefault(e => e.Date == date);

        return OperationResult<HabitEntryResultDto>.Ok(new HabitEntryResultDto
        {
            EntryDate = date,
            Done = logged is not null && (avoid || HabitStreaks.IsMet(logged.Value, habit.TargetValue)),
            Value = logged?.Value,
            Streak = avoid ? new HabitStreak(0, 0, false, false, null) : BuildStreak(habit, entries, today),
            CleanRun = avoid ? HabitStreaks.CleanRuns(habit.StartDate, entries.Select(e => e.Date), today) : null,
        });
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var habit = await db.Habits.FindAsync(id);
        if (habit is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        var now = DateTime.UtcNow;
        await using var transaction = await db.Database.BeginTransactionAsync();

        // Goals counted from it keep what it counted (as Carried over) — read before its entries go.
        await goalMeasureService.ReleaseEntityAsync(HabitLinkableProvider.Type, id);

        await db.HabitEntries
            .Where(e => e.HabitId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(e => e.IsDeleted, true).SetProperty(e => e.DeletedAt, now));
        await db.HabitTags
            .Where(t => t.HabitId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.IsDeleted, true).SetProperty(t => t.DeletedAt, now));
        await db.HabitChallenges
            .Where(c => c.HabitId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(c => c.IsDeleted, true).SetProperty(c => c.DeletedAt, now));
        await db.RoutineHabits
            .Where(r => r.HabitId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(r => r.IsDeleted, true).SetProperty(r => r.DeletedAt, now));
        // A hobby practised through it carries on without a habit.
        await db.Hobbies
            .Where(h => h.HabitId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(h => h.HabitId, (int?)null).SetProperty(h => h.UpdatedAt, now));

        habit.IsDeleted = true;
        habit.DeletedAt = now;
        await db.SaveChangesAsync();
        await entityLinksService.RemoveAllForEntityAsync(HabitLinkableProvider.Type, id);
        await remindersService.RemoveAllForEntityAsync(HabitLinkableProvider.Type, id);

        await transaction.CommitAsync();
        return OperationResult<bool>.Ok(true);
    }

    /// <summary>
    /// One query for every listed habit's ticked days. Streaks need the whole history (a streak can be years long),
    /// but that's one small DATE per day done, so it's read in full rather than paged.
    /// </summary>
    private async Task FillEntriesAsync(List<HabitDto> habits, DateOnly today, DateOnly from)
    {
        if (habits.Count == 0)
        {
            return;
        }

        var habitIds = habits.Select(h => h.Id).ToList();
        var entries = (await db.HabitEntries
                .Where(e => habitIds.Contains(e.HabitId))
                .Select(e => new { e.HabitId, e.EntryDate, e.Value })
                .ToListAsync())
            .ToLookup(e => e.HabitId, e => new LoggedDay(e.EntryDate, e.Value));
        var challenges = (await db.HabitChallenges
                .Where(c => habitIds.Contains(c.HabitId))
                .Select(c => new ChallengeRow(c.Id, c.HabitId, c.Days, c.StartDate))
                .ToListAsync())
            .ToLookup(c => c.HabitId);

        foreach (var habit in habits)
        {
            var logged = entries[habit.Id].ToList();
            var inWindow = logged.Where(d => d.Date >= from && d.Date <= today).OrderBy(d => d.Date).ToList();
            habit.Challenges = EvaluateChallenges(habit.Kind, habit.ScheduleDays, habit.StartDate, habit.TargetValue,
                logged, challenges[habit.Id], today);
            if (habit.Kind == HabitKinds.Avoid)
            {
                habit.CleanRun = HabitStreaks.CleanRuns(habit.StartDate, logged.Select(d => d.Date), today);
                habit.SlipDates = inWindow.Select(d => d.Date).ToList();
                continue;
            }

            habit.Streak = HabitStreaks.Calculate(habit.ScheduleDays, habit.StartDate,
                logged.Where(d => HabitStreaks.IsMet(d.Value, habit.TargetValue)).Select(d => d.Date), today);
            habit.DoneDates = inWindow.Where(d => HabitStreaks.IsMet(d.Value, habit.TargetValue)).Select(d => d.Date).ToList();
            if (habit.TargetValue is not null)
            {
                habit.Values = inWindow.Where(d => d.Value is not null).ToDictionary(d => d.Date, d => d.Value!.Value);
            }
        }
    }

    public async Task<OperationResult<List<HabitChallengeDto>>> StartChallengeAsync(int id, StartChallengeRequest request)
    {
        var habit = await db.Habits.FindAsync(id);
        if (habit is null)
        {
            return OperationResult<List<HabitChallengeDto>>.Fail(NotFound);
        }

        var today = request.Today!.Value;
        var start = request.StartDate ?? today;
        if (!HabitChallenges.Lengths.Contains(request.Days))
        {
            return OperationResult<List<HabitChallengeDto>>.Fail("A challenge is 7, 30 or 90 days.");
        }

        if (habit.Status != HabitStatuses.Active)
        {
            return OperationResult<List<HabitChallengeDto>>.Fail("This habit is archived. Restore it to take on a challenge.");
        }

        if (start < habit.StartDate)
        {
            return OperationResult<List<HabitChallengeDto>>.Fail("A challenge can't start before the habit does.");
        }

        if (start > today)
        {
            return OperationResult<List<HabitChallengeDto>>.Fail("Start a challenge today, or on a day that's already been.");
        }

        var current = await ChallengesOfAsync(habit, today);
        if (current.Any(c => c.State == ChallengeStates.Active))
        {
            return OperationResult<List<HabitChallengeDto>>.Fail("This habit already has a challenge under way.");
        }

        db.HabitChallenges.Add(new HabitChallenge { UserId = habit.UserId, HabitId = id, Days = request.Days, StartDate = start });
        await db.SaveChangesAsync();
        return OperationResult<List<HabitChallengeDto>>.Ok(await ChallengesOfAsync(habit, today));
    }

    public async Task<OperationResult<List<HabitChallengeDto>>> RemoveChallengeAsync(int id, int challengeId, DateOnly today)
    {
        var challenge = await db.HabitChallenges.Include(c => c.Habit).FirstOrDefaultAsync(c => c.Id == challengeId && c.HabitId == id);
        if (challenge is null)
        {
            return await db.Habits.AnyAsync(h => h.Id == id)
                ? OperationResult<List<HabitChallengeDto>>.Fail(HabitErrors.ChallengeNotFound)
                : OperationResult<List<HabitChallengeDto>>.Fail(NotFound);
        }

        challenge.IsDeleted = true;
        challenge.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return OperationResult<List<HabitChallengeDto>>.Ok(await ChallengesOfAsync(challenge.Habit, today));
    }

    private async Task<List<HabitChallengeDto>> ChallengesOfAsync(Habit habit, DateOnly today)
    {
        var logged = await db.HabitEntries
            .Where(e => e.HabitId == habit.Id)
            .Select(e => new LoggedDay(e.EntryDate, e.Value))
            .ToListAsync();
        var challenges = await db.HabitChallenges
            .Where(c => c.HabitId == habit.Id)
            .Select(c => new ChallengeRow(c.Id, c.HabitId, c.Days, c.StartDate))
            .ToListAsync();
        return EvaluateChallenges(habit.Kind, habit.ScheduleDays, habit.StartDate, habit.TargetValue, logged, challenges, today);
    }

    /// <summary>Each challenge as of today, newest first: judged on the met days (build) or the slips (avoid).</summary>
    private static List<HabitChallengeDto> EvaluateChallenges(string kind, byte scheduleDays, DateOnly habitStart,
        decimal? target, IEnumerable<LoggedDay> logged, IEnumerable<ChallengeRow> challenges, DateOnly today)
    {
        var avoid = kind == HabitKinds.Avoid;
        var days = (avoid ? logged : logged.Where(d => HabitStreaks.IsMet(d.Value, target))).Select(d => d.Date).ToHashSet();
        return challenges
            .OrderByDescending(c => c.StartDate).ThenByDescending(c => c.Id)
            .Select(c =>
            {
                var progress = HabitChallenges.Evaluate(c.Days, c.StartDate, avoid, scheduleDays, habitStart, days, today);
                return new HabitChallengeDto
                {
                    Id = c.Id,
                    Days = c.Days,
                    StartDate = c.StartDate,
                    EndDate = progress.EndDate,
                    State = progress.State,
                    DaysDone = progress.DaysDone,
                    DaysTotal = progress.DaysTotal,
                    CompletedOn = progress.CompletedOn,
                };
            })
            .ToList();
    }

    private sealed record ChallengeRow(int Id, int HabitId, int Days, DateOnly StartDate);

    private sealed record LoggedDay(DateOnly Date, decimal? Value);

    private static HabitStreak BuildStreak(Habit habit, IEnumerable<LoggedDay> logged, DateOnly today) =>
        HabitStreaks.Calculate(habit.ScheduleDays, habit.StartDate,
            logged.Where(d => HabitStreaks.IsMet(d.Value, habit.TargetValue)).Select(d => d.Date), today);

    private static string? ValidateWindow(DateOnly today, DateOnly from)
    {
        if (from > today)
        {
            return "'from' can't be after 'today'.";
        }

        return today.DayNumber - from.DayNumber >= MaxWindowDays
            ? $"Ask for at most {MaxWindowDays} days at a time."
            : null;
    }

    private async Task<string?> ValidateAsync(HabitRequest request, int? id)
    {
        var title = request.Title.Trim();
        if (title.Length == 0)
        {
            return "Title is required.";
        }

        if (await db.Habits.AnyAsync(h => h.Title == title && h.Id != id))
        {
            return DuplicateTitle;
        }

        if (request.LifeAreaId is { } lifeAreaId && !await db.LifeAreas.AnyAsync(a => a.Id == lifeAreaId))
        {
            return "Life area not found.";
        }

        if (request.Kind is not (HabitKinds.Build or HabitKinds.Avoid))
        {
            return "Kind must be Build or Avoid.";
        }

        if (request.Kind == HabitKinds.Avoid && request.TargetValue is not null)
        {
            return "A habit you're avoiding has no target — each clean day counts.";
        }

        if (!string.IsNullOrWhiteSpace(request.Unit) && request.TargetValue is null)
        {
            return "A unit needs a target.";
        }

        // Tags go through the per-user filter, so another user's tag id counts as missing.
        var tagIds = request.TagIds.Distinct().ToList();
        if (tagIds.Count > 0 && await db.Tags.CountAsync(t => tagIds.Contains(t.Id)) != tagIds.Count)
        {
            return "Tag not found.";
        }

        return null;
    }

    private static void Apply(Habit habit, HabitRequest request)
    {
        habit.Title = request.Title.Trim();
        habit.Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();
        habit.LifeAreaId = request.LifeAreaId;
        habit.Kind = request.Kind;
        // An avoid habit runs every day (CK_Habits_AvoidEveryDay): there's no day off from not smoking.
        habit.ScheduleDays = request.Kind == HabitKinds.Avoid ? HabitStreaks.EveryDay : request.ScheduleDays;
        habit.StartDate = request.StartDate!.Value;
        habit.TargetValue = request.Kind == HabitKinds.Build ? request.TargetValue : null;
        habit.Unit = habit.TargetValue is null || string.IsNullOrWhiteSpace(request.Unit) ? null : request.Unit.Trim();
    }
}
