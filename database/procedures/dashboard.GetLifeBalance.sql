USE LifeOS_UAT;
GO

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- The Life Balance Wheel's raw numbers: for every life area (the fixed, shared taxonomy), how much happened in it over
-- a window. One row per area, including areas with nothing (the wheel needs every spoke). Called via Dapper from
-- DashboardService, which turns the counts into scores (LifeBalance). Depends on 01_shared.sql to 07_dashboard.sql.
--
--   ActiveGoals          active goals in the area right now (not windowed — what you're aiming at)
--   GoalsCompleted       goals completed inside the window
--   MilestonesCompleted  milestones ticked inside the window, on the area's goals
--   HabitTicks           habit days done inside the window, on the area's habits (archived habits still count:
--                        the days were really done)
--   JournalEntries       journal entries dated inside the window and filed under the area
--
-- Same two kinds of range as calendar.GetCalendarFeed: @FromDate/@ToDate (local days, inclusive) for DATE columns,
-- @FromUtc/@ToUtc (the same span as UTC instants, half-open) for the CompletedAt moments.
-- Every subquery filters UserId/IsDeleted itself (EF's filters don't apply here); tasks have no life area, so they
-- don't feed the wheel.
CREATE OR ALTER PROCEDURE dashboard.GetLifeBalance
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

    -- One correlated aggregate per measure: each is a separate COUNT over its own table, so nothing fans out.
    SELECT
        LifeAreaId = la.Id,
        LifeAreaName = la.Name,
        ActiveGoals = (
            SELECT COUNT(*)
            FROM goals.Goals g
            WHERE g.UserId = @UserId AND g.IsDeleted = 0
              AND g.LifeAreaId = la.Id
              AND g.Status = N'Active'
        ),
        GoalsCompleted = (
            SELECT COUNT(*)
            FROM goals.Goals g
            WHERE g.UserId = @UserId AND g.IsDeleted = 0
              AND g.LifeAreaId = la.Id
              AND g.Status = N'Completed'
              AND g.CompletedAt >= @FromUtc AND g.CompletedAt < @ToUtc
        ),
        MilestonesCompleted = (
            SELECT COUNT(*)
            FROM goals.GoalMilestones m
            INNER JOIN goals.Goals g
                ON g.Id = m.GoalId
               AND g.UserId = @UserId
               AND g.IsDeleted = 0
               AND g.LifeAreaId = la.Id
            WHERE m.UserId = @UserId AND m.IsDeleted = 0
              AND m.CompletedAt >= @FromUtc AND m.CompletedAt < @ToUtc
        ),
        HabitTicks = (
            SELECT COUNT(*)
            FROM habits.HabitEntries he
            INNER JOIN habits.Habits hb
                ON hb.Id = he.HabitId
               AND hb.UserId = @UserId
               AND hb.IsDeleted = 0
               AND hb.LifeAreaId = la.Id
               AND hb.Kind = N'Build'
            WHERE he.UserId = @UserId AND he.IsDeleted = 0
              AND he.EntryDate BETWEEN @FromDate AND @ToDate
              -- Only days that count as done (a measurable habit's met days; an avoid habit's slips never count).
              AND (hb.TargetValue IS NULL OR he.Value IS NULL OR he.Value >= hb.TargetValue)
        ),
        JournalEntries = (
            SELECT COUNT(*)
            FROM journal.JournalEntries je
            WHERE je.UserId = @UserId AND je.IsDeleted = 0
              AND je.LifeAreaId = la.Id
              AND je.EntryDate BETWEEN @FromDate AND @ToDate
        )
    FROM shared.LifeAreas la
    WHERE la.IsDeleted = 0
    ORDER BY la.SortOrder, la.Id;
END
GO
