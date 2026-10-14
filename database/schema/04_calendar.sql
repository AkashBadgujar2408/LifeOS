USE LifeOS_UAT;
GO

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- Calendar & Reminders (Month 1, Milestone 4). Depends on 01_shared.sql (Users).
-- The calendar itself is a *feed*: events from this schema plus task due dates and goal milestones/targets, merged by
-- database/procedures/calendar.GetCalendarFeed.sql. Only things that exist purely on the calendar live here.

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'calendar')
    EXEC('CREATE SCHEMA calendar');
GO

-- An event is either all-day or timed, never both, and the two use different column types on purpose:
--   * all-day ("Mum's birthday", "Holiday 3-7 April"): StartDate/EndDate as DATE — a calendar date, no timezone,
--     so it lands on the same day wherever the user is. EndDate is inclusive (a one-day event has EndDate = StartDate).
--   * timed ("Dentist 15:30-16:00"): StartsAt/EndsAt as DATETIME2 in UTC — a real moment, converted to the user's
--     local time only for display.
-- CK_Events_Shape enforces exactly one of the two shapes, so no query ever has to guess.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('calendar.Events'))
BEGIN
    CREATE TABLE calendar.Events
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Events PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_Events_Users REFERENCES shared.Users(Id),
        Title           NVARCHAR(200)     NOT NULL,
        Notes           NVARCHAR(MAX)     NULL,
        Location        NVARCHAR(200)     NULL,
        IsAllDay        BIT               NOT NULL,
        StartDate       DATE              NULL,
        EndDate         DATE              NULL,
        StartsAt        DATETIME2         NULL,
        EndsAt          DATETIME2         NULL,
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_Events_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_Events_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL,
        CONSTRAINT CK_Events_Shape CHECK (
            (IsAllDay = 1 AND StartDate IS NOT NULL AND EndDate IS NOT NULL AND EndDate >= StartDate
                AND StartsAt IS NULL AND EndsAt IS NULL)
            OR (IsAllDay = 0 AND StartsAt IS NOT NULL AND EndsAt IS NOT NULL AND EndsAt >= StartsAt
                AND StartDate IS NULL AND EndDate IS NULL))
    );
END
GO

-- The feed asks "what overlaps this range", one index per shape.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('calendar.Events') AND name = 'IX_Events_User_StartDate')
    CREATE INDEX IX_Events_User_StartDate ON calendar.Events(UserId, StartDate) INCLUDE (EndDate) WHERE IsDeleted = 0 AND IsAllDay = 1;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('calendar.Events') AND name = 'IX_Events_User_StartsAt')
    CREATE INDEX IX_Events_User_StartsAt ON calendar.Events(UserId, StartsAt) INCLUDE (EndsAt) WHERE IsDeleted = 0 AND IsAllDay = 0;
GO

-- A reminder is a moment (RemindAt, UTC) at which something should surface. With no job server (deferred to
-- Phase 2), "due" is computed when the app loads: RemindAt <= now AND DismissedAt IS NULL (Session 17).
-- It can be about something else — an event, a task, a goal, later a bill — so the target is an open
-- EntityType/EntityId pair (same type strings as shared.EntityLinks), or none for a free-standing reminder.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('calendar.Reminders'))
BEGIN
    CREATE TABLE calendar.Reminders
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Reminders PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_Reminders_Users REFERENCES shared.Users(Id),
        Title           NVARCHAR(200)     NOT NULL,
        Notes           NVARCHAR(MAX)     NULL,
        RemindAt        DATETIME2         NOT NULL,
        DismissedAt     DATETIME2         NULL,
        EntityType      NVARCHAR(50)      NULL,
        EntityId        INT               NULL,
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_Reminders_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_Reminders_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL,
        CONSTRAINT CK_Reminders_Target CHECK ((EntityType IS NULL AND EntityId IS NULL) OR (EntityType IS NOT NULL AND EntityId IS NOT NULL))
    );
END
GO

-- "Which of my reminders are due and not dismissed" — the one query Session 17 runs on every load.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('calendar.Reminders') AND name = 'IX_Reminders_User_Due')
    CREATE INDEX IX_Reminders_User_Due ON calendar.Reminders(UserId, RemindAt) WHERE IsDeleted = 0 AND DismissedAt IS NULL;
GO

-- Removing an entity removes reminders about it (RemoveAll... style), so look them up by target.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('calendar.Reminders') AND name = 'IX_Reminders_Entity')
    CREATE INDEX IX_Reminders_Entity ON calendar.Reminders(EntityType, EntityId) WHERE IsDeleted = 0 AND EntityType IS NOT NULL;
GO
