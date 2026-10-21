USE LifeOS_UAT;
GO

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- Leisure & media (Phase 4, Sessions 78a-78b). Depends on 01_shared.sql (Users, LifeAreas, Tags), 05_habits.sql
-- (Habits — the habit a hobby is practised through) and 10_learning.sql (Skills; StudySessions and RoadmapSteps
-- point at a media item through MediaItemId, whose foreign keys are added here because this script runs later).
-- One backlog for everything you read, watch, play or listen to — books included (they were learning.Books until
-- Session 78a; a book read for a skill keeps its skill) — plus hobbies and the time given to them. Anything
-- computed (how far through, hours this year, top-rated) is worked out in C#, never stored.

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'leisure')
    EXEC('CREATE SCHEMA leisure');
GO

-- Session 78a: books leave Learning. Their data wasn't kept (your call, 2026-10-21): anything pointing at a book is
-- removed — links, reminders, attachments, goal sources, study sessions that were only about the book — roadmap
-- steps lose their book, then the book tables go. Runs once (only while learning.Books exists); dynamic SQL
-- because the columns it reads are gone on a fresh database.
IF OBJECT_ID('learning.Books') IS NOT NULL
BEGIN
    EXEC(N'DELETE FROM shared.EntityLinks WHERE SourceEntityType = N''Book'' OR TargetEntityType = N''Book'';
           DELETE FROM calendar.Reminders WHERE EntityType = N''Book'';
           DELETE FROM shared.Attachments WHERE EntityType = N''Book'';
           DELETE FROM goals.GoalSources WHERE EntityType = N''Book'';');

    IF COL_LENGTH('learning.StudySessions', 'BookId') IS NOT NULL
        EXEC(N'DELETE FROM learning.StudySessions
                   WHERE BookId IS NOT NULL AND Topic IS NULL AND SkillId IS NULL AND CourseId IS NULL;
               ALTER TABLE learning.StudySessions DROP CONSTRAINT CK_StudySessions_Subject;
               DROP INDEX IX_StudySessions_User_Day ON learning.StudySessions;
               ALTER TABLE learning.StudySessions DROP CONSTRAINT FK_StudySessions_Books;
               ALTER TABLE learning.StudySessions DROP COLUMN BookId;');

    IF COL_LENGTH('learning.RoadmapSteps', 'BookId') IS NOT NULL
        EXEC(N'ALTER TABLE learning.RoadmapSteps DROP CONSTRAINT CK_RoadmapSteps_OneTarget;
               ALTER TABLE learning.RoadmapSteps DROP CONSTRAINT FK_RoadmapSteps_Books;
               ALTER TABLE learning.RoadmapSteps DROP COLUMN BookId;');

    DROP TABLE learning.BookNotes;
    DROP TABLE learning.BookTags;
    DROP TABLE learning.Books;
END
GO

-- Goal sources: hours studied for a media item replace hours for a book (02_goals.sql has the new shape for
-- fresh databases).
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_GoalSources_Shape' AND definition LIKE '%''Book''%')
    ALTER TABLE goals.GoalSources DROP CONSTRAINT CK_GoalSources_Shape;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_GoalSources_Shape')
    ALTER TABLE goals.GoalSources ADD CONSTRAINT CK_GoalSources_Shape CHECK (
        (Kind = 'Habit' AND EntityType = 'Habit' AND Filter IS NULL AND Metric IS NULL)
        OR (Kind = 'StudyTime' AND EntityType IN ('Skill', 'Course', 'MediaItem') AND Filter IS NULL AND Metric IS NULL)
        OR (Kind IN ('BooksFinished', 'CoursesCompleted') AND (EntityType IS NULL OR EntityType = 'Skill') AND Filter IS NULL AND Metric IS NULL)
        OR (Kind = 'Roadmap' AND EntityType = 'Roadmap' AND Filter IS NULL AND Metric IS NULL)
        OR (Kind IN ('ProjectTasks', 'ProjectFocus') AND EntityType = 'Project' AND Filter IS NULL AND Metric IS NULL)
        OR (Kind = 'Workouts' AND EntityType IS NULL AND Metric IS NOT NULL));
GO

-- A thing to read, watch, play or listen to. Status: Want → InProgress → Finished, or Dropped (kept apart, never
-- deleted for it). A Finished item has a FinishedOn day (and only then). Progress depends on the kind: a Book has
-- pages read of TotalPages; a Series or Podcast the Season/Episode reached (episode alone for a podcast). A rating
-- (1-5) and a short Review belong to something finished or dropped. UpNext marks what's next on the backlog (only
-- while wanted). WhereToFind is free text ("Netflix", "Kindle", "Steam"). SkillId: a book (or anything) read for a
-- skill — its study time and "books finished" count for that skill.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('leisure.MediaItems'))
BEGIN
    CREATE TABLE leisure.MediaItems
    (
        Id                  INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_MediaItems PRIMARY KEY,
        UserId              INT               NOT NULL CONSTRAINT FK_MediaItems_Users REFERENCES shared.Users(Id),
        SkillId             INT               NULL     CONSTRAINT FK_MediaItems_Skills REFERENCES learning.Skills(Id),
        LifeAreaId          INT               NULL     CONSTRAINT FK_MediaItems_LifeAreas REFERENCES shared.LifeAreas(Id),
        Kind                NVARCHAR(20)      NOT NULL CONSTRAINT CK_MediaItems_Kind
                                CHECK (Kind IN ('Book', 'Film', 'Series', 'Game', 'Album', 'Podcast', 'Other')),
        Title               NVARCHAR(200)     NOT NULL CONSTRAINT CK_MediaItems_Title CHECK (LEN(Title) > 0),
        Creator             NVARCHAR(200)     NULL,
        WhereToFind         NVARCHAR(200)     NULL,
        Status              NVARCHAR(20)      NOT NULL CONSTRAINT DF_MediaItems_Status DEFAULT ('Want')
                                CONSTRAINT CK_MediaItems_Status CHECK (Status IN ('Want', 'InProgress', 'Finished', 'Dropped')),
        UpNext              BIT               NOT NULL CONSTRAINT DF_MediaItems_UpNext DEFAULT (0),
        TotalPages          INT               NULL     CONSTRAINT CK_MediaItems_TotalPages CHECK (TotalPages BETWEEN 1 AND 100000),
        CurrentPage         INT               NOT NULL CONSTRAINT DF_MediaItems_CurrentPage DEFAULT (0)
                                CONSTRAINT CK_MediaItems_CurrentPage CHECK (CurrentPage >= 0),
        Season              SMALLINT          NULL     CONSTRAINT CK_MediaItems_Season CHECK (Season BETWEEN 1 AND 1000),
        Episode             SMALLINT          NULL     CONSTRAINT CK_MediaItems_Episode CHECK (Episode BETWEEN 0 AND 10000),
        StartedOn           DATE              NULL,
        FinishedOn          DATE              NULL,
        Rating              TINYINT           NULL     CONSTRAINT CK_MediaItems_Rating CHECK (Rating BETWEEN 1 AND 5),
        Review              NVARCHAR(2000)    NULL     CONSTRAINT CK_MediaItems_Review CHECK (LEN(Review) > 0),
        CreatedAt           DATETIME2         NOT NULL CONSTRAINT DF_MediaItems_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt           DATETIME2         NULL,
        IsDeleted           BIT               NOT NULL CONSTRAINT DF_MediaItems_IsDeleted DEFAULT (0),
        DeletedAt           DATETIME2         NULL,
        CONSTRAINT CK_MediaItems_PagesOnBooks CHECK (Kind = 'Book' OR (TotalPages IS NULL AND CurrentPage = 0)),
        CONSTRAINT CK_MediaItems_Pages CHECK (TotalPages IS NULL OR CurrentPage <= TotalPages),
        CONSTRAINT CK_MediaItems_EpisodesOnShows CHECK (Kind IN ('Series', 'Podcast') OR (Season IS NULL AND Episode IS NULL)),
        CONSTRAINT CK_MediaItems_PodcastNoSeason CHECK (Kind <> 'Podcast' OR Season IS NULL),
        CONSTRAINT CK_MediaItems_Finished CHECK ((Status = 'Finished' AND FinishedOn IS NOT NULL) OR (Status <> 'Finished' AND FinishedOn IS NULL)),
        CONSTRAINT CK_MediaItems_Dates CHECK (StartedOn IS NULL OR FinishedOn IS NULL OR FinishedOn >= StartedOn),
        CONSTRAINT CK_MediaItems_RatedOnceDone CHECK ((Rating IS NULL AND Review IS NULL) OR Status IN ('Finished', 'Dropped')),
        CONSTRAINT CK_MediaItems_UpNextOnlyWanted CHECK (UpNext = 0 OR Status = 'Want')
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('leisure.MediaItems') AND name = 'IX_MediaItems_User_Kind_Status')
    CREATE INDEX IX_MediaItems_User_Kind_Status ON leisure.MediaItems(UserId, Kind, Status) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('leisure.MediaItems') AND name = 'IX_MediaItems_Skill')
    CREATE INDEX IX_MediaItems_Skill ON leisure.MediaItems(SkillId) WHERE IsDeleted = 0 AND SkillId IS NOT NULL;
