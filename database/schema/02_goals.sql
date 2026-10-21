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

-- Session 58 (Finance 4): a savings goal is an ordinary goal with an amount to reach. TargetAmount in TargetCurrency
-- (both or neither); how far along it is comes from the finance accounts and investments linked to the goal
-- (EntityLinks), worked out per request in C# — never stored.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('goals.Goals') AND name = 'TargetAmount')
    ALTER TABLE goals.Goals ADD
        TargetAmount    DECIMAL(19, 4)    NULL CONSTRAINT CK_Goals_TargetAmount CHECK (TargetAmount > 0),
        TargetCurrency  CHAR(3)           NULL CONSTRAINT CK_Goals_TargetCurrency
                            CHECK (TargetCurrency COLLATE Latin1_General_BIN LIKE '[A-Z][A-Z][A-Z]');
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Goals_TargetPair')
    ALTER TABLE goals.Goals ADD CONSTRAINT CK_Goals_TargetPair
        CHECK ((TargetAmount IS NULL AND TargetCurrency IS NULL) OR (TargetAmount IS NOT NULL AND TargetCurrency IS NOT NULL));
GO

-- Sessions 71d–71h: a goal can be measured by its own number — a target and a free-text unit ("1,00,000 steps",
-- "24 books") — fed by a manual log (Manual) or counted from other items (Linked, goals.GoalSources). How far along it is
-- is worked out per request (GoalProgress), never stored. A goal has at most one kind of target: a measure, a savings
-- amount (Session 58) or a Health body target (Session 65, kept in the health schema).
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('goals.Goals') AND name = 'MeasureTarget')
    ALTER TABLE goals.Goals ADD
        MeasureTarget   DECIMAL(19, 4)    NULL,
        -- What was already done before the goal was measured here (usually 0).
        MeasureStart    DECIMAL(19, 4)    NULL,
        MeasureUnit     NVARCHAR(30)      NULL,
        MeasureSource   NVARCHAR(10)      NULL CONSTRAINT CK_Goals_MeasureSource CHECK (MeasureSource IN ('Manual', 'Linked'));
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Goals_MeasureShape')
    ALTER TABLE goals.Goals ADD CONSTRAINT CK_Goals_MeasureShape CHECK (
        (MeasureTarget IS NULL AND MeasureStart IS NULL AND MeasureUnit IS NULL AND MeasureSource IS NULL)
        OR (MeasureTarget IS NOT NULL AND MeasureStart IS NOT NULL AND MeasureUnit IS NOT NULL AND MeasureSource IS NOT NULL
            AND MeasureStart >= 0 AND MeasureTarget > MeasureStart AND LEN(MeasureUnit) > 0));
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Goals_OneTarget')
    ALTER TABLE goals.Goals ADD CONSTRAINT CK_Goals_OneTarget CHECK (MeasureTarget IS NULL OR TargetAmount IS NULL);
GO

-- The manual log of a measured goal: what was done on a day. Logged = typed by you; CarriedOver = what a source had
-- counted when it was deleted or the goal stopped being counted from it (kept so the total doesn't drop).
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('goals.GoalMeasureEntries'))
BEGIN
    CREATE TABLE goals.GoalMeasureEntries
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_GoalMeasureEntries PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_GoalMeasureEntries_Users REFERENCES shared.Users(Id),
        GoalId          INT               NOT NULL CONSTRAINT FK_GoalMeasureEntries_Goals REFERENCES goals.Goals(Id),
        EntryDate       DATE              NOT NULL,
        Value           DECIMAL(19, 4)    NOT NULL CONSTRAINT CK_GoalMeasureEntries_Value CHECK (Value > 0),
        Kind            NVARCHAR(12)      NOT NULL CONSTRAINT DF_GoalMeasureEntries_Kind DEFAULT ('Logged')
                                                   CONSTRAINT CK_GoalMeasureEntries_Kind CHECK (Kind IN ('Logged', 'CarriedOver')),
        Note            NVARCHAR(200)     NULL,
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_GoalMeasureEntries_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_GoalMeasureEntries_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('goals.GoalMeasureEntries') AND name = 'IX_GoalMeasureEntries_Goal')
    CREATE INDEX IX_GoalMeasureEntries_Goal ON goals.GoalMeasureEntries(GoalId, EntryDate) INCLUDE (Value) WHERE IsDeleted = 0;
