USE LifeOS_UAT;
GO

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- Story Mode's achievements are computed, never stored: this procedure returns the raw facts they're judged on, and
-- the pure Achievements.Evaluate in C# decides what's unlocked and on which day. Eleven result sets, read in this order
-- by AchievementsService (Dapper QueryMultiple — keep the two in step). Depends on 01_shared.sql to 08_story.sql.
--
--   1 GoalsPassed       GoalType, LifeAreaId, CompletedAt (UTC)     goals currently Completed
--   2 ObjectivesDone    LifeAreaId, CompletedAt (UTC)               milestones ticked, with their goal's area
--   3 Habits            Id, ScheduleDays, StartDate                 every habit, archived included (the days were done)
--   4 HabitDays         HabitId, LifeAreaId, EntryDate (DATE)       habit days done
--   5 JournalDays       LifeAreaId, EntryDate (DATE)                journal entries
--   6 Chapters          StartDate, EndDate, CreatedAt (UTC)
--   7 Debriefs          CreatedAt (UTC)
--   8 Ratings           LifeAreaId, MonthStart, CreatedAt (UTC)     monthly self-ratings
--   9 LifeAreaCount     how many life areas there are (for "every area")
--  10 Challenges        HabitId, Days, StartDate, Kind, ScheduleDays, HabitStartDate   habit challenges (Session 44)
--  11 ChallengeSlips    HabitId, LifeAreaId, EntryDate               slips of avoid habits that have a challenge
--
-- Moments stay UTC; the service puts them on the user's local day with their timezone. Every set filters
-- UserId/IsDeleted itself (EF's filters don't apply here), joined parents included.
CREATE OR ALTER PROCEDURE story.GetAchievementFacts
    @UserId INT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT g.GoalType, g.LifeAreaId, g.CompletedAt
    FROM goals.Goals g
    WHERE g.UserId = @UserId AND g.IsDeleted = 0
      AND g.Status = N'Completed'
      AND g.CompletedAt IS NOT NULL;

    SELECT g.LifeAreaId, m.CompletedAt
    FROM goals.GoalMilestones m
    INNER JOIN goals.Goals g
        ON g.Id = m.GoalId
       AND g.UserId = @UserId
       AND g.IsDeleted = 0
    WHERE m.UserId = @UserId AND m.IsDeleted = 0
      AND m.CompletedAt IS NOT NULL;

    -- Build habits only: an avoid habit's entries are slips, never days done (Session 43).
    SELECT h.Id, h.ScheduleDays, h.StartDate
    FROM habits.Habits h
    WHERE h.UserId = @UserId AND h.IsDeleted = 0 AND h.Kind = N'Build';

    -- A measurable habit's day counts only once it met the target (HabitStreaks.IsMet).
    SELECT he.HabitId, h.LifeAreaId, he.EntryDate
    FROM habits.HabitEntries he
    INNER JOIN habits.Habits h
        ON h.Id = he.HabitId
       AND h.UserId = @UserId
       AND h.IsDeleted = 0
       AND h.Kind = N'Build'
    WHERE he.UserId = @UserId AND he.IsDeleted = 0
      AND (h.TargetValue IS NULL OR he.Value IS NULL OR he.Value >= h.TargetValue);

    SELECT je.LifeAreaId, je.EntryDate
    FROM journal.JournalEntries je
    WHERE je.UserId = @UserId AND je.IsDeleted = 0;

    SELECT c.StartDate, c.EndDate, c.CreatedAt
    FROM story.Chapters c
    WHERE c.UserId = @UserId AND c.IsDeleted = 0;

    -- Only debriefs on goals that still exist and are still passed.
    SELECT d.CreatedAt
    FROM story.MissionDebriefs d
    INNER JOIN goals.Goals g
        ON g.Id = d.GoalId
       AND g.UserId = @UserId
       AND g.IsDeleted = 0
       AND g.Status = N'Completed'
    WHERE d.UserId = @UserId AND d.IsDeleted = 0;

    SELECT r.LifeAreaId, r.MonthStart, r.CreatedAt
    FROM story.LifeAreaRatings r
    WHERE r.UserId = @UserId AND r.IsDeleted = 0;

    SELECT LifeAreaCount = COUNT(*)
    FROM shared.LifeAreas la
    WHERE la.IsDeleted = 0;

    SELECT c.HabitId, c.Days, c.StartDate, h.Kind, h.ScheduleDays, HabitStartDate = h.StartDate
    FROM habits.HabitChallenges c
    INNER JOIN habits.Habits h
        ON h.Id = c.HabitId
       AND h.UserId = @UserId
       AND h.IsDeleted = 0
    WHERE c.UserId = @UserId AND c.IsDeleted = 0;

    SELECT he.HabitId, h.LifeAreaId, he.EntryDate
    FROM habits.HabitEntries he
    INNER JOIN habits.Habits h
        ON h.Id = he.HabitId
       AND h.UserId = @UserId
       AND h.IsDeleted = 0
       AND h.Kind = N'Avoid'
    WHERE he.UserId = @UserId AND he.IsDeleted = 0
      AND EXISTS (SELECT 1 FROM habits.HabitChallenges c WHERE c.HabitId = h.Id AND c.UserId = @UserId AND c.IsDeleted = 0);
END
GO
