USE LifeOS_UAT;
GO

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- Documents (Phase 2, Sessions 38-41). Depends on 01_shared.sql (Users, Tags) and 04_calendar.sql (Reminders).
-- A document is the record of a real-world paper — a passport, a degree certificate, a lease — plus the scans or
-- files of it. The files themselves live on disk (IFileStore: outside the web root, one folder per user, served
-- only through the API to their owner); SQL keeps only what describes them.

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'documents')
    EXEC('CREATE SCHEMA documents');
GO

-- Kind is a fixed CHECK list (the Blueprint's document categories); anything finer is a tag.
-- NumberLast4: never the whole passport/account number — only enough to tell two documents apart ("…4821").
-- IssuedOn/ExpiresOn are calendar dates (DATE); an expiry can't come before the issue date.
-- IsVault: sensitive documents whose files get encrypted and need the password again to open (Session 41).
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('documents.Documents'))
BEGIN
    CREATE TABLE documents.Documents
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Documents PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_Documents_Users REFERENCES shared.Users(Id),
        Title           NVARCHAR(200)     NOT NULL,
        Kind            NVARCHAR(20)      NOT NULL CONSTRAINT CK_Documents_Kind
                            CHECK (Kind IN ('Identity', 'Education', 'Employment', 'Financial', 'Legal', 'Medical', 'Other')),
        Issuer          NVARCHAR(200)     NULL,
        NumberLast4     NVARCHAR(4)       NULL CONSTRAINT CK_Documents_NumberLast4
                            CHECK (NumberLast4 IS NULL OR LEN(NumberLast4) BETWEEN 1 AND 4),
        IssuedOn        DATE              NULL,
        ExpiresOn       DATE              NULL,
        Notes           NVARCHAR(MAX)     NULL,
        IsVault         BIT               NOT NULL CONSTRAINT DF_Documents_IsVault DEFAULT (0),
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_Documents_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_Documents_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL,
        CONSTRAINT CK_Documents_Dates CHECK (IssuedOn IS NULL OR ExpiresOn IS NULL OR ExpiresOn >= IssuedOn)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('documents.Documents') AND name = 'IX_Documents_User_Kind')
    CREATE INDEX IX_Documents_User_Kind ON documents.Documents(UserId, Kind) INCLUDE (Title, ExpiresOn) WHERE IsDeleted = 0;
GO

-- "What's expiring soon" (My Day, Session 40) seeks on this.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('documents.Documents') AND name = 'IX_Documents_User_ExpiresOn')
    CREATE INDEX IX_Documents_User_ExpiresOn ON documents.Documents(UserId, ExpiresOn) WHERE IsDeleted = 0 AND ExpiresOn IS NOT NULL;
GO

-- The files of a document (front + back of an ID card, every page of a contract). StoredName is the name on disk:
-- 32 random hex characters + the extension, never anything the user typed (OriginalName is kept only to offer the
-- file back under its own name). Sha256 is of the bytes as uploaded, so a download can be checked against it.
-- Replacing a file adds a row and soft-deletes the old one; the old bytes stay on disk until permanent deletion
-- (Session 60), so an undo is still possible.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('documents.DocumentFiles'))
BEGIN
    CREATE TABLE documents.DocumentFiles
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_DocumentFiles PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_DocumentFiles_Users REFERENCES shared.Users(Id),
        DocumentId      INT               NOT NULL CONSTRAINT FK_DocumentFiles_Documents REFERENCES documents.Documents(Id),
        StoredName      NVARCHAR(50)      NOT NULL,
        OriginalName    NVARCHAR(255)     NOT NULL,
        ContentType     NVARCHAR(100)     NOT NULL,
        SizeBytes       BIGINT            NOT NULL CONSTRAINT CK_DocumentFiles_SizeBytes CHECK (SizeBytes > 0),
        Sha256          CHAR(64)          NOT NULL,
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_DocumentFiles_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_DocumentFiles_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL,
        CONSTRAINT CK_DocumentFiles_StoredName CHECK (StoredName COLLATE Latin1_General_BIN NOT LIKE '%[^0-9a-z.]%' AND LEN(StoredName) >= 32),
        CONSTRAINT CK_DocumentFiles_Sha256 CHECK (Sha256 COLLATE Latin1_General_BIN NOT LIKE '%[^0-9A-F]%')
    );
END
GO

-- Stored names are unique across live and deleted rows: a name on disk belongs to exactly one row, ever.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('documents.DocumentFiles') AND name = 'UX_DocumentFiles_StoredName')
    CREATE UNIQUE INDEX UX_DocumentFiles_StoredName ON documents.DocumentFiles(StoredName);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('documents.DocumentFiles') AND name = 'IX_DocumentFiles_Document')
    CREATE INDEX IX_DocumentFiles_Document ON documents.DocumentFiles(DocumentId) WHERE IsDeleted = 0;
GO

-- Tags on documents: the per-module join table pattern (goals.GoalTags), so untag-then-retag works under soft delete.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('documents.DocumentTags'))
BEGIN
    CREATE TABLE documents.DocumentTags
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_DocumentTags PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_DocumentTags_Users REFERENCES shared.Users(Id),
        DocumentId      INT               NOT NULL CONSTRAINT FK_DocumentTags_Documents REFERENCES documents.Documents(Id),
        TagId           INT               NOT NULL CONSTRAINT FK_DocumentTags_Tags REFERENCES shared.Tags(Id),
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_DocumentTags_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_DocumentTags_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('documents.DocumentTags') AND name = 'UX_DocumentTags_Document_Tag')
    CREATE UNIQUE INDEX UX_DocumentTags_Document_Tag ON documents.DocumentTags(DocumentId, TagId) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('documents.DocumentTags') AND name = 'IX_DocumentTags_Tag')
    CREATE INDEX IX_DocumentTags_Tag ON documents.DocumentTags(TagId) WHERE IsDeleted = 0;
GO

-- Expiry reminders (Session 39). "Remind me N days before it expires" (0 = on the day, up to a year): the documents
-- service keeps one ordinary calendar.Reminders row about the document in step with ExpiresOn and the days chosen
-- (09:00 in the user's zone), so done/snooze/history work as for any reminder. ExpiryReminderId points at it.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('documents.Documents') AND name = 'ExpiryReminderDays')
    ALTER TABLE documents.Documents ADD
        ExpiryReminderDays  INT  NULL,
        ExpiryReminderId    INT  NULL CONSTRAINT FK_Documents_ExpiryReminder REFERENCES calendar.Reminders(Id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Documents_ExpiryReminderDays')
    ALTER TABLE documents.Documents ADD CONSTRAINT CK_Documents_ExpiryReminderDays
        CHECK (ExpiryReminderDays IS NULL OR (ExpiryReminderDays BETWEEN 0 AND 365 AND ExpiresOn IS NOT NULL));
GO

-- Vault (Session 41). A sensitive document's files are encrypted at rest with ASP.NET Core Data Protection: the bytes
-- on disk are unreadable without the app's key ring. IsEncrypted says how this file's bytes are stored (the truth for
-- reading it back), kept per file because marking a document sensitive — or not — rewrites its files one by one.
-- Sha256 stays the hash of the original bytes either way.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('documents.DocumentFiles') AND name = 'IsEncrypted')
    ALTER TABLE documents.DocumentFiles ADD
        IsEncrypted     BIT  NOT NULL CONSTRAINT DF_DocumentFiles_IsEncrypted DEFAULT (0);
GO
