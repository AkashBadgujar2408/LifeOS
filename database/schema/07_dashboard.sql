USE LifeOS_UAT;
GO

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- Dashboard, My Day & Insights (Month 1, Milestone 7). The dashboard reads every other module's data through stored
-- procedures in this schema (database/procedures/dashboard.*.sql). Until Session 46 it owned no tables; now it keeps
-- only the user's own dashboard choices (KPI tiles, dismissed insights) — never figures, which are always computed.

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'dashboard')
    EXEC('CREATE SCHEMA dashboard');
GO

-- Personal KPI tiles (Session 46): which figures the user picked for My Day, in their order. The figures themselves
-- are worked out per request (DashboardService.GetKpisAsync); KpiKey values are stable identifiers (KpiKeys in C#)
-- — never rename one. Replacing the choice soft-deletes the removed rows; a re-picked tile gets a fresh row.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('dashboard.KpiTiles'))
BEGIN
    CREATE TABLE dashboard.KpiTiles
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_KpiTiles PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_KpiTiles_Users REFERENCES shared.Users(Id),
        KpiKey          NVARCHAR(40)      NOT NULL CONSTRAINT CK_KpiTiles_KpiKey
                            CHECK (KpiKey IN ('tasks-done-week', 'focus-week', 'habit-consistency-30', 'journal-days-30',
                                              'objectives-done-30', 'goals-passed-year', 'goals-active')),
        SortOrder       INT               NOT NULL CONSTRAINT DF_KpiTiles_SortOrder DEFAULT (0),
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_KpiTiles_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_KpiTiles_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('dashboard.KpiTiles') AND name = 'UX_KpiTiles_User_Key')
    CREATE UNIQUE INDEX UX_KpiTiles_User_Key ON dashboard.KpiTiles(UserId, KpiKey) WHERE IsDeleted = 0;
GO

-- Dismissed insights (Session 46): an insight is never stored, but each one carries a key describing its situation
-- ("habit 7's streak broke on 12 Oct", "passport expiring on 6 Dec"). Dismissing stores that key, and My Day leaves
-- out any insight whose key is here — so it stays hidden until the situation changes and the key with it.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('dashboard.DismissedInsights'))
BEGIN
    CREATE TABLE dashboard.DismissedInsights
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_DismissedInsights PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_DismissedInsights_Users REFERENCES shared.Users(Id),
        InsightKey      NVARCHAR(200)     NOT NULL,
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_DismissedInsights_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_DismissedInsights_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('dashboard.DismissedInsights') AND name = 'UX_DismissedInsights_User_Key')
    CREATE UNIQUE INDEX UX_DismissedInsights_User_Key ON dashboard.DismissedInsights(UserId, InsightKey) WHERE IsDeleted = 0;
GO

-- Session 61: the net-worth tile (Finance). Databases created before then have the shorter list, so the CHECK is
-- dropped and re-added whenever it lacks the newest key.
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_KpiTiles_KpiKey' AND definition NOT LIKE '%net-worth%')
    ALTER TABLE dashboard.KpiTiles DROP CONSTRAINT CK_KpiTiles_KpiKey;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_KpiTiles_KpiKey')
    ALTER TABLE dashboard.KpiTiles ADD CONSTRAINT CK_KpiTiles_KpiKey
        CHECK (KpiKey IN ('tasks-done-week', 'focus-week', 'habit-consistency-30', 'journal-days-30',
                          'objectives-done-30', 'goals-passed-year', 'goals-active', 'net-worth'));
GO
