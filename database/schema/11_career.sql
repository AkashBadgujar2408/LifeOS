USE LifeOS_UAT;
GO

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- Career & Professional Growth (Phase 2, Sessions 51-54). Depends on 01_shared.sql (Users, Tags, Contacts) and
-- 04_calendar.sql (Events, for interview rounds on the calendar).
-- Where you've worked (Employments) and what it paid (SalaryRecords), what you did there (CareerAchievements,
-- PerformanceReviews), where you're trying to go next (JobApplications with their stage history, interviews and a
-- question bank, the ResumeVersions sent) and what you earn beside it (SideIncomeSources). People are
-- shared.Contacts; career goals are ordinary Goals in the Career life area. Anything computed — change % per move,
-- time in a role, the current role — is worked out in C#, never stored. Money is DECIMAL(19,4) + a 3-letter currency.

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'career')
    EXEC('CREATE SCHEMA career');
GO

-- A role at an organisation, from StartDate to EndDate (NULL = still there). A promotion is a new row at the same
-- organisation, starting the day the old one ends, so the timeline shows every role in order.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('career.Employments'))
BEGIN
    CREATE TABLE career.Employments
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Employments PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_Employments_Users REFERENCES shared.Users(Id),
        Organisation    NVARCHAR(200)     NOT NULL CONSTRAINT CK_Employments_Organisation CHECK (LEN(Organisation) > 0),
        Role            NVARCHAR(200)     NOT NULL CONSTRAINT CK_Employments_Role CHECK (LEN(Role) > 0),
        EmploymentType  NVARCHAR(20)      NOT NULL CONSTRAINT DF_Employments_EmploymentType DEFAULT ('FullTime')
                            CONSTRAINT CK_Employments_EmploymentType
                            CHECK (EmploymentType IN ('FullTime', 'PartTime', 'Contract', 'Freelance', 'Internship')),
        Location        NVARCHAR(200)     NULL,
        StartDate       DATE              NOT NULL,
        EndDate         DATE              NULL,
        Description     NVARCHAR(4000)    NULL,
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_Employments_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_Employments_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL,
        CONSTRAINT CK_Employments_Dates CHECK (EndDate IS NULL OR EndDate >= StartDate)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('career.Employments') AND name = 'IX_Employments_User_Start')
    CREATE INDEX IX_Employments_User_Start ON career.Employments(UserId, StartDate) WHERE IsDeleted = 0;
GO

-- Pay from EffectiveOn until the next record: an amount per Period in a Currency, usually for a role (EmploymentId),
-- with why it changed. Change % between records is computed (Session 52), only between like periods and currencies.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('career.SalaryRecords'))
BEGIN
    CREATE TABLE career.SalaryRecords
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SalaryRecords PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_SalaryRecords_Users REFERENCES shared.Users(Id),
        EmploymentId    INT               NULL     CONSTRAINT FK_SalaryRecords_Employments REFERENCES career.Employments(Id),
        EffectiveOn     DATE              NOT NULL,
        Amount          DECIMAL(19, 4)    NOT NULL CONSTRAINT CK_SalaryRecords_Amount CHECK (Amount > 0),
        Currency        CHAR(3)           NOT NULL CONSTRAINT CK_SalaryRecords_Currency
                            CHECK (Currency COLLATE Latin1_General_BIN LIKE '[A-Z][A-Z][A-Z]'),
        Period          NVARCHAR(10)      NOT NULL CONSTRAINT DF_SalaryRecords_Period DEFAULT ('Year')
                            CONSTRAINT CK_SalaryRecords_Period CHECK (Period IN ('Year', 'Month', 'Hour')),
        Reason          NVARCHAR(20)      NOT NULL CONSTRAINT DF_SalaryRecords_Reason DEFAULT ('Starting')
                            CONSTRAINT CK_SalaryRecords_Reason
                            CHECK (Reason IN ('Starting', 'Raise', 'Promotion', 'Adjustment', 'Other')),
        Note            NVARCHAR(1000)    NULL,
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_SalaryRecords_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_SalaryRecords_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL
    );
END
GO

