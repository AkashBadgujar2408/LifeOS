using LifeOS.Core.Calendar.DTOs;
using LifeOS.Core.Calendar.ServiceContracts;
using LifeOS.Core.Calendar.Services;
using LifeOS.Core.Finance.DTOs;
using LifeOS.Core.Finance.ServiceContracts;
using LifeOS.Core.Goals.DTOs;
using LifeOS.Core.Goals.ServiceContracts;
using LifeOS.Core.Habits.DTOs;
using LifeOS.Core.Habits.ServiceContracts;
using LifeOS.Core.Home.DTOs;
using LifeOS.Core.Home.ServiceContracts;
using LifeOS.Core.Journal.DTOs;
using LifeOS.Core.Journal.ServiceContracts;
using LifeOS.Core.Learning.DTOs;
using LifeOS.Core.Learning.ServiceContracts;
using LifeOS.Core.Leisure.DTOs;
using LifeOS.Core.Leisure.ServiceContracts;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using LifeOS.Core.Tasks.DTOs;
using LifeOS.Core.Tasks.ServiceContracts;

namespace LifeOS.Core.Assistant.Services;

public static partial class AssistantActions
{
    private static readonly string[] GoalTypeValues = [GoalTypes.ShortTerm, GoalTypes.LongTerm, GoalTypes.BucketList];
    private static readonly string[] PriorityValues = [TaskPriorities.None, TaskPriorities.Low, TaskPriorities.Medium, TaskPriorities.High];
    private static readonly string[] CourseStatusValues = [CourseStatuses.Planned, CourseStatuses.InProgress, CourseStatuses.Completed, CourseStatuses.Dropped];
    private static readonly string[] MediaKindValues = [MediaKinds.Book, MediaKinds.Film, MediaKinds.Series, MediaKinds.Game, MediaKinds.Album, MediaKinds.Podcast, MediaKinds.Other];
    private static readonly string[] MediaStatusValues = [MediaStatuses.Want, MediaStatuses.InProgress, MediaStatuses.Finished, MediaStatuses.Dropped];

