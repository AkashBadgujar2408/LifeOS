USE LifeOS_UAT;
GO

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- Family & Relationships (Phase 3, Sessions 72-74). Depends on 01_shared.sql (Users, Contacts), 03_tasks.sql
-- (TaskItems — the task that keeps a responsibility going) and 15_shopping.sql (Purchases — a gift that was bought).
-- Every person is a shared.Contacts row: this schema only adds what's true *between* people and you — how they're
-- related, the days that matter, when you were in touch, gifts, who looks after what. A memory and commitment aid,
-- never a rating: nothing here scores, ranks or grades a person. Anything "next", "due" or "overdue" (the next
-- birthday, an age, who's past their keep-in-touch cadence) is computed, never stored.

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'people')
    EXEC('CREATE SCHEMA people');
GO

-- The family tree, as edges: RelativeContactId is PersonContactId's <Kind>. A NULL side is you: PersonContactId NULL
-- = "Asha is my Parent"; RelativeContactId NULL (Parent only) = "I'm Kiran's parent" — your child (Session 73).
-- Parent is directed (a child is the same edge read the other way); Partner and Sibling go both ways, so
-- they're stored once, the smaller id first (you, NULL, always first) — the unique index then catches either
-- direction. Other needs a Label ("Cousin", "Godmother"); the others may carry one ("Step-mother", "Wife").
-- Loops ("A is B's parent and B is A's") and a second kind between the same pair are refused by the service.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('people.Relationships'))
BEGIN
    CREATE TABLE people.Relationships
    (
        Id                  INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Relationships PRIMARY KEY,
        UserId              INT               NOT NULL CONSTRAINT FK_Relationships_Users REFERENCES shared.Users(Id),
        PersonContactId     INT               NULL     CONSTRAINT FK_Relationships_PersonContacts REFERENCES shared.Contacts(Id),
        RelativeContactId   INT               NULL     CONSTRAINT FK_Relationships_RelativeContacts REFERENCES shared.Contacts(Id),
        Kind                NVARCHAR(10)      NOT NULL CONSTRAINT CK_Relationships_Kind CHECK (Kind IN ('Parent', 'Partner', 'Sibling', 'Other')),
        Label               NVARCHAR(50)      NULL     CONSTRAINT CK_Relationships_Label CHECK (LEN(Label) > 0),
        CreatedAt           DATETIME2         NOT NULL CONSTRAINT DF_Relationships_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt           DATETIME2         NULL,
        IsDeleted           BIT               NOT NULL CONSTRAINT DF_Relationships_IsDeleted DEFAULT (0),
        DeletedAt           DATETIME2         NULL,
        CONSTRAINT CK_Relationships_NotSelf CHECK (PersonContactId IS NULL OR PersonContactId <> RelativeContactId),
        CONSTRAINT CK_Relationships_OtherLabel CHECK (Kind <> 'Other' OR Label IS NOT NULL),
        CONSTRAINT CK_Relationships_Canonical CHECK (Kind NOT IN ('Partner', 'Sibling') OR PersonContactId IS NULL
            OR PersonContactId < RelativeContactId),
        CONSTRAINT CK_Relationships_NotYouTwice CHECK (PersonContactId IS NOT NULL OR RelativeContactId IS NOT NULL),
        CONSTRAINT CK_Relationships_YouAsParent CHECK (RelativeContactId IS NOT NULL OR Kind = 'Parent')
    );
END
GO

-- Session 73: your children are Parent edges with you (NULL) as the relative. Databases created by the first
-- Session 72 script have RelativeContactId NOT NULL; the indexes on it go first, the blocks below put them back.
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('people.Relationships') AND name = 'RelativeContactId' AND is_nullable = 0)
BEGIN
    DROP INDEX IF EXISTS UX_Relationships_Pair ON people.Relationships;
    DROP INDEX IF EXISTS IX_Relationships_Relative ON people.Relationships;
    ALTER TABLE people.Relationships ALTER COLUMN RelativeContactId INT NULL;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Relationships_NotYouTwice')
    ALTER TABLE people.Relationships ADD CONSTRAINT CK_Relationships_NotYouTwice CHECK (PersonContactId IS NOT NULL OR RelativeContactId IS NOT NULL);
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Relationships_YouAsParent')
    ALTER TABLE people.Relationships ADD CONSTRAINT CK_Relationships_YouAsParent CHECK (RelativeContactId IS NOT NULL OR Kind = 'Parent');
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('people.Relationships') AND name = 'UX_Relationships_Pair')
    CREATE UNIQUE INDEX UX_Relationships_Pair ON people.Relationships(UserId, PersonContactId, RelativeContactId, Kind) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('people.Relationships') AND name = 'IX_Relationships_Relative')
    CREATE INDEX IX_Relationships_Relative ON people.Relationships(RelativeContactId) WHERE IsDeleted = 0;