GO

-- Genres and the like are tags.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('leisure.MediaItemTags'))
BEGIN
    CREATE TABLE leisure.MediaItemTags
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_MediaItemTags PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_MediaItemTags_Users REFERENCES shared.Users(Id),
        MediaItemId     INT               NOT NULL CONSTRAINT FK_MediaItemTags_MediaItems REFERENCES leisure.MediaItems(Id),
        TagId           INT               NOT NULL CONSTRAINT FK_MediaItemTags_Tags REFERENCES shared.Tags(Id),
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_MediaItemTags_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_MediaItemTags_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('leisure.MediaItemTags') AND name = 'UX_MediaItemTags_Item_Tag')
    CREATE UNIQUE INDEX UX_MediaItemTags_Item_Tag ON leisure.MediaItemTags(MediaItemId, TagId) WHERE IsDeleted = 0;
GO

-- What an item left behind: a Note (your own thought) or a Highlight (a passage or a line worth keeping), optionally
-- at a page (books only — checked by the service, which knows the kind).
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('leisure.MediaNotes'))
BEGIN
    CREATE TABLE leisure.MediaNotes
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_MediaNotes PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_MediaNotes_Users REFERENCES shared.Users(Id),
        MediaItemId     INT               NOT NULL CONSTRAINT FK_MediaNotes_MediaItems REFERENCES leisure.MediaItems(Id),
        Kind            NVARCHAR(20)      NOT NULL CONSTRAINT CK_MediaNotes_Kind CHECK (Kind IN ('Note', 'Highlight')),
        Text            NVARCHAR(4000)    NOT NULL CONSTRAINT CK_MediaNotes_Text CHECK (LEN(Text) > 0),
        Page            INT               NULL     CONSTRAINT CK_MediaNotes_Page CHECK (Page BETWEEN 1 AND 100000),
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_MediaNotes_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_MediaNotes_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('leisure.MediaNotes') AND name = 'IX_MediaNotes_Item')
    CREATE INDEX IX_MediaNotes_Item ON leisure.MediaNotes(MediaItemId, Page) WHERE IsDeleted = 0;
