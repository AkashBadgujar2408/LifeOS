USE LifeOS_UAT;
GO

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- Reports (Phase 5, Sessions 90–93). Reports read every other module's data through stored procedures in this schema
-- (database/procedures/reports.*.sql) and own no tables: every figure is computed per request, never stored.
-- Session 93's saved custom-report definitions (reports.SavedReports) are its only table — definitions, never results.

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'reports')
    EXEC('CREATE SCHEMA reports');
GO

-- Saved custom reports (Session 93): a definition only — what to count, over which days, grouped how and compared
-- with what. Running one recomputes every figure through the same report code as the tabs; no result is stored.
--   Metric       a CustomMetrics key in C# (stable, never renamed) — CK below mirrors the list
--   LifeAreaId   filter for the metrics that have one by life area (null = all areas)
--   TagId        filter for spending (null = all spending)
--   Grouping     Week (ISO weeks) / Month
--   Compare      None / PreviousPeriod (the same number of days just before) / PreviousYear (the same days a year back)
--   RangePreset  a moving range (this month, last year, …) worked out from the day it runs — or FromDate/ToDate, fixed
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('reports.SavedReports'))
BEGIN
    CREATE TABLE reports.SavedReports
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SavedReports PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_SavedReports_Users REFERENCES shared.Users(Id),
        Name            NVARCHAR(100)     NOT NULL CONSTRAINT CK_SavedReports_Name CHECK (LEN(Name) > 0),
        Metric          NVARCHAR(40)      NOT NULL CONSTRAINT CK_SavedReports_Metric
                            CHECK (Metric IN ('goals-completed', 'goals-on-time', 'habit-consistency', 'tasks-done',
                                              'overdue-rate', 'focus-minutes', 'tracked-minutes', 'planned-minutes',
                                              'study-minutes', 'income', 'spending', 'savings-rate', 'net-worth-change',
                                              'life-balance-score', 'life-rating')),
        LifeAreaId      INT               NULL     CONSTRAINT FK_SavedReports_LifeAreas REFERENCES shared.LifeAreas(Id),
        TagId           INT               NULL     CONSTRAINT FK_SavedReports_Tags REFERENCES shared.Tags(Id),
        Grouping        NVARCHAR(10)      NOT NULL CONSTRAINT CK_SavedReports_Grouping CHECK (Grouping IN ('Week', 'Month')),
        Compare         NVARCHAR(20)      NOT NULL CONSTRAINT DF_SavedReports_Compare DEFAULT ('None')
                            CONSTRAINT CK_SavedReports_Compare CHECK (Compare IN ('None', 'PreviousPeriod', 'PreviousYear')),
        RangePreset     NVARCHAR(20)      NULL     CONSTRAINT CK_SavedReports_RangePreset
                            CHECK (RangePreset IN ('month', 'last-month', '3-months', 'year', 'last-year')),
        FromDate        DATE              NULL,
        ToDate          DATE              NULL,
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_SavedReports_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_SavedReports_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL,
        -- Either a moving preset or two fixed days, never both.
        CONSTRAINT CK_SavedReports_Range CHECK (
            (RangePreset IS NOT NULL AND FromDate IS NULL AND ToDate IS NULL)
            OR (RangePreset IS NULL AND FromDate IS NOT NULL AND ToDate IS NOT NULL AND ToDate >= FromDate)),
        CONSTRAINT CK_SavedReports_TagOnSpending CHECK (TagId IS NULL OR Metric = 'spending')
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('reports.SavedReports') AND name = 'UX_SavedReports_User_Name')
    CREATE UNIQUE INDEX UX_SavedReports_User_Name ON reports.SavedReports(UserId, Name) WHERE IsDeleted = 0;
GO