    public static readonly IReadOnlyList<AssistantAction> All =
    [
        // ---- Goals ----
        new("create_goal", ModuleKeys.Goals,
            "Propose a new goal (the user confirms before it's saved).",
            Schema(["title", "lifeArea"],
                P("title", "string", "The goal."),
                LifeAreaArg,
                P("goalType", "string", "ShortTerm (default), LongTerm or BucketList.", GoalTypeValues),
                P("targetDate", "string", "Target day, yyyy-MM-dd."),
                P("description", "string", "Why or what it means."),
                TagsArg),
            async (ctx, args) =>
            {
                var area = await LifeAreaAsync(ctx, Required(args, "lifeArea"));
                var tags = await TagsAsync(ctx, args);
                var request = Valid(new GoalRequest
                {
                    Title = Required(args, "title"),
                    LifeAreaId = area!.Value.Id,
                    GoalType = OneOf(args, "goalType", GoalTypeValues) ?? GoalTypes.ShortTerm,
                    TargetDate = args.Date("targetDate"),
                    Description = args.String("description"),
                    Today = ctx.Today,
                });
                var card = new Card(false);
                card.Add("Life area", null, area.Value.Name);
                card.Add("Kind", null, GoalTypeText(request.GoalType));
                card.Add("Target", null, Day(request.TargetDate));
                card.Add("Description", null, Trunc(request.Description));
                card.Add("Tags", null, tags?.Text);
                return new ActionPlan($"Create goal: {request.Title}", card.Lines, () => WithTagsAsync(ctx, tags, [], async ids =>
                    Done(await ctx.Get<IGoalsService>().CreateAsync(Copy(request, ids)), ActionKinds.Created, "Goal", g => g.Id, g => g.Title)));
            }),

        new("update_goal", ModuleKeys.Goals,
            "Propose changes to a goal: only the fields sent change. Status (complete, postpone) isn't changed here — that's on the goal page.",
            Schema(["goalId"],
                P("goalId", "integer", "The goal's id (from goals or search)."),
                P("title", "string", "New title."),
                LifeAreaArg,
                P("goalType", "string", "ShortTerm, LongTerm or BucketList.", GoalTypeValues),
                P("targetDate", "string", "New target day, yyyy-MM-dd; null removes it."),
                P("description", "string", "New description; null removes it."),
                P("revisionNote", "string", "Why the goal is being revised (kept in its history)."),
                TagsArg),
            async (ctx, args) =>
            {
                var goals = ctx.Get<IGoalsService>();
                var goal = Found(await goals.GetAsync(Id(args, "goalId"), ctx.Today), "goal").Data!;
                var area = args.Has("lifeArea") ? await LifeAreaAsync(ctx, Required(args, "lifeArea")) : (goal.LifeAreaId, goal.LifeAreaName);
                var tags = await TagsAsync(ctx, args);
                var request = Valid(new GoalRequest
                {
                    Title = Text(args, "title", goal.Title) ?? throw new ToolArgumentException("A goal needs a title."),
                    Description = Text(args, "description", goal.Description),
                    LifeAreaId = area!.Value.Item1,
                    GoalType = OneOf(args, "goalType", GoalTypeValues) ?? goal.GoalType,
                    TargetDate = DateOr(args, "targetDate", goal.TargetDate),
                    TargetAmount = goal.TargetAmount,
                    TargetCurrency = goal.TargetCurrency,
                    MeasureTarget = goal.MeasureTarget,
                    MeasureStart = goal.MeasureStart,
                    MeasureUnit = goal.MeasureUnit,
                    MeasureSource = goal.MeasureSource,
                    Today = ctx.Today,
                    RevisionNote = args.String("revisionNote"),
                });
                var card = new Card(true);
                card.Add("Title", goal.Title, request.Title);
                card.Add("Life area", goal.LifeAreaName, area.Value.Item2);
                card.Add("Kind", GoalTypeText(goal.GoalType), GoalTypeText(request.GoalType));
                card.Add("Target", Day(goal.TargetDate), Day(request.TargetDate));
                card.Add("Description", Trunc(goal.Description), Trunc(request.Description));
                card.Add("Tags", TagText(goal.Tags), tags?.Text ?? TagText(goal.Tags));
                card.RequireChange();
                card.Add("Why", null, request.RevisionNote);
                return new ActionPlan($"Update goal: {goal.Title}", card.Lines, () => WithTagsAsync(ctx, tags, goal.Tags.Select(t => t.Id).ToList(), async ids =>
                    Done(await goals.UpdateAsync(goal.Id, Copy(request, ids)), ActionKinds.Updated, "Goal", g => g.Id, g => g.Title)));
            }),

        new("add_milestone", ModuleKeys.Goals,
            "Propose a new milestone on a goal.",
            Schema(["goalId", "title"],
                P("goalId", "integer", "The goal's id."),
                P("title", "string", "The milestone."),
                P("targetDate", "string", "Target day, yyyy-MM-dd.")),
            async (ctx, args) =>
            {
                var goal = Found(await ctx.Get<IGoalsService>().GetAsync(Id(args, "goalId"), ctx.Today), "goal").Data!;
                var request = Valid(new GoalMilestoneRequest { Title = Required(args, "title"), TargetDate = args.Date("targetDate") });
                var card = new Card(false);
                card.Add("Goal", null, goal.Title);
                card.Add("Target", null, Day(request.TargetDate));
                return new ActionPlan($"Add milestone: {request.Title}", card.Lines, async () =>
                    Done(await ctx.Get<IGoalMilestonesService>().CreateAsync(goal.Id, request), ActionKinds.Created, "Goal", _ => goal.Id, m => m.Title));
            }),

        new("update_milestone", ModuleKeys.Goals,
            "Propose changes to a goal's milestone, or tick it done / not done (completed). A milestone that follows a task or project ticks itself.",
            Schema(["goalId", "milestoneId"],
                P("goalId", "integer", "The goal's id."),
                P("milestoneId", "integer", "The milestone's id (from goal_detail)."),
                P("title", "string", "New title."),
                P("targetDate", "string", "New target day, yyyy-MM-dd; null removes it."),
                P("completed", "boolean", "true = done, false = not done.")),
            async (ctx, args) =>
            {
                var goal = Found(await ctx.Get<IGoalsService>().GetAsync(Id(args, "goalId"), ctx.Today), "goal").Data!;
                var milestone = goal.Milestones.FirstOrDefault(m => m.Id == Id(args, "milestoneId"))
                    ?? throw new ToolArgumentException("That goal has no milestone with that id — use goal_detail to see its milestones.");
                var request = Valid(new GoalMilestoneRequest
                {
                    Title = Text(args, "title", milestone.Title) ?? throw new ToolArgumentException("A milestone needs a title."),
                    TargetDate = DateOr(args, "targetDate", milestone.TargetDate),
                    TaskItemId = milestone.TaskItemId,
                    ProjectId = milestone.ProjectId,
                });
                var wasDone = milestone.CompletedAt is not null;
                var done = args.Bool("completed") ?? wasDone;
                var card = new Card(true);
                card.Add("Title", milestone.Title, request.Title);
                card.Add("Target", Day(milestone.TargetDate), Day(request.TargetDate));
                card.Add("Done", YesNo(wasDone), YesNo(done));
                card.RequireChange();
                var detailsChanged = request.Title != milestone.Title || request.TargetDate != milestone.TargetDate;
                return new ActionPlan($"Update milestone: {milestone.Title} ({goal.Title})", card.Lines, async () =>
                {
                    var milestones = ctx.Get<IGoalMilestonesService>();
                    if (detailsChanged)
                    {
                        var updated = await milestones.UpdateAsync(goal.Id, milestone.Id, request);
                        if (!updated.Success)
                        {
                            return OperationResult<ActionDone>.Fail(updated.Error!);
                        }
                    }

                    if (done != wasDone)
                    {
                        var ticked = await milestones.SetCompletedAsync(goal.Id, milestone.Id, done);
                        if (!ticked.Success)
                        {
                            return OperationResult<ActionDone>.Fail(ticked.Error!);
                        }
                    }

                    return OperationResult<ActionDone>.Ok(new ActionDone(ActionKinds.Updated, "Goal", goal.Id, request.Title));
                });
            }),

        // ---- Tasks ----
        new("create_task", ModuleKeys.Tasks,
            "Propose a new task.",
            Schema(["title"],
                P("title", "string", "The task."),
                P("dueDate", "string", "Due day, yyyy-MM-dd; leave out for Someday."),
                P("priority", "string", "None (default), Low, Medium or High.", PriorityValues),
                P("project", "string", "An existing active project's name."),
                P("estimateMinutes", "integer", "How long it should take, in minutes."),
                P("notes", "string", "Notes."),
                TagsArg),
            async (ctx, args) =>
            {
                var project = await ProjectAsync(ctx, args.String("project"));
                var tags = await TagsAsync(ctx, args);
                var request = Valid(new TaskRequest
                {
                    Title = Required(args, "title"),
                    DueDate = args.Date("dueDate"),
                    Priority = OneOf(args, "priority", PriorityValues) ?? TaskPriorities.None,
                    ProjectId = project?.Id,
                    EstimateMinutes = args.Int("estimateMinutes"),
                    Notes = args.String("notes"),
                });
                var card = new Card(false);
                card.Add("Due", null, Day(request.DueDate) ?? "Someday");
                card.Add("Priority", null, request.Priority == TaskPriorities.None ? null : request.Priority);
                card.Add("Project", null, project?.Name);
                card.Add("Estimate", null, request.EstimateMinutes is { } m ? $"{Number(m)} min" : null);
                card.Add("Notes", null, Trunc(request.Notes));
                card.Add("Tags", null, tags?.Text);
                return new ActionPlan($"Create task: {request.Title}", card.Lines, () => WithTagsAsync(ctx, tags, [], async ids =>
                    Done(await ctx.Get<ITasksService>().CreateAsync(Copy(request, ids)), ActionKinds.Created, "Task", t => t.Id, t => t.Title)));
            }),

        new("update_task", ModuleKeys.Tasks,
            "Propose changes to a task (only the fields sent change), or mark it done / open again (completed).",
            Schema(["taskId"],
                P("taskId", "integer", "The task's id (from tasks or search)."),
                P("title", "string", "New title."),
                P("dueDate", "string", "New due day, yyyy-MM-dd; null = Someday."),
                P("priority", "string", "None, Low, Medium or High.", PriorityValues),
                P("project", "string", "An existing active project's name; null takes it out of its project."),
                P("estimateMinutes", "integer", "Estimate in minutes; null removes it."),
                P("notes", "string", "New notes; null removes them."),
                P("completed", "boolean", "true = done, false = open again."),
                TagsArg),
            async (ctx, args) =>
            {
                var tasks = ctx.Get<ITasksService>();
                var task = Found(await tasks.GetAsync(Id(args, "taskId")), "task").Data!;
                var project = args.Has("project")
                    ? await ProjectAsync(ctx, args.String("project"))
                    : task.ProjectId is { } pid ? (pid, task.ProjectName ?? string.Empty) : null;
                var tags = await TagsAsync(ctx, args);
                var request = Valid(new TaskRequest
                {
                    Title = Text(args, "title", task.Title) ?? throw new ToolArgumentException("A task needs a title."),
                    Notes = Text(args, "notes", task.Notes),
                    DueDate = DateOr(args, "dueDate", task.DueDate),
                    Priority = OneOf(args, "priority", PriorityValues) ?? task.Priority,
                    ProjectId = project?.Id,
                    Recurrence = task.Recurrence,
                    EstimateMinutes = IntOr(args, "estimateMinutes", task.EstimateMinutes),
                    BlockedByTaskIds = task.BlockedBy.Select(b => b.Id).ToList(),
                });
                var wasDone = task.Status == TaskStatuses.Done;
                var done = args.Bool("completed") ?? wasDone;
                var card = new Card(true);
                card.Add("Title", task.Title, request.Title);
                card.Add("Due", Day(task.DueDate) ?? "Someday", Day(request.DueDate) ?? "Someday");
                card.Add("Priority", task.Priority, request.Priority);
                card.Add("Project", task.ProjectName, project?.Name);
                card.Add("Estimate", Number(task.EstimateMinutes), Number(request.EstimateMinutes));
                card.Add("Notes", Trunc(task.Notes), Trunc(request.Notes));
                card.Add("Tags", TagText(task.Tags), tags?.Text ?? TagText(task.Tags));
                card.Add("Done", YesNo(wasDone), YesNo(done));
                card.RequireChange();
                var detailsChanged = card.Lines.Any(l => l.Label != "Done");
                return new ActionPlan($"Update task: {task.Title}", card.Lines, () => WithTagsAsync(ctx, tags, task.Tags.Select(t => t.Id).ToList(), async ids =>
                {
                    if (detailsChanged)
                    {
                        var updated = await tasks.UpdateAsync(task.Id, Copy(request, ids));
                        if (!updated.Success)
                        {
                            return OperationResult<ActionDone>.Fail(updated.Error!);
                        }
                    }

                    if (done != wasDone)
                    {
                        var ticked = await tasks.SetCompletedAsync(task.Id, done, ctx.Today);
                        if (!ticked.Success)
                        {
                            return OperationResult<ActionDone>.Fail(ticked.Error!);
                        }
                    }

                    return OperationResult<ActionDone>.Ok(new ActionDone(ActionKinds.Updated, "Task", task.Id, request.Title));
                }));
            }),

        // ---- Habits ----
        new("create_habit", ModuleKeys.Habits,
            "Propose a new habit.",
            Schema(["title"],
                P("title", "string", "The habit."),
                P("days", "array", "Days it's done: Mon, Tue … Sun, or \"weekdays\", \"weekends\", \"every day\" (default every day)."),
                P("startDate", "string", "First day, yyyy-MM-dd (default today)."),
                P("kind", "string", "Build (do it, default) or Avoid (stop doing it — avoid habits run every day).", [HabitKinds.Build, HabitKinds.Avoid]),
                P("targetValue", "number", "Build habits: what a day needs to count (e.g. 20 for 20 pages)."),
                P("unit", "string", "The target's unit (pages, minutes, glasses)."),
                LifeAreaArg,
                P("description", "string", "Description."),
                TagsArg),
            async (ctx, args) =>
            {
                var area = await LifeAreaAsync(ctx, args.String("lifeArea"));
                var tags = await TagsAsync(ctx, args);
                var request = Valid(new HabitRequest
                {
                    Title = Required(args, "title"),
                    Description = args.String("description"),
                    LifeAreaId = area?.Id,
                    ScheduleDays = WeekdayMask(args.Strings("days")) ?? 127,
                    StartDate = args.Date("startDate") ?? ctx.Today,
                    Kind = OneOf(args, "kind", HabitKinds.Build, HabitKinds.Avoid) ?? HabitKinds.Build,
                    TargetValue = args.Decimal("targetValue"),
                    Unit = args.String("unit"),
                    Today = ctx.Today,
                });
                var card = new Card(false);
                card.Add("Kind", null, request.Kind == HabitKinds.Avoid ? "Avoid" : null);
                card.Add("Days", null, WeekdayText(request.ScheduleDays));
                card.Add("Starts", null, Day(request.StartDate));
                card.Add("Target", null, request.TargetValue is { } t ? $"{Number(t)} {request.Unit}".Trim() : null);
                card.Add("Life area", null, area?.Name);
                card.Add("Description", null, Trunc(request.Description));
                card.Add("Tags", null, tags?.Text);
                return new ActionPlan($"Create habit: {request.Title}", card.Lines, () => WithTagsAsync(ctx, tags, [], async ids =>
                    Done(await ctx.Get<IHabitsService>().CreateAsync(Copy(request, ids), ctx.Today), ActionKinds.Created, "Habit", h => h.Id, h => h.Title)));
            }),

        new("update_habit", ModuleKeys.Habits,
            "Propose changes to a habit (only the fields sent change). Its kind (build/avoid) can't change here.",
            Schema(["habitId"],
                P("habitId", "integer", "The habit's id (from habits)."),
                P("title", "string", "New title."),
                P("days", "array", "Days it's done: Mon … Sun, \"weekdays\", \"weekends\" or \"every day\"."),
                P("startDate", "string", "First day, yyyy-MM-dd."),
                P("targetValue", "number", "What a day needs; null makes it a plain tick."),
                P("unit", "string", "The target's unit."),
                LifeAreaArg,
                P("description", "string", "New description; null removes it."),
                TagsArg),
            async (ctx, args) =>
            {
                var habits = ctx.Get<IHabitsService>();
                var habit = Found(await habits.GetAsync(Id(args, "habitId"), ctx.Today, ctx.Today), "habit").Data!;
                var area = args.Has("lifeArea") ? await LifeAreaAsync(ctx, args.String("lifeArea")) : habit.LifeAreaId is { } aid ? (aid, habit.LifeAreaName ?? string.Empty) : null;
                var tags = await TagsAsync(ctx, args);
                var request = Valid(new HabitRequest
                {
                    Title = Text(args, "title", habit.Title) ?? throw new ToolArgumentException("A habit needs a title."),
                    Description = Text(args, "description", habit.Description),
                    LifeAreaId = area?.Id,
                    ScheduleDays = WeekdayMask(args.Strings("days")) ?? habit.ScheduleDays,
                    StartDate = args.Date("startDate") ?? habit.StartDate,
                    Kind = habit.Kind,
                    TargetValue = DecimalOr(args, "targetValue", habit.TargetValue),
                    Unit = Text(args, "unit", habit.Unit),
                    Today = ctx.Today,
                });
                var card = new Card(true);
                card.Add("Title", habit.Title, request.Title);
                card.Add("Days", WeekdayText(habit.ScheduleDays), WeekdayText(request.ScheduleDays));
                card.Add("Starts", Day(habit.StartDate), Day(request.StartDate));
                card.Add("Target", $"{Number(habit.TargetValue)} {habit.Unit}".Trim(), $"{Number(request.TargetValue)} {request.Unit}".Trim());
                card.Add("Life area", habit.LifeAreaName, area?.Name);
                card.Add("Description", Trunc(habit.Description), Trunc(request.Description));
                card.Add("Tags", TagText(habit.Tags), tags?.Text ?? TagText(habit.Tags));
                card.RequireChange();
                return new ActionPlan($"Update habit: {habit.Title}", card.Lines, () => WithTagsAsync(ctx, tags, habit.Tags.Select(t => t.Id).ToList(), async ids =>
                    Done(await habits.UpdateAsync(habit.Id, Copy(request, ids), ctx.Today), ActionKinds.Updated, "Habit", h => h.Id, h => h.Title)));
            }),

        new("tick_habit", ModuleKeys.Habits,
            "Propose ticking a habit for a day (done), un-ticking it (done false), or logging a measurable habit's amount (value). For an avoid habit, done means a slip.",
            Schema(["habitId"],
                P("habitId", "integer", "The habit's id (from habits)."),
                P("date", "string", "The day, yyyy-MM-dd (default today)."),
                P("done", "boolean", "true (default) ticks the day, false removes the tick."),
                P("value", "number", "Measurable habits: what was done that day.")),
            async (ctx, args) =>
            {
                var habit = Found(await ctx.Get<IHabitsService>().GetAsync(Id(args, "habitId"), ctx.Today, ctx.Today), "habit").Data!;
                var day = args.Date("date") ?? ctx.Today;
                var done = args.Bool("done") ?? true;
                var value = args.Decimal("value");
                if (value is < 0 or > 9999999.99m)
                {
                    throw new ToolArgumentException("The value must be between 0 and 9,999,999.99.");
                }

                var card = new Card(false);
                card.Add("Day", null, Day(day));
                card.Add(habit.Kind == HabitKinds.Avoid ? "Slipped" : "Done", null, YesNo(done));
                card.Add("Amount", null, value is { } v ? $"{Number(v)} {habit.Unit}".Trim() : null);
                var verb = !done ? "Un-tick" : habit.Kind == HabitKinds.Avoid ? "Log a slip" : "Tick";
                return new ActionPlan($"{verb} habit: {habit.Title}", card.Lines, async () =>
                    Done(await ctx.Get<IHabitsService>().SetEntryAsync(habit.Id, day, done, value, ctx.Today), ActionKinds.Updated, "Habit", _ => habit.Id, _ => habit.Title));
            }),

        // ---- Journal ----
        new("write_journal", ModuleKeys.Journal,
            "Propose writing in the journal for a day: the text is added to that day's entry (one entry per day; created if there's none). Mood 1 (awful) – 5 (great) replaces the day's mood.",
            Schema([],
                P("date", "string", "The day, yyyy-MM-dd (default today)."),
                P("content", "string", "Text to add, in the user's words."),
                P("mood", "integer", "1 awful, 2 bad, 3 okay, 4 good, 5 great."),
                P("title", "string", "A title for the day (only used when it has none).")),
            async (ctx, args) =>
            {
                var day = args.Date("date") ?? ctx.Today;
                var journal = ctx.Get<IJournalService>();
                var entry = await journal.GetForDayAsync(day);
                var added = args.String("content");
                var mood = args.Int("mood");
                if (added is null && mood is null)
                {
                    throw new ToolArgumentException("Send content or a mood.");
                }

                var request = Valid(new JournalEntryRequest
                {
                    Title = entry?.Title ?? args.String("title"),
                    Content = added is null ? entry?.Content : string.IsNullOrWhiteSpace(entry?.Content) ? added : $"{entry.Content.TrimEnd()}\n\n{added}",
                    Mood = mood is { } m ? (m is >= 1 and <= 5 ? (byte)m : throw new ToolArgumentException("Mood must be between 1 and 5.")) : entry?.Mood,
                    LifeAreaId = entry?.LifeAreaId,
                    TagIds = entry?.Tags.Select(t => t.Id).ToList() ?? [],
                });
                var card = new Card(false);
                card.Add("Day", null, Day(day));
                card.Add(entry is null ? "Text" : "Adds", null, Trunc(added));
                card.Add("Mood", null, mood is { } mm ? MoodText(mm) : null);
                card.Add("Title", null, entry?.Title is null ? request.Title : null);
                var kind = entry is null ? ActionKinds.Created : ActionKinds.Updated;
                return new ActionPlan(entry is null ? $"Write journal entry for {Day(day)}" : $"Add to journal entry for {Day(day)}", card.Lines, async () =>
                    Done(await journal.SaveForDayAsync(day, request), kind, "JournalEntry", e => e.Id, e => e.Title ?? Day(e.EntryDate)!));
            }),

        // ---- Calendar ----
        new("create_event", ModuleKeys.Calendar,
            "Propose a calendar event. With start (and end or minutes) it's timed in the user's own time; without it's all-day.",
            Schema(["title", "date"],
                P("title", "string", "The event."),
                P("date", "string", "The day, yyyy-MM-dd."),
                P("start", "string", "Start time HH:mm (24-hour, the user's local time); leave out for all-day."),
                P("end", "string", "End time HH:mm."),
                P("minutes", "integer", "Length in minutes, when no end is given (default 60)."),
                P("endDate", "string", "All-day events: last day, yyyy-MM-dd."),
                P("location", "string", "Where."),
                P("notes", "string", "Notes."),
                LifeAreaArg),
            async (ctx, args) =>
            {
                var area = await LifeAreaAsync(ctx, args.String("lifeArea"));
                var title = Required(args, "title");
                var day = args.Date("date") ?? throw new ToolArgumentException("date is required.");
                var request = Valid(EventShape(ctx, args, day, new EventRequest
                {
                    Title = title,
                    Location = args.String("location"),
                    Notes = args.String("notes"),
                    LifeAreaId = area?.Id,
                }));
                var card = new Card(false);
                card.Add("When", null, EventWhen(request, ctx.Zone));
                card.Add("Where", null, request.Location);
                card.Add("Life area", null, area?.Name);
                card.Add("Notes", null, Trunc(request.Notes));
                return new ActionPlan($"Create event: {title}", card.Lines, async () =>
                    Done(await ctx.Get<IEventsService>().CreateAsync(request), ActionKinds.Created, "Event", e => e.Id, e => e.Title));
            }),

        new("update_event", ModuleKeys.Calendar,
            "Propose changes to an event (only the fields sent change). A repeating event's day and times are changed on the calendar, not here.",
            Schema(["eventId"],
                P("eventId", "integer", "The event's id (calendar items of source Event)."),
                P("title", "string", "New title."),
                P("date", "string", "New day, yyyy-MM-dd."),
                P("start", "string", "New start HH:mm (local)."),
                P("end", "string", "New end HH:mm."),
                P("minutes", "integer", "New length in minutes."),
                P("allDay", "boolean", "true makes it all-day."),
                P("endDate", "string", "All-day events: last day."),
                P("location", "string", "Where; null removes it."),
                P("notes", "string", "Notes; null removes them.")),
            async (ctx, args) =>
            {
                var events = ctx.Get<IEventsService>();
                var current = Found(await events.GetAsync(Id(args, "eventId")), "event").Data!;
                var timing = new[] { "date", "start", "end", "minutes", "allDay", "endDate" }.Any(args.Has);
                if (timing && current.Recurrence is not null)
                {
                    throw new ToolArgumentException("This event repeats — its day and times are changed on the calendar (drag it, or open it). Say so to the user.");
                }

                var request = new EventRequest
                {
                    Title = Text(args, "title", current.Title) ?? throw new ToolArgumentException("An event needs a title."),
                    Notes = Text(args, "notes", current.Notes),
                    Location = Text(args, "location", current.Location),
                    IsAllDay = current.IsAllDay,
                    StartDate = current.StartDate,
                    EndDate = current.EndDate,
                    StartsAt = current.StartsAt,
                    EndsAt = current.EndsAt,
                    Recurrence = current.Recurrence,
                    TimeZone = current.TimeZone,
                    ReminderMinutesBefore = current.ReminderMinutesBefore,
                    LifeAreaId = current.LifeAreaId,
                };
                if (timing)
                {
                    var day = args.Date("date") ?? current.StartDate
                        ?? DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(current.StartsAt!.Value, ctx.Zone));
                    request = EventShape(ctx, args, day, request, current);
                }

                Valid(request);
                var card = new Card(true);
                card.Add("Title", current.Title, request.Title);
                card.Add("When", EventWhen(Shape(current), ctx.Zone), EventWhen(request, ctx.Zone));
                card.Add("Where", current.Location, request.Location);
                card.Add("Notes", Trunc(current.Notes), Trunc(request.Notes));
                card.RequireChange();
                return new ActionPlan($"Update event: {current.Title}", card.Lines, async () =>
                    Done(await events.UpdateAsync(current.Id, request), ActionKinds.Updated, "Event", e => e.Id, e => e.Title));
            }),

