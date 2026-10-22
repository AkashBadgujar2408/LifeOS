USE LifeOS_UAT;
GO

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- The productivity report's raw rows (Session 91), eight result sets read in this order by ReportsService:
--   1. tasks with anything in the range: completed in it (@FromUtc..@ToUtc), due in it, or created in it — with their
--      estimate, their focus minutes of all time (a task's actual time is always the sum of its focus sessions) and
--      the life area they serve (see below)
--   2. focus sessions that started in the range (on live tasks), with the task's life area
--   3. study sessions in the range, with their life area (skill's, else course's, else media item's, else Learning —
--      the same rule as story.GetLifeAreaStats)
--   4. hobby practice sessions in the range, with the hobby's life area (may be none)
--   5. one-off timed events overlapping the range (time blocks — all-day events plan no hours)
--   6. recurring timed series that may have an occurrence in the range (as calendar.GetCalendarFeed's set 2)
--   7. their skipped occurrences
--   8. the life areas (the taxonomy, in order)
--
-- Tasks have no life area of their own, so a task's area is the goal it serves: a goal it is linked to, else a goal
-- whose milestone follows it, else the same for its project — lowest goal id when several. Nothing found = no area.
--
-- Two kinds of range, as in the calendar feed: @FromDate/@ToDate are local days (DATE columns), @FromUtc/@ToUtc the
-- same span as UTC instants, half-open. Every branch filters UserId/IsDeleted itself (EF's filters don't apply here).
CREATE OR ALTER PROCEDURE reports.GetProductivityReport
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

    -- Every live task's life area, worked out once for sets 1 and 2.
    CREATE TABLE #TaskAreas (TaskItemId INT NOT NULL PRIMARY KEY, LifeAreaId INT NULL);

    INSERT INTO #TaskAreas (TaskItemId, LifeAreaId)
    SELECT t.Id, area.LifeAreaId
    FROM tasks.TaskItems t
    OUTER APPLY (
        SELECT TOP (1) g.LifeAreaId
        FROM (
            -- 1: the task linked to a goal (links are undirected; look both ways)
            SELECT Pick = 1, GoalId = l.SourceEntityId
            FROM shared.EntityLinks l
            WHERE l.UserId = @UserId AND l.IsDeleted = 0
              AND l.SourceEntityType = N'Goal' AND l.TargetEntityType = N'Task' AND l.TargetEntityId = t.Id
            UNION ALL
            SELECT 1, l.TargetEntityId
            FROM shared.EntityLinks l
            WHERE l.UserId = @UserId AND l.IsDeleted = 0
              AND l.TargetEntityType = N'Goal' AND l.SourceEntityType = N'Task' AND l.SourceEntityId = t.Id
            -- 2: a milestone that follows the task
            UNION ALL
            SELECT 2, m.GoalId
            FROM goals.GoalMilestones m
            WHERE m.UserId = @UserId AND m.IsDeleted = 0 AND m.TaskItemId = t.Id
            -- 3: its project linked to a goal
            UNION ALL
            SELECT 3, l.SourceEntityId
            FROM shared.EntityLinks l
            WHERE t.ProjectId IS NOT NULL AND l.UserId = @UserId AND l.IsDeleted = 0
              AND l.SourceEntityType = N'Goal' AND l.TargetEntityType = N'Project' AND l.TargetEntityId = t.ProjectId
            UNION ALL
            SELECT 3, l.TargetEntityId
            FROM shared.EntityLinks l
            WHERE t.ProjectId IS NOT NULL AND l.UserId = @UserId AND l.IsDeleted = 0
              AND l.TargetEntityType = N'Goal' AND l.SourceEntityType = N'Project' AND l.SourceEntityId = t.ProjectId
            -- 4: a milestone that follows its project
            UNION ALL
            SELECT 4, m.GoalId
            FROM goals.GoalMilestones m
            WHERE t.ProjectId IS NOT NULL AND m.UserId = @UserId AND m.IsDeleted = 0 AND m.ProjectId = t.ProjectId
        ) served
        INNER JOIN goals.Goals g ON g.Id = served.GoalId AND g.UserId = @UserId AND g.IsDeleted = 0
        ORDER BY served.Pick, g.Id
    ) area
    WHERE t.UserId = @UserId AND t.IsDeleted = 0;

    -- 1. Tasks with anything in the range.
    SELECT
        t.Id,
        t.Title,
        ProjectName = p.Name,
        t.DueDate,
        t.Status,
        t.CompletedAt,
        t.CreatedAt,
        t.EstimateMinutes,
        FocusMinutes = ISNULL(focus.Minutes, 0),
        ta.LifeAreaId
    FROM tasks.TaskItems t
    INNER JOIN #TaskAreas ta ON ta.TaskItemId = t.Id
    LEFT JOIN tasks.Projects p ON p.Id = t.ProjectId AND p.UserId = @UserId AND p.IsDeleted = 0
    OUTER APPLY (
        SELECT Minutes = SUM(f.Minutes)
        FROM tasks.FocusSessions f
        WHERE f.UserId = @UserId AND f.IsDeleted = 0 AND f.TaskItemId = t.Id
    ) focus
    WHERE t.UserId = @UserId AND t.IsDeleted = 0
      AND ((t.CompletedAt >= @FromUtc AND t.CompletedAt < @ToUtc)
           OR t.DueDate BETWEEN @FromDate AND @ToDate
           OR (t.CreatedAt >= @FromUtc AND t.CreatedAt < @ToUtc))
    ORDER BY t.Id;

    -- 2. Focus sessions that started in the range.
    SELECT f.TaskItemId, f.StartedAt, f.Minutes, ta.LifeAreaId
    FROM tasks.FocusSessions f
    INNER JOIN #TaskAreas ta ON ta.TaskItemId = f.TaskItemId
    WHERE f.UserId = @UserId AND f.IsDeleted = 0
      AND f.StartedAt >= @FromUtc AND f.StartedAt < @ToUtc
    ORDER BY f.StartedAt;

    -- 3. Study sessions in the range. A deleted parent no longer gives the session its area.
    SELECT
        Day = ss.StudiedOn,
        ss.Minutes,
        LifeAreaId = COALESCE(sk.LifeAreaId, c.LifeAreaId, b.LifeAreaId,
                              (SELECT TOP (1) l.Id FROM shared.LifeAreas l WHERE l.Name = N'Learning' AND l.IsDeleted = 0))
    FROM learning.StudySessions ss
    LEFT JOIN learning.Skills sk ON sk.Id = ss.SkillId AND sk.UserId = @UserId AND sk.IsDeleted = 0
    LEFT JOIN learning.Courses c ON c.Id = ss.CourseId AND c.UserId = @UserId AND c.IsDeleted = 0
    LEFT JOIN leisure.MediaItems b ON b.Id = ss.MediaItemId AND b.UserId = @UserId AND b.IsDeleted = 0
    WHERE ss.UserId = @UserId AND ss.IsDeleted = 0
      AND ss.StudiedOn BETWEEN @FromDate AND @ToDate
    ORDER BY ss.StudiedOn;

    -- 4. Hobby practice in the range (sessions of a deleted hobby are gone with it).
    SELECT Day = hs.PracticedOn, hs.Minutes, h.LifeAreaId
    FROM leisure.HobbySessions hs
    INNER JOIN leisure.Hobbies h ON h.Id = hs.HobbyId AND h.UserId = @UserId AND h.IsDeleted = 0
    WHERE hs.UserId = @UserId AND hs.IsDeleted = 0
      AND hs.PracticedOn BETWEEN @FromDate AND @ToDate
    ORDER BY hs.PracticedOn;

    -- 5. One-off timed events overlapping the range.
    SELECT e.Id, e.StartsAt, e.EndsAt, e.LifeAreaId
    FROM calendar.Events e
    WHERE e.UserId = @UserId AND e.IsDeleted = 0
      AND e.RecurrenceFrequency IS NULL
      AND e.IsAllDay = 0
      AND e.StartsAt < @ToUtc AND e.EndsAt > @FromUtc
    ORDER BY e.StartsAt;

    -- 6. Timed series that may have an occurrence in the range (the feed's filter: RecurrenceUntil is the last day an
    -- occurrence may start, so allow for its length plus two days of timezone slack). EventRecurrence expands them.
    SELECT
        e.Id, e.Title, e.IsAllDay, e.StartDate, e.EndDate, e.StartsAt, e.EndsAt, e.Location,
        e.RecurrenceFrequency, e.RecurrenceInterval, e.RecurrenceUntil, e.TimeZone, e.LifeAreaId
    FROM calendar.Events e
    WHERE e.UserId = @UserId AND e.IsDeleted = 0
      AND e.RecurrenceFrequency IS NOT NULL
      AND e.IsAllDay = 0
      AND e.StartsAt < @ToUtc
      AND (e.RecurrenceUntil IS NULL
           OR e.RecurrenceUntil >= DATEADD(DAY, -DATEDIFF(DAY, e.StartsAt, e.EndsAt) - 2, @FromDate))
    ORDER BY e.Id;

    -- 7. Their skipped occurrences.
    SELECT x.EventId, x.OccurrenceDate
    FROM calendar.EventExceptions x
    INNER JOIN calendar.Events e
        ON e.Id = x.EventId AND e.UserId = @UserId AND e.IsDeleted = 0
       AND e.RecurrenceFrequency IS NOT NULL AND e.IsAllDay = 0
    WHERE x.UserId = @UserId AND x.IsDeleted = 0
      AND x.OccurrenceDate <= DATEADD(DAY, 2, @ToDate);

    -- 8. The life areas, in order.
    SELECT la.Id, la.Name
    FROM shared.LifeAreas la
    WHERE la.IsDeleted = 0
    ORDER BY la.SortOrder, la.Id;

    DROP TABLE #TaskAreas;
END
GO
