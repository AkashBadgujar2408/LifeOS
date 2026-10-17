USE LifeOS_UAT;
GO

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- Tasks & Personal Projects (Month 1, Milestone 3). Depends on 01_shared.sql (Users, Tags).

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'tasks')
    EXEC('CREATE SCHEMA tasks');
GO

-- A personal project groups tasks ("Renovate the balcony", "Side project: LifeOS"). Linking a project to the goal
-- it serves goes through shared.EntityLinks, like every other cross-module relationship.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('tasks.Projects'))
BEGIN
    CREATE TABLE tasks.Projects
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Projects PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_Projects_Users REFERENCES shared.Users(Id),
        Name            NVARCHAR(200)     NOT NULL,
        Description     NVARCHAR(MAX)     NULL,
        Status          NVARCHAR(20)      NOT NULL CONSTRAINT DF_Projects_Status DEFAULT ('Active')
                                                   CONSTRAINT CK_Projects_Status CHECK (Status IN ('Active', 'Completed', 'Archived')),
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_Projects_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_Projects_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL
    );
END
GO

-- One live project per name per user (same rule as Tags); filtered so a deleted project's name can be reused.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('tasks.Projects') AND name = 'UX_Projects_User_Name')
    CREATE UNIQUE INDEX UX_Projects_User_Name ON tasks.Projects(UserId, Name) WHERE IsDeleted = 0;
GO

-- "TaskItems", not "Tasks": the scaffolder would name the entity `Task`, which collides with
-- System.Threading.Tasks.Task in every async method signature in LifeOS.Core.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('tasks.TaskItems'))
BEGIN
    CREATE TABLE tasks.TaskItems
    (
        Id                      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_TaskItems PRIMARY KEY,
        UserId                  INT               NOT NULL CONSTRAINT FK_TaskItems_Users REFERENCES shared.Users(Id),
        ProjectId               INT               NULL     CONSTRAINT FK_TaskItems_Projects REFERENCES tasks.Projects(Id),
        Title                   NVARCHAR(300)     NOT NULL,
        Notes                   NVARCHAR(MAX)     NULL,
        -- A calendar date (DATE, no timezone). NULL = "Someday": no date yet.
        DueDate                 DATE              NULL,
        Priority                NVARCHAR(10)      NOT NULL CONSTRAINT DF_TaskItems_Priority DEFAULT ('None')
                                                           CONSTRAINT CK_TaskItems_Priority CHECK (Priority IN ('None', 'Low', 'Medium', 'High')),
        Status                  NVARCHAR(10)      NOT NULL CONSTRAINT DF_TaskItems_Status DEFAULT ('Open')
                                                           CONSTRAINT CK_TaskItems_Status CHECK (Status IN ('Open', 'Done')),
        CompletedAt             DATETIME2         NULL,
        -- Recurrence as structured columns rather than a free-text rule, so the database can validate it:
        -- "every RecurrenceInterval RecurrenceFrequency", counted from RecurrenceAnchorDate (the series' first due
        -- date). Computing each occurrence from the anchor, not from the previous one, stops monthly drift
        -- (31 Jan -> 28 Feb -> 31 Mar, not -> 28 Mar).
        RecurrenceFrequency     NVARCHAR(10)      NULL     CONSTRAINT CK_TaskItems_RecurrenceFrequency CHECK (RecurrenceFrequency IN ('Daily', 'Weekly', 'Monthly', 'Yearly')),
        RecurrenceInterval      INT               NULL,
        RecurrenceAnchorDate    DATE              NULL,
        -- Set on a completed recurring task once its next occurrence exists, so completing, reopening and completing
        -- again can never spawn a second copy.
        NextOccurrenceTaskId    INT               NULL     CONSTRAINT FK_TaskItems_NextOccurrence REFERENCES tasks.TaskItems(Id),
        CreatedAt               DATETIME2         NOT NULL CONSTRAINT DF_TaskItems_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt               DATETIME2         NULL,
        IsDeleted               BIT               NOT NULL CONSTRAINT DF_TaskItems_IsDeleted DEFAULT (0),
        DeletedAt               DATETIME2         NULL,
        CONSTRAINT CK_TaskItems_CompletedAt CHECK ((Status = 'Done') OR (CompletedAt IS NULL)),
        -- All three recurrence columns together or none; a repeating task needs a due date to repeat from.
        CONSTRAINT CK_TaskItems_Recurrence CHECK (
            (RecurrenceFrequency IS NULL AND RecurrenceInterval IS NULL AND RecurrenceAnchorDate IS NULL)
            OR (RecurrenceFrequency IS NOT NULL AND RecurrenceInterval BETWEEN 1 AND 999
                AND RecurrenceAnchorDate IS NOT NULL AND DueDate IS NOT NULL))
    );
END
GO