        new("create_reminder", ModuleKeys.Reminders,
            "Propose a reminder at a local time, optionally about an item (entityType + entityId, e.g. Task 12, Goal 3).",
            Schema(["title", "at"],
                P("title", "string", "What to be reminded of."),
                P("at", "string", "When, the user's local time yyyy-MM-dd HH:mm."),
                P("notes", "string", "Notes."),
                P("entityType", "string", "What it's about: Goal, Task, Habit, Event, Contact, Skill, Course, MediaItem…"),
                P("entityId", "integer", "That item's id.")),
            async (ctx, args) =>
            {
                var at = args.LocalTime("at") ?? throw new ToolArgumentException("at is required.");
                var request = Valid(new ReminderRequest
                {
                    Title = Required(args, "title"),
                    Notes = args.String("notes"),
                    RemindAt = EventRecurrence.LocalToUtc(at, ctx.Zone),
                    EntityType = args.String("entityType"),
                    EntityId = args.Int("entityId"),
                });
                var card = new Card(false);
                card.Add("When", null, LocalText(request.RemindAt!.Value, ctx.Zone));
                card.Add("About", null, request.EntityType is null ? null : $"{request.EntityType} #{request.EntityId}");
                card.Add("Notes", null, Trunc(request.Notes));
                return new ActionPlan($"Create reminder: {request.Title}", card.Lines, async () =>
                    Done(await ctx.Get<IRemindersService>().CreateAsync(request), ActionKinds.Created, "Reminder", r => r.Id, r => r.Title));
            }),

