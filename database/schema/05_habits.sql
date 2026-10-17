USE LifeOS_UAT;
GO

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- Habits & Routines (Month 1, Milestone 5). Depends on 01_shared.sql (Users, LifeAreas).
-- A habit is a small routine with a weekly schedule; each day it gets done is one row in HabitEntries. Streaks are
-- not stored — they're computed from the entries (LifeOS.Core/Habits/Services/HabitStreaks.cs), so they can never
-- drift out of step with what was actually ticked. Tying a habit to the goal it supports goes through
-- shared.EntityLinks, like every other cross-module relationship.

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'habits')
    EXEC('CREATE SCHEMA habits');
GO

-- ScheduleDays is a bitmask of the weekdays the habit is due, ISO order: Monday = 1, Tuesday = 2, Wednesday = 4,
-- Thursday = 8, Friday = 16, Saturday = 32, Sunday = 64. 127 = every day, 31 = weekdays, 21 = Mon/Wed/Fri.
-- One column instead of seven BITs or a child table: it's validated in one CHECK, and "is it due on day X" is a
-- single bitwise AND in SQL (ScheduleDays & POWER(2, isoWeekday - 1)) as well as in C#.
-- StartDate is the first day that counts: nothing before it can be "missed".
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('habits.Habits'))
BEGIN
    CREATE TABLE habits.Habits
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Habits PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_Habits_Users REFERENCES shared.Users(Id),
        LifeAreaId      INT               NULL     CONSTRAINT FK_Habits_LifeAreas REFERENCES shared.LifeAreas(Id),
        Title           NVARCHAR(200)     NOT NULL,
        Description     NVARCHAR(MAX)     NULL,
        ScheduleDays    TINYINT           NOT NULL CONSTRAINT DF_Habits_ScheduleDays DEFAULT (127)
                                                   CONSTRAINT CK_Habits_ScheduleDays CHECK (ScheduleDays BETWEEN 1 AND 127),
        StartDate       DATE              NOT NULL,
        Status          NVARCHAR(20)      NOT NULL CONSTRAINT DF_Habits_Status DEFAULT ('Active')
                                                   CONSTRAINT CK_Habits_Status CHECK (Status IN ('Active', 'Archived')),
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_Habits_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_Habits_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL
    );
END
GO

-- One live habit per name per user (same rule as Tags/Projects); filtered so a deleted habit's name can be reused.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('habits.Habits') AND name = 'UX_Habits_User_Title')
    CREATE UNIQUE INDEX UX_Habits_User_Title ON habits.Habits(UserId, Title) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('habits.Habits') AND name = 'IX_Habits_LifeAreaId')
    CREATE INDEX IX_Habits_LifeAreaId ON habits.Habits(LifeAreaId) WHERE IsDeleted = 0;
GO

-- "Done on this day": EntryDate is a calendar date in the user's own terms (DATE, no timezone), the same as task due
-- dates. Un-ticking a day soft-deletes its row, so the unique index is filtered: tick, un-tick, tick again works.
-- UserId is repeated here (not just via the habit) so the per-user global filter applies to entries directly.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('habits.HabitEntries'))
BEGIN
    CREATE TABLE habits.HabitEntries
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_HabitEntries PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_HabitEntries_Users REFERENCES shared.Users(Id),
        HabitId         INT               NOT NULL CONSTRAINT FK_HabitEntries_Habits REFERENCES habits.Habits(Id),
        EntryDate       DATE              NOT NULL,
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_HabitEntries_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_HabitEntries_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('habits.HabitEntries') AND name = 'UX_HabitEntries_Habit_Date')
    CREATE UNIQUE INDEX UX_HabitEntries_Habit_Date ON habits.HabitEntries(HabitId, EntryDate) WHERE IsDeleted = 0;
GO

-- The check-off grid and the dashboard read "all of my entries in this date range".
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('habits.HabitEntries') AND name = 'IX_HabitEntries_User_Date')
    CREATE INDEX IX_HabitEntries_User_Date ON habits.HabitEntries(UserId, EntryDate) INCLUDE (HabitId) WHERE IsDeleted = 0;
GO

-- Session 43 (habits follow-up 1).
-- Kind: Build = something to do (ticked days count towards a streak); Avoid = something to stop (each HabitEntries row
--   is a slip — a day it happened — and what's shown is the clean run since the last one; nothing punitive is stored).
--   An avoid habit runs every day (CK_Habits_AvoidEveryDay) and can't have a target.
-- TargetValue/Unit: a measurable build habit ("Read 20 pages"): each entry carries the Value done that day, and the
--   day counts only when Value >= TargetValue — everything that counts habit days (streaks, achievements, life-area
--   stats, life balance, My Day) uses that same rule. A plain build habit has no target; its entries have no Value.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('habits.Habits') AND name = 'Kind')
    ALTER TABLE habits.Habits ADD
        Kind            NVARCHAR(10)      NOT NULL CONSTRAINT DF_Habits_Kind DEFAULT ('Build')
                                                   CONSTRAINT CK_Habits_Kind CHECK (Kind IN ('Build', 'Avoid')),
        TargetValue     DECIMAL(9, 2)     NULL,
        Unit            NVARCHAR(30)      NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Habits_Target')
    ALTER TABLE habits.Habits ADD CONSTRAINT CK_Habits_Target CHECK (
        (TargetValue IS NULL AND Unit IS NULL)
        OR (TargetValue > 0 AND Kind = 'Build'));
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Habits_AvoidEveryDay')
    ALTER TABLE habits.Habits ADD CONSTRAINT CK_Habits_AvoidEveryDay CHECK (Kind = 'Build' OR ScheduleDays = 127);
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('habits.HabitEntries') AND name = 'Value')
    ALTER TABLE habits.HabitEntries ADD
        Value           DECIMAL(9, 2)     NULL CONSTRAINT CK_HabitEntries_Value CHECK (Value IS NULL OR Value >= 0);
