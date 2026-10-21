USE LifeOS_UAT;
GO

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- Education & Learning (Phase 2, Sessions 47-50). Depends on 01_shared.sql (Users, LifeAreas, Tags), 02_goals.sql
-- (Goals, for roadmap steps) and 04_calendar.sql (Reminders, for certification renewals).
-- What you know (Skills), how you're learning it (Courses, StudySessions, Roadmaps), what proves it
-- (Certifications) and what you want to keep (KnowledgeNotes, reviewed on a spaced schedule). Anything computed —
-- hours studied, a roadmap's progress, the next review interval — is worked out in C#, never stored. Books were
-- here until Session 78a; they are media items now (leisure.MediaItems, 17_leisure.sql), which a study session or
-- a roadmap step can point at through MediaItemId — its foreign key is added by 17_leisure.sql, which runs later.

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'learning')
    EXEC('CREATE SCHEMA learning');
GO

-- A skill and where you stand with it: Proficiency 1-5 (1 = just starting, 5 = could teach it); TargetProficiency
-- is where you want to get. Every change of level is kept in SkillLevelChanges (the skill's history). Categories
-- ("Programming", "Languages") are tags; LifeAreaId says where it counts (default Learning, chosen by the service).
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('learning.Skills'))
BEGIN
    CREATE TABLE learning.Skills
    (
        Id                  INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Skills PRIMARY KEY,
        UserId              INT               NOT NULL CONSTRAINT FK_Skills_Users REFERENCES shared.Users(Id),
        LifeAreaId          INT               NULL     CONSTRAINT FK_Skills_LifeAreas REFERENCES shared.LifeAreas(Id),
        Name                NVARCHAR(200)     NOT NULL,
        Description         NVARCHAR(2000)    NULL,
        Proficiency         TINYINT           NOT NULL CONSTRAINT CK_Skills_Proficiency CHECK (Proficiency BETWEEN 1 AND 5),
        TargetProficiency   TINYINT           NULL     CONSTRAINT CK_Skills_TargetProficiency CHECK (TargetProficiency BETWEEN 1 AND 5),
        CreatedAt           DATETIME2         NOT NULL CONSTRAINT DF_Skills_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt           DATETIME2         NULL,
        IsDeleted           BIT               NOT NULL CONSTRAINT DF_Skills_IsDeleted DEFAULT (0),
        DeletedAt           DATETIME2         NULL
    );
END
GO

-- One live skill per name per user (re-adding one after deleting it works: the index ignores deleted rows).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('learning.Skills') AND name = 'UX_Skills_User_Name')
    CREATE UNIQUE INDEX UX_Skills_User_Name ON learning.Skills(UserId, Name) WHERE IsDeleted = 0;
GO

-- A skill's level history: one row per change (the first row is where it started, FromProficiency NULL). ChangedOn
-- is the user's local day; Note is the why ("passed the B1 exam").
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('learning.SkillLevelChanges'))
BEGIN
    CREATE TABLE learning.SkillLevelChanges
    (
        Id                  INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SkillLevelChanges PRIMARY KEY,
        UserId              INT               NOT NULL CONSTRAINT FK_SkillLevelChanges_Users REFERENCES shared.Users(Id),
        SkillId             INT               NOT NULL CONSTRAINT FK_SkillLevelChanges_Skills REFERENCES learning.Skills(Id),
        FromProficiency     TINYINT           NULL     CONSTRAINT CK_SkillLevelChanges_From CHECK (FromProficiency BETWEEN 1 AND 5),
        ToProficiency       TINYINT           NOT NULL CONSTRAINT CK_SkillLevelChanges_To CHECK (ToProficiency BETWEEN 1 AND 5),
        ChangedOn           DATE              NOT NULL,
        Note                NVARCHAR(1000)    NULL,
        CreatedAt           DATETIME2         NOT NULL CONSTRAINT DF_SkillLevelChanges_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt           DATETIME2         NULL,
        IsDeleted           BIT               NOT NULL CONSTRAINT DF_SkillLevelChanges_IsDeleted DEFAULT (0),
        DeletedAt           DATETIME2         NULL,
        CONSTRAINT CK_SkillLevelChanges_Changed CHECK (FromProficiency IS NULL OR FromProficiency <> ToProficiency)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('learning.SkillLevelChanges') AND name = 'IX_SkillLevelChanges_Skill')
    CREATE INDEX IX_SkillLevelChanges_Skill ON learning.SkillLevelChanges(SkillId, ChangedOn) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('learning.SkillTags'))