GO

-- A watch / play / listen / read on a local day, with how long when known — so rewatches count and time spent adds
-- up (year in media). Several on one day are fine (a double bill).
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('leisure.MediaLogs'))
BEGIN
    CREATE TABLE leisure.MediaLogs
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_MediaLogs PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_MediaLogs_Users REFERENCES shared.Users(Id),
        MediaItemId     INT               NOT NULL CONSTRAINT FK_MediaLogs_MediaItems REFERENCES leisure.MediaItems(Id),
        LoggedOn        DATE              NOT NULL,
        Minutes         INT               NULL     CONSTRAINT CK_MediaLogs_Minutes CHECK (Minutes BETWEEN 1 AND 1440),
        Note            NVARCHAR(500)     NULL     CONSTRAINT CK_MediaLogs_Note CHECK (LEN(Note) > 0),
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_MediaLogs_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_MediaLogs_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('leisure.MediaLogs') AND name = 'IX_MediaLogs_User_Day')
    CREATE INDEX IX_MediaLogs_User_Day ON leisure.MediaLogs(UserId, LoggedOn) INCLUDE (MediaItemId, Minutes) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('leisure.MediaLogs') AND name = 'IX_MediaLogs_Item')
    CREATE INDEX IX_MediaLogs_Item ON leisure.MediaLogs(MediaItemId, LoggedOn) WHERE IsDeleted = 0;
GO

