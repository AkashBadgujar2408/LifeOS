USE LifeOS_UAT;
GO

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- Story Mode's achievements are computed, never stored: this procedure returns the raw facts they're judged on, and
-- the pure Achievements.Evaluate in C# decides what's unlocked and on which day. Twenty result sets, read in this order
-- by AchievementsService (Dapper QueryMultiple — keep the two in step). Depends on 01_shared.sql to 17_leisure.sql.
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
--  12 Promotions        Day (DATE)                                   career achievements of kind Promotion (Session 96b)
--  13 OffersAccepted    Day (DATE)                                   applications closed as Accepted
--  14 Certifications    Day (DATE)                                   issued
--  15 CoursesFinished   Day (DATE)                                   courses Completed
--  16 Study             Day (DATE), Minutes                          study sessions
--  17 SkillsAtTop       Day (DATE)                                   skills at level 5 now: the day they last reached it
--  18 MediaFinished     Kind, Day (DATE)                             media items Finished
--  19 TasksDone         CompletedAt (UTC)                            tasks Done
--  20 Focus             StartedAt (UTC), Minutes                     focus sessions on tasks that still exist
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

    SELECT Day = ca.AchievedOn
    FROM career.CareerAchievements ca
    WHERE ca.UserId = @UserId AND ca.IsDeleted = 0 AND ca.Kind = N'Promotion';

    SELECT Day = ja.ClosedOn
    FROM career.JobApplications ja
    WHERE ja.UserId = @UserId AND ja.IsDeleted = 0 AND ja.Stage = N'Accepted' AND ja.ClosedOn IS NOT NULL;

    SELECT Day = c.IssuedOn
    FROM learning.Certifications c
    WHERE c.UserId = @UserId AND c.IsDeleted = 0;

    SELECT Day = c.CompletedOn
    FROM learning.Courses c
    WHERE c.UserId = @UserId AND c.IsDeleted = 0 AND c.Status = N'Completed' AND c.CompletedOn IS NOT NULL;

    SELECT Day = s.StudiedOn, s.Minutes
    FROM learning.StudySessions s
    WHERE s.UserId = @UserId AND s.IsDeleted = 0;

    -- Lowered since? Then it isn't at the top any more, and the achievement goes with it.
    SELECT Day = MAX(lc.ChangedOn)
    FROM learning.Skills sk
    INNER JOIN learning.SkillLevelChanges lc
        ON lc.SkillId = sk.Id
       AND lc.UserId = @UserId
       AND lc.IsDeleted = 0
       AND lc.ToProficiency = 5
    WHERE sk.UserId = @UserId AND sk.IsDeleted = 0 AND sk.Proficiency = 5
    GROUP BY sk.Id;

    SELECT m.Kind, Day = m.FinishedOn
    FROM leisure.MediaItems m
    WHERE m.UserId = @UserId AND m.IsDeleted = 0 AND m.Status = N'Finished' AND m.FinishedOn IS NOT NULL;

    SELECT t.CompletedAt
    FROM tasks.TaskItems t
    WHERE t.UserId = @UserId AND t.IsDeleted = 0 AND t.Status = N'Done' AND t.CompletedAt IS NOT NULL;

    SELECT f.StartedAt, f.Minutes
    FROM tasks.FocusSessions f
    INNER JOIN tasks.TaskItems t
        ON t.Id = f.TaskItemId
       AND t.UserId = @UserId
       AND t.IsDeleted = 0
    WHERE f.UserId = @UserId AND f.IsDeleted = 0;
END
GO