BEGIN
    CREATE TABLE learning.SkillTags
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SkillTags PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_SkillTags_Users REFERENCES shared.Users(Id),
        SkillId         INT               NOT NULL CONSTRAINT FK_SkillTags_Skills REFERENCES learning.Skills(Id),
        TagId           INT               NOT NULL CONSTRAINT FK_SkillTags_Tags REFERENCES shared.Tags(Id),
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_SkillTags_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_SkillTags_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('learning.SkillTags') AND name = 'UX_SkillTags_Skill_Tag')
    CREATE UNIQUE INDEX UX_SkillTags_Skill_Tag ON learning.SkillTags(SkillId, TagId) WHERE IsDeleted = 0;
GO

-- A course (online or in person). Status: Planned → InProgress → Completed (or Dropped); ProgressPercent is what the
-- user says (0-100, a Completed course is 100). StartedOn/CompletedOn are local days; CompletedOn only once
-- Completed, never before StartedOn. SkillId: the skill it builds, if any.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('learning.Courses'))
BEGIN
    CREATE TABLE learning.Courses
    (
        Id                  INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Courses PRIMARY KEY,
        UserId              INT               NOT NULL CONSTRAINT FK_Courses_Users REFERENCES shared.Users(Id),
        SkillId             INT               NULL     CONSTRAINT FK_Courses_Skills REFERENCES learning.Skills(Id),
        LifeAreaId          INT               NULL     CONSTRAINT FK_Courses_LifeAreas REFERENCES shared.LifeAreas(Id),
        Title               NVARCHAR(200)     NOT NULL,
        Provider            NVARCHAR(200)     NULL,
        Url                 NVARCHAR(500)     NULL,
        Status              NVARCHAR(20)      NOT NULL CONSTRAINT DF_Courses_Status DEFAULT ('Planned')
                                CONSTRAINT CK_Courses_Status CHECK (Status IN ('Planned', 'InProgress', 'Completed', 'Dropped')),
        ProgressPercent     TINYINT           NOT NULL CONSTRAINT DF_Courses_ProgressPercent DEFAULT (0)
                                CONSTRAINT CK_Courses_ProgressPercent CHECK (ProgressPercent BETWEEN 0 AND 100),
        StartedOn           DATE              NULL,
        CompletedOn         DATE              NULL,
        Notes               NVARCHAR(MAX)     NULL,
        CreatedAt           DATETIME2         NOT NULL CONSTRAINT DF_Courses_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt           DATETIME2         NULL,
        IsDeleted           BIT               NOT NULL CONSTRAINT DF_Courses_IsDeleted DEFAULT (0),
        DeletedAt           DATETIME2         NULL,
        CONSTRAINT CK_Courses_Completed CHECK ((Status = 'Completed' AND CompletedOn IS NOT NULL AND ProgressPercent = 100)
                                             OR (Status <> 'Completed' AND CompletedOn IS NULL)),
        CONSTRAINT CK_Courses_Dates CHECK (StartedOn IS NULL OR CompletedOn IS NULL OR CompletedOn >= StartedOn)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('learning.Courses') AND name = 'IX_Courses_User_Status')
    CREATE INDEX IX_Courses_User_Status ON learning.Courses(UserId, Status) WHERE IsDeleted = 0;
GO

