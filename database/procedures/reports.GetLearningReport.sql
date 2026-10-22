USE LifeOS_UAT;
GO

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- The learning report's raw rows (Session 91), three result sets read in this order by ReportsService:
--   1. minutes per ISO week and subject — learning.GetStudyBySubject itself, so the report groups study time exactly
--      as the study page's "Hours by subject" chart does (a skill, else the course/book, else the topic)
--   2. study per local day: sessions and minutes (active days, session counts)
--   3. what was reached in the range, one row shape (Kind, Id, Title, Day, Detail):
--        CourseCompleted   a course completed (Detail = its skill)
--        BookFinished      a book finished (Detail = its author)
--        SkillLevelUp      a skill's level rose (Detail = "2 → 3"; the starting row and drops don't count)
--        Certification     a certification issued (Detail = the issuer)
-- Every branch filters UserId/IsDeleted itself (EF's filters don't apply here). Applied after
-- learning.GetStudyBySubject.sql.
CREATE OR ALTER PROCEDURE reports.GetLearningReport
    @UserId     INT,
    @FromDate   DATE,
    @ToDate     DATE
AS
BEGIN
    SET NOCOUNT ON;

    IF @ToDate < @FromDate
        THROW 50001, 'The end of the range must be after its start.', 1;

    -- 1. Minutes per week and subject.
    EXEC learning.GetStudyBySubject @UserId = @UserId, @From = @FromDate, @To = @ToDate;

    -- 2. Study per day.
    SELECT Day = ss.StudiedOn, Sessions = COUNT(*), Minutes = SUM(ss.Minutes)
    FROM learning.StudySessions ss
    WHERE ss.UserId = @UserId AND ss.IsDeleted = 0
      AND ss.StudiedOn BETWEEN @FromDate AND @ToDate
    GROUP BY ss.StudiedOn
    ORDER BY ss.StudiedOn;

    -- 3. What was reached.
    SELECT Kind = N'CourseCompleted', c.Id, c.Title, Day = c.CompletedOn, Detail = sk.Name
    FROM learning.Courses c
    LEFT JOIN learning.Skills sk ON sk.Id = c.SkillId AND sk.UserId = @UserId AND sk.IsDeleted = 0
    WHERE c.UserId = @UserId AND c.IsDeleted = 0
      AND c.Status = N'Completed' AND c.CompletedOn BETWEEN @FromDate AND @ToDate

    UNION ALL
    SELECT N'BookFinished', m.Id, m.Title, m.FinishedOn, m.Creator
    FROM leisure.MediaItems m
    WHERE m.UserId = @UserId AND m.IsDeleted = 0
      AND m.Kind = N'Book' AND m.Status = N'Finished' AND m.FinishedOn BETWEEN @FromDate AND @ToDate

    UNION ALL
    SELECT N'SkillLevelUp', sk.Id, sk.Name, ch.ChangedOn,
           CONCAT(ch.FromProficiency, N' ', NCHAR(8594), N' ', ch.ToProficiency)  -- NCHAR: "→" without depending on the file's encoding under sqlcmd
    FROM learning.SkillLevelChanges ch
    INNER JOIN learning.Skills sk ON sk.Id = ch.SkillId AND sk.UserId = @UserId AND sk.IsDeleted = 0
    WHERE ch.UserId = @UserId AND ch.IsDeleted = 0
      AND ch.FromProficiency IS NOT NULL AND ch.ToProficiency > ch.FromProficiency
      AND ch.ChangedOn BETWEEN @FromDate AND @ToDate

    UNION ALL
    SELECT N'Certification', ce.Id, ce.Name, ce.IssuedOn, ce.Issuer
    FROM learning.Certifications ce
    WHERE ce.UserId = @UserId AND ce.IsDeleted = 0
      AND ce.IssuedOn BETWEEN @FromDate AND @ToDate

    ORDER BY Day, Kind, Id;
END
GO
