USE LifeOS_UAT;
GO

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- Story Mode (Phase 2, first module): your life as a biography, with light game elements. Depends on 01_shared.sql
-- (Users, LifeAreas) and 02_goals.sql (Goals).
--
-- Story Mode is mostly a *layer* over data that already exists — goals become missions (long-term = main, short-term
-- = side, bucket list = collectible: derived from GoalType, not stored), milestones are their objectives, and the
-- Life Story timeline is assembled from goal history, milestones and the journal. This schema only holds what
-- nothing else records: the chapters of your life, which mission unlocks which, the debrief written when a mission
-- is passed, and a monthly self-rating per life area (the Blueprint's Life Balance Wheel is self-assessment).

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'story')
    EXEC('CREATE SCHEMA story');
GO

-- Chapters: named eras of your life ("Chapter 3: The move to Pune"), one after another like a book — they never
-- overlap, and at most one is open (EndDate NULL = the chapter you're living now). DATE columns: a chapter is about
-- calendar days, not moments. No overlap can't be a CHECK (it spans rows); the service enforces it (ChapterRules).
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('story.Chapters'))
BEGIN
    CREATE TABLE story.Chapters
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Chapters PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_Chapters_Users REFERENCES shared.Users(Id),
        Title           NVARCHAR(200)     NOT NULL,
        -- Written by you: what this part of your life was about.
        Summary         NVARCHAR(MAX)     NULL,
        StartDate       DATE              NOT NULL,
        EndDate         DATE              NULL,
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_Chapters_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_Chapters_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL,
        CONSTRAINT CK_Chapters_Dates CHECK (EndDate IS NULL OR EndDate >= StartDate)
    );
END
GO

-- Two live chapters can't start on the same day (the timeline orders by StartDate)...
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('story.Chapters') AND name = 'UX_Chapters_User_Start')
    CREATE UNIQUE INDEX UX_Chapters_User_Start ON story.Chapters(UserId, StartDate) INCLUDE (EndDate) WHERE IsDeleted = 0;
GO

-- ...and only one can be open: "now" is a single chapter.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('story.Chapters') AND name = 'UX_Chapters_User_Open')
    CREATE UNIQUE INDEX UX_Chapters_User_Open ON story.Chapters(UserId) WHERE EndDate IS NULL AND IsDeleted = 0;
GO

-- Mission prerequisites: GoalId stays locked until RequiresGoalId is no longer in play ("Get a passport" unlocks
-- "Visit Japan"). A graph, so cycles (A needs B needs A) are possible in principle; the service rejects any edge that
-- would close one (MissionGraph). Real FKs on both ends — both are always goals.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('story.MissionPrerequisites'))
BEGIN
    CREATE TABLE story.MissionPrerequisites
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_MissionPrerequisites PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_MissionPrerequisites_Users REFERENCES shared.Users(Id),
        GoalId          INT               NOT NULL CONSTRAINT FK_MissionPrerequisites_Goal REFERENCES goals.Goals(Id),
        RequiresGoalId  INT               NOT NULL CONSTRAINT FK_MissionPrerequisites_RequiresGoal REFERENCES goals.Goals(Id),
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_MissionPrerequisites_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_MissionPrerequisites_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL,
        CONSTRAINT CK_MissionPrerequisites_NotSelf CHECK (GoalId <> RequiresGoalId)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('story.MissionPrerequisites') AND name = 'UX_MissionPrerequisites_Pair')
    CREATE UNIQUE INDEX UX_MissionPrerequisites_Pair ON story.MissionPrerequisites(GoalId, RequiresGoalId) WHERE IsDeleted = 0;
GO

-- "What does finishing this unlock?" reads from the other side.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('story.MissionPrerequisites') AND name = 'IX_MissionPrerequisites_Requires')
    CREATE INDEX IX_MissionPrerequisites_Requires ON story.MissionPrerequisites(RequiresGoalId) WHERE IsDeleted = 0;
GO

-- The "Mission passed" debrief: written when a goal is completed, read in the Life Story. One per goal (rewriting it
-- updates the row); both prompts optional, but not both empty.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('story.MissionDebriefs'))
BEGIN
    CREATE TABLE story.MissionDebriefs
    (
        Id                  INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_MissionDebriefs PRIMARY KEY,
        UserId              INT               NOT NULL CONSTRAINT FK_MissionDebriefs_Users REFERENCES shared.Users(Id),
        GoalId              INT               NOT NULL CONSTRAINT FK_MissionDebriefs_Goals REFERENCES goals.Goals(Id),
        HowItWent           NVARCHAR(MAX)     NULL,
        AdviceToPastSelf    NVARCHAR(MAX)     NULL,
        CreatedAt           DATETIME2         NOT NULL CONSTRAINT DF_MissionDebriefs_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt           DATETIME2         NULL,
        IsDeleted           BIT               NOT NULL CONSTRAINT DF_MissionDebriefs_IsDeleted DEFAULT (0),
        DeletedAt           DATETIME2         NULL,
        CONSTRAINT CK_MissionDebriefs_NotEmpty CHECK (HowItWent IS NOT NULL OR AdviceToPastSelf IS NOT NULL)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('story.MissionDebriefs') AND name = 'UX_MissionDebriefs_Goal')
    CREATE UNIQUE INDEX UX_MissionDebriefs_Goal ON story.MissionDebriefs(GoalId) WHERE IsDeleted = 0;
GO

-- Monthly self-rating per life area: how satisfied you are with it, 1-10, plus an optional note. The Blueprint's Life
-- Balance Wheel is self-assessment; Session 24's bars measure activity — the two are shown side by side. Keyed by the
-- month's first day (DATE), so "October 2026" is 2026-10-01.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('story.LifeAreaRatings'))
BEGIN
    CREATE TABLE story.LifeAreaRatings
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_LifeAreaRatings PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_LifeAreaRatings_Users REFERENCES shared.Users(Id),
        LifeAreaId      INT               NOT NULL CONSTRAINT FK_LifeAreaRatings_LifeAreas REFERENCES shared.LifeAreas(Id),
        MonthStart      DATE              NOT NULL CONSTRAINT CK_LifeAreaRatings_MonthStart CHECK (DAY(MonthStart) = 1),
        Rating          TINYINT           NOT NULL CONSTRAINT CK_LifeAreaRatings_Rating CHECK (Rating BETWEEN 1 AND 10),
        Note            NVARCHAR(500)     NULL,
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_LifeAreaRatings_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_LifeAreaRatings_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('story.LifeAreaRatings') AND name = 'UX_LifeAreaRatings_User_Area_Month')
    CREATE UNIQUE INDEX UX_LifeAreaRatings_User_Area_Month ON story.LifeAreaRatings(UserId, LifeAreaId, MonthStart) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('story.LifeAreaRatings') AND name = 'IX_LifeAreaRatings_User_Month')
    CREATE INDEX IX_LifeAreaRatings_User_Month ON story.LifeAreaRatings(UserId, MonthStart) INCLUDE (LifeAreaId, Rating) WHERE IsDeleted = 0;
GO
