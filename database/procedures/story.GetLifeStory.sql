USE LifeOS_UAT;
GO

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- The Life Story: every "story beat" the rest of LifeOS already recorded, in one row shape, for StoryService to file
-- into chapters (story.Chapters) and read like a book. Depends on 02_goals.sql, 05_habits.sql, 06_journal.sql and
-- 08_story.sql. Nothing here is stored for the story's sake — it's assembled from what happened.
--
-- Kinds:
--   GoalStarted      a goal was set (Goals.CreatedAt)                          → becomes a mission in the story
--   MissionPassed    a goal was completed (GoalHistory StatusChanged→Completed)  + its debrief on the latest completion
--   GoalPostponed / GoalAbandoned / GoalResumed   the other status changes, with the note written at the time
--   GoalRescheduled  a revision that moved the target date (FromDate → ToDate)
--   MilestoneDone    a milestone ticked (GoalMilestones.CompletedAt), with its goal as ParentTitle
--   HabitStarted     a habit's start date
--   JournalHighlight a journal day rated Great (5) or Awful (1) — the days a biography would mention
--   Memory           a journal day with photos attached (Session 42); carries the day's mood, so a great day with
--                    photos is one Memory beat rather than a highlight and a memory. The client shows the photos
--                    (attachments of that JournalEntry).
--   NewRole          a role started (Employments.StartDate, Session 52), organisation as ParentTitle — left out when
--                    a Promotion achievement of that role on that day already tells it
--   CareerPromotion / CareerProject / CareerAward / CareerContribution / CareerOther
--                    a career achievement ('Career' + its Kind) on its day, the description's start as Detail and the
--                    role's organisation as ParentTitle. Depends on 11_career.sql.
--
-- Moments come back as UTC (OccurredAt); calendar days as DATE (OccurredOn). Exactly one is set per row. Turning a
-- moment into the user's local day needs their timezone, which only the caller has — StoryService does it.
--
-- This runs outside EF Core: every branch filters UserId/IsDeleted itself, joined goals included. Depends also on
-- 01_shared.sql (Attachments) for memories.
CREATE OR ALTER PROCEDURE story.GetLifeStory
    @UserId INT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        Kind          = N'GoalStarted',
        OccurredOn    = CAST(NULL AS DATE),
        OccurredAt    = g.CreatedAt,
        Title         = g.Title,
        Detail        = CAST(NULL AS NVARCHAR(MAX)),
        Note          = CAST(NULL AS NVARCHAR(MAX)),
        Advice        = CAST(NULL AS NVARCHAR(MAX)),
        GoalType      = g.GoalType,
        LifeAreaName  = la.Name,
        Mood          = CAST(NULL AS TINYINT),
        FromDate      = CAST(NULL AS DATE),
        ToDate        = g.TargetDate,
        EntityType    = N'Goal',
        EntityId      = g.Id,
        ParentTitle   = CAST(NULL AS NVARCHAR(200))
    FROM goals.Goals g
    INNER JOIN shared.LifeAreas la ON la.Id = g.LifeAreaId
    WHERE g.UserId = @UserId
      AND g.IsDeleted = 0

    UNION ALL

    -- Status changes. A goal can be completed, reopened and completed again; its one debrief belongs to the latest
    -- completion, so only that row carries it.
    SELECT
        CASE h.ToStatus
            WHEN N'Completed' THEN N'MissionPassed'
            WHEN N'Abandoned' THEN N'GoalAbandoned'
            WHEN N'Postponed' THEN N'GoalPostponed'
            ELSE N'GoalResumed'
        END,
        NULL, h.CreatedAt, g.Title,
        CASE WHEN h.ToStatus = N'Completed' AND h.Id = lastDone.Id THEN d.HowItWent END,
        h.Note,
        CASE WHEN h.ToStatus = N'Completed' AND h.Id = lastDone.Id THEN d.AdviceToPastSelf END,
        g.GoalType, la.Name, NULL, NULL, NULL, N'Goal', g.Id, NULL
    FROM goals.GoalHistory h
    INNER JOIN goals.Goals g ON g.Id = h.GoalId AND g.UserId = @UserId AND g.IsDeleted = 0
    INNER JOIN shared.LifeAreas la ON la.Id = g.LifeAreaId
    LEFT JOIN story.MissionDebriefs d ON d.GoalId = g.Id AND d.UserId = @UserId AND d.IsDeleted = 0
    OUTER APPLY (
        SELECT TOP (1) last.Id
        FROM goals.GoalHistory last
        WHERE last.GoalId = g.Id
          AND last.IsDeleted = 0
          AND last.EventType = N'StatusChanged'
          AND last.ToStatus = N'Completed'
        ORDER BY last.CreatedAt DESC, last.Id DESC
    ) lastDone
    WHERE h.UserId = @UserId
      AND h.IsDeleted = 0
      AND h.EventType = N'StatusChanged'

    UNION ALL

    -- Revisions that moved the deadline: "pushed from X to Y" is the part of a revision worth a line in a biography.
    SELECT
        N'GoalRescheduled', NULL, h.CreatedAt, g.Title, NULL, h.Note, NULL,
        g.GoalType, la.Name, NULL, h.PreviousTargetDate, h.NewTargetDate, N'Goal', g.Id, NULL
    FROM goals.GoalHistory h
    INNER JOIN goals.Goals g ON g.Id = h.GoalId AND g.UserId = @UserId AND g.IsDeleted = 0
    INNER JOIN shared.LifeAreas la ON la.Id = g.LifeAreaId
    WHERE h.UserId = @UserId
      AND h.IsDeleted = 0
      AND h.EventType = N'Revised'
      AND (h.PreviousTargetDate IS NOT NULL OR h.NewTargetDate IS NOT NULL)
      AND ISNULL(h.PreviousTargetDate, '0001-01-01') <> ISNULL(h.NewTargetDate, '0001-01-01')

    UNION ALL

    SELECT
        N'MilestoneDone', NULL, m.CompletedAt, m.Title, NULL, NULL, NULL,
        g.GoalType, la.Name, NULL, NULL, NULL, N'Goal', g.Id, g.Title
    FROM goals.GoalMilestones m
    INNER JOIN goals.Goals g ON g.Id = m.GoalId AND g.UserId = @UserId AND g.IsDeleted = 0
    INNER JOIN shared.LifeAreas la ON la.Id = g.LifeAreaId
    WHERE m.UserId = @UserId
      AND m.IsDeleted = 0
      AND m.CompletedAt IS NOT NULL

    UNION ALL

    SELECT
        N'HabitStarted', hb.StartDate, NULL, hb.Title, NULL, NULL, NULL,
        NULL, la.Name, NULL, NULL, NULL, N'Habit', hb.Id, NULL
    FROM habits.Habits hb
    LEFT JOIN shared.LifeAreas la ON la.Id = hb.LifeAreaId
    WHERE hb.UserId = @UserId
      AND hb.IsDeleted = 0

    UNION ALL

    SELECT
        N'JournalHighlight', je.EntryDate, NULL, je.Title, LEFT(je.Content, 280), NULL, NULL,
        NULL, la.Name, je.Mood, NULL, NULL, N'JournalEntry', je.Id, NULL
    FROM journal.JournalEntries je
    LEFT JOIN shared.LifeAreas la ON la.Id = je.LifeAreaId
    WHERE je.UserId = @UserId
      AND je.IsDeleted = 0
      AND je.Mood IN (1, 5)
      AND NOT EXISTS (SELECT 1 FROM shared.Attachments a
                      WHERE a.UserId = @UserId AND a.IsDeleted = 0 AND a.EntityType = N'JournalEntry'
                        AND a.EntityId = je.Id AND a.ContentType IN (N'image/jpeg', N'image/png', N'image/gif', N'image/webp'))

    UNION ALL

    -- Memories: only photos a browser can show count (HEIC is stored but can't be previewed).
    SELECT
        N'Memory', je.EntryDate, NULL, je.Title, LEFT(je.Content, 280), NULL, NULL,
        NULL, la.Name, je.Mood, NULL, NULL, N'JournalEntry', je.Id, NULL
    FROM journal.JournalEntries je
    LEFT JOIN shared.LifeAreas la ON la.Id = je.LifeAreaId
    WHERE je.UserId = @UserId
      AND je.IsDeleted = 0
      AND EXISTS (SELECT 1 FROM shared.Attachments a
                  WHERE a.UserId = @UserId AND a.IsDeleted = 0 AND a.EntityType = N'JournalEntry'
                    AND a.EntityId = je.Id AND a.ContentType IN (N'image/jpeg', N'image/png', N'image/gif', N'image/webp'))

    UNION ALL

    SELECT
        N'NewRole', e.StartDate, NULL, e.Role, NULL, NULL, NULL,
        NULL, N'Career', NULL, NULL, NULL, N'Employment', e.Id, e.Organisation
    FROM career.Employments e
    WHERE e.UserId = @UserId
      AND e.IsDeleted = 0
      AND NOT EXISTS (SELECT 1 FROM career.CareerAchievements p
                      WHERE p.UserId = @UserId AND p.IsDeleted = 0 AND p.Kind = N'Promotion'
                        AND p.EmploymentId = e.Id AND p.AchievedOn = e.StartDate)

    UNION ALL

    SELECT
        N'Career' + ca.Kind, ca.AchievedOn, NULL, ca.Title, LEFT(ca.Description, 280), NULL, NULL,
        NULL, N'Career', NULL, NULL, NULL, N'CareerAchievement', ca.Id, e.Organisation
    FROM career.CareerAchievements ca
    LEFT JOIN career.Employments e ON e.Id = ca.EmploymentId AND e.UserId = @UserId AND e.IsDeleted = 0
    WHERE ca.UserId = @UserId
      AND ca.IsDeleted = 0;
END
GO