GO

-- What a Linked goal is counted from. Kind says what is counted (each kind has its own unit — a goal's unit must match):
--   Habit            a habit (EntityType 'Habit'): logged values of a measurable habit, else 1 per day done
--   StudyTime        hours studied for a Skill / Course / MediaItem (EntityType + EntityId)
--   BooksFinished    books finished (media items of kind Book) — of a Skill, or every book (no entity)
--   CoursesCompleted courses completed — of a Skill, or every course (no entity)
--   Roadmap          a Roadmap's % (the goal's only source, unit '%')
--   ProjectTasks     tasks done in a Project
--   ProjectFocus     hours of focus on a Project's tasks
--   Workouts         Health workouts (no entity): Filter = workout kind or NULL for any, Metric = Steps / DistanceKm / Minutes
-- EntityType/EntityId are named like links' so export/import remaps them. CountsFrom: nothing earlier counts.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('goals.GoalSources'))
BEGIN
    CREATE TABLE goals.GoalSources
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_GoalSources PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_GoalSources_Users REFERENCES shared.Users(Id),
        GoalId          INT               NOT NULL CONSTRAINT FK_GoalSources_Goals REFERENCES goals.Goals(Id),
        Kind            NVARCHAR(20)      NOT NULL CONSTRAINT CK_GoalSources_Kind CHECK (Kind IN ('Habit', 'StudyTime', 'BooksFinished',
                                                       'CoursesCompleted', 'Roadmap', 'ProjectTasks', 'ProjectFocus', 'Workouts')),
        EntityType      NVARCHAR(50)      NULL,
        EntityId        INT               NULL,
        Filter          NVARCHAR(30)      NULL,
        Metric          NVARCHAR(20)      NULL CONSTRAINT CK_GoalSources_Metric CHECK (Metric IN ('Steps', 'DistanceKm', 'Minutes')),
        CountsFrom      DATE              NOT NULL,
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_GoalSources_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_GoalSources_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL,
        CONSTRAINT CK_GoalSources_EntityPair CHECK ((EntityType IS NULL AND EntityId IS NULL) OR (EntityType IS NOT NULL AND EntityId IS NOT NULL)),
        CONSTRAINT CK_GoalSources_Shape CHECK (
            (Kind = 'Habit' AND EntityType = 'Habit' AND Filter IS NULL AND Metric IS NULL)
            OR (Kind = 'StudyTime' AND EntityType IN ('Skill', 'Course', 'MediaItem') AND Filter IS NULL AND Metric IS NULL)
            OR (Kind IN ('BooksFinished', 'CoursesCompleted') AND (EntityType IS NULL OR EntityType = 'Skill') AND Filter IS NULL AND Metric IS NULL)
            OR (Kind = 'Roadmap' AND EntityType = 'Roadmap' AND Filter IS NULL AND Metric IS NULL)
            OR (Kind IN ('ProjectTasks', 'ProjectFocus') AND EntityType = 'Project' AND Filter IS NULL AND Metric IS NULL)
            OR (Kind = 'Workouts' AND EntityType IS NULL AND Metric IS NOT NULL))
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('goals.GoalSources') AND name = 'IX_GoalSources_Goal')
    CREATE INDEX IX_GoalSources_Goal ON goals.GoalSources(GoalId) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('goals.GoalSources') AND name = 'IX_GoalSources_Entity')
    CREATE INDEX IX_GoalSources_Entity ON goals.GoalSources(EntityType, EntityId) WHERE IsDeleted = 0;
GO

-- The same thing counted twice would double the figure.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('goals.GoalSources') AND name = 'UX_GoalSources_Same')
    CREATE UNIQUE INDEX UX_GoalSources_Same ON goals.GoalSources(GoalId, Kind, EntityType, EntityId, Filter, Metric) WHERE IsDeleted = 0;
GO