GO

-- Days that come round every year: a birthday (one per person), an anniversary (with you — ContactId is your
-- partner — or of two other people, OtherContactId: your parents'), or anything else with a Label ("Remembrance
-- day"). Month + Day + an optional Year, because a birthday is often known without the year it was born in; 29 Feb
-- is allowed (shown on 28 Feb in other years), and with a year only in a leap year.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('people.SignificantDates'))
BEGIN
    CREATE TABLE people.SignificantDates
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SignificantDates PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_SignificantDates_Users REFERENCES shared.Users(Id),
        ContactId       INT               NOT NULL CONSTRAINT FK_SignificantDates_Contacts REFERENCES shared.Contacts(Id),
        OtherContactId  INT               NULL     CONSTRAINT FK_SignificantDates_OtherContacts REFERENCES shared.Contacts(Id),
        Kind            NVARCHAR(12)      NOT NULL CONSTRAINT CK_SignificantDates_Kind CHECK (Kind IN ('Birthday', 'Anniversary', 'Other')),
        Label           NVARCHAR(100)     NULL     CONSTRAINT CK_SignificantDates_Label CHECK (LEN(Label) > 0),
        Month           TINYINT           NOT NULL CONSTRAINT CK_SignificantDates_Month CHECK (Month BETWEEN 1 AND 12),
        Day             TINYINT           NOT NULL,
        Year            SMALLINT          NULL     CONSTRAINT CK_SignificantDates_Year CHECK (Year BETWEEN 1850 AND 2200),
        Notes           NVARCHAR(2000)    NULL,
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_SignificantDates_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_SignificantDates_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL,
        CONSTRAINT CK_SignificantDates_Day CHECK (Day >= 1 AND Day <= CASE WHEN Month IN (4, 6, 9, 11) THEN 30 WHEN Month = 2 THEN 29 ELSE 31 END),
        CONSTRAINT CK_SignificantDates_LeapDay CHECK (Month <> 2 OR Day <> 29 OR Year IS NULL
            OR (Year % 4 = 0 AND (Year % 100 <> 0 OR Year % 400 = 0))),
        CONSTRAINT CK_SignificantDates_OtherLabel CHECK (Kind <> 'Other' OR Label IS NOT NULL),
        CONSTRAINT CK_SignificantDates_Pair CHECK (OtherContactId IS NULL OR (Kind = 'Anniversary' AND OtherContactId <> ContactId))
    );
END
GO

-- One birthday per person. Keyed on (ContactId, Kind) on purpose: a unique index on ContactId alone makes EF scaffold
-- Contact ↔ SignificantDate as one-to-one, and a person has many dates (same trap as UX_Transactions_LoanDisbursement).
IF EXISTS (SELECT 1 FROM sys.indexes i WHERE i.object_id = OBJECT_ID('people.SignificantDates') AND i.name = 'UX_SignificantDates_Birthday'
           AND (SELECT COUNT(*) FROM sys.index_columns c WHERE c.object_id = i.object_id AND c.index_id = i.index_id) = 1)
    DROP INDEX UX_SignificantDates_Birthday ON people.SignificantDates;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('people.SignificantDates') AND name = 'UX_SignificantDates_Birthday')
    CREATE UNIQUE INDEX UX_SignificantDates_Birthday ON people.SignificantDates(ContactId, Kind) WHERE IsDeleted = 0 AND Kind = 'Birthday';
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('people.SignificantDates') AND name = 'IX_SignificantDates_User_MonthDay')
    CREATE INDEX IX_SignificantDates_User_MonthDay ON people.SignificantDates(UserId, Month, Day) WHERE IsDeleted = 0;
GO

