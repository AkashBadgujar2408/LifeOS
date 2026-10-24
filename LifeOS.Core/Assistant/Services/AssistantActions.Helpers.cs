using LifeOS.Core.Calendar.DTOs;
using LifeOS.Core.Calendar.Services;
using LifeOS.Core.Finance.DTOs;
using LifeOS.Core.Finance.ServiceContracts;
using LifeOS.Core.Goals.DTOs;
using LifeOS.Core.Habits.DTOs;
using LifeOS.Core.Home.DTOs;
using LifeOS.Core.Learning.DTOs;
using LifeOS.Core.Learning.ServiceContracts;
using LifeOS.Core.Leisure.DTOs;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using LifeOS.Core.Tasks.DTOs;
using LifeOS.Core.Tasks.ServiceContracts;
using static System.FormattableString;

namespace LifeOS.Core.Assistant.Services;

/// <summary>The actions' small pieces: tag ids put in place, names looked up, words for the cards, event shapes.</summary>
public static partial class AssistantActions
{
    // ---- Tag ids, set once the tags exist (the lists are the requests' own) ----

    private static T Tagged<T>(T request, List<int> target, List<int> ids)
    {
        target.Clear();
        target.AddRange(ids);
        return request;
    }

    private static GoalRequest Copy(GoalRequest r, List<int> ids) => Tagged(r, r.TagIds, ids);
    private static TaskRequest Copy(TaskRequest r, List<int> ids) => Tagged(r, r.TagIds, ids);
    private static HabitRequest Copy(HabitRequest r, List<int> ids) => Tagged(r, r.TagIds, ids);
    private static SkillRequest Copy(SkillRequest r, List<int> ids) => Tagged(r, r.TagIds, ids);
    private static MediaItemRequest Copy(MediaItemRequest r, List<int> ids) => Tagged(r, r.TagIds, ids);
    private static TransactionRequest Copy(TransactionRequest r, List<int> ids) => Tagged(r, r.TagIds, ids);
    private static ContactRequest Copy(ContactRequest r, List<int> ids) => Tagged(r, r.TagIds, ids);
    private static AssetRequest Copy(AssetRequest r, List<int> ids) => Tagged(r, r.TagIds, ids);

    // ---- Things by name ----

    /// <summary>One of the user's own items by name: exact (any case), else the only one containing the words.</summary>
    private static T? ByName<T>(IReadOnlyList<T> items, Func<T, string> name, string wanted, string what) where T : class
    {
        var exact = items.FirstOrDefault(i => string.Equals(name(i), wanted, StringComparison.OrdinalIgnoreCase));
        if (exact is not null)
        {
            return exact;
        }

        var partial = items.Where(i => name(i).Contains(wanted, StringComparison.OrdinalIgnoreCase)).ToList();
        if (partial.Count == 1)
        {
            return partial[0];
        }

        var names = items.Count == 0 ? "there are none yet" : $"the user has: {string.Join(", ", items.Take(30).Select(name))}";
        throw new ToolArgumentException(partial.Count > 1
            ? $"More than one {what} matches {wanted}: {string.Join(", ", partial.Select(name))}. Ask which one."
            : $"There's no {what} called {wanted} — {names}.");
    }

    private static async Task<(int Id, string Name)?> ProjectAsync(AssistantToolContext ctx, string? name)
    {
        if (name is null)
        {
            return null;
        }

        var active = (await ctx.Get<IProjectsService>().GetAllAsync()).Where(p => p.Status == ProjectStatuses.Active).ToList();
        var project = ByName(active, p => p.Name, name, "active project")!;
        return (project.Id, project.Name);
    }

    private static async Task<(int Id, string Name)?> SkillAsync(AssistantToolContext ctx, string? name)
    {
        if (name is null)
        {
            return null;
        }

        var skill = ByName(await ctx.Get<ISkillsService>().GetAllAsync(), s => s.Name, name, "skill")!;
        return (skill.Id, skill.Name);
    }

    /// <summary>The account named, or the user's only open account when none is named.</summary>
    private static async Task<AccountDto> AccountAsync(AssistantToolContext ctx, string? name)
    {
        var open = (await ctx.Get<IAccountsService>().GetAllAsync(ctx.Today)).Where(a => !a.IsArchived).ToList();
        if (name is not null)
        {
            return ByName(open, a => a.Name, name, "account")!;
        }

        return open.Count switch
        {
            1 => open[0],
            0 => throw new ToolArgumentException("The user has no money accounts yet — they add one on the Accounts page (/finance) first."),
            _ => throw new ToolArgumentException($"Which account? The user has: {string.Join(", ", open.Select(a => a.Name))}."),
        };
    }

    /// <summary>New learning items go in the Learning life area, as the editors preselect it (when it's shown).</summary>
    private static async Task<(int Id, string Name)?> DefaultLearningAreaAsync(AssistantToolContext ctx)
    {
        var settings = await ctx.Get<ISettingsService>().GetAsync();
        var hidden = settings.Data?.HiddenLifeAreaIds ?? [];
        var area = (await ctx.Get<ILifeAreasService>().GetAllAsync())
            .FirstOrDefault(a => a.Name == "Learning" && !hidden.Contains(a.Id));
        return area is null ? null : (area.Id, area.Name);
    }

    // ---- Numbers ----

    private static byte? Level(int? value) => value switch
    {
        null => null,
        >= 1 and <= 5 => (byte)value.Value,
        _ => throw new ToolArgumentException("Levels and ratings are 1 to 5."),
    };