-- Today / Upcoming / Someday all read open tasks by due date for one user.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('tasks.TaskItems') AND name = 'IX_TaskItems_User_Status_DueDate')
    CREATE INDEX IX_TaskItems_User_Status_DueDate ON tasks.TaskItems(UserId, Status, DueDate) INCLUDE (Priority, ProjectId) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('tasks.TaskItems') AND name = 'IX_TaskItems_ProjectId')
    CREATE INDEX IX_TaskItems_ProjectId ON tasks.TaskItems(ProjectId) WHERE IsDeleted = 0;
GO

-- Tags on tasks: same shape as goals.GoalTags (surrogate Id + filtered unique pair, so untag-then-retag works).
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('tasks.TaskTags'))
BEGIN
    CREATE TABLE tasks.TaskTags
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_TaskTags PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_TaskTags_Users REFERENCES shared.Users(Id),
        TaskItemId      INT               NOT NULL CONSTRAINT FK_TaskTags_TaskItems REFERENCES tasks.TaskItems(Id),
        TagId           INT               NOT NULL CONSTRAINT FK_TaskTags_Tags REFERENCES shared.Tags(Id),
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_TaskTags_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_TaskTags_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('tasks.TaskTags') AND name = 'UX_TaskTags_TaskItem_Tag')
    CREATE UNIQUE INDEX UX_TaskTags_TaskItem_Tag ON tasks.TaskTags(TaskItemId, TagId) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('tasks.TaskTags') AND name = 'IX_TaskTags_Tag')
    CREATE INDEX IX_TaskTags_Tag ON tasks.TaskTags(TagId) WHERE IsDeleted = 0;
GO

-- Session 45 (tasks follow-up).
-- EstimateMinutes: how long the task should take (1 minute to a week of minutes); compared with the focus time
-- actually logged (the sum of FocusSessions — never stored on the task).
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('tasks.TaskItems') AND name = 'EstimateMinutes')
    ALTER TABLE tasks.TaskItems ADD
        EstimateMinutes INT NULL CONSTRAINT CK_TaskItems_EstimateMinutes CHECK (EstimateMinutes IS NULL OR EstimateMinutes BETWEEN 1 AND 10080);
GO

-- "TaskItemId can't really start until BlockedByTaskId is done." Advisory, like mission locks: a blocked task shows
-- what it's waiting for, nothing refuses it. Loops are refused by the service (DependencyGraph.WouldCreateCycle);
-- the CHECK only stops the trivial one. Filtered unique so remove-then-add works under soft delete.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('tasks.TaskDependencies'))
BEGIN
    CREATE TABLE tasks.TaskDependencies
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_TaskDependencies PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_TaskDependencies_Users REFERENCES shared.Users(Id),
        TaskItemId      INT               NOT NULL CONSTRAINT FK_TaskDependencies_Task REFERENCES tasks.TaskItems(Id),
        BlockedByTaskId INT               NOT NULL CONSTRAINT FK_TaskDependencies_BlockedBy REFERENCES tasks.TaskItems(Id),
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_TaskDependencies_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_TaskDependencies_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL,
        CONSTRAINT CK_TaskDependencies_NotSelf CHECK (TaskItemId <> BlockedByTaskId)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('tasks.TaskDependencies') AND name = 'UX_TaskDependencies_Pair')
    CREATE UNIQUE INDEX UX_TaskDependencies_Pair ON tasks.TaskDependencies(TaskItemId, BlockedByTaskId) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('tasks.TaskDependencies') AND name = 'IX_TaskDependencies_BlockedBy')
    CREATE INDEX IX_TaskDependencies_BlockedBy ON tasks.TaskDependencies(BlockedByTaskId) WHERE IsDeleted = 0;
GO

-- A focus session (the editor's Pomodoro timer): a stretch of time actually spent on the task. Minutes is the focused
-- time (pauses excluded), so it can be less than EndedAt − StartedAt. A task's actual time is the sum of these.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('tasks.FocusSessions'))
BEGIN
    CREATE TABLE tasks.FocusSessions
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_FocusSessions PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_FocusSessions_Users REFERENCES shared.Users(Id),
        TaskItemId      INT               NOT NULL CONSTRAINT FK_FocusSessions_Task REFERENCES tasks.TaskItems(Id),
        StartedAt       DATETIME2         NOT NULL,
        EndedAt         DATETIME2         NOT NULL,
        Minutes         INT               NOT NULL CONSTRAINT CK_FocusSessions_Minutes CHECK (Minutes BETWEEN 1 AND 600),
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_FocusSessions_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_FocusSessions_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL,
        CONSTRAINT CK_FocusSessions_Times CHECK (EndedAt > StartedAt)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('tasks.FocusSessions') AND name = 'IX_FocusSessions_Task')
    CREATE INDEX IX_FocusSessions_Task ON tasks.FocusSessions(TaskItemId) INCLUDE (Minutes) WHERE IsDeleted = 0;
GO