-- Being in touch: a call, a visit, a message — with one or more people (InteractionPeople), on a day. The latest one
-- keeps shared.Contacts.LastContactedOn current (Session 74).
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('people.Interactions'))
BEGIN
    CREATE TABLE people.Interactions
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Interactions PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_Interactions_Users REFERENCES shared.Users(Id),
        OccurredOn      DATE              NOT NULL,
        Kind            NVARCHAR(10)      NOT NULL CONSTRAINT CK_Interactions_Kind
                            CHECK (Kind IN ('Call', 'Video', 'Message', 'Meeting', 'Visit', 'Event', 'Other')),
        Summary         NVARCHAR(500)     NULL     CONSTRAINT CK_Interactions_Summary CHECK (LEN(Summary) > 0),
        Notes           NVARCHAR(4000)    NULL,
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_Interactions_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_Interactions_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('people.Interactions') AND name = 'IX_Interactions_User_OccurredOn')
    CREATE INDEX IX_Interactions_User_OccurredOn ON people.Interactions(UserId, OccurredOn) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('people.InteractionPeople'))
BEGIN
    CREATE TABLE people.InteractionPeople
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_InteractionPeople PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_InteractionPeople_Users REFERENCES shared.Users(Id),
        InteractionId   INT               NOT NULL CONSTRAINT FK_InteractionPeople_Interactions REFERENCES people.Interactions(Id),
        ContactId       INT               NOT NULL CONSTRAINT FK_InteractionPeople_Contacts REFERENCES shared.Contacts(Id),
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_InteractionPeople_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_InteractionPeople_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('people.InteractionPeople') AND name = 'UX_InteractionPeople_Pair')
    CREATE UNIQUE INDEX UX_InteractionPeople_Pair ON people.InteractionPeople(InteractionId, ContactId) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('people.InteractionPeople') AND name = 'IX_InteractionPeople_Contact')
    CREATE INDEX IX_InteractionPeople_Contact ON people.InteractionPeople(ContactId) WHERE IsDeleted = 0;
GO

-- How often you'd like to be in touch with someone (every N days). Who's past it is worked out from their last
-- interaction — a gentle nudge, never a score.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('people.KeepInTouch'))
BEGIN
    CREATE TABLE people.KeepInTouch
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_KeepInTouch PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_KeepInTouch_Users REFERENCES shared.Users(Id),
        ContactId       INT               NOT NULL CONSTRAINT FK_KeepInTouch_Contacts REFERENCES shared.Contacts(Id),
        CadenceDays     SMALLINT          NOT NULL CONSTRAINT CK_KeepInTouch_CadenceDays CHECK (CadenceDays BETWEEN 1 AND 730),
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_KeepInTouch_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_KeepInTouch_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('people.KeepInTouch') AND name = 'UX_KeepInTouch_Contact')
    CREATE UNIQUE INDEX UX_KeepInTouch_Contact ON people.KeepInTouch(ContactId) WHERE IsDeleted = 0;
GO