-- One record per role per day (two on the same day would make "the pay from then on" ambiguous).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('career.SalaryRecords') AND name = 'UX_SalaryRecords_Employment_Day')
    CREATE UNIQUE INDEX UX_SalaryRecords_Employment_Day ON career.SalaryRecords(EmploymentId, EffectiveOn)
        WHERE IsDeleted = 0 AND EmploymentId IS NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('career.SalaryRecords') AND name = 'IX_SalaryRecords_User_Effective')
    CREATE INDEX IX_SalaryRecords_User_Effective ON career.SalaryRecords(UserId, EffectiveOn) WHERE IsDeleted = 0;
GO

-- What you did that's worth remembering: a project shipped, a promotion, an award, a contribution. AchievedOn is
-- the local day; it becomes a Life Story beat (Session 52). EmploymentId says where (NULL: outside work).
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('career.CareerAchievements'))
BEGIN
    CREATE TABLE career.CareerAchievements
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_CareerAchievements PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_CareerAchievements_Users REFERENCES shared.Users(Id),
        EmploymentId    INT               NULL     CONSTRAINT FK_CareerAchievements_Employments REFERENCES career.Employments(Id),
        Kind            NVARCHAR(20)      NOT NULL CONSTRAINT CK_CareerAchievements_Kind
                            CHECK (Kind IN ('Project', 'Promotion', 'Award', 'Contribution', 'Other')),
        Title           NVARCHAR(200)     NOT NULL CONSTRAINT CK_CareerAchievements_Title CHECK (LEN(Title) > 0),
        AchievedOn      DATE              NOT NULL,
        Description     NVARCHAR(4000)    NULL,
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_CareerAchievements_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_CareerAchievements_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('career.CareerAchievements') AND name = 'IX_CareerAchievements_User_Day')
    CREATE INDEX IX_CareerAchievements_User_Day ON career.CareerAchievements(UserId, AchievedOn) WHERE IsDeleted = 0;
GO

-- An appraisal: when, for which period, the rating in the company's own words (scales differ, so free text), and
-- the feedback.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('career.PerformanceReviews'))
BEGIN
    CREATE TABLE career.PerformanceReviews
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_PerformanceReviews PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_PerformanceReviews_Users REFERENCES shared.Users(Id),
        EmploymentId    INT               NULL     CONSTRAINT FK_PerformanceReviews_Employments REFERENCES career.Employments(Id),
        ReviewedOn      DATE              NOT NULL,
        PeriodLabel     NVARCHAR(100)     NULL,
        Rating          NVARCHAR(100)     NULL,
        Strengths       NVARCHAR(4000)    NULL,
        Improvements    NVARCHAR(4000)    NULL,
        Notes           NVARCHAR(4000)    NULL,
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_PerformanceReviews_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_PerformanceReviews_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL
    );
END
GO

-- A resume version ("Backend — Oct 2026"): the file itself is an attachment on it (Session 54); applications say
-- which version they were sent.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('career.ResumeVersions'))
BEGIN
    CREATE TABLE career.ResumeVersions
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ResumeVersions PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_ResumeVersions_Users REFERENCES shared.Users(Id),
        Name            NVARCHAR(200)     NOT NULL CONSTRAINT CK_ResumeVersions_Name CHECK (LEN(Name) > 0),
        TargetRole      NVARCHAR(200)     NULL,
        Notes           NVARCHAR(2000)    NULL,
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_ResumeVersions_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_ResumeVersions_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('career.ResumeVersions') AND name = 'UX_ResumeVersions_User_Name')
    CREATE UNIQUE INDEX UX_ResumeVersions_User_Name ON career.ResumeVersions(UserId, Name) WHERE IsDeleted = 0;
GO

