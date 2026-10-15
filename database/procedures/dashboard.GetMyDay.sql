USE LifeOS_UAT;
GO

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- Everything the My Day screen shows, in one round trip: several result sets, read in order by DashboardService
-- through Dapper's QueryMultiple. Depends on 01_shared.sql to 07_dashboard.sql.
--
-- Result sets, in this order:
--   1 Tasks          open tasks due today or earlier (overdue), plus tasks due today already done
--   2 Events         events on the user's day (all-day overlapping @Today, timed overlapping the day's UTC span)
--   3 Reminders      not dismissed and due before the end of the day (includes ones already overdue)
--   4 Goals          active goals: milestone counts, next open milestone, last activity
--   5 Habits         active habits that have started
--   6 HabitEntries   every day ticked for those habits (streaks are computed in C# by HabitStreaks, never stored)
--   7 Journal        the latest journal entry on or before @Today (zero or one row)
--
-- @Today is the user's local date; @DayStartUtc/@DayEndUtc are its local midnights as UTC instants, worked out by the
-- client (same split as calendar.GetCalendarFeed). Half-open: [@DayStartUtc, @DayEndUtc).
--
-- This runs outside EF Core, so the global soft-delete/user filters do NOT apply: every query filters
-- UserId = @UserId and IsDeleted = 0 itself, including joined parents and children.
CREATE OR ALTER PROCEDURE dashboard.GetMyDay
    @UserId       INT,
    @Today        DATE,
    @DayStartUtc  DATETIME2,
    @DayEndUtc    DATETIME2
AS
BEGIN
    SET NOCOUNT ON;

    IF @DayEndUtc <= @DayStartUtc
        THROW 50001, 'The end of the day must be after its start.', 1;

    -- 1 Tasks. Done tasks due today stay in the list so ticking one off on My Day doesn't make it vanish; done
    -- overdue ones don't (they're finished business). Order: oldest due first, then priority, then newest.
    SELECT
        t.Id,
        t.Title,
        t.DueDate,
        t.Priority,
        IsDone      = CAST(CASE WHEN t.Status = N'Done' THEN 1 ELSE 0 END AS BIT),
        IsRecurring = CAST(CASE WHEN t.RecurrenceFrequency IS NOT NULL THEN 1 ELSE 0 END AS BIT),
        ProjectId   = p.Id,
        ProjectName = p.Name
    FROM tasks.TaskItems t
    LEFT JOIN tasks.Projects p
        ON p.Id = t.ProjectId
       AND p.IsDeleted = 0
    WHERE t.UserId = @UserId
      AND t.IsDeleted = 0
      AND (
            (t.Status = N'Open' AND t.DueDate <= @Today)
         OR (t.Status = N'Done' AND t.DueDate = @Today)
          )
    ORDER BY
        t.DueDate,
        CASE t.Priority WHEN N'High' THEN 0 WHEN N'Medium' THEN 1 WHEN N'Low' THEN 2 ELSE 3 END,
        t.Id DESC;

    -- 2 Events. All-day first, then timed by start.
    SELECT
        e.Id,
        e.Title,
        e.IsAllDay,
        e.StartDate,
        e.EndDate,
        e.StartsAt,
        e.EndsAt,
        e.Location
    FROM calendar.Events e
    WHERE e.UserId = @UserId
      AND e.IsDeleted = 0
      AND (
            (e.IsAllDay = 1 AND e.StartDate <= @Today AND e.EndDate >= @Today)
         OR (e.IsAllDay = 0 AND e.StartsAt < @DayEndUtc AND e.EndsAt >= @DayStartUtc)
          )
    ORDER BY e.IsAllDay DESC, e.StartsAt, e.Title, e.Id;

    -- 3 Reminders still open today: overdue ones and the rest of the day's.
    SELECT
        r.Id,
        r.Title,
        r.RemindAt,
        r.EntityType,
        r.EntityId
    FROM calendar.Reminders r
    WHERE r.UserId = @UserId
      AND r.IsDeleted = 0
      AND r.DismissedAt IS NULL
      AND r.RemindAt < @DayEndUtc
    ORDER BY r.RemindAt, r.Id;

    -- 4 Active goals. Each child is aggregated in its own OUTER APPLY — joining milestones and history together and
    -- grouping once would multiply the counts (CLAUDE.md, "join fan-out").
    -- LastActivityAt: the goal's own UpdatedAt already moves on every edit, status change and milestone change (the
    -- services touch it), and history rows are written alongside; GREATEST keeps it right if either one lags.
    SELECT
        g.Id,
        g.Title,
        g.GoalType,
        g.TargetDate,
        LifeAreaName            = la.Name,
        MilestoneCount          = ISNULL(ms.MilestoneCount, 0),
        CompletedMilestoneCount = ISNULL(ms.CompletedMilestoneCount, 0),
        NextMilestoneId         = nm.Id,
        NextMilestoneTitle      = nm.Title,
        NextMilestoneTargetDate = nm.TargetDate,
        LastActivityAt          = GREATEST(g.UpdatedAt, g.CreatedAt, h.LastHistoryAt, ms.LastMilestoneAt)
    FROM goals.Goals g
    INNER JOIN shared.LifeAreas la
        ON la.Id = g.LifeAreaId
    OUTER APPLY (
        SELECT
            MilestoneCount          = COUNT(*),
            CompletedMilestoneCount = SUM(CASE WHEN m.CompletedAt IS NOT NULL THEN 1 ELSE 0 END),
            LastMilestoneAt         = MAX(m.UpdatedAt)
        FROM goals.GoalMilestones m
        WHERE m.GoalId = g.Id
          AND m.UserId = @UserId
          AND m.IsDeleted = 0
    ) ms
    OUTER APPLY (
        -- The next thing to do: the first open milestone in the user's own order.
        SELECT TOP (1) m.Id, m.Title, m.TargetDate
        FROM goals.GoalMilestones m
        WHERE m.GoalId = g.Id
          AND m.UserId = @UserId
          AND m.IsDeleted = 0
          AND m.CompletedAt IS NULL
        ORDER BY m.SortOrder, m.Id
    ) nm
    OUTER APPLY (
        SELECT LastHistoryAt = MAX(gh.CreatedAt)
        FROM goals.GoalHistory gh
        WHERE gh.GoalId = g.Id
          AND gh.UserId = @UserId
          AND gh.IsDeleted = 0
    ) h
    WHERE g.UserId = @UserId
      AND g.IsDeleted = 0
      AND g.Status = N'Active'
    -- Dated goals first, soonest first; undated (bucket list) ones after, newest first.
    ORDER BY CASE WHEN g.TargetDate IS NULL THEN 1 ELSE 0 END, g.TargetDate, g.CreatedAt DESC, g.Id;

    -- 5 Active habits that have started (a habit starting tomorrow has nothing to show yet).
    SELECT
        hb.Id,
        hb.Title,
        hb.ScheduleDays,
        hb.StartDate,
        LifeAreaName = la.Name
    FROM habits.Habits hb
    LEFT JOIN shared.LifeAreas la
        ON la.Id = hb.LifeAreaId
    WHERE hb.UserId = @UserId
      AND hb.IsDeleted = 0
      AND hb.Status = N'Active'
      AND hb.StartDate <= @Today
    ORDER BY hb.Title, hb.Id;

    -- 6 Their ticked days, full history (the longest streak needs all of it), nothing after @Today.
    SELECT
        he.HabitId,
        he.EntryDate
    FROM habits.HabitEntries he
    INNER JOIN habits.Habits hb
        ON hb.Id = he.HabitId
       AND hb.UserId = @UserId
       AND hb.IsDeleted = 0
       AND hb.Status = N'Active'
       AND hb.StartDate <= @Today
    WHERE he.UserId = @UserId
      AND he.IsDeleted = 0
      AND he.EntryDate <= @Today
    ORDER BY he.HabitId, he.EntryDate;

    -- 7 The latest journal entry up to today, with a short excerpt (the full text can be long).
    SELECT TOP (1)
        je.Id,
        je.EntryDate,
        je.Title,
        Excerpt = LEFT(je.Content, 280),
        je.Mood
    FROM journal.JournalEntries je
    WHERE je.UserId = @UserId
      AND je.IsDeleted = 0
      AND je.EntryDate <= @Today
    ORDER BY je.EntryDate DESC;
END
GO
