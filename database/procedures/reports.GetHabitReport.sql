USE LifeOS_UAT;
GO

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- The habit consistency report's raw rows (Session 90), two result sets read in this order by ReportsService:
--   1. habits that had started by @ToDate (archived ones too — ArchivedAt is their UpdatedAt, the only record of when
--      they were put away, so their days count up to then)
--   2. their entries on days inside the range (HabitId, EntryDate, Value) — every entry; whether a day counts is
--      HabitStreaks.IsMet in C# (Build) and every entry is a slip (Avoid), as on the habit page
-- Every branch filters UserId/IsDeleted itself (EF's filters don't apply here).
CREATE OR ALTER PROCEDURE reports.GetHabitReport
    @UserId     INT,
    @FromDate   DATE,
    @ToDate     DATE
AS
BEGIN
    SET NOCOUNT ON;

    IF @ToDate < @FromDate
        THROW 50001, 'The end of the range must be after its start.', 1;

    SELECT
        h.Id,
        h.Title,
        h.Kind,
        h.ScheduleDays,
        h.StartDate,
        h.Status,
        h.TargetValue,
        h.Unit,
        LifeAreaName = la.Name,
        ArchivedAt = CASE WHEN h.Status = 'Archived' THEN COALESCE(h.UpdatedAt, h.CreatedAt) END
    FROM habits.Habits h
    LEFT JOIN shared.LifeAreas la ON la.Id = h.LifeAreaId
    WHERE h.UserId = @UserId AND h.IsDeleted = 0
      AND h.StartDate <= @ToDate
    ORDER BY h.Title;

    SELECT e.HabitId, e.EntryDate, e.Value
    FROM habits.HabitEntries e
    JOIN habits.Habits h ON h.Id = e.HabitId AND h.UserId = @UserId AND h.IsDeleted = 0
    WHERE e.UserId = @UserId AND e.IsDeleted = 0
      AND e.EntryDate BETWEEN @FromDate AND @ToDate;
END
GO
