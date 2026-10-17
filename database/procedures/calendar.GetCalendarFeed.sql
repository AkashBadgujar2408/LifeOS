USE LifeOS_UAT;
GO

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- The unified calendar feed: everything with a date that falls in a range, from every module, as one row shape.
-- Called via Dapper from CalendarFeedService. Depends on 02_goals.sql, 03_tasks.sql, 04_calendar.sql.
--
-- Sources (SourceType) in result set 1:
--   Event      one-off calendar.Events — all-day (date range) or timed (UTC moments); recurring ones are sets 2-3
--   Task       tasks.TaskItems with a DueDate (open and done; IsDone tells them apart)
--   Milestone  goals.GoalMilestones with a TargetDate
--   Goal       goals.Goals with a TargetDate
--
-- Two kinds of range, because the data has two kinds of time (see CLAUDE.md "Calendar dates are DATE"):
--   @FromDate/@ToDate  the user's *local* calendar days shown, inclusive — matched against DATE columns as-is.
--   @FromUtc/@ToUtc    the same span as UTC instants (local midnight of @FromDate to local midnight after @ToDate),
--                      computed by the client, which is the only side that knows the user's timezone — matched
--                      against timed events. Half-open: [@FromUtc, @ToUtc).
--
-- Events carry their optional LifeAreaId (time blocking, Session 35); other sources return NULL there.
--
-- This runs outside EF Core, so the global soft-delete/user filters do NOT apply: every branch filters
-- UserId = @UserId and IsDeleted = 0 itself, including on joined parents (a milestone of a deleted goal is gone).
CREATE OR ALTER PROCEDURE calendar.GetCalendarFeed
    @UserId     INT,
    @FromDate   DATE,
    @ToDate     DATE,
    @FromUtc    DATETIME2,
    @ToUtc      DATETIME2