-- A job you're after, through its stages. AppliedOn is required once it's been applied for (Applied / Interview /
-- Offer / Accepted); a closed application (Accepted / Rejected / Withdrawn) has ClosedOn, an open one doesn't.
-- ContactId: the recruiter or referrer; ResumeVersionId: what was sent.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('career.JobApplications'))
BEGIN
    CREATE TABLE career.JobApplications
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_JobApplications PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_JobApplications_Users REFERENCES shared.Users(Id),
        Organisation    NVARCHAR(200)     NOT NULL CONSTRAINT CK_JobApplications_Organisation CHECK (LEN(Organisation) > 0),
        Role            NVARCHAR(200)     NOT NULL CONSTRAINT CK_JobApplications_Role CHECK (LEN(Role) > 0),
        Stage           NVARCHAR(20)      NOT NULL CONSTRAINT DF_JobApplications_Stage DEFAULT ('Saved')
                            CONSTRAINT CK_JobApplications_Stage
                            CHECK (Stage IN ('Saved', 'Applied', 'Interview', 'Offer', 'Accepted', 'Rejected', 'Withdrawn')),
        AppliedOn       DATE              NULL,
        ClosedOn        DATE              NULL,
        Source          NVARCHAR(200)     NULL,
        Url             NVARCHAR(2000)    NULL,
        ContactId       INT               NULL     CONSTRAINT FK_JobApplications_Contacts REFERENCES shared.Contacts(Id),
        ResumeVersionId INT               NULL     CONSTRAINT FK_JobApplications_ResumeVersions REFERENCES career.ResumeVersions(Id),
        Notes           NVARCHAR(4000)    NULL,
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_JobApplications_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_JobApplications_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL,
        CONSTRAINT CK_JobApplications_Applied CHECK (Stage NOT IN ('Applied', 'Interview', 'Offer', 'Accepted') OR AppliedOn IS NOT NULL),
        CONSTRAINT CK_JobApplications_Closed CHECK (
            (Stage IN ('Accepted', 'Rejected', 'Withdrawn') AND ClosedOn IS NOT NULL)
            OR (Stage NOT IN ('Accepted', 'Rejected', 'Withdrawn') AND ClosedOn IS NULL)),
        CONSTRAINT CK_JobApplications_Dates CHECK (AppliedOn IS NULL OR ClosedOn IS NULL OR ClosedOn >= AppliedOn)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('career.JobApplications') AND name = 'IX_JobApplications_User_Stage')
    CREATE INDEX IX_JobApplications_User_Stage ON career.JobApplications(UserId, Stage) WHERE IsDeleted = 0;
GO

-- An application's stage history (Session 53 keeps it): one row per move, the first one with no FromStage.
-- ChangedOn is the user's local day.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('career.ApplicationStageChanges'))
BEGIN
    CREATE TABLE career.ApplicationStageChanges
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ApplicationStageChanges PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_ApplicationStageChanges_Users REFERENCES shared.Users(Id),
        JobApplicationId INT              NOT NULL CONSTRAINT FK_ApplicationStageChanges_JobApplications REFERENCES career.JobApplications(Id),
        FromStage       NVARCHAR(20)      NULL     CONSTRAINT CK_ApplicationStageChanges_From
                            CHECK (FromStage IN ('Saved', 'Applied', 'Interview', 'Offer', 'Accepted', 'Rejected', 'Withdrawn')),
        ToStage         NVARCHAR(20)      NOT NULL CONSTRAINT CK_ApplicationStageChanges_To
                            CHECK (ToStage IN ('Saved', 'Applied', 'Interview', 'Offer', 'Accepted', 'Rejected', 'Withdrawn')),
        ChangedOn       DATE              NOT NULL,
        Note            NVARCHAR(1000)    NULL,
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_ApplicationStageChanges_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_ApplicationStageChanges_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL,
        CONSTRAINT CK_ApplicationStageChanges_Moves CHECK (FromStage IS NULL OR FromStage <> ToStage)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('career.ApplicationStageChanges') AND name = 'IX_ApplicationStageChanges_Application')
    CREATE INDEX IX_ApplicationStageChanges_Application ON career.ApplicationStageChanges(JobApplicationId, ChangedOn) WHERE IsDeleted = 0;
GO

-- An interview round of an application ("Technical round"). When it's scheduled, EventId is its calendar entry
-- (Session 53 creates it), so the time lives on the event, not here. Prep and review notes are the round's own;
-- Outcome is NULL until you know.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('career.Interviews'))
BEGIN
    CREATE TABLE career.Interviews
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Interviews PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_Interviews_Users REFERENCES shared.Users(Id),
        JobApplicationId INT              NOT NULL CONSTRAINT FK_Interviews_JobApplications REFERENCES career.JobApplications(Id),
        EventId         INT               NULL     CONSTRAINT FK_Interviews_Events REFERENCES calendar.Events(Id),
        Title           NVARCHAR(200)     NOT NULL CONSTRAINT CK_Interviews_Title CHECK (LEN(Title) > 0),
        PrepNotes       NVARCHAR(4000)    NULL,
        ReviewNotes     NVARCHAR(4000)    NULL,
        Outcome         NVARCHAR(10)      NULL     CONSTRAINT CK_Interviews_Outcome CHECK (Outcome IN ('Passed', 'Failed')),
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_Interviews_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_Interviews_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('career.Interviews') AND name = 'IX_Interviews_Application')
    CREATE INDEX IX_Interviews_Application ON career.Interviews(JobApplicationId) WHERE IsDeleted = 0;