        new("update_reminder", ModuleKeys.Reminders,
            "Propose changes to a pending reminder: title, time (local) or notes.",
            Schema(["reminderId"],
                P("reminderId", "integer", "The reminder's id (from reminders)."),
                P("title", "string", "New title."),
                P("at", "string", "New time, local yyyy-MM-dd HH:mm."),
                P("notes", "string", "Notes; null removes them.")),
            async (ctx, args) =>
            {
                var reminders = ctx.Get<IRemindersService>();
                var current = Found(await reminders.GetAsync(Id(args, "reminderId")), "reminder").Data!;
                var request = Valid(new ReminderRequest
                {
                    Title = Text(args, "title", current.Title) ?? throw new ToolArgumentException("A reminder needs a title."),
                    Notes = Text(args, "notes", current.Notes),
                    RemindAt = args.LocalTime("at") is { } at ? EventRecurrence.LocalToUtc(at, ctx.Zone) : current.RemindAt,
                    Recurrence = current.Recurrence,
                    TimeZone = current.TimeZone,
                });
                var card = new Card(true);
                card.Add("Title", current.Title, request.Title);
                card.Add("When", LocalText(current.RemindAt, ctx.Zone), LocalText(request.RemindAt!.Value, ctx.Zone));
                card.Add("Notes", Trunc(current.Notes), Trunc(request.Notes));
                card.RequireChange();
                return new ActionPlan($"Update reminder: {current.Title}", card.Lines, async () =>
                    Done(await reminders.UpdateAsync(current.Id, request), ActionKinds.Updated, "Reminder", r => r.Id, r => r.Title));
            }),