AS
BEGIN
    SET NOCOUNT ON;

    IF @ToDate < @FromDate OR @ToUtc <= @FromUtc
        THROW 50001, 'The end of the range must be after its start.', 1;

    -- All-day events: overlap test on inclusive date ranges (a 3-7 April holiday shows in a 5-30 April view).
    SELECT
        SourceType  = N'Event',
        SourceId    = e.Id,
        Title       = e.Title,
        IsAllDay    = CAST(1 AS BIT),
        StartDate   = e.StartDate,
        EndDate     = e.EndDate,
        StartsAt    = CAST(NULL AS DATETIME2),
        EndsAt      = CAST(NULL AS DATETIME2),
        IsDone      = CAST(0 AS BIT),
        Priority    = CAST(NULL AS NVARCHAR(10)),
        ParentId    = CAST(NULL AS INT),
        ParentTitle = CAST(NULL AS NVARCHAR(200)),
        Location    = e.Location,
        LifeAreaId  = e.LifeAreaId
    FROM calendar.Events e
    WHERE e.UserId = @UserId
      AND e.IsDeleted = 0
      AND e.IsAllDay = 1
      AND e.RecurrenceFrequency IS NULL
      AND e.StartDate <= @ToDate
      AND e.EndDate >= @FromDate

    UNION ALL

    -- Timed events: overlap test on UTC instants. EndsAt >= @FromUtc (not >) keeps a zero-length event that sits
    -- exactly on the range start.
    SELECT
        N'Event', e.Id, e.Title, CAST(0 AS BIT),
        NULL, NULL, e.StartsAt, e.EndsAt,
        CAST(0 AS BIT), NULL, NULL, NULL, e.Location, e.LifeAreaId
    FROM calendar.Events e
    WHERE e.UserId = @UserId
      AND e.IsDeleted = 0
      AND e.IsAllDay = 0
      AND e.RecurrenceFrequency IS NULL
      AND e.StartsAt < @ToUtc
      AND e.EndsAt >= @FromUtc

    UNION ALL

    -- Task due dates. The project is optional, so LEFT JOIN — with IsDeleted in the ON clause, so a deleted project
    -- just means no ParentTitle rather than dropping the task.
    SELECT
        N'Task', t.Id, t.Title, CAST(1 AS BIT),
        t.DueDate, t.DueDate, NULL, NULL,
        CAST(CASE WHEN t.Status = N'Done' THEN 1 ELSE 0 END AS BIT),
        t.Priority, p.Id, p.Name, NULL, NULL
    FROM tasks.TaskItems t
    LEFT JOIN tasks.Projects p
        ON p.Id = t.ProjectId
       AND p.IsDeleted = 0
    WHERE t.UserId = @UserId
      AND t.IsDeleted = 0
      AND t.DueDate BETWEEN @FromDate AND @ToDate

    UNION ALL

    -- Milestone target dates, labelled with their goal. INNER JOIN: no live goal, no milestone. Abandoned goals
    -- drop off the calendar — their dates no longer mean anything.
    SELECT
        N'Milestone', m.Id, m.Title, CAST(1 AS BIT),
        m.TargetDate, m.TargetDate, NULL, NULL,
        CAST(CASE WHEN m.CompletedAt IS NOT NULL THEN 1 ELSE 0 END AS BIT),
        NULL, g.Id, g.Title, NULL, NULL
    FROM goals.GoalMilestones m
    INNER JOIN goals.Goals g
        ON g.Id = m.GoalId
       AND g.IsDeleted = 0
       AND g.Status <> N'Abandoned'
    WHERE m.UserId = @UserId
      AND m.IsDeleted = 0
      AND m.TargetDate BETWEEN @FromDate AND @ToDate

    UNION ALL

    -- Goal target dates themselves (same Abandoned rule).
    SELECT
        N'Goal', g.Id, g.Title, CAST(1 AS BIT),
        g.TargetDate, g.TargetDate, NULL, NULL,
        CAST(CASE WHEN g.Status = N'Completed' THEN 1 ELSE 0 END AS BIT),
        NULL, NULL, NULL, NULL, NULL
    FROM goals.Goals g
    WHERE g.UserId = @UserId
      AND g.IsDeleted = 0
      AND g.Status <> N'Abandoned'
      AND g.TargetDate BETWEEN @FromDate AND @ToDate

    -- A stable order: date-based items by date, then timed events by start. The client still places each item on
    -- its local day (only it can turn StartsAt into a local date); this just keeps ties deterministic.
    -- A UNION's ORDER BY may only use the column names of its first SELECT.
    ORDER BY IsAllDay DESC, StartDate, StartsAt, SourceType, Title, SourceId;

    -- Result set 2: recurring event series that may have an occurrence in the range (Session 33). Occurrences aren't
    -- stored, so this can't be an overlap test on the row's own dates — those are only the first occurrence.
    -- CalendarFeedService expands each series (EventRecurrence) and keeps what really overlaps; here it's enough to
    -- drop series that start after the range or ended well before it. RecurrenceUntil is the last day an occurrence
    -- may start, so allow for the occurrence's own length (plus two days of timezone slack for timed series).
    SELECT
        e.Id, e.Title, e.IsAllDay, e.StartDate, e.EndDate, e.StartsAt, e.EndsAt, e.Location,
        e.RecurrenceFrequency, e.RecurrenceInterval, e.RecurrenceUntil, e.TimeZone, e.LifeAreaId
    FROM calendar.Events e
    WHERE e.UserId = @UserId
      AND e.IsDeleted = 0
      AND e.RecurrenceFrequency IS NOT NULL
      AND ((e.IsAllDay = 1 AND e.StartDate <= @ToDate) OR (e.IsAllDay = 0 AND e.StartsAt < @ToUtc))
      AND (e.RecurrenceUntil IS NULL
           OR (e.IsAllDay = 1 AND e.RecurrenceUntil >= DATEADD(DAY, -DATEDIFF(DAY, e.StartDate, e.EndDate), @FromDate))
           OR (e.IsAllDay = 0 AND e.RecurrenceUntil >= DATEADD(DAY, -DATEDIFF(DAY, e.StartsAt, e.EndsAt) - 2, @FromDate)))
    ORDER BY e.Id;

    -- Result set 3: skipped occurrences of those series (joined so a deleted series' skips stay out).
    SELECT x.EventId, x.OccurrenceDate
    FROM calendar.EventExceptions x
    INNER JOIN calendar.Events e
        ON e.Id = x.EventId
       AND e.UserId = @UserId
       AND e.IsDeleted = 0
       AND e.RecurrenceFrequency IS NOT NULL
    WHERE x.UserId = @UserId
      AND x.IsDeleted = 0
      AND x.OccurrenceDate <= DATEADD(DAY, 2, @ToDate);
END
GO
