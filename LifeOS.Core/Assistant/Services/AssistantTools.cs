using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using LifeOS.Core.Calendar.DTOs;
using LifeOS.Core.Calendar.ServiceContracts;
using LifeOS.Core.Calendar.Services;
using LifeOS.Core.Career.ServiceContracts;
using LifeOS.Core.Dashboard.ServiceContracts;
using LifeOS.Core.Family.ServiceContracts;
using LifeOS.Core.Finance.ServiceContracts;
using LifeOS.Core.Goals.DTOs;
using LifeOS.Core.Goals.ServiceContracts;
using LifeOS.Core.Habits.ServiceContracts;
using LifeOS.Core.Home.ServiceContracts;
using LifeOS.Core.Journal.ServiceContracts;
using LifeOS.Core.Learning.ServiceContracts;
using LifeOS.Core.Leisure.DTOs;
using LifeOS.Core.Leisure.ServiceContracts;
using LifeOS.Core.Purchases.ServiceContracts;
using LifeOS.Core.Reports.ServiceContracts;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using LifeOS.Core.Tasks.DTOs;
using LifeOS.Core.Tasks.ServiceContracts;
using Microsoft.Extensions.DependencyInjection;

namespace LifeOS.Core.Assistant.Services;

/// <summary>What a lookup runs with: the user's today and zone, and the request's services (so filters and the vault apply).</summary>
public sealed record AssistantToolContext(DateOnly Today, TimeZoneInfo Zone, IReadOnlySet<string> HiddenModules, IServiceProvider Services)
{
    public T Get<T>() where T : notnull => Services.GetRequiredService<T>();

    public DateTime MidnightUtc(DateOnly day) => EventRecurrence.LocalToUtc(day.ToDateTime(TimeOnly.MinValue), Zone);
}

/// <summary>
/// One read-only lookup the model may call. <see cref="Module"/> is the Settings module it belongs to — a switched-off
/// module's lookups aren't offered. <see cref="Label"/> is how "Lookups" names it to the user.
/// </summary>
public sealed record AssistantTool(
    string Name,
    string Label,
    string? Module,
    string Description,
    object Parameters,
    Func<AssistantToolContext, ToolArgs, Task<object?>> Run);

/// <summary>A lookup's arguments as the model sent them; a bad one throws <see cref="ToolArgumentException"/>.</summary>
public sealed class ToolArgs(JsonElement root)
{
    public static ToolArgs Parse(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(json) ? "{}" : json);
            return new ToolArgs(doc.RootElement.ValueKind == JsonValueKind.Object ? doc.RootElement.Clone() : default);
        }
        catch (JsonException)
        {
            throw new ToolArgumentException("The arguments weren't valid JSON.");
        }
    }

    public string? String(string name) =>
        root.ValueKind == JsonValueKind.Object && root.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String
            ? (string.IsNullOrWhiteSpace(value.GetString()) ? null : value.GetString()!.Trim())
            : null;

    public int? Int(string name)
    {
        if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty(name, out var value))
        {
            return null;
        }

        return value.ValueKind switch
        {
            JsonValueKind.Number when value.TryGetInt32(out var number) => number,
            JsonValueKind.String when int.TryParse(value.GetString(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var number) => number,
            JsonValueKind.Null => null,
            _ => throw new ToolArgumentException($"{name} must be a whole number."),
        };
    }

    public DateOnly? Date(string name)
    {
        var text = String(name);
        if (text is null)
        {
            return null;
        }

        return DateOnly.TryParseExact(text, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var day)
            ? day
            : throw new ToolArgumentException($"{name} must be a day written yyyy-MM-dd.");
    }

    /// <summary>A from–to range, defaulting either end, no longer than <paramref name="maxDays"/>.</summary>
    public (DateOnly From, DateOnly To) Range(DateOnly defaultFrom, DateOnly defaultTo, int maxDays)
    {
        var from = Date("from") ?? defaultFrom;
        var to = Date("to") ?? defaultTo;
        if (to < from)
        {
            throw new ToolArgumentException("to must not be before from.");
        }

        return to.DayNumber - from.DayNumber + 1 > maxDays
            ? throw new ToolArgumentException($"Ask for {maxDays} days or fewer at a time.")
            : (from, to);
    }
}