        // ---- Learning ----
        new("create_skill", ModuleKeys.Learning,
            "Propose a new skill to track, with its level 1–5 now and an optional target level.",
            Schema(["name"],
                P("name", "string", "The skill."),
                P("proficiency", "integer", "Level now, 1 (beginner) to 5 (expert); default 1."),
                P("targetProficiency", "integer", "Level aimed for, 1–5."),
                P("description", "string", "Description."),
                P("lifeArea", "string", "Life area name (default Learning)."),
                TagsArg),
            async (ctx, args) =>
            {
                var area = await LifeAreaAsync(ctx, args.String("lifeArea")) ?? await DefaultLearningAreaAsync(ctx);
                var tags = await TagsAsync(ctx, args);
                var request = Valid(new SkillRequest
                {
                    Name = Required(args, "name"),
                    Description = args.String("description"),
                    Proficiency = Level(args.Int("proficiency")) ?? 1,
                    TargetProficiency = Level(args.Int("targetProficiency")),
                    LifeAreaId = area?.Id,
                    Today = ctx.Today,
                });
                var card = new Card(false);
                card.Add("Level", null, $"{request.Proficiency} of 5");
                card.Add("Target", null, request.TargetProficiency is { } t ? $"{t} of 5" : null);
                card.Add("Life area", null, area?.Name);
                card.Add("Description", null, Trunc(request.Description));
                card.Add("Tags", null, tags?.Text);
                return new ActionPlan($"Create skill: {request.Name}", card.Lines, () => WithTagsAsync(ctx, tags, [], async ids =>
                    Done(await ctx.Get<ISkillsService>().CreateAsync(Copy(request, ids)), ActionKinds.Created, "Skill", s => s.Id, s => s.Name)));
            }),

        new("update_skill", ModuleKeys.Learning,
            "Propose changes to a skill — e.g. a new level (kept in its level history with levelNote).",
            Schema(["skillId"],
                P("skillId", "integer", "The skill's id (from learning)."),
                P("name", "string", "New name."),
                P("proficiency", "integer", "New level 1–5."),
                P("targetProficiency", "integer", "Target level 1–5; null removes it."),
                P("levelNote", "string", "Why the level changed (\"passed the B1 exam\")."),
                P("description", "string", "Description; null removes it."),
                LifeAreaArg,
                TagsArg),
            async (ctx, args) =>
            {
                var skills = ctx.Get<ISkillsService>();
                var skill = Found(await skills.GetAsync(Id(args, "skillId")), "skill").Data!;
                var area = args.Has("lifeArea") ? await LifeAreaAsync(ctx, args.String("lifeArea")) : skill.LifeAreaId is { } aid ? (aid, skill.LifeAreaName ?? string.Empty) : null;
                var tags = await TagsAsync(ctx, args);
                var request = Valid(new SkillRequest
                {
                    Name = Text(args, "name", skill.Name) ?? throw new ToolArgumentException("A skill needs a name."),
                    Description = Text(args, "description", skill.Description),
                    Proficiency = Level(args.Int("proficiency")) ?? skill.Proficiency,
                    TargetProficiency = args.Has("targetProficiency") ? Level(args.Int("targetProficiency")) : skill.TargetProficiency,
                    LifeAreaId = area?.Id,
                    Today = ctx.Today,
                    LevelNote = args.String("levelNote"),
                });
                var card = new Card(true);
                card.Add("Name", skill.Name, request.Name);
                card.Add("Level", $"{skill.Proficiency} of 5", $"{request.Proficiency} of 5");
                card.Add("Target", skill.TargetProficiency is { } t0 ? $"{t0} of 5" : null, request.TargetProficiency is { } t1 ? $"{t1} of 5" : null);
                card.Add("Life area", skill.LifeAreaName, area?.Name);
                card.Add("Description", Trunc(skill.Description), Trunc(request.Description));
                card.Add("Tags", TagText(skill.Tags), tags?.Text ?? TagText(skill.Tags));
                card.RequireChange();
                if (request.Proficiency != skill.Proficiency)
                {
                    card.Add("Note", null, request.LevelNote);
                }

                return new ActionPlan($"Update skill: {skill.Name}", card.Lines, () => WithTagsAsync(ctx, tags, skill.Tags.Select(t => t.Id).ToList(), async ids =>
                    Done(await skills.UpdateAsync(skill.Id, Copy(request, ids)), ActionKinds.Updated, "Skill", s => s.Id, s => s.Name)));
            }),

