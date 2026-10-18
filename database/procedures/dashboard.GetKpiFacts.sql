USE LifeOS_UAT;
GO

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- The raw numbers behind My Day's personal KPI tiles (Session 46). Called via Dapper from DashboardService, which
-- works out the windows from the user's local today + IANA zone and turns these into tiles; habit consistency is
-- computed in C# (KpiFigures) from sets 2-3 because it depends on each habit's weekday schedule.
--
-- Windows: "this week" = Monday of the local week up to the end of today, "last week" = the whole week before;
-- "30 days" = the 30 local days ending today, "previous 30" = the 30 before those; "this year" = 1 January to now.
-- DATE columns compare with the local days, moments (CompletedAt, EndedAt) with the same spans as UTC instants
-- (half-open). Every query filters UserId/IsDeleted itself, joined parents included.
--
--   1. one row of counts (see the column names)
--   2. active build habits: Id, ScheduleDays, StartDate
--   3. their met days (habit days that count — HabitStreaks.IsMet) from @Prev30Start to @Today: HabitId, EntryDate
CREATE OR ALTER PROCEDURE dashboard.GetKpiFacts
    @UserId             INT,
    @Today              DATE,
    @Last30Start        DATE,
    @Prev30Start        DATE,
    @WeekStartUtc       DATETIME2,
    @LastWeekStartUtc   DATETIME2,
    @Last30StartUtc     DATETIME2,
    @Prev30StartUtc     DATETIME2,
    @YearStartUtc       DATETIME2,
    @TomorrowStartUtc   DATETIME2
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        TasksDoneThisWeek = (
            SELECT COUNT(*) FROM tasks.TaskItems t
            WHERE t.UserId = @UserId AND t.IsDeleted = 0 AND t.Status = N'Done'
              AND t.CompletedAt >= @WeekStartUtc AND t.CompletedAt < @TomorrowStartUtc
        ),
        TasksDoneLastWeek = (
            SELECT COUNT(*) FROM tasks.TaskItems t
            WHERE t.UserId = @UserId AND t.IsDeleted = 0 AND t.Status = N'Done'
              AND t.CompletedAt >= @LastWeekStartUtc AND t.CompletedAt < @WeekStartUtc
        ),
        FocusMinutesThisWeek = (
            SELECT ISNULL(SUM(f.Minutes), 0) FROM tasks.FocusSessions f
            INNER JOIN tasks.TaskItems t ON t.Id = f.TaskItemId AND t.UserId = @UserId AND t.IsDeleted = 0
            WHERE f.UserId = @UserId AND f.IsDeleted = 0
              AND f.EndedAt >= @WeekStartUtc AND f.EndedAt < @TomorrowStartUtc
        ),
        FocusMinutesLastWeek = (
            SELECT ISNULL(SUM(f.Minutes), 0) FROM tasks.FocusSessions f
            INNER JOIN tasks.TaskItems t ON t.Id = f.TaskItemId AND t.UserId = @UserId AND t.IsDeleted = 0
            WHERE f.UserId = @UserId AND f.IsDeleted = 0
              AND f.EndedAt >= @LastWeekStartUtc AND f.EndedAt < @WeekStartUtc
        ),
        JournalDaysLast30 = (
            SELECT COUNT(*) FROM journal.JournalEntries j
            WHERE j.UserId = @UserId AND j.IsDeleted = 0
              AND j.EntryDate >= @Last30Start AND j.EntryDate <= @Today
        ),
        JournalDaysPrev30 = (
            SELECT COUNT(*) FROM journal.JournalEntries j
            WHERE j.UserId = @UserId AND j.IsDeleted = 0
              AND j.EntryDate >= @Prev30Start AND j.EntryDate < @Last30Start
        ),
        ObjectivesDoneLast30 = (
            SELECT COUNT(*) FROM goals.GoalMilestones m
            INNER JOIN goals.Goals g ON g.Id = m.GoalId AND g.UserId = @UserId AND g.IsDeleted = 0
            WHERE m.UserId = @UserId AND m.IsDeleted = 0
              AND m.CompletedAt >= @Last30StartUtc AND m.CompletedAt < @TomorrowStartUtc
        ),
        ObjectivesDonePrev30 = (
            SELECT COUNT(*) FROM goals.GoalMilestones m
            INNER JOIN goals.Goals g ON g.Id = m.GoalId AND g.UserId = @UserId AND g.IsDeleted = 0
            WHERE m.UserId = @UserId AND m.IsDeleted = 0
              AND m.CompletedAt >= @Prev30StartUtc AND m.CompletedAt < @Last30StartUtc
        ),
        GoalsPassedThisYear = (
            SELECT COUNT(*) FROM goals.Goals g
            WHERE g.UserId = @UserId AND g.IsDeleted = 0 AND g.Status = N'Completed'
              AND g.CompletedAt >= @YearStartUtc AND g.CompletedAt < @TomorrowStartUtc
        ),
        GoalsActive = (
            SELECT COUNT(*) FROM goals.Goals g
            WHERE g.UserId = @UserId AND g.IsDeleted = 0 AND g.Status = N'Active'
        );

    SELECT h.Id, h.ScheduleDays, h.StartDate
    FROM habits.Habits h
    WHERE h.UserId = @UserId AND h.IsDeleted = 0 AND h.Status = N'Active' AND h.Kind = N'Build'
      AND h.StartDate <= @Today;

    -- The one rule for "a day counts" (HabitStreaks.IsMet), as in every habit-counting procedure.
    SELECT e.HabitId, e.EntryDate
    FROM habits.HabitEntries e
    INNER JOIN habits.Habits h ON h.Id = e.HabitId AND h.UserId = @UserId AND h.IsDeleted = 0
    WHERE e.UserId = @UserId AND e.IsDeleted = 0
      AND h.Status = N'Active' AND h.Kind = N'Build'
      AND e.EntryDate >= @Prev30Start AND e.EntryDate <= @Today
      AND (h.TargetValue IS NULL OR e.Value IS NULL OR e.Value >= h.TargetValue);
END
GO