-- A hobby (guitar, sketching, gardening), Active or Archived, unique by name per user. HabitId: the habit you practise
-- it through, if any (a session doesn't tick the habit — they're kept apart on purpose).
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('leisure.Hobbies'))
BEGIN
    CREATE TABLE leisure.Hobbies
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Hobbies PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_Hobbies_Users REFERENCES shared.Users(Id),
        HabitId         INT               NULL     CONSTRAINT FK_Hobbies_Habits REFERENCES habits.Habits(Id),
        LifeAreaId      INT               NULL     CONSTRAINT FK_Hobbies_LifeAreas REFERENCES shared.LifeAreas(Id),
        Name            NVARCHAR(100)     NOT NULL CONSTRAINT CK_Hobbies_Name CHECK (LEN(Name) > 0),
        Description     NVARCHAR(1000)    NULL,
        Status          NVARCHAR(20)      NOT NULL CONSTRAINT DF_Hobbies_Status DEFAULT ('Active')
                            CONSTRAINT CK_Hobbies_Status CHECK (Status IN ('Active', 'Archived')),
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_Hobbies_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_Hobbies_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('leisure.Hobbies') AND name = 'UX_Hobbies_User_Name')
    CREATE UNIQUE INDEX UX_Hobbies_User_Name ON leisure.Hobbies(UserId, Name) WHERE IsDeleted = 0;
GO

-- Time given to a hobby on a local day. StartedAt is set when the practice timer logged it, NULL when typed in
-- (like study sessions).
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('leisure.HobbySessions'))
BEGIN
    CREATE TABLE leisure.HobbySessions
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_HobbySessions PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_HobbySessions_Users REFERENCES shared.Users(Id),
        HobbyId         INT               NOT NULL CONSTRAINT FK_HobbySessions_Hobbies REFERENCES leisure.Hobbies(Id),
        PracticedOn     DATE              NOT NULL,
        Minutes         INT               NOT NULL CONSTRAINT CK_HobbySessions_Minutes CHECK (Minutes BETWEEN 1 AND 1440),
        StartedAt       DATETIME2         NULL,
        Note            NVARCHAR(1000)    NULL     CONSTRAINT CK_HobbySessions_Note CHECK (LEN(Note) > 0),
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_HobbySessions_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_HobbySessions_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('leisure.HobbySessions') AND name = 'IX_HobbySessions_Hobby_Day')
    CREATE INDEX IX_HobbySessions_Hobby_Day ON leisure.HobbySessions(HobbyId, PracticedOn) INCLUDE (Minutes) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('leisure.HobbySessions') AND name = 'IX_HobbySessions_User_Day')
    CREATE INDEX IX_HobbySessions_User_Day ON leisure.HobbySessions(UserId, PracticedOn) INCLUDE (HobbyId, Minutes) WHERE IsDeleted = 0;
GO

-- Learning's study log and roadmap steps can point at a media item. 10_learning.sql creates MediaItemId on a fresh
-- database; a database from before Session 78a gets it here (the upgrade above dropped BookId). Either way the
-- foreign key, the "about something" CHECK, the one-target CHECK and the day index are made here.
IF COL_LENGTH('learning.StudySessions', 'MediaItemId') IS NULL
    ALTER TABLE learning.StudySessions ADD MediaItemId INT NULL;
GO

IF COL_LENGTH('learning.RoadmapSteps', 'MediaItemId') IS NULL
    ALTER TABLE learning.RoadmapSteps ADD MediaItemId INT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_StudySessions_MediaItems')
    ALTER TABLE learning.StudySessions ADD CONSTRAINT FK_StudySessions_MediaItems FOREIGN KEY (MediaItemId) REFERENCES leisure.MediaItems(Id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_RoadmapSteps_MediaItems')
    ALTER TABLE learning.RoadmapSteps ADD CONSTRAINT FK_RoadmapSteps_MediaItems FOREIGN KEY (MediaItemId) REFERENCES leisure.MediaItems(Id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_StudySessions_Subject')
    ALTER TABLE learning.StudySessions ADD CONSTRAINT CK_StudySessions_Subject
        CHECK (Topic IS NOT NULL OR SkillId IS NOT NULL OR CourseId IS NOT NULL OR MediaItemId IS NOT NULL);
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_RoadmapSteps_OneTarget')
    ALTER TABLE learning.RoadmapSteps ADD CONSTRAINT CK_RoadmapSteps_OneTarget CHECK (
        (CASE WHEN CourseId IS NULL THEN 0 ELSE 1 END)
      + (CASE WHEN MediaItemId IS NULL THEN 0 ELSE 1 END)
      + (CASE WHEN GoalId IS NULL THEN 0 ELSE 1 END) <= 1);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('learning.StudySessions') AND name = 'IX_StudySessions_User_Day')
    CREATE INDEX IX_StudySessions_User_Day ON learning.StudySessions(UserId, StudiedOn) INCLUDE (Minutes, SkillId, CourseId, MediaItemId) WHERE IsDeleted = 0;
GO
