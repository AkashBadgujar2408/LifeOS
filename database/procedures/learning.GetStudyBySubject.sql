USE LifeOS_UAT;
GO

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- Learning analytics (Session 50): minutes studied per ISO week (keyed by its Monday) and per subject, for the local
-- days @From..@To. StudyAnalytics (C#) fills the empty weeks, keeps the biggest subjects and folds the rest together.
--
-- A session's subject is the skill it serves — its own skill, else its course's skill, else its book's skill — so a
-- course and the book read alongside it add up under one skill. Without a skill it's the course, else the book,
-- else its topic (topics group case-insensitively, under the first spelling met).
--
--   WeekStart    the Monday of the session's week (1900-01-01 was a Monday, so this doesn't depend on DATEFIRST)
--   SubjectKind  Skill / Course / Book / Topic
--   SubjectId    the skill/course/book id; NULL for a topic
--   SubjectName  what to call it (NULL: its only subject was deleted)
--   Minutes      minutes that week
--
-- Every join filters UserId/IsDeleted itself (EF's filters don't apply here); a deleted skill/course/book stops
-- naming the session, which then falls through to the next subject (as the study page shows it).
CREATE OR ALTER PROCEDURE learning.GetStudyBySubject
    @UserId INT,
    @From DATE,
    @To DATE
AS
BEGIN
    SET NOCOUNT ON;

    WITH sessions AS (
        SELECT
            WeekStart = DATEADD(DAY, -(DATEDIFF(DAY, CAST('19000101' AS DATE), ss.StudiedOn) % 7), ss.StudiedOn),
            SubjectKind = CASE
                WHEN subjectSkill.Id IS NOT NULL THEN N'Skill'
                WHEN c.Id IS NOT NULL THEN N'Course'
                WHEN b.Id IS NOT NULL THEN N'Book'
                ELSE N'Topic' END,
            SubjectId = COALESCE(subjectSkill.Id, c.Id, b.Id),
            SubjectName = COALESCE(subjectSkill.Name, c.Title, b.Title, ss.Topic),
            ss.Minutes
        FROM learning.StudySessions ss
        LEFT JOIN learning.Skills sk ON sk.Id = ss.SkillId AND sk.UserId = @UserId AND sk.IsDeleted = 0
        LEFT JOIN learning.Courses c ON c.Id = ss.CourseId AND c.UserId = @UserId AND c.IsDeleted = 0
        LEFT JOIN learning.Books b ON b.Id = ss.BookId AND b.UserId = @UserId AND b.IsDeleted = 0
        LEFT JOIN learning.Skills courseSkill ON courseSkill.Id = c.SkillId AND courseSkill.UserId = @UserId AND courseSkill.IsDeleted = 0
        LEFT JOIN learning.Skills bookSkill ON bookSkill.Id = b.SkillId AND bookSkill.UserId = @UserId AND bookSkill.IsDeleted = 0
        -- The first of the three skills that's there.
        OUTER APPLY (
            SELECT TOP (1) s.Id, s.Name
            FROM (VALUES (1, sk.Id, sk.Name), (2, courseSkill.Id, courseSkill.Name), (3, bookSkill.Id, bookSkill.Name)) AS s(Pick, Id, Name)
            WHERE s.Id IS NOT NULL
            ORDER BY s.Pick
        ) subjectSkill
        WHERE ss.UserId = @UserId AND ss.IsDeleted = 0
          AND ss.StudiedOn BETWEEN @From AND @To
    )
    SELECT
        WeekStart,
        SubjectKind,
        SubjectId,
        -- One name per topic group (MIN picks one spelling deterministically).
        SubjectName = MIN(SubjectName),
        Minutes = SUM(Minutes)
    FROM sessions
    -- A session with no topic whose skill/course/book was deleted has no name left (NULL): it still counts, as one
    -- "since removed" group.
    GROUP BY WeekStart, SubjectKind, SubjectId, CASE WHEN SubjectKind = N'Topic' THEN SubjectName END
    ORDER BY WeekStart, SubjectKind, SubjectId;
END
GO
