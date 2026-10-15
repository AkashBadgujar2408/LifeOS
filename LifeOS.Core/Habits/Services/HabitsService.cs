using AutoMapper;
using AutoMapper.QueryableExtensions;
using LifeOS.Core.Calendar.ServiceContracts;
using LifeOS.Core.Habits.DTOs;
using LifeOS.Core.Habits.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using LifeOS.Core.Shared.Services;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Habits.Services;

public class HabitsService(AppDbContext db, IMapper mapper, IEntityLinksService entityLinksService,
    IRemindersService remindersService) : IHabitsService
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

        // Days already ticked stay as they are: a new schedule or a later start only changes which of them count.
        Apply(habit, request);
        habit.UpdatedAt = DateTime.UtcNow;

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

    public async Task<OperationResult<HabitEntryResultDto>> SetEntryAsync(int id, DateOnly date, bool done, DateOnly today)
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

        // Only ticking is restricted: a day ticked before the start date or schedule changed can still be un-ticked.
        if (done && date < habit.StartDate)
        {
            return OperationResult<HabitEntryResultDto>.Fail("That's before the habit started.");
        }

        if (done && !HabitStreaks.IsScheduled(habit.ScheduleDays, date))
        {
            return OperationResult<HabitEntryResultDto>.Fail("That day isn't on this habit's schedule.");
        }

        var entry = await db.HabitEntries.FirstOrDefaultAsync(e => e.HabitId == id && e.EntryDate == date);
        if (done && entry is null)
        {
            db.HabitEntries.Add(new HabitEntry { UserId = habit.UserId, HabitId = id, EntryDate = date });
            try
            {
                await db.SaveChangesAsync();
            }
            catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
            {
                // Ticked by a concurrent request (a double click): the day is done either way.
                db.ChangeTracker.Clear();
            }
        }
        else if (!done && entry is not null)
        {
            // Un-ticking soft-deletes the row; the filtered unique index lets the day be ticked again later.
            entry.IsDeleted = true;
            entry.DeletedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
        }

        var doneDates = await db.HabitEntries
            .Where(e => e.HabitId == id)
            .Select(e => e.EntryDate)
            .ToListAsync();

        return OperationResult<HabitEntryResultDto>.Ok(new HabitEntryResultDto
        {
            EntryDate = date,
            Done = done,
            Streak = HabitStreaks.Calculate(habit.ScheduleDays, habit.StartDate, doneDates, today),
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

        await db.HabitEntries
            .Where(e => e.HabitId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(e => e.IsDeleted, true).SetProperty(e => e.DeletedAt, now));

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
                .Select(e => new { e.HabitId, e.EntryDate })
                .ToListAsync())
            .ToLookup(e => e.HabitId, e => e.EntryDate);

        foreach (var habit in habits)
        {
            var dates = entries[habit.Id].ToList();
            habit.Streak = HabitStreaks.Calculate(habit.ScheduleDays, habit.StartDate, dates, today);
            habit.DoneDates = dates.Where(d => d >= from && d <= today).Order().ToList();
        }
    }

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

        return null;
    }

    private static void Apply(Habit habit, HabitRequest request)
    {
        habit.Title = request.Title.Trim();
        habit.Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();
        habit.LifeAreaId = request.LifeAreaId;
        habit.ScheduleDays = request.ScheduleDays;
        habit.StartDate = request.StartDate!.Value;
    }
}