-- A certification: issued, maybe expiring (never before it was issued). The renewal reminder works like a
-- document's expiry reminder (one ordinary calendar.Reminders row kept in step by the service, Session 49):
-- RenewalReminderDays before ExpiresOn, 0-365, only with an expiry.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('learning.Certifications'))
BEGIN
    CREATE TABLE learning.Certifications
    (
        Id                  INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Certifications PRIMARY KEY,
        UserId              INT               NOT NULL CONSTRAINT FK_Certifications_Users REFERENCES shared.Users(Id),
        SkillId             INT               NULL     CONSTRAINT FK_Certifications_Skills REFERENCES learning.Skills(Id),
        CourseId            INT               NULL     CONSTRAINT FK_Certifications_Courses REFERENCES learning.Courses(Id),
        Name                NVARCHAR(200)     NOT NULL,
        Issuer              NVARCHAR(200)     NULL,
        CredentialId        NVARCHAR(100)     NULL,
        Url                 NVARCHAR(500)     NULL,
        IssuedOn            DATE              NOT NULL,
        ExpiresOn           DATE              NULL,
        RenewalReminderDays INT               NULL     CONSTRAINT CK_Certifications_RenewalReminderDays CHECK (RenewalReminderDays BETWEEN 0 AND 365),
        RenewalReminderId   INT               NULL     CONSTRAINT FK_Certifications_Reminders REFERENCES calendar.Reminders(Id),
        CreatedAt           DATETIME2         NOT NULL CONSTRAINT DF_Certifications_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt           DATETIME2         NULL,
        IsDeleted           BIT               NOT NULL CONSTRAINT DF_Certifications_IsDeleted DEFAULT (0),
        DeletedAt           DATETIME2         NULL,
        CONSTRAINT CK_Certifications_Dates CHECK (ExpiresOn IS NULL OR ExpiresOn >= IssuedOn),
        CONSTRAINT CK_Certifications_Reminder CHECK (RenewalReminderDays IS NULL OR ExpiresOn IS NOT NULL)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('learning.Certifications') AND name = 'IX_Certifications_User_ExpiresOn')
    CREATE INDEX IX_Certifications_User_ExpiresOn ON learning.Certifications(UserId, ExpiresOn) WHERE IsDeleted = 0;
GO

-- Time spent learning: Minutes on a local day (StudiedOn), about a Topic and/or a skill, course or media item (a book
-- read for it). StartedAt is
-- set when the study timer logged it (Session 49), NULL for a session entered by hand. Hours by subject (Session 50)
-- are summed from these, never stored.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('learning.StudySessions'))
BEGIN
    CREATE TABLE learning.StudySessions
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_StudySessions PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_StudySessions_Users REFERENCES shared.Users(Id),
        SkillId         INT               NULL     CONSTRAINT FK_StudySessions_Skills REFERENCES learning.Skills(Id),
        CourseId        INT               NULL     CONSTRAINT FK_StudySessions_Courses REFERENCES learning.Courses(Id),
        Topic           NVARCHAR(200)     NULL,
        StudiedOn       DATE              NOT NULL,
        Minutes         INT               NOT NULL CONSTRAINT CK_StudySessions_Minutes CHECK (Minutes BETWEEN 1 AND 1440),
        StartedAt       DATETIME2         NULL,
        Notes           NVARCHAR(2000)    NULL,
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_StudySessions_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_StudySessions_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL,
        -- Last, where databases from before Session 78a got it (FK added by 17_leisure.sql).
        MediaItemId     INT               NULL,
        -- A session is about something: a topic, or a skill/course/media item.
        CONSTRAINT CK_StudySessions_Subject CHECK (Topic IS NOT NULL OR SkillId IS NOT NULL OR CourseId IS NOT NULL OR MediaItemId IS NOT NULL)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('learning.StudySessions') AND name = 'IX_StudySessions_User_Day')
    CREATE INDEX IX_StudySessions_User_Day ON learning.StudySessions(UserId, StudiedOn) INCLUDE (Minutes, SkillId, CourseId, MediaItemId) WHERE IsDeleted = 0;
GO

-- A learning roadmap ("Become a backend developer"): ordered steps, optionally serving a goal. Progress is the share
-- of steps done (computed); Status is the user's own choice of Active / Completed / Archived.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('learning.Roadmaps'))
BEGIN
    CREATE TABLE learning.Roadmaps
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Roadmaps PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_Roadmaps_Users REFERENCES shared.Users(Id),
        GoalId          INT               NULL     CONSTRAINT FK_Roadmaps_Goals REFERENCES goals.Goals(Id),
        Title           NVARCHAR(200)     NOT NULL,
        Description     NVARCHAR(2000)    NULL,
        Status          NVARCHAR(20)      NOT NULL CONSTRAINT DF_Roadmaps_Status DEFAULT ('Active')
                            CONSTRAINT CK_Roadmaps_Status CHECK (Status IN ('Active', 'Completed', 'Archived')),
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_Roadmaps_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_Roadmaps_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL
    );
END
GO