GO

-- An event belongs to at most one interview round.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('career.Interviews') AND name = 'UX_Interviews_Event')
    CREATE UNIQUE INDEX UX_Interviews_Event ON career.Interviews(EventId) WHERE IsDeleted = 0 AND EventId IS NOT NULL;
GO

-- The interview question bank: a question, your answer, what to improve after using it. General (no application)
-- or asked in a particular one; topics are tags. LastPractisedOn is the last local day you went over it.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('career.InterviewQuestions'))
BEGIN
    CREATE TABLE career.InterviewQuestions
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_InterviewQuestions PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_InterviewQuestions_Users REFERENCES shared.Users(Id),
        JobApplicationId INT              NULL     CONSTRAINT FK_InterviewQuestions_JobApplications REFERENCES career.JobApplications(Id),
        Question        NVARCHAR(1000)    NOT NULL CONSTRAINT CK_InterviewQuestions_Question CHECK (LEN(Question) > 0),
        Answer          NVARCHAR(MAX)     NULL,
        ReviewNotes     NVARCHAR(4000)    NULL,
        LastPractisedOn DATE              NULL,
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_InterviewQuestions_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_InterviewQuestions_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('career.InterviewQuestionTags'))
BEGIN
    CREATE TABLE career.InterviewQuestionTags
    (
        Id                  INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_InterviewQuestionTags PRIMARY KEY,
        UserId              INT               NOT NULL CONSTRAINT FK_InterviewQuestionTags_Users REFERENCES shared.Users(Id),
        InterviewQuestionId INT               NOT NULL CONSTRAINT FK_InterviewQuestionTags_InterviewQuestions REFERENCES career.InterviewQuestions(Id),
        TagId               INT               NOT NULL CONSTRAINT FK_InterviewQuestionTags_Tags REFERENCES shared.Tags(Id),
        CreatedAt           DATETIME2         NOT NULL CONSTRAINT DF_InterviewQuestionTags_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt           DATETIME2         NULL,
        IsDeleted           BIT               NOT NULL CONSTRAINT DF_InterviewQuestionTags_IsDeleted DEFAULT (0),
        DeletedAt           DATETIME2         NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('career.InterviewQuestionTags') AND name = 'UX_InterviewQuestionTags_Question_Tag')
    CREATE UNIQUE INDEX UX_InterviewQuestionTags_Question_Tag ON career.InterviewQuestionTags(InterviewQuestionId, TagId) WHERE IsDeleted = 0;
GO

-- Income beside the job: freelancing, content, consulting, teaching. What it earns is recorded in Finance
-- (Sessions 55+) against the source; here is what it is and whether it is going. EndedOn only once Ended.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('career.SideIncomeSources'))
BEGIN
    CREATE TABLE career.SideIncomeSources
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SideIncomeSources PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_SideIncomeSources_Users REFERENCES shared.Users(Id),
        Name            NVARCHAR(200)     NOT NULL CONSTRAINT CK_SideIncomeSources_Name CHECK (LEN(Name) > 0),
        Kind            NVARCHAR(20)      NOT NULL CONSTRAINT CK_SideIncomeSources_Kind
                            CHECK (Kind IN ('Freelance', 'Content', 'Consulting', 'Teaching', 'Other')),
        Status          NVARCHAR(10)      NOT NULL CONSTRAINT DF_SideIncomeSources_Status DEFAULT ('Active')
                            CONSTRAINT CK_SideIncomeSources_Status CHECK (Status IN ('Active', 'Paused', 'Ended')),
        StartedOn       DATE              NULL,
        EndedOn         DATE              NULL,
        Url             NVARCHAR(2000)    NULL,
        Notes           NVARCHAR(4000)    NULL,
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_SideIncomeSources_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_SideIncomeSources_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL,
        CONSTRAINT CK_SideIncomeSources_Ended CHECK (EndedOn IS NULL OR Status = 'Ended'),
        CONSTRAINT CK_SideIncomeSources_Dates CHECK (StartedOn IS NULL OR EndedOn IS NULL OR EndedOn >= StartedOn)
    );
END
GO