        new("create_course", ModuleKeys.Learning,
            "Propose a new course.",
            Schema(["title"],
                P("title", "string", "The course."),
                P("provider", "string", "Who runs it (Coursera, a university…)."),
                P("url", "string", "Its web address."),
                P("status", "string", "Planned (default), InProgress, Completed or Dropped.", CourseStatusValues),
                P("progressPercent", "integer", "0–100."),
                P("skill", "string", "An existing skill's name it builds."),
                P("notes", "string", "Notes.")),
            async (ctx, args) =>
            {
                var skill = await SkillAsync(ctx, args.String("skill"));
                var area = await DefaultLearningAreaAsync(ctx);
                var request = Valid(new CourseRequest
                {
                    Title = Required(args, "title"),
                    Provider = args.String("provider"),
                    Url = args.String("url"),
                    Status = OneOf(args, "status", CourseStatusValues) ?? CourseStatuses.Planned,
                    ProgressPercent = Percent(args.Int("progressPercent")) ?? 0,
                    Notes = args.String("notes"),
                    SkillId = skill?.Id,
                    LifeAreaId = area?.Id,
                    Today = ctx.Today,
                });
                var card = new Card(false);
                card.Add("Provider", null, request.Provider);
                card.Add("Status", null, CourseStatusText(request.Status));
                card.Add("Progress", null, request.ProgressPercent > 0 ? $"{request.ProgressPercent}%" : null);
                card.Add("Skill", null, skill?.Name);
                card.Add("Link", null, request.Url);
                card.Add("Notes", null, Trunc(request.Notes));
                return new ActionPlan($"Create course: {request.Title}", card.Lines, async () =>
                    Done(await ctx.Get<ICoursesService>().CreateAsync(request), ActionKinds.Created, "Course", c => c.Id, c => c.Title));
            }),

        new("update_course", ModuleKeys.Learning,
            "Propose changes to a course: progress, status (InProgress, Completed…), notes and so on.",
            Schema(["courseId"],
                P("courseId", "integer", "The course's id (from learning)."),
                P("title", "string", "New title."),
                P("provider", "string", "Provider; null removes it."),
                P("url", "string", "Web address; null removes it."),
                P("status", "string", "Planned, InProgress, Completed or Dropped.", CourseStatusValues),
                P("progressPercent", "integer", "0–100."),
                P("skill", "string", "An existing skill's name; null unlinks it."),
                P("notes", "string", "Notes; null removes them.")),
            async (ctx, args) =>
            {
                var courses = ctx.Get<ICoursesService>();
                var course = Found(await courses.GetAsync(Id(args, "courseId")), "course").Data!;
                var skill = args.Has("skill") ? await SkillAsync(ctx, args.String("skill")) : course.SkillId is { } sid ? (sid, course.SkillName ?? string.Empty) : null;
                var request = Valid(new CourseRequest
                {
                    Title = Text(args, "title", course.Title) ?? throw new ToolArgumentException("A course needs a title."),
                    Provider = Text(args, "provider", course.Provider),
                    Url = Text(args, "url", course.Url),
                    Status = OneOf(args, "status", CourseStatusValues) ?? course.Status,
                    ProgressPercent = Percent(args.Int("progressPercent")) ?? course.ProgressPercent,
                    StartedOn = course.StartedOn,
                    CompletedOn = course.CompletedOn,
                    Notes = Text(args, "notes", course.Notes),
                    SkillId = skill?.Id,
                    LifeAreaId = course.LifeAreaId,
                    Today = ctx.Today,
                });
                var card = new Card(true);
                card.Add("Title", course.Title, request.Title);
                card.Add("Provider", course.Provider, request.Provider);
                card.Add("Status", CourseStatusText(course.Status), CourseStatusText(request.Status));
                card.Add("Progress", $"{course.ProgressPercent}%", $"{request.ProgressPercent}%");
                card.Add("Skill", course.SkillName, skill?.Name);
                card.Add("Link", course.Url, request.Url);
                card.Add("Notes", Trunc(course.Notes), Trunc(request.Notes));
                card.RequireChange();
                return new ActionPlan($"Update course: {course.Title}", card.Lines, async () =>
                    Done(await courses.UpdateAsync(course.Id, request), ActionKinds.Updated, "Course", c => c.Id, c => c.Title));
            }),

        // ---- Leisure ----
        new("create_media", ModuleKeys.Leisure,
            "Propose adding a book, film, series, game, album or podcast to the backlog.",
            Schema(["kind", "title"],
                P("kind", "string", "Book, Film, Series, Game, Album, Podcast or Other.", MediaKindValues),
                P("title", "string", "Its title."),
                P("creator", "string", "Author, director, artist…"),
                P("status", "string", "Want (default), InProgress, Finished or Dropped.", MediaStatusValues),
                P("totalPages", "integer", "Books: pages."),
                P("whereToFind", "string", "Where to read/watch it (Netflix, library…)."),
                P("rating", "integer", "Finished or dropped only: 1–5."),
                P("review", "string", "Finished or dropped only: a short review."),
                TagsArg),
            async (ctx, args) =>
            {
                var tags = await TagsAsync(ctx, args);
                var request = Valid(new MediaItemRequest
                {
                    Kind = OneOf(args, "kind", MediaKindValues) ?? throw new ToolArgumentException("kind is required."),
                    Title = Required(args, "title"),
                    Creator = args.String("creator"),
                    WhereToFind = args.String("whereToFind"),
                    Status = OneOf(args, "status", MediaStatusValues) ?? MediaStatuses.Want,
                    TotalPages = args.Int("totalPages"),
                    Rating = Level(args.Int("rating")),
                    Review = args.String("review"),
                    Today = ctx.Today,
                });
                var card = new Card(false);
                card.Add("Kind", null, request.Kind);
                card.Add("By", null, request.Creator);
                card.Add("Status", null, MediaStatusText(request.Status, request.Kind));
                card.Add("Pages", null, Number(request.TotalPages));
                card.Add("Where", null, request.WhereToFind);
                card.Add("Rating", null, request.Rating is { } r ? $"{r} of 5" : null);
                card.Add("Review", null, Trunc(request.Review));
                card.Add("Tags", null, tags?.Text);
                return new ActionPlan($"Add {request.Kind.ToLowerInvariant()}: {request.Title}", card.Lines, () => WithTagsAsync(ctx, tags, [], async ids =>
                    Done(await ctx.Get<IMediaItemsService>().CreateAsync(Copy(request, ids)), ActionKinds.Created, "MediaItem", m => m.Id, m => m.Title)));
            }),