-- A step of a roadmap, in order; done = CompletedAt set. It can point at the one thing that is the step — a course,
-- a media item (a book) or a goal — at most one of them.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('learning.RoadmapSteps'))
BEGIN
    CREATE TABLE learning.RoadmapSteps
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_RoadmapSteps PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_RoadmapSteps_Users REFERENCES shared.Users(Id),
        RoadmapId       INT               NOT NULL CONSTRAINT FK_RoadmapSteps_Roadmaps REFERENCES learning.Roadmaps(Id),
        Title           NVARCHAR(200)     NOT NULL,
        SortOrder       INT               NOT NULL CONSTRAINT DF_RoadmapSteps_SortOrder DEFAULT (0),
        CourseId        INT               NULL     CONSTRAINT FK_RoadmapSteps_Courses REFERENCES learning.Courses(Id),
        GoalId          INT               NULL     CONSTRAINT FK_RoadmapSteps_Goals REFERENCES goals.Goals(Id),
        CompletedAt     DATETIME2         NULL,
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_RoadmapSteps_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_RoadmapSteps_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL,
        -- Last, where databases from before Session 78a got it (FK added by 17_leisure.sql).
        MediaItemId     INT               NULL,
        CONSTRAINT CK_RoadmapSteps_OneTarget CHECK (
            (CASE WHEN CourseId IS NULL THEN 0 ELSE 1 END)
          + (CASE WHEN MediaItemId IS NULL THEN 0 ELSE 1 END)
          + (CASE WHEN GoalId IS NULL THEN 0 ELSE 1 END) <= 1)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('learning.RoadmapSteps') AND name = 'IX_RoadmapSteps_Roadmap')
    CREATE INDEX IX_RoadmapSteps_Roadmap ON learning.RoadmapSteps(RoadmapId, SortOrder) INCLUDE (CompletedAt) WHERE IsDeleted = 0;
GO

-- The knowledge base: a note worth keeping, optionally about a skill. Spaced review (Session 49): ReviewStage is how
-- many reviews in a row went well (0 = new), NextReviewOn the local day it's next due (NULL = not being reviewed);
-- the intervals (1/3/7/14/30 days) live in C#, not here.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('learning.KnowledgeNotes'))
BEGIN
    CREATE TABLE learning.KnowledgeNotes
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_KnowledgeNotes PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_KnowledgeNotes_Users REFERENCES shared.Users(Id),
        SkillId         INT               NULL     CONSTRAINT FK_KnowledgeNotes_Skills REFERENCES learning.Skills(Id),
        Title           NVARCHAR(200)     NOT NULL,
        Content         NVARCHAR(MAX)     NULL,
        ReviewStage     TINYINT           NOT NULL CONSTRAINT DF_KnowledgeNotes_ReviewStage DEFAULT (0)
                            CONSTRAINT CK_KnowledgeNotes_ReviewStage CHECK (ReviewStage BETWEEN 0 AND 5),
        NextReviewOn    DATE              NULL,
        LastReviewedOn  DATE              NULL,
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_KnowledgeNotes_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_KnowledgeNotes_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL,
        CONSTRAINT CK_KnowledgeNotes_Review CHECK (LastReviewedOn IS NULL OR NextReviewOn IS NULL OR NextReviewOn > LastReviewedOn)
    );
END
GO

-- "Due for review" (Session 49) seeks on this.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('learning.KnowledgeNotes') AND name = 'IX_KnowledgeNotes_User_NextReview')
    CREATE INDEX IX_KnowledgeNotes_User_NextReview ON learning.KnowledgeNotes(UserId, NextReviewOn) WHERE IsDeleted = 0 AND NextReviewOn IS NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('learning.KnowledgeNoteTags'))
BEGIN
    CREATE TABLE learning.KnowledgeNoteTags
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_KnowledgeNoteTags PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_KnowledgeNoteTags_Users REFERENCES shared.Users(Id),
        KnowledgeNoteId INT               NOT NULL CONSTRAINT FK_KnowledgeNoteTags_KnowledgeNotes REFERENCES learning.KnowledgeNotes(Id),
        TagId           INT               NOT NULL CONSTRAINT FK_KnowledgeNoteTags_Tags REFERENCES shared.Tags(Id),
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_KnowledgeNoteTags_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_KnowledgeNoteTags_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('learning.KnowledgeNoteTags') AND name = 'UX_KnowledgeNoteTags_Note_Tag')
    CREATE UNIQUE INDEX UX_KnowledgeNoteTags_Note_Tag ON learning.KnowledgeNoteTags(KnowledgeNoteId, TagId) WHERE IsDeleted = 0;
GO