GO

-- Habit categories are tags (the library's templates come with one): the per-module join pattern.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('habits.HabitTags'))
BEGIN
    CREATE TABLE habits.HabitTags
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_HabitTags PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_HabitTags_Users REFERENCES shared.Users(Id),
        HabitId         INT               NOT NULL CONSTRAINT FK_HabitTags_Habits REFERENCES habits.Habits(Id),
        TagId           INT               NOT NULL CONSTRAINT FK_HabitTags_Tags REFERENCES shared.Tags(Id),
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_HabitTags_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_HabitTags_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('habits.HabitTags') AND name = 'UX_HabitTags_Habit_Tag')
    CREATE UNIQUE INDEX UX_HabitTags_Habit_Tag ON habits.HabitTags(HabitId, TagId) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('habits.HabitTags') AND name = 'IX_HabitTags_Tag')
    CREATE INDEX IX_HabitTags_Tag ON habits.HabitTags(TagId) WHERE IsDeleted = 0;
GO

-- Session 44 (habits follow-up 2).
-- A challenge: keep a habit for Days (7 / 30 / 90) calendar days from StartDate — every scheduled day done for a build
-- habit, no slip for an avoid one. Only the attempt is stored; whether it's under way, finished or broken is computed
-- every time from the habit's days (HabitChallenges.Evaluate), like streaks — so un-ticking a day un-finishes it.
-- A finished challenge unlocks a Story achievement (challenge-7 / -30 / -90).
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('habits.HabitChallenges'))
BEGIN
    CREATE TABLE habits.HabitChallenges
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_HabitChallenges PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_HabitChallenges_Users REFERENCES shared.Users(Id),
        HabitId         INT               NOT NULL CONSTRAINT FK_HabitChallenges_Habits REFERENCES habits.Habits(Id),
        Days            INT               NOT NULL CONSTRAINT CK_HabitChallenges_Days CHECK (Days IN (7, 30, 90)),
        StartDate       DATE              NOT NULL,
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_HabitChallenges_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_HabitChallenges_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('habits.HabitChallenges') AND name = 'IX_HabitChallenges_Habit')
    CREATE INDEX IX_HabitChallenges_Habit ON habits.HabitChallenges(HabitId, StartDate) WHERE IsDeleted = 0;
GO

-- Routines: named, ordered groups of build habits done together (Morning, Evening, Weekend), ticked in one go on My
-- Day. A habit can be in more than one routine; the order inside a routine is SortOrder.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('habits.Routines'))
BEGIN
    CREATE TABLE habits.Routines
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Routines PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_Routines_Users REFERENCES shared.Users(Id),
        Name            NVARCHAR(100)     NOT NULL CONSTRAINT CK_Routines_Name CHECK (LEN(Name) > 0),
        SortOrder       INT               NOT NULL CONSTRAINT DF_Routines_SortOrder DEFAULT (0),
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_Routines_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_Routines_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('habits.Routines') AND name = 'UX_Routines_User_Name')
    CREATE UNIQUE INDEX UX_Routines_User_Name ON habits.Routines(UserId, Name) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('habits.RoutineHabits'))
BEGIN
    CREATE TABLE habits.RoutineHabits
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_RoutineHabits PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_RoutineHabits_Users REFERENCES shared.Users(Id),
        RoutineId       INT               NOT NULL CONSTRAINT FK_RoutineHabits_Routines REFERENCES habits.Routines(Id),
        HabitId         INT               NOT NULL CONSTRAINT FK_RoutineHabits_Habits REFERENCES habits.Habits(Id),
        SortOrder       INT               NOT NULL CONSTRAINT DF_RoutineHabits_SortOrder DEFAULT (0),
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_RoutineHabits_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_RoutineHabits_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('habits.RoutineHabits') AND name = 'UX_RoutineHabits_Routine_Habit')
    CREATE UNIQUE INDEX UX_RoutineHabits_Routine_Habit ON habits.RoutineHabits(RoutineId, HabitId) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('habits.RoutineHabits') AND name = 'IX_RoutineHabits_Habit')
    CREATE INDEX IX_RoutineHabits_Habit ON habits.RoutineHabits(HabitId) WHERE IsDeleted = 0;
GO