        new("update_media", ModuleKeys.Leisure,
            "Propose changes to a media item: status (started, finished…), the page reached, season/episode, rating, review.",
            Schema(["mediaItemId"],
                P("mediaItemId", "integer", "The item's id (from media)."),
                P("title", "string", "New title."),
                P("creator", "string", "Author, director…; null removes it."),
                P("status", "string", "Want, InProgress, Finished or Dropped.", MediaStatusValues),
                P("currentPage", "integer", "Books: the page reached (the last page finishes it)."),
                P("totalPages", "integer", "Books: pages."),
                P("season", "integer", "Series: the season."),
                P("episode", "integer", "Series/podcasts: the episode."),
                P("upNext", "boolean", "Want only: put it at the top of the backlog."),
                P("rating", "integer", "Finished or dropped only: 1–5."),
                P("review", "string", "Finished or dropped only: a short review."),
                TagsArg),
            async (ctx, args) =>
            {
                var media = ctx.Get<IMediaItemsService>();
                var item = Found(await media.GetAsync(Id(args, "mediaItemId")), "media item").Data!;
                var tags = await TagsAsync(ctx, args);
                var status = OneOf(args, "status", MediaStatusValues) ?? item.Status;
                var request = Valid(new MediaItemRequest
                {
                    Kind = item.Kind,
                    Title = Text(args, "title", item.Title) ?? throw new ToolArgumentException("An item needs a title."),
                    Creator = Text(args, "creator", item.Creator),
                    WhereToFind = item.WhereToFind,
                    Status = status,
                    UpNext = status == MediaStatuses.Want && (args.Bool("upNext") ?? item.UpNext),
                    TotalPages = IntOr(args, "totalPages", item.TotalPages),
                    CurrentPage = args.Int("currentPage") ?? item.CurrentPage,
                    Season = args.Has("season") ? (short?)args.Int("season") : item.Season,
                    Episode = args.Has("episode") ? (short?)args.Int("episode") : item.Episode,
                    StartedOn = item.StartedOn,
                    FinishedOn = item.FinishedOn,
                    Rating = args.Has("rating") ? Level(args.Int("rating")) : item.Rating,
                    Review = Text(args, "review", item.Review),
                    SkillId = item.SkillId,
                    LifeAreaId = item.LifeAreaId,
                    Today = ctx.Today,
                });
                var card = new Card(true);
                card.Add("Title", item.Title, request.Title);
                card.Add("By", item.Creator, request.Creator);
                card.Add("Status", MediaStatusText(item.Status, item.Kind), MediaStatusText(request.Status, item.Kind));
                card.Add("Page", Number(item.CurrentPage), Number(request.CurrentPage));
                card.Add("Pages", Number(item.TotalPages), Number(request.TotalPages));
                card.Add("Season", Number(item.Season), Number(request.Season));
                card.Add("Episode", Number(item.Episode), Number(request.Episode));
                card.Add("Up next", YesNo(item.UpNext), YesNo(request.UpNext));
                card.Add("Rating", item.Rating is { } r0 ? $"{r0} of 5" : null, request.Rating is { } r1 ? $"{r1} of 5" : null);
                card.Add("Review", Trunc(item.Review), Trunc(request.Review));
                card.Add("Tags", TagText(item.Tags), tags?.Text ?? TagText(item.Tags));
                card.RequireChange();
                return new ActionPlan($"Update {item.Kind.ToLowerInvariant()}: {item.Title}", card.Lines, () => WithTagsAsync(ctx, tags, item.Tags.Select(t => t.Id).ToList(), async ids =>
                    Done(await media.UpdateAsync(item.Id, Copy(request, ids)), ActionKinds.Updated, "MediaItem", m => m.Id, m => m.Title)));
            }),

        // ---- Money ----
        new("create_transaction", ModuleKeys.Finance,
            "Propose recording money spent (Expense) or received (Income) on one of the user's accounts. Transfers and edits are done on the Transactions page.",
            Schema(["kind", "amount"],
                P("kind", "string", "Expense or Income.", [TransactionKinds.Expense, TransactionKinds.Income]),
                P("amount", "number", "How much, in the account's currency (positive)."),
                P("account", "string", "The account's name (needed when there's more than one)."),
                P("date", "string", "The day, yyyy-MM-dd (default today)."),
                P("payee", "string", "Who was paid / who paid."),
                P("note", "string", "A note."),
                P("currency", "string", "Only on an account that holds several currencies: the 3-letter code."),
                P("exchangeRate", "number", "Only when the money isn't in the base currency: how much of the base currency one unit was worth."),
                TagsArg),
            async (ctx, args) =>
            {
                var kind = OneOf(args, "kind", TransactionKinds.Expense, TransactionKinds.Income) ?? throw new ToolArgumentException("kind is required.");
                var account = await AccountAsync(ctx, args.String("account"));
                var tags = await TagsAsync(ctx, args);
                var amount = args.Decimal("amount") ?? throw new ToolArgumentException("amount is required.");
                if (amount <= 0)
                {
                    throw new ToolArgumentException("amount must be more than 0.");
                }

                var currency = args.String("currency")?.ToUpperInvariant();
                var request = Valid(new TransactionRequest
                {
                    Kind = kind,
                    OccurredOn = args.Date("date") ?? ctx.Today,
                    Amount = amount,
                    Currency = currency,
                    ExchangeRate = args.Decimal("exchangeRate"),
                    FromAccountId = kind == TransactionKinds.Expense ? account.Id : null,
                    ToAccountId = kind == TransactionKinds.Income ? account.Id : null,
                    Payee = args.String("payee"),
                    Note = args.String("note"),
                });
                var card = new Card(false);
                card.Add("Amount", null, Money(amount, currency ?? account.Currency));
                card.Add(kind == TransactionKinds.Expense ? "From" : "Into", null, account.Name);
                card.Add("Day", null, Day(request.OccurredOn));
                card.Add("Payee", null, request.Payee);
                card.Add("Note", null, Trunc(request.Note));
                card.Add("Rate", null, Number(request.ExchangeRate));
                card.Add("Tags", null, tags?.Text);
                return new ActionPlan($"Record {kind.ToLowerInvariant()}: {Money(amount, currency ?? account.Currency)}{(request.Payee is null ? string.Empty : $" — {request.Payee}")}",
                    card.Lines, () => WithTagsAsync(ctx, tags, [], async ids =>
                        Done(await ctx.Get<ITransactionsService>().CreateAsync(Copy(request, ids)), ActionKinds.Created, "Transaction", t => t.Id,
                            t => t.Payee ?? Money(t.Amount, t.Currency)!)));
            }),

        // ---- People ----
        new("create_contact", null,
            "Propose a new person in the contact list.",
            Schema(["name"],
                P("name", "string", "Their name."),
                P("organisation", "string", "Where they work."),
                P("jobTitle", "string", "Their job."),
                P("email", "string", "Email address."),
                P("phone", "string", "Phone number."),
                P("notes", "string", "Notes."),
                TagsArg),
            async (ctx, args) =>
            {
                var tags = await TagsAsync(ctx, args);
                var request = Valid(new ContactRequest
                {
                    Name = Required(args, "name"),
                    Organisation = args.String("organisation"),
                    JobTitle = args.String("jobTitle"),
                    Email = args.String("email"),
                    Phone = args.String("phone"),
                    Notes = args.String("notes"),
                    Today = ctx.Today,
                });
                var card = new Card(false);
                card.Add("Organisation", null, request.Organisation);
                card.Add("Job", null, request.JobTitle);
                card.Add("Email", null, request.Email);
                card.Add("Phone", null, request.Phone);
                card.Add("Notes", null, Trunc(request.Notes));
                card.Add("Tags", null, tags?.Text);
                return new ActionPlan($"Add contact: {request.Name}", card.Lines, () => WithTagsAsync(ctx, tags, [], async ids =>
                    Done(await ctx.Get<IContactsService>().CreateAsync(Copy(request, ids)), ActionKinds.Created, "Contact", c => c.Id, c => c.Name)));
            }),