public sealed class ToolArgumentException(string message) : Exception(message);

/// <summary>
/// The assistant's read-only lookups — every one goes through the module's own service, so the user filter, soft
/// delete and the module's rules apply exactly as on its page. Session 95 adds the write tools.
/// </summary>
public static class AssistantTools
{
    public const string HealthReport = "health_report";

    private static object Schema(params (string Name, string Type, string Description, string[]? Values)[] properties) => new
    {
        type = "object",
        properties = properties.ToDictionary(
            p => p.Name,
            p => p.Values is null
                ? (object)new { type = p.Type, description = p.Description }
                : new { type = p.Type, description = p.Description, @enum = p.Values }),
    };

    private static readonly (string, string, string, string[]?) FromArg = ("from", "string", "First day, yyyy-MM-dd.", null);
    private static readonly (string, string, string, string[]?) ToArg = ("to", "string", "Last day, yyyy-MM-dd.", null);

    private static readonly string[] ReportKinds = ["goals", "habits", "productivity", "learning", "money", "life_balance"];

    public static readonly IReadOnlyList<AssistantTool> All =
    [
        new("app_help", "LifeOS guide", null,
            "How to use LifeOS: where things are and what each area does. Use for questions about the app itself or to tell the user where to do something.",
            Schema(("topic", "string", "The area of LifeOS.", AssistantPrompts.AppGuide.Keys.ToArray())),
            (ctx, args) => Task.FromResult<object?>(new
            {
                guide = AssistantPrompts.AppGuide.TryGetValue(args.String("topic") ?? "overview", out var text)
                    ? text
                    : AssistantPrompts.AppGuide["overview"],
            })),

        new("search", "Search", null,
            "Find items of any kind (goals, tasks, events, journal entries, contacts, documents, transactions, media...) by words in their title.",
            Schema(("query", "string", "Words to look for.", null)),
            async (ctx, args) =>
            {
                var result = await ctx.Get<ISearchService>().SearchAsync(args.String("query"));
                return result.Success ? result.Data : new { error = result.Error };
            }),

        new("my_day", "My Day", null,
            "Today at a glance: tasks due, events, due reminders, goals, habits to tick, the latest journal entry, expiring documents, home items and birthdays coming up, and insights.",
            Schema(),
            async (ctx, _) =>
            {
                var result = await ctx.Get<IDashboardService>()
                    .GetMyDayAsync(ctx.Today, ctx.MidnightUtc(ctx.Today), ctx.MidnightUtc(ctx.Today.AddDays(1)));
                return result.Success ? result.Data : new { error = result.Error };
            }),

        new("goals", "Goals", ModuleKeys.Goals,
            "The user's goals with progress %, target date, milestones done and next milestone. Filter by status.",
            Schema(("status", "string", "Which goals; default Active.", ["Active", "Completed", "Postponed", "Abandoned", "all"])),
            async (ctx, args) =>
            {
                var status = args.String("status") ?? GoalStatuses.Active;
                return await ctx.Get<IGoalsService>().GetAllAsync(status == "all" ? null : status, ctx.Today);
            }),

        new("goal_detail", "Goal details", ModuleKeys.Goals,
            "One goal in full: milestones, measure, history. Needs the goal's id from goals or search.",
            Schema(("goal_id", "integer", "The goal's id.", null)),
            async (ctx, args) =>
            {
                var id = args.Int("goal_id") ?? throw new ToolArgumentException("goal_id is required.");
                var result = await ctx.Get<IGoalsService>().GetAsync(id, ctx.Today);
                return result.Success ? result.Data : new { error = result.Error };
            }),

        new("tasks", "Tasks", ModuleKeys.Tasks,
            "The user's tasks in one view: today (due today), overdue, upcoming (due later), someday (no due date) or done (recently completed).",
            Schema(("view", "string", "Which tasks; default today.", ["today", "overdue", "upcoming", "someday", "done"])),
            async (ctx, args) =>
            {
                var view = args.String("view") ?? "today";
                var service = ctx.Get<ITasksService>();
                if (view == "done")
                {
                    var done = await service.GetAllAsync(TaskStatuses.Done);
                    return done.OrderByDescending(t => t.CompletedAt).Take(30).Select(TaskLine).ToList();
                }

                var open = await service.GetAllAsync(TaskStatuses.Open);
                var picked = view switch
                {
                    "overdue" => open.Where(t => t.DueDate < ctx.Today).OrderBy(t => t.DueDate),
                    "upcoming" => open.Where(t => t.DueDate > ctx.Today).OrderBy(t => t.DueDate),
                    "someday" => open.Where(t => t.DueDate is null).OrderBy(t => t.Title),
                    "today" => open.Where(t => t.DueDate == ctx.Today).OrderBy(t => t.Title),
                    _ => throw new ToolArgumentException("view must be today, overdue, upcoming, someday or done."),
                };
                return picked.Take(50).Select(TaskLine).ToList();
            }),

        new("habits", "Habits", ModuleKeys.Habits,
            "The user's habits with their schedule (ScheduleDays bitmask: Mon=1 … Sun=64), streaks and the days done in the last two weeks.",
            Schema(),
            async (ctx, _) =>
            {
                var result = await ctx.Get<IHabitsService>().GetAllAsync(ctx.Today, ctx.Today.AddDays(-13));
                return result.Success ? result.Data : new { error = result.Error };
            }),

        new("calendar", "Calendar", ModuleKeys.Calendar,
            "What's on between two days: events (times are the user's local time), task due dates, goal and milestone dates, bills, birthdays. Default: today and the next 6 days.",
            Schema(FromArg, ToArg),
            async (ctx, args) =>
            {
                var (from, to) = args.Range(ctx.Today, ctx.Today.AddDays(6), 62);
                var result = await ctx.Get<ICalendarFeedService>()
                    .GetFeedAsync(from, to, ctx.MidnightUtc(from), ctx.MidnightUtc(to.AddDays(1)));
                return result.Success ? result.Data : new { error = result.Error };
            }),

        new("reminders", "Reminders", ModuleKeys.Reminders,
            "The user's pending reminders and when each is set for.",
            Schema(),
            async (ctx, _) =>
            {
                var result = await ctx.Get<IRemindersService>().ListAsync(ReminderStatuses.Pending, null, null);
                return result.Success ? result.Data : new { error = result.Error };
            }),

        new("journal", "Journal", ModuleKeys.Journal,
            "Journal entries (text and mood 1–5) between two days. Default: the last 7 days.",
            Schema(FromArg, ToArg),
            async (ctx, args) =>
            {
                var (from, to) = args.Range(ctx.Today.AddDays(-6), ctx.Today, 31);
                var result = await ctx.Get<IJournalService>().ListAsync(from, to);
                return result.Success ? result.Data : new { error = result.Error };
            }),

        new("accounts", "Accounts and net worth", ModuleKeys.Finance,
            "Money accounts with today's balances, and net worth (what is owned and owed, in the base currency).",
            Schema(),
            async (ctx, _) =>
            {
                await ctx.Get<IRecurringTransactionsService>().GenerateDueAsync(ctx.Today);
                return new
                {
                    accounts = await ctx.Get<IAccountsService>().GetAllAsync(ctx.Today),
                    netWorth = await ctx.Get<IWealthService>().GetNetWorthAsync(ctx.Today),
                };
            }),

        new("budget_month", "Budget month", ModuleKeys.Finance,
            "One month's income, spending by tag against each budget, in the base currency.",
            Schema(("month", "string", "The month, yyyy-MM; default this month.", null)),
            async (ctx, args) =>
            {
                var text = args.String("month");
                var month = text is null
                    ? new DateOnly(ctx.Today.Year, ctx.Today.Month, 1)
                    : DateOnly.TryParseExact(text + "-01", "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var start)
                        ? start
                        : throw new ToolArgumentException("month must be written yyyy-MM.");
                await ctx.Get<IRecurringTransactionsService>().GenerateDueAsync(ctx.Today);
                var result = await ctx.Get<IBudgetsService>().GetMonthAsync(month);
                return result.Success ? result.Data : new { error = result.Error };
            }),

        new("transactions", "Transactions", ModuleKeys.Finance,
            "Income, expenses and transfers between two days, with tags and totals. Default: the last 30 days.",
            Schema(FromArg, ToArg, ("kind", "string", "Only one kind.", ["Income", "Expense", "Transfer"])),
            async (ctx, args) =>
            {
                var (from, to) = args.Range(ctx.Today.AddDays(-29), ctx.Today, 92);
                await ctx.Get<IRecurringTransactionsService>().GenerateDueAsync(ctx.Today);
                return await ctx.Get<ITransactionsService>().GetLedgerAsync(from, to, null, null, args.String("kind"));
            }),

        new("learning", "Learning", ModuleKeys.Learning,
            "Skills (level 1–5 and target), courses and their status, and study time by subject over the last 8 weeks.",
            Schema(),
            async (ctx, _) =>
            {
                var study = await ctx.Get<IStudySessionsService>().GetAnalyticsAsync(ctx.Today, 8);
                return new
                {
                    skills = await ctx.Get<ISkillsService>().GetAllAsync(),
                    courses = await ctx.Get<ICoursesService>().GetAllAsync(null),
                    study = study.Success ? study.Data : null,
                };
            }),

        new("career", "Career", ModuleKeys.Career,
            "Roles held (the career timeline) and job applications with their stage.",
            Schema(),
            async (ctx, _) => new
            {
                roles = await ctx.Get<IEmploymentsService>().GetAllAsync(),
                applications = await ctx.Get<IJobApplicationsService>().GetAllAsync(),
            }),

        new("home", "Home coming up", ModuleKeys.Home,
            "Home things coming up: warranties ending, vehicle papers, maintenance due, unpaid bills.",
            Schema(),
            async (ctx, _) => await ctx.Get<IHomeAgendaService>().UpcomingAsync(ctx.Today)),

        new("purchases", "Purchases and subscriptions", ModuleKeys.Purchases,
            "Subscriptions with costs and next charges, rewards and vouchers summary, and returns waiting.",
            Schema(),
            async (ctx, _) => new
            {
                subscriptions = await ctx.Get<ISubscriptionsService>().GetAllAsync(ctx.Today, ctx.Zone.Id),
                rewards = await ctx.Get<IBenefitsService>().SummaryAsync(ctx.Today),
                returnsWaiting = await ctx.Get<IReturnsService>().AttentionAsync(ctx.Today),
            }),

        new("family", "Family and friends", ModuleKeys.Family,
            "Birthdays and other yearly days coming up, and who is due a catch-up.",
            Schema(("days", "integer", "How many days ahead; default 30, at most 366.", null)),
            async (ctx, args) =>
            {
                var days = args.Int("days") ?? 30;
                if (days is < 1 or > 366)
                {
                    throw new ToolArgumentException("days must be 1 to 366.");
                }

                return new
                {
                    upcomingDays = await ctx.Get<ISignificantDatesService>().UpcomingAsync(ctx.Today, days),
                    keepInTouch = await ctx.Get<IKeepInTouchService>().GetAllAsync(ctx.Today),
                };
            }),

        new("media", "Books and media", ModuleKeys.Leisure,
            "Books, films, series, games, albums and podcasts: what's wanted, in progress, finished or dropped.",
            Schema(("status", "string", "Only this status.", [MediaStatuses.Want, MediaStatuses.InProgress, MediaStatuses.Finished, MediaStatuses.Dropped])),
            async (ctx, args) => await ctx.Get<IMediaItemsService>().GetAllAsync(null, args.String("status"))),

        new("report", "Report", null,
            "A report over a date range, counted exactly as the Reports page: goals (completed, on time, missed), habits (consistency), productivity (tasks, overdue rate, focus), learning (study), money (cash flow, net worth) or life_balance (activity by life area per month). Default: this year so far.",
            Schema(("kind", "string", "Which report.", ReportKinds), FromArg, ToArg),
            async (ctx, args) =>
            {
                var (from, to) = args.Range(new DateOnly(ctx.Today.Year, 1, 1), ctx.Today, 1830);
                var kind = args.String("kind");
                if (ReportModule(kind) is { } module && ctx.HiddenModules.Contains(module))
                {
                    return new { error = $"{module} is switched off in Settings." };
                }

                var reports = ctx.Get<IReportsService>();
                var zone = ctx.Zone.Id;
                object? Data<T>(OperationResult<T> result) => result.Success ? result.Data : new { error = result.Error };
                return kind switch
                {
                    "goals" => Data(await reports.GetGoalReportAsync(from, to, ctx.Today, zone)),
                    "habits" => Data(await reports.GetHabitReportAsync(from, to, ctx.Today, zone)),
                    "productivity" => Data(await reports.GetProductivityReportAsync(from, to, ctx.Today, zone)),
                    "learning" => Data(await reports.GetLearningReportAsync(from, to, ctx.Today, zone)),
                    "money" => Data(await reports.GetFinanceReportAsync(from, to, ctx.Today, zone)),
                    "life_balance" => Data(await reports.GetLifeBalanceReportAsync(from, to, ctx.Today, zone)),
                    _ => throw new ToolArgumentException("kind must be goals, habits, productivity, learning, money or life_balance."),
                };
            }),

        new(HealthReport, "Health report", ModuleKeys.Health,
            "Health over a date range (only while the vault is unlocked): workouts, sleep, stress/energy/mood, body measurements. Default: the last 30 days.",
            Schema(FromArg, ToArg),
            async (ctx, args) =>
            {
                var (from, to) = args.Range(ctx.Today.AddDays(-29), ctx.Today, 1830);
                var result = await ctx.Get<IReportsService>().GetHealthReportAsync(from, to, ctx.Today, ctx.Zone.Id);
                return result.Success ? result.Data : new { error = result.Error };
            }),
    ];

    /// <summary>A report's own module (switched off = not offered for that kind).</summary>
    public static string? ReportModule(string? kind) => kind switch
    {
        "goals" => ModuleKeys.Goals,
        "habits" => ModuleKeys.Habits,
        "productivity" => ModuleKeys.Tasks,
        "learning" => ModuleKeys.Learning,
        "money" => ModuleKeys.Finance,
        _ => null,
    };

    /// <summary>The lookups offered for one answer: none of a switched-off module, and Health only while unlocked.</summary>
    public static IReadOnlyList<AssistantTool> Available(IReadOnlySet<string> hiddenModules, bool healthUnlocked) =>
        All.Where(t => (t.Module is null || !hiddenModules.Contains(t.Module)) && (t.Name != HealthReport || healthUnlocked))
            .ToList();

    public static List<MistralTool> Definitions(IEnumerable<AssistantTool> tools) =>
        tools.Select(t => new MistralTool
        {
            Function = new MistralFunction { Name = t.Name, Description = t.Description, Parameters = t.Parameters },
        }).ToList();

    private static object TaskLine(TaskItemDto t) => new
    {
        t.Id,
        t.Title,
        t.DueDate,
        t.Priority,
        t.Status,
        t.CompletedAt,
        Project = t.ProjectName,
        Tags = t.Tags.Select(tag => tag.Name).ToList(),
        t.EstimateMinutes,
        FocusMinutes = t.ActualMinutes,
        WaitingFor = t.BlockedBy.Select(b => b.Title).ToList(),
    };

    /// <summary>
    /// JSON for what a lookup returns: camelCase, and every moment (UTC in LifeOS) written as the user's local time
    /// ("2026-10-23 14:30"), so the model never has to convert zones.
    /// </summary>
    public static JsonSerializerOptions ResultJson(TimeZoneInfo zone) => new(JsonSerializerDefaults.Web)
    {
        Converters = { new LocalTimeConverter(zone), new NullableLocalTimeConverter(zone) },
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    private sealed class LocalTimeConverter(TimeZoneInfo zone) : JsonConverter<DateTime>
    {
        public override DateTime Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) =>
            throw new NotSupportedException();

        public override void Write(Utf8JsonWriter writer, DateTime value, JsonSerializerOptions options) =>
            writer.WriteStringValue(Local(value, zone));
    }

    private sealed class NullableLocalTimeConverter(TimeZoneInfo zone) : JsonConverter<DateTime?>
    {
        public override DateTime? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) =>
            throw new NotSupportedException();

        public override void Write(Utf8JsonWriter writer, DateTime? value, JsonSerializerOptions options)
        {
            if (value is { } moment)
            {
                writer.WriteStringValue(Local(moment, zone));
            }
            else
            {
                writer.WriteNullValue();
            }
        }
    }

    internal static string Local(DateTime moment, TimeZoneInfo zone) =>
        TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(moment, DateTimeKind.Utc), zone)
            .ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture);
}
