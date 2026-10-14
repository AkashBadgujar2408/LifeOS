USE LifeOS_UAT;
GO

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- Goals & Milestones (Month 1, Milestone 2). Depends on 01_shared.sql (Users, LifeAreas, Tags).
-- One engine for every kind of goal: "Become a technical lead" (Career, LongTerm) and "Finish GTA V"
-- (Personal / Fun, ShortTerm) are the same shape — only LifeArea, GoalType and Tags differ.

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'goals')
    EXEC('CREATE SCHEMA goals');
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('goals.Goals'))
BEGIN
    CREATE TABLE goals.Goals
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Goals PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_Goals_Users REFERENCES shared.Users(Id),
        LifeAreaId      INT               NOT NULL CONSTRAINT FK_Goals_LifeAreas REFERENCES shared.LifeAreas(Id),
        Title           NVARCHAR(200)     NOT NULL,
        Description     NVARCHAR(MAX)     NULL,
        GoalType        NVARCHAR(20)      NOT NULL CONSTRAINT CK_Goals_GoalType CHECK (GoalType IN ('ShortTerm', 'LongTerm', 'BucketList')),
        -- "Revised" (Session 11) is an edit, not a state, so it isn't a status value.
        Status          NVARCHAR(20)      NOT NULL CONSTRAINT DF_Goals_Status DEFAULT ('Active')
                                                   CONSTRAINT CK_Goals_Status CHECK (Status IN ('Active', 'Completed', 'Postponed', 'Abandoned')),
        -- A calendar date, not a moment in time: DATE has no timezone to shift, unlike the UTC datetime2 columns.
        TargetDate      DATE              NULL,
        CompletedAt     DATETIME2         NULL,
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_Goals_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_Goals_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL,
        CONSTRAINT CK_Goals_CompletedAt CHECK ((Status = 'Completed') OR (CompletedAt IS NULL))
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('goals.Goals') AND name = 'IX_Goals_User_Status')
    CREATE INDEX IX_Goals_User_Status ON goals.Goals(UserId, Status) INCLUDE (LifeAreaId, TargetDate) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('goals.Goals') AND name = 'IX_Goals_LifeAreaId')
    CREATE INDEX IX_Goals_LifeAreaId ON goals.Goals(LifeAreaId) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('goals.GoalMilestones'))
BEGIN
    CREATE TABLE goals.GoalMilestones
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_GoalMilestones PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_GoalMilestones_Users REFERENCES shared.Users(Id),
        GoalId          INT               NOT NULL CONSTRAINT FK_GoalMilestones_Goals REFERENCES goals.Goals(Id),
        Title           NVARCHAR(200)     NOT NULL,
        TargetDate      DATE              NULL,
        -- Done = CompletedAt IS NOT NULL. Goal progress % is computed from these rows, never stored.
        CompletedAt     DATETIME2         NULL,
        SortOrder       INT               NOT NULL CONSTRAINT DF_GoalMilestones_SortOrder DEFAULT (0),
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_GoalMilestones_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_GoalMilestones_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('goals.GoalMilestones') AND name = 'IX_GoalMilestones_Goal')
    CREATE INDEX IX_GoalMilestones_Goal ON goals.GoalMilestones(GoalId, SortOrder) INCLUDE (CompletedAt) WHERE IsDeleted = 0;
GO

-- Tags on goals. A real join table (FKs on both sides) rather than a generic EntityType/EntityId one: unlike
-- EntityLinks, a tag assignment always targets a known table, so the database can enforce integrity.
-- Surrogate Id + filtered unique index (not a composite PK) so untag-then-retag works with soft delete.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('goals.GoalTags'))
BEGIN
    CREATE TABLE goals.GoalTags
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_GoalTags PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_GoalTags_Users REFERENCES shared.Users(Id),
        GoalId          INT               NOT NULL CONSTRAINT FK_GoalTags_Goals REFERENCES goals.Goals(Id),
        TagId           INT               NOT NULL CONSTRAINT FK_GoalTags_Tags REFERENCES shared.Tags(Id),
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_GoalTags_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_GoalTags_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('goals.GoalTags') AND name = 'UX_GoalTags_Goal_Tag')
    CREATE UNIQUE INDEX UX_GoalTags_Goal_Tag ON goals.GoalTags(GoalId, TagId) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('goals.GoalTags') AND name = 'IX_GoalTags_Tag')
    CREATE INDEX IX_GoalTags_Tag ON goals.GoalTags(TagId) WHERE IsDeleted = 0;
GO

-- Session 11: a goal's review history. Postponing, abandoning or revising a goal must not erase how it got
-- there, so each status change and each revision (an edit with a reason) is logged here, newest read first.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('goals.GoalHistory'))
BEGIN
    CREATE TABLE goals.GoalHistory
    (
        Id                  INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_GoalHistory PRIMARY KEY,
        UserId              INT               NOT NULL CONSTRAINT FK_GoalHistory_Users REFERENCES shared.Users(Id),
        GoalId              INT               NOT NULL CONSTRAINT FK_GoalHistory_Goals REFERENCES goals.Goals(Id),
        EventType           NVARCHAR(20)      NOT NULL CONSTRAINT CK_GoalHistory_EventType CHECK (EventType IN ('StatusChanged', 'Revised')),
        -- StatusChanged: from -> to.
        FromStatus          NVARCHAR(20)      NULL,
        ToStatus            NVARCHAR(20)      NULL,
        -- Revised: which fields changed (comma-separated property names), plus the target date move if any,
        -- since "pushed the deadline from X to Y" is the revision worth seeing at a glance.
        ChangedFields       NVARCHAR(200)     NULL,
        PreviousTargetDate  DATE              NULL,
        NewTargetDate       DATE              NULL,
        Note                NVARCHAR(1000)    NULL,
        CreatedAt           DATETIME2         NOT NULL CONSTRAINT DF_GoalHistory_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt           DATETIME2         NULL,
        IsDeleted           BIT               NOT NULL CONSTRAINT DF_GoalHistory_IsDeleted DEFAULT (0),
        DeletedAt           DATETIME2         NULL,
        CONSTRAINT CK_GoalHistory_StatusChange CHECK (EventType <> 'StatusChanged' OR (FromStatus IS NOT NULL AND ToStatus IS NOT NULL))
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('goals.GoalHistory') AND name = 'IX_GoalHistory_Goal')
    CREATE INDEX IX_GoalHistory_Goal ON goals.GoalHistory(GoalId, CreatedAt) WHERE IsDeleted = 0;
GO