        new("update_contact", null,
            "Propose changes to a contact (only the fields sent change).",
            Schema(["contactId"],
                P("contactId", "integer", "The contact's id (from search)."),
                P("name", "string", "New name."),
                P("organisation", "string", "Organisation; null removes it."),
                P("jobTitle", "string", "Job; null removes it."),
                P("email", "string", "Email; null removes it."),
                P("phone", "string", "Phone; null removes it."),
                P("notes", "string", "Notes; null removes them."),
                P("lastContactedOn", "string", "Last in touch, yyyy-MM-dd."),
                TagsArg),
            async (ctx, args) =>
            {
                var contacts = ctx.Get<IContactsService>();
                var contact = Found(await contacts.GetAsync(Id(args, "contactId")), "contact").Data!;
                var tags = await TagsAsync(ctx, args);
                var request = Valid(new ContactRequest
                {
                    Name = Text(args, "name", contact.Name) ?? throw new ToolArgumentException("A contact needs a name."),
                    Organisation = Text(args, "organisation", contact.Organisation),
                    JobTitle = Text(args, "jobTitle", contact.JobTitle),
                    Email = Text(args, "email", contact.Email),
                    Phone = Text(args, "phone", contact.Phone),
                    Notes = Text(args, "notes", contact.Notes),
                    LastContactedOn = DateOr(args, "lastContactedOn", contact.LastContactedOn),
                    Today = ctx.Today,
                });
                var card = new Card(true);
                card.Add("Name", contact.Name, request.Name);
                card.Add("Organisation", contact.Organisation, request.Organisation);
                card.Add("Job", contact.JobTitle, request.JobTitle);
                card.Add("Email", contact.Email, request.Email);
                card.Add("Phone", contact.Phone, request.Phone);
                card.Add("Notes", Trunc(contact.Notes), Trunc(request.Notes));
                card.Add("Last in touch", Day(contact.LastContactedOn), Day(request.LastContactedOn));
                card.Add("Tags", TagText(contact.Tags), tags?.Text ?? TagText(contact.Tags));
                card.RequireChange();
                return new ActionPlan($"Update contact: {contact.Name}", card.Lines, () => WithTagsAsync(ctx, tags, contact.Tags.Select(t => t.Id).ToList(), async ids =>
                    Done(await contacts.UpdateAsync(contact.Id, Copy(request, ids)), ActionKinds.Updated, "Contact", c => c.Id, c => c.Name)));
            }),

        // ---- Home ----
        new("create_home_item", ModuleKeys.Home,
            "Propose adding something the user owns to the Home inventory.",
            Schema(["name"],
                P("name", "string", "What it is."),
                P("room", "string", "Where it is (Kitchen, Bedroom…)."),
                P("brand", "string", "Brand."),
                P("model", "string", "Model."),
                P("quantity", "integer", "How many (default 1)."),
                P("purchasedOn", "string", "Bought on, yyyy-MM-dd."),
                P("purchasePrice", "number", "What it cost."),
                P("currency", "string", "The price's 3-letter currency code."),
                P("notes", "string", "Notes."),
                TagsArg),
            async (ctx, args) =>
            {
                var tags = await TagsAsync(ctx, args);
                var request = Valid(new AssetRequest
                {
                    Name = Required(args, "name"),
                    Room = args.String("room"),
                    Brand = args.String("brand"),
                    Model = args.String("model"),
                    Quantity = args.Int("quantity") ?? 1,
                    PurchasedOn = args.Date("purchasedOn"),
                    PurchasePrice = args.Decimal("purchasePrice"),
                    Currency = args.String("currency")?.ToUpperInvariant(),
                    Notes = args.String("notes"),
                    Today = ctx.Today,
                });
                var card = new Card(false);
                card.Add("Room", null, request.Room);
                card.Add("Brand", null, request.Brand);
                card.Add("Model", null, request.Model);
                card.Add("Quantity", null, request.Quantity == 1 ? null : Number(request.Quantity));
                card.Add("Bought", null, Day(request.PurchasedOn));
                card.Add("Price", null, Money(request.PurchasePrice, request.Currency));
                card.Add("Notes", null, Trunc(request.Notes));
                card.Add("Tags", null, tags?.Text);
                return new ActionPlan($"Add to Home inventory: {request.Name}", card.Lines, () => WithTagsAsync(ctx, tags, [], async ids =>
                    Done(await ctx.Get<IAssetsService>().CreateAsync(Copy(request, ids)), ActionKinds.Created, "Asset", a => a.Id, a => a.Name)));
            }),

        new("update_home_item", ModuleKeys.Home,
            "Propose changes to a Home inventory item (only the fields sent change). Letting something go is done on the Home page.",
            Schema(["assetId"],
                P("assetId", "integer", "The item's id (from search)."),
                P("name", "string", "New name."),
                P("room", "string", "Room; null removes it."),
                P("brand", "string", "Brand; null removes it."),
                P("model", "string", "Model; null removes it."),
                P("quantity", "integer", "How many."),
                P("notes", "string", "Notes; null removes them."),
                TagsArg),
            async (ctx, args) =>
            {
                var assets = ctx.Get<IAssetsService>();
                var asset = Found(await assets.GetAsync(Id(args, "assetId")), "home item").Data!;
                var tags = await TagsAsync(ctx, args);
                var request = Valid(new AssetRequest
                {
                    Name = Text(args, "name", asset.Name) ?? throw new ToolArgumentException("An item needs a name."),
                    PropertyId = asset.PropertyId,
                    Room = Text(args, "room", asset.Room),
                    Brand = Text(args, "brand", asset.Brand),
                    Model = Text(args, "model", asset.Model),
                    SerialNumber = asset.SerialNumber,
                    Quantity = args.Int("quantity") ?? asset.Quantity,
                    PurchasedOn = asset.PurchasedOn,
                    PurchasePrice = asset.PurchasePrice,
                    Currency = asset.Currency,
                    Notes = Text(args, "notes", asset.Notes),
                    Today = ctx.Today,
                });
                var card = new Card(true);
                card.Add("Name", asset.Name, request.Name);
                card.Add("Room", asset.Room, request.Room);
                card.Add("Brand", asset.Brand, request.Brand);
                card.Add("Model", asset.Model, request.Model);
                card.Add("Quantity", Number(asset.Quantity), Number(request.Quantity));
                card.Add("Notes", Trunc(asset.Notes), Trunc(request.Notes));
                card.Add("Tags", TagText(asset.Tags), tags?.Text ?? TagText(asset.Tags));
                card.RequireChange();
                return new ActionPlan($"Update home item: {asset.Name}", card.Lines, () => WithTagsAsync(ctx, tags, asset.Tags.Select(t => t.Id).ToList(), async ids =>
                    Done(await assets.UpdateAsync(asset.Id, Copy(request, ids)), ActionKinds.Updated, "Asset", a => a.Id, a => a.Name)));
            }),
    ];
}