    private static byte? Percent(int? value) => value switch
    {
        null => null,
        >= 0 and <= 100 => (byte)value.Value,
        _ => throw new ToolArgumentException("Progress is 0 to 100%."),
    };

    // ---- Words ----

    private static string GoalTypeText(string type) => type switch
    {
        GoalTypes.LongTerm => "Long-term",
        GoalTypes.BucketList => "Bucket list",
        _ => "Short-term",
    };

    /// <summary>The journal's mood words (features/journal/journal-days.ts MOODS).</summary>
    private static string MoodText(int mood) => mood switch
    {
        1 => "1 — Awful",
        2 => "2 — Bad",
        3 => "3 — Okay",
        4 => "4 — Good",
        _ => "5 — Great",
    };

    private static string CourseStatusText(string status) => status == CourseStatuses.InProgress ? "In progress" : status;

    /// <summary>Status words that follow the kind, as the backlog shows them (statusLabel in leisure-view.ts).</summary>
    private static string MediaStatusText(string status, string kind) => status switch
    {
        MediaStatuses.InProgress => kind switch
        {
            MediaKinds.Book => "Reading now",
            MediaKinds.Film or MediaKinds.Series => "Watching",
            MediaKinds.Game => "Playing",
            MediaKinds.Album or MediaKinds.Podcast => "Listening",
            _ => "In progress",
        },
        MediaStatuses.Want => kind switch
        {
            MediaKinds.Book => "Want to read",
            MediaKinds.Film or MediaKinds.Series => "Want to watch",
            MediaKinds.Game => "Want to play",
            MediaKinds.Album or MediaKinds.Podcast => "Want to listen",
            _ => "Want",
        },
        _ => status,
    };

    // ---- Events ----

    /// <summary>
    /// An event's day and times from the arguments, in the user's zone: no start = all-day (endDate or the same day);
    /// a start with an end (past midnight = the next day) or a length — on an update the event's own start and length
    /// fill what isn't sent.
    /// </summary>
    private static EventRequest EventShape(AssistantToolContext ctx, ToolArgs args, DateOnly day, EventRequest r, EventDto? current = null)
    {
        var start = args.Time("start");
        var allDay = args.Bool("allDay") ?? (start is null && (current?.IsAllDay ?? true));
        if (allDay)
        {
            var endDate = args.Date("endDate")
                ?? (current is { IsAllDay: true, StartDate: { } first, EndDate: { } last } ? day.AddDays(last.DayNumber - first.DayNumber) : day);
            return Timing(r, true, day, endDate, null, null);
        }

        if (start is null)
        {
            start = current?.StartsAt is { } startsAt
                ? TimeOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(startsAt, ctx.Zone))
                : throw new ToolArgumentException("start (HH:mm) is required for an event at a time; leave start out for an all-day one.");
        }

        var startLocal = day.ToDateTime(start.Value);
        DateTime endLocal;
        if (args.Time("end") is { } end)
        {
            endLocal = day.ToDateTime(end);
            if (endLocal <= startLocal)
            {
                endLocal = endLocal.AddDays(1);
            }
        }
        else
        {
            var minutes = args.Int("minutes")
                ?? (current is { StartsAt: { } from, EndsAt: { } to } ? (int)(to - from).TotalMinutes : 60);
            if (minutes is < 1 or > 10080)
            {
                throw new ToolArgumentException("An event lasts 1 minute to 7 days.");
            }

            endLocal = startLocal.AddMinutes(minutes);
        }

        return Timing(r, false, null, null, EventRecurrence.LocalToUtc(startLocal, ctx.Zone), EventRecurrence.LocalToUtc(endLocal, ctx.Zone));
    }

    private static EventRequest Timing(EventRequest r, bool allDay, DateOnly? startDate, DateOnly? endDate, DateTime? startsAt, DateTime? endsAt) => new()
    {
        Title = r.Title,
        Notes = r.Notes,
        Location = r.Location,
        IsAllDay = allDay,
        StartDate = startDate,
        EndDate = endDate,
        StartsAt = startsAt,
        EndsAt = endsAt,
        Recurrence = r.Recurrence,
        TimeZone = r.TimeZone,
        ReminderMinutesBefore = r.ReminderMinutesBefore,
        LifeAreaId = r.LifeAreaId,
    };

    private static EventRequest Shape(EventDto e) => new()
    {
        Title = e.Title,
        IsAllDay = e.IsAllDay,
        StartDate = e.StartDate,
        EndDate = e.EndDate,
        StartsAt = e.StartsAt,
        EndsAt = e.EndsAt,
    };

    /// <summary>"24/Oct/2026, all day", "24/Oct/2026 – 26/Oct/2026, all day", "24/Oct/2026 13:00–14:00".</summary>
    private static string EventWhen(EventRequest e, TimeZoneInfo zone)
    {
        if (e.IsAllDay)
        {
            return e.EndDate is { } last && last != e.StartDate
                ? $"{Day(e.StartDate)} – {Day(last)}, all day"
                : $"{Day(e.StartDate)}, all day";
        }

        var start = TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(e.StartsAt!.Value, DateTimeKind.Utc), zone);
        var end = TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(e.EndsAt!.Value, DateTimeKind.Utc), zone);
        return start.Date == end.Date
            ? Invariant($"{AssistantRules.Day(DateOnly.FromDateTime(start))} {start:HH:mm}–{end:HH:mm}")
            : Invariant($"{AssistantRules.Day(DateOnly.FromDateTime(start))} {start:HH:mm} – {AssistantRules.Day(DateOnly.FromDateTime(end))} {end:HH:mm}");
    }
}