-- A gift for someone: an idea, then bought, then given. The occasion is one of their significant dates or free
-- text ("Housewarming"). Money is never kept here: a bought gift points at its Purchase (which owns the Finance
-- expense); EstimatedAmount is only what the idea is expected to cost.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('people.GiftIdeas'))
BEGIN
    CREATE TABLE people.GiftIdeas
    (
        Id                  INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_GiftIdeas PRIMARY KEY,
        UserId              INT               NOT NULL CONSTRAINT FK_GiftIdeas_Users REFERENCES shared.Users(Id),
        ContactId           INT               NOT NULL CONSTRAINT FK_GiftIdeas_Contacts REFERENCES shared.Contacts(Id),
        Title               NVARCHAR(200)     NOT NULL CONSTRAINT CK_GiftIdeas_Title CHECK (LEN(Title) > 0),
        SignificantDateId   INT               NULL     CONSTRAINT FK_GiftIdeas_SignificantDates REFERENCES people.SignificantDates(Id),
        Occasion            NVARCHAR(100)     NULL     CONSTRAINT CK_GiftIdeas_Occasion CHECK (LEN(Occasion) > 0),
        Status              NVARCHAR(10)      NOT NULL CONSTRAINT DF_GiftIdeas_Status DEFAULT ('Idea')
                                                       CONSTRAINT CK_GiftIdeas_Status CHECK (Status IN ('Idea', 'Bought', 'Given')),
        EstimatedAmount     DECIMAL(19, 4)    NULL     CONSTRAINT CK_GiftIdeas_EstimatedAmount CHECK (EstimatedAmount >= 0),
        Currency            CHAR(3)           NULL     CONSTRAINT CK_GiftIdeas_Currency
                                CHECK (Currency COLLATE Latin1_General_BIN LIKE '[A-Z][A-Z][A-Z]'),
        Link                NVARCHAR(2000)    NULL     CONSTRAINT CK_GiftIdeas_Link CHECK (Link LIKE 'http://_%' OR Link LIKE 'https://_%'),
        PurchaseId          INT               NULL     CONSTRAINT FK_GiftIdeas_Purchases REFERENCES shopping.Purchases(Id),
        GivenOn             DATE              NULL,
        Notes               NVARCHAR(2000)    NULL,
        CreatedAt           DATETIME2         NOT NULL CONSTRAINT DF_GiftIdeas_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt           DATETIME2         NULL,
        IsDeleted           BIT               NOT NULL CONSTRAINT DF_GiftIdeas_IsDeleted DEFAULT (0),
        DeletedAt           DATETIME2         NULL,
        CONSTRAINT CK_GiftIdeas_Money CHECK ((EstimatedAmount IS NULL AND Currency IS NULL) OR (EstimatedAmount IS NOT NULL AND Currency IS NOT NULL)),
        CONSTRAINT CK_GiftIdeas_Given CHECK ((Status = 'Given' AND GivenOn IS NOT NULL) OR (Status <> 'Given' AND GivenOn IS NULL)),
        CONSTRAINT CK_GiftIdeas_Purchase CHECK (PurchaseId IS NULL OR Status <> 'Idea')
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('people.GiftIdeas') AND name = 'IX_GiftIdeas_Contact')
    CREATE INDEX IX_GiftIdeas_Contact ON people.GiftIdeas(ContactId) WHERE IsDeleted = 0;
GO

-- Commitments in the family: who looks after what ("Dad's medicines", "Paying the society bill"). HeldBy: Me, Shared
-- (with HolderContactId when it's one person) or Someone (HolderContactId required — tracked, not yours to do).
-- ContactId: whom it's for. TaskItemId: the (usually repeating) task that keeps it going.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('people.Responsibilities'))
BEGIN
    CREATE TABLE people.Responsibilities
    (
        Id                  INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Responsibilities PRIMARY KEY,
        UserId              INT               NOT NULL CONSTRAINT FK_Responsibilities_Users REFERENCES shared.Users(Id),
        Title               NVARCHAR(200)     NOT NULL CONSTRAINT CK_Responsibilities_Title CHECK (LEN(Title) > 0),
        ContactId           INT               NULL     CONSTRAINT FK_Responsibilities_Contacts REFERENCES shared.Contacts(Id),
        HeldBy              NVARCHAR(10)      NOT NULL CONSTRAINT DF_Responsibilities_HeldBy DEFAULT ('Me')
                                                       CONSTRAINT CK_Responsibilities_HeldBy CHECK (HeldBy IN ('Me', 'Shared', 'Someone')),
        HolderContactId     INT               NULL     CONSTRAINT FK_Responsibilities_HolderContacts REFERENCES shared.Contacts(Id),
        TaskItemId          INT               NULL     CONSTRAINT FK_Responsibilities_TaskItems REFERENCES tasks.TaskItems(Id),
        StartedOn           DATE              NULL,
        EndedOn             DATE              NULL,
        Notes               NVARCHAR(2000)    NULL,
        CreatedAt           DATETIME2         NOT NULL CONSTRAINT DF_Responsibilities_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt           DATETIME2         NULL,
        IsDeleted           BIT               NOT NULL CONSTRAINT DF_Responsibilities_IsDeleted DEFAULT (0),
        DeletedAt           DATETIME2         NULL,
        CONSTRAINT CK_Responsibilities_Holder CHECK ((HeldBy = 'Me' AND HolderContactId IS NULL) OR HeldBy = 'Shared'
            OR (HeldBy = 'Someone' AND HolderContactId IS NOT NULL)),
        CONSTRAINT CK_Responsibilities_Span CHECK (EndedOn IS NULL OR StartedOn IS NULL OR EndedOn >= StartedOn)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('people.Responsibilities') AND name = 'IX_Responsibilities_User')
    CREATE INDEX IX_Responsibilities_User ON people.Responsibilities(UserId) WHERE IsDeleted = 0;
GO
