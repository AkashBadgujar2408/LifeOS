USE LifeOS_UAT;
GO

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- The goal achievement report's raw rows (Session 90): every goal that could have something to say about a range —
-- completed in it, abandoned (any time; ReportsService puts the moment on the user's local day and checks it), its
-- target day inside it, created in it, or its deadline pushed back in it. GoalReport (C#) decides each goal's outcome.
--
--   AbandonedAt  when an Abandoned goal was abandoned: its latest StatusChanged → Abandoned history row, else its
--                UpdatedAt (goals abandoned before Session 11's history existed)
--   PushedBack   deadline moves later inside the range (Revised rows whose NewTargetDate is after the previous one)
--
-- Same two kinds of range as dashboard.GetLifeBalance: @FromDate/@ToDate (local days, inclusive) for DATE columns,
-- @FromUtc/@ToUtc (the same span as UTC instants, half-open) for moments. Each history figure is its own OUTER APPLY,
-- so nothing fans out. Every branch filters UserId/IsDeleted itself (EF's filters don't apply here).
CREATE OR ALTER PROCEDURE reports.GetGoalReport
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

    SELECT
        g.Id,
        g.Title,
        g.GoalType,
        g.Status,
        g.TargetDate,
        g.CompletedAt,
        g.CreatedAt,
        LifeAreaId = la.Id,
        LifeAreaName = la.Name,
        AbandonedAt = CASE WHEN g.Status = 'Abandoned' THEN COALESCE(ab.At, g.UpdatedAt, g.CreatedAt) END,
        PushedBack = ISNULL(pb.Moves, 0)
    FROM goals.Goals g
    JOIN shared.LifeAreas la ON la.Id = g.LifeAreaId
    OUTER APPLY (
        SELECT At = MAX(h.CreatedAt)
        FROM goals.GoalHistory h
        WHERE h.GoalId = g.Id AND h.UserId = @UserId AND h.IsDeleted = 0
          AND h.EventType = 'StatusChanged' AND h.ToStatus = 'Abandoned'
    ) ab
    OUTER APPLY (
        SELECT Moves = COUNT(*)
        FROM goals.GoalHistory h
        WHERE h.GoalId = g.Id AND h.UserId = @UserId AND h.IsDeleted = 0
          AND h.EventType = 'Revised' AND h.NewTargetDate > h.PreviousTargetDate
          AND h.CreatedAt >= @FromUtc AND h.CreatedAt < @ToUtc
    ) pb
    WHERE g.UserId = @UserId AND g.IsDeleted = 0
      AND g.CreatedAt < @ToUtc
      AND (
            (g.CompletedAt >= @FromUtc AND g.CompletedAt < @ToUtc)
         OR g.Status = 'Abandoned'
         OR g.TargetDate BETWEEN @FromDate AND @ToDate
         OR g.CreatedAt >= @FromUtc
         OR pb.Moves > 0
      )
    ORDER BY la.Id, g.Title;
END
GO
