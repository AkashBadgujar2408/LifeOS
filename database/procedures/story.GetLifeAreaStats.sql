USE LifeOS_UAT;
GO

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- Story Mode's life-area stats: everything ever finished in each life area, all time, for LifeAreaLevels to turn into
-- XP and a level (computed on every request, never stored; nothing decays — a missed week takes nothing away).
-- One row per life area, including areas with nothing yet. Depends on 01_shared.sql to 06_journal.sql.
--
--   GoalsCompleted       goals currently Completed in the area (a reopened goal stops counting until passed again)
--   MilestonesCompleted  milestones ticked on the area's goals
--   HabitDays            habit days done on the area's habits (archived habits still count: the days were done)
--   JournalEntries       journal entries filed under the area
--   LastActivityOn       the latest DATE of any of those (UTC date for the CompletedAt moments — only used to say
--                        "last moved on", so a day's drift across timezones doesn't matter)
--
-- Same shape as dashboard.GetLifeBalance, minus the window and active goals (aiming at something earns no XP).
-- Every subquery filters UserId/IsDeleted itself (EF's filters don't apply here).
CREATE OR ALTER PROCEDURE story.GetLifeAreaStats
    @UserId INT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        LifeAreaId = la.Id,
        LifeAreaName = la.Name,
        GoalsCompleted = goals.Completed,
        MilestonesCompleted = milestones.Completed,
        HabitDays = habitDays.Done,
        JournalEntries = journal.Entries,
        LastActivityOn = (
            SELECT MAX(d)
            FROM (VALUES (goals.LastOn), (milestones.LastOn), (habitDays.LastOn), (journal.LastOn)) AS latest(d)
        )
    FROM shared.LifeAreas la
    -- One OUTER APPLY per measure, each aggregating its own table: nothing fans out.
    OUTER APPLY (
        SELECT Completed = COUNT(*), LastOn = CAST(MAX(g.CompletedAt) AS DATE)
        FROM goals.Goals g
        WHERE g.UserId = @UserId AND g.IsDeleted = 0
          AND g.LifeAreaId = la.Id
          AND g.Status = N'Completed'
    ) goals
    OUTER APPLY (
        SELECT Completed = COUNT(*), LastOn = CAST(MAX(m.CompletedAt) AS DATE)
        FROM goals.GoalMilestones m
        INNER JOIN goals.Goals g
            ON g.Id = m.GoalId
           AND g.UserId = @UserId
           AND g.IsDeleted = 0
           AND g.LifeAreaId = la.Id
        WHERE m.UserId = @UserId AND m.IsDeleted = 0
          AND m.CompletedAt IS NOT NULL
    ) milestones
    OUTER APPLY (
        SELECT Done = COUNT(*), LastOn = MAX(he.EntryDate)
        FROM habits.HabitEntries he
        INNER JOIN habits.Habits hb
            ON hb.Id = he.HabitId
           AND hb.UserId = @UserId
           AND hb.IsDeleted = 0
           AND hb.LifeAreaId = la.Id
           AND hb.Kind = N'Build'
        WHERE he.UserId = @UserId AND he.IsDeleted = 0
          -- Days that count as done only (HabitStreaks.IsMet); avoid habits' slips earn nothing.
          AND (hb.TargetValue IS NULL OR he.Value IS NULL OR he.Value >= hb.TargetValue)
    ) habitDays
    OUTER APPLY (
        SELECT Entries = COUNT(*), LastOn = MAX(je.EntryDate)
        FROM journal.JournalEntries je
        WHERE je.UserId = @UserId AND je.IsDeleted = 0
          AND je.LifeAreaId = la.Id
    ) journal
    WHERE la.IsDeleted = 0
    ORDER BY la.SortOrder, la.Id;
END
GO
