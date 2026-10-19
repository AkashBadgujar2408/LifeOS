USE LifeOS_UAT;
GO

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- Health & Wellness (Phase 3, Sessions 62-65). Depends on 01_shared.sql (Users, Contacts) and 04_calendar.sql
-- (Events, Reminders — a visit's appointment and its follow-up).
-- Blueprint: "Treat medical records as highly sensitive: encrypt, control access and provide export/deletion."
-- So: every free-text column here is named ...Notes and holds ASP.NET Core Data Protection ciphertext, written
-- and read only through the app (a value converter, `SensitiveColumns`); the CK_..._Encrypted checks refuse
-- anything that isn't a Data Protection payload (they all start "CfDJ8"), so plain text can never be stored by
-- mistake. Everything else (names, dates, values) stays plain so it can be filtered, charted and checked — the
-- API refuses all of it without the vault unlock (423), and every unlock is logged. Calendar days are DATE in the
-- user's own day; moments are DATETIME2 UTC. Trends, averages, adherence and "out of range" are computed, never
-- stored.

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'health')
    EXEC('CREATE SCHEMA health');
GO

-- One per user: the basics a doctor or an emergency card asks for. All optional. Sex only as far as reference
-- ranges need it (Intersex is a valid answer, blank is "rather not say").
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('health.HealthProfiles'))
BEGIN
    CREATE TABLE health.HealthProfiles
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_HealthProfiles PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_HealthProfiles_Users REFERENCES shared.Users(Id),
        DateOfBirth     DATE              NULL,
        Sex             NVARCHAR(10)      NULL     CONSTRAINT CK_HealthProfiles_Sex CHECK (Sex IN ('Female', 'Male', 'Intersex')),
        BloodGroup      NVARCHAR(3)       NULL     CONSTRAINT CK_HealthProfiles_BloodGroup
                            CHECK (BloodGroup IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
        HeightCm        DECIMAL(4, 1)     NULL     CONSTRAINT CK_HealthProfiles_HeightCm CHECK (HeightCm BETWEEN 30 AND 272),
        IsOrganDonor    BIT               NULL,
        Notes           NVARCHAR(MAX)     NULL     CONSTRAINT CK_HealthProfiles_NotesEncrypted CHECK (Notes LIKE 'CfDJ8%'),
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_HealthProfiles_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_HealthProfiles_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('health.HealthProfiles') AND name = 'UX_HealthProfiles_User')
    CREATE UNIQUE INDEX UX_HealthProfiles_User ON health.HealthProfiles(UserId) WHERE IsDeleted = 0;
GO

-- Medical history: a condition (diagnosis), a surgery, an allergy. StartedOn = diagnosed / operated / first
-- noticed; EndedOn = resolved (a surgery has none — it happened on a day). Severity is for allergies only.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('health.MedicalConditions'))
BEGIN
    CREATE TABLE health.MedicalConditions
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_MedicalConditions PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_MedicalConditions_Users REFERENCES shared.Users(Id),
        Kind            NVARCHAR(10)      NOT NULL CONSTRAINT CK_MedicalConditions_Kind CHECK (Kind IN ('Condition', 'Surgery', 'Allergy')),
        Name            NVARCHAR(200)     NOT NULL CONSTRAINT CK_MedicalConditions_Name CHECK (LEN(Name) > 0),
        Severity        NVARCHAR(10)      NULL     CONSTRAINT CK_MedicalConditions_Severity CHECK (Severity IN ('Mild', 'Moderate', 'Severe')),
        StartedOn       DATE              NULL,
        EndedOn         DATE              NULL,
        Notes           NVARCHAR(MAX)     NULL     CONSTRAINT CK_MedicalConditions_NotesEncrypted CHECK (Notes LIKE 'CfDJ8%'),
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_MedicalConditions_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_MedicalConditions_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL,
        CONSTRAINT CK_MedicalConditions_SeverityKind CHECK (Severity IS NULL OR Kind = 'Allergy'),
        CONSTRAINT CK_MedicalConditions_Ended CHECK (EndedOn IS NULL OR (Kind <> 'Surgery' AND (StartedOn IS NULL OR EndedOn >= StartedOn)))
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('health.MedicalConditions') AND name = 'IX_MedicalConditions_User_Kind')
    CREATE INDEX IX_MedicalConditions_User_Kind ON health.MedicalConditions(UserId, Kind) WHERE IsDeleted = 0;
GO

-- A visit to a doctor (or dentist, physio...). The doctor is a shared contact (the one people list). A booked
-- appointment owns a timed calendar.Events row (EventId, Session 63 — like interview rounds); FollowUpOn is when
-- to go back, and its reminder is owned by the visits service (FollowUpReminderId, same pattern as insurance
-- renewals). ConditionId: what it was about, if anything.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('health.DoctorVisits'))
BEGIN
    CREATE TABLE health.DoctorVisits
    (
        Id                  INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_DoctorVisits PRIMARY KEY,
        UserId              INT               NOT NULL CONSTRAINT FK_DoctorVisits_Users REFERENCES shared.Users(Id),
        Reason              NVARCHAR(200)     NOT NULL CONSTRAINT CK_DoctorVisits_Reason CHECK (LEN(Reason) > 0),
        VisitOn             DATE              NOT NULL,
        ContactId           INT               NULL     CONSTRAINT FK_DoctorVisits_Contacts REFERENCES shared.Contacts(Id),
        Specialty           NVARCHAR(100)     NULL,
        Place               NVARCHAR(200)     NULL,
        ConditionId         INT               NULL     CONSTRAINT FK_DoctorVisits_MedicalConditions REFERENCES health.MedicalConditions(Id),
        EventId             INT               NULL     CONSTRAINT FK_DoctorVisits_Events REFERENCES calendar.Events(Id),
        FollowUpOn          DATE              NULL,
        FollowUpReminderId  INT               NULL     CONSTRAINT FK_DoctorVisits_Reminders REFERENCES calendar.Reminders(Id),
        Notes               NVARCHAR(MAX)     NULL     CONSTRAINT CK_DoctorVisits_NotesEncrypted CHECK (Notes LIKE 'CfDJ8%'),
        CreatedAt           DATETIME2         NOT NULL CONSTRAINT DF_DoctorVisits_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt           DATETIME2         NULL,
        IsDeleted           BIT               NOT NULL CONSTRAINT DF_DoctorVisits_IsDeleted DEFAULT (0),
        DeletedAt           DATETIME2         NULL,
        CONSTRAINT CK_DoctorVisits_FollowUp CHECK (FollowUpOn IS NULL OR FollowUpOn >= VisitOn),
        CONSTRAINT CK_DoctorVisits_FollowUpReminder CHECK (FollowUpReminderId IS NULL OR FollowUpOn IS NOT NULL)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('health.DoctorVisits') AND name = 'IX_DoctorVisits_User_VisitOn')
    CREATE INDEX IX_DoctorVisits_User_VisitOn ON health.DoctorVisits(UserId, VisitOn) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('health.DoctorVisits') AND name = 'UX_DoctorVisits_Event')
    CREATE UNIQUE INDEX UX_DoctorVisits_Event ON health.DoctorVisits(EventId) WHERE IsDeleted = 0 AND EventId IS NOT NULL;
GO

-- A medicine: what, how much, from when to when (no EndDate = ongoing). IsAsNeeded = taken when needed, so it
-- has no schedule and nothing is ever "due". PrescribedAtVisitId / ConditionId: where it came from and what for.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('health.Medications'))
BEGIN
    CREATE TABLE health.Medications
    (
        Id                  INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Medications PRIMARY KEY,
        UserId              INT               NOT NULL CONSTRAINT FK_Medications_Users REFERENCES shared.Users(Id),
        Name                NVARCHAR(200)     NOT NULL CONSTRAINT CK_Medications_Name CHECK (LEN(Name) > 0),
        Strength            NVARCHAR(100)     NULL,
        StartDate           DATE              NOT NULL,
        EndDate             DATE              NULL,
        IsAsNeeded          BIT               NOT NULL CONSTRAINT DF_Medications_IsAsNeeded DEFAULT (0),
        ConditionId         INT               NULL     CONSTRAINT FK_Medications_MedicalConditions REFERENCES health.MedicalConditions(Id),
        PrescribedAtVisitId INT               NULL     CONSTRAINT FK_Medications_DoctorVisits REFERENCES health.DoctorVisits(Id),
        Notes               NVARCHAR(MAX)     NULL     CONSTRAINT CK_Medications_NotesEncrypted CHECK (Notes LIKE 'CfDJ8%'),
        CreatedAt           DATETIME2         NOT NULL CONSTRAINT DF_Medications_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt           DATETIME2         NULL,
        IsDeleted           BIT               NOT NULL CONSTRAINT DF_Medications_IsDeleted DEFAULT (0),
        DeletedAt           DATETIME2         NULL,
        CONSTRAINT CK_Medications_EndDate CHECK (EndDate IS NULL OR EndDate >= StartDate)
    );
END
GO

-- When a scheduled medicine is taken: a local wall-clock time on some weekdays (ScheduleDays: the habits'
-- ISO bitmask, Mon = 1 ... Sun = 64, 127 = every day). Dose: how much at that time ("1 tablet").
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('health.MedicationSchedules'))
BEGIN
    CREATE TABLE health.MedicationSchedules
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_MedicationSchedules PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_MedicationSchedules_Users REFERENCES shared.Users(Id),
        MedicationId    INT               NOT NULL CONSTRAINT FK_MedicationSchedules_Medications REFERENCES health.Medications(Id),
        TimeOfDay       TIME(0)           NOT NULL,
        ScheduleDays    TINYINT           NOT NULL CONSTRAINT DF_MedicationSchedules_ScheduleDays DEFAULT (127)
                            CONSTRAINT CK_MedicationSchedules_ScheduleDays CHECK (ScheduleDays BETWEEN 1 AND 127),
        Dose            NVARCHAR(100)     NULL,
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_MedicationSchedules_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_MedicationSchedules_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('health.MedicationSchedules') AND name = 'UX_MedicationSchedules_Medication_Time')
    CREATE UNIQUE INDEX UX_MedicationSchedules_Medication_Time ON health.MedicationSchedules(MedicationId, TimeOfDay) WHERE IsDeleted = 0;
GO

-- A dose taken (or knowingly skipped) on the user's local day. A scheduled dose is one row per schedule per day,
-- ticked like a habit day (un-ticking soft-deletes it); an as-needed dose has no schedule and is always Taken.
-- TakenAt is the moment, if known.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('health.MedicationDoses'))
BEGIN
    CREATE TABLE health.MedicationDoses
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_MedicationDoses PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_MedicationDoses_Users REFERENCES shared.Users(Id),
        MedicationId    INT               NOT NULL CONSTRAINT FK_MedicationDoses_Medications REFERENCES health.Medications(Id),
        ScheduleId      INT               NULL     CONSTRAINT FK_MedicationDoses_MedicationSchedules REFERENCES health.MedicationSchedules(Id),
        DoseDate        DATE              NOT NULL,
        Status          NVARCHAR(10)      NOT NULL CONSTRAINT CK_MedicationDoses_Status CHECK (Status IN ('Taken', 'Skipped')),
        TakenAt         DATETIME2         NULL,
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_MedicationDoses_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_MedicationDoses_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL,
        CONSTRAINT CK_MedicationDoses_AsNeeded CHECK (ScheduleId IS NOT NULL OR Status = 'Taken'),
        CONSTRAINT CK_MedicationDoses_TakenAt CHECK (TakenAt IS NULL OR Status = 'Taken')
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('health.MedicationDoses') AND name = 'UX_MedicationDoses_Schedule_Date')
    CREATE UNIQUE INDEX UX_MedicationDoses_Schedule_Date ON health.MedicationDoses(ScheduleId, DoseDate) WHERE IsDeleted = 0 AND ScheduleId IS NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('health.MedicationDoses') AND name = 'IX_MedicationDoses_User_Date')
    CREATE INDEX IX_MedicationDoses_User_Date ON health.MedicationDoses(UserId, DoseDate) WHERE IsDeleted = 0;
GO

-- Exercise on a day: a walk, a run, a gym session. Steps for a walk (or a day's steps), distance for anything
-- that covers ground.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('health.Workouts'))
BEGIN
    CREATE TABLE health.Workouts
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Workouts PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_Workouts_Users REFERENCES shared.Users(Id),
        Kind            NVARCHAR(10)      NOT NULL CONSTRAINT CK_Workouts_Kind
                            CHECK (Kind IN ('Walk', 'Run', 'Cycle', 'Swim', 'Strength', 'Yoga', 'Sport', 'Other')),
        OccurredOn      DATE              NOT NULL,
        Minutes         INT               NOT NULL CONSTRAINT CK_Workouts_Minutes CHECK (Minutes BETWEEN 1 AND 1440),
        Steps           INT               NULL     CONSTRAINT CK_Workouts_Steps CHECK (Steps BETWEEN 0 AND 200000),
        DistanceKm      DECIMAL(6, 2)     NULL     CONSTRAINT CK_Workouts_DistanceKm CHECK (DistanceKm > 0),
        Calories        INT               NULL     CONSTRAINT CK_Workouts_Calories CHECK (Calories BETWEEN 0 AND 20000),
        Intensity       NVARCHAR(10)      NULL     CONSTRAINT CK_Workouts_Intensity CHECK (Intensity IN ('Light', 'Moderate', 'Hard')),
        Notes           NVARCHAR(MAX)     NULL     CONSTRAINT CK_Workouts_NotesEncrypted CHECK (Notes LIKE 'CfDJ8%'),
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_Workouts_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_Workouts_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('health.Workouts') AND name = 'IX_Workouts_User_OccurredOn')
    CREATE INDEX IX_Workouts_User_OccurredOn ON health.Workouts(UserId, OccurredOn) WHERE IsDeleted = 0;
GO

-- What was eaten, roughly: a description, optionally calories and macros.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('health.Meals'))
BEGIN
    CREATE TABLE health.Meals
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Meals PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_Meals_Users REFERENCES shared.Users(Id),
        EatenOn         DATE              NOT NULL,
        MealType        NVARCHAR(10)      NOT NULL CONSTRAINT CK_Meals_MealType CHECK (MealType IN ('Breakfast', 'Lunch', 'Dinner', 'Snack')),
        Description     NVARCHAR(500)     NOT NULL CONSTRAINT CK_Meals_Description CHECK (LEN(Description) > 0),
        Calories        INT               NULL     CONSTRAINT CK_Meals_Calories CHECK (Calories BETWEEN 0 AND 10000),
        ProteinG        DECIMAL(5, 1)     NULL     CONSTRAINT CK_Meals_ProteinG CHECK (ProteinG >= 0),
        CarbsG          DECIMAL(5, 1)     NULL     CONSTRAINT CK_Meals_CarbsG CHECK (CarbsG >= 0),
        FatG            DECIMAL(5, 1)     NULL     CONSTRAINT CK_Meals_FatG CHECK (FatG >= 0),
        Notes           NVARCHAR(MAX)     NULL     CONSTRAINT CK_Meals_NotesEncrypted CHECK (Notes LIKE 'CfDJ8%'),
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_Meals_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_Meals_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('health.Meals') AND name = 'IX_Meals_User_EatenOn')
    CREATE INDEX IX_Meals_User_EatenOn ON health.Meals(UserId, EatenOn) WHERE IsDeleted = 0;
GO

-- Water drunk on a day: one row per quick log ("+250 ml"); the day's total is their sum.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('health.WaterIntakes'))
BEGIN
    CREATE TABLE health.WaterIntakes
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_WaterIntakes PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_WaterIntakes_Users REFERENCES shared.Users(Id),
        DrunkOn         DATE              NOT NULL,
        Millilitres     INT               NOT NULL CONSTRAINT CK_WaterIntakes_Millilitres CHECK (Millilitres BETWEEN 1 AND 5000),
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_WaterIntakes_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_WaterIntakes_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('health.WaterIntakes') AND name = 'IX_WaterIntakes_User_DrunkOn')
    CREATE INDEX IX_WaterIntakes_User_DrunkOn ON health.WaterIntakes(UserId, DrunkOn) WHERE IsDeleted = 0;
GO

-- A night's sleep (or a nap): from when to when, as UTC moments, plus how it felt (1-5). WokeOn is the local day
-- it counts for — averages and "last night" read it, so a sleep from 23:30 to 07:00 belongs to the morning after.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('health.SleepRecords'))
BEGIN
    CREATE TABLE health.SleepRecords
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SleepRecords PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_SleepRecords_Users REFERENCES shared.Users(Id),
        WokeOn          DATE              NOT NULL,
        StartedAt       DATETIME2         NOT NULL,
        EndedAt         DATETIME2         NOT NULL,
        Quality         TINYINT           NULL     CONSTRAINT CK_SleepRecords_Quality CHECK (Quality BETWEEN 1 AND 5),
        IsNap           BIT               NOT NULL CONSTRAINT DF_SleepRecords_IsNap DEFAULT (0),
        Notes           NVARCHAR(MAX)     NULL     CONSTRAINT CK_SleepRecords_NotesEncrypted CHECK (Notes LIKE 'CfDJ8%'),
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_SleepRecords_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_SleepRecords_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL,
        CONSTRAINT CK_SleepRecords_Span CHECK (EndedAt > StartedAt AND DATEDIFF(MINUTE, StartedAt, EndedAt) <= 1440)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('health.SleepRecords') AND name = 'IX_SleepRecords_User_WokeOn')
    CREATE INDEX IX_SleepRecords_User_WokeOn ON health.SleepRecords(UserId, WokeOn) WHERE IsDeleted = 0;
GO

-- A measurement of the body on a day, in one fixed unit per kind (converted for display, never stored twice):
-- Weight kg, BodyFat %, Waist/Chest/Hips cm, BloodPressure mmHg (Value = systolic, Value2 = diastolic — the only
-- kind with a second value), RestingHeartRate bpm, BloodSugar mg/dL.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('health.BodyMeasurements'))
BEGIN
    CREATE TABLE health.BodyMeasurements
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_BodyMeasurements PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_BodyMeasurements_Users REFERENCES shared.Users(Id),
        Kind            NVARCHAR(20)      NOT NULL CONSTRAINT CK_BodyMeasurements_Kind
                            CHECK (Kind IN ('Weight', 'BodyFat', 'Waist', 'Chest', 'Hips', 'BloodPressure', 'RestingHeartRate', 'BloodSugar')),
        MeasuredOn      DATE              NOT NULL,
        Value           DECIMAL(7, 2)     NOT NULL CONSTRAINT CK_BodyMeasurements_Value CHECK (Value > 0),
        Value2          DECIMAL(7, 2)     NULL     CONSTRAINT CK_BodyMeasurements_Value2Positive CHECK (Value2 > 0),
        Notes           NVARCHAR(MAX)     NULL     CONSTRAINT CK_BodyMeasurements_NotesEncrypted CHECK (Notes LIKE 'CfDJ8%'),
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_BodyMeasurements_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_BodyMeasurements_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL,
        CONSTRAINT CK_BodyMeasurements_Value2 CHECK ((Kind = 'BloodPressure' AND Value2 IS NOT NULL) OR (Kind <> 'BloodPressure' AND Value2 IS NULL)),
        CONSTRAINT CK_BodyMeasurements_BodyFat CHECK (Kind <> 'BodyFat' OR Value < 100)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('health.BodyMeasurements') AND name = 'IX_BodyMeasurements_User_Kind_MeasuredOn')
    CREATE INDEX IX_BodyMeasurements_User_Kind_MeasuredOn ON health.BodyMeasurements(UserId, Kind, MeasuredOn) WHERE IsDeleted = 0;
GO

-- One result of a medical test ("HbA1c 5.9 %", "Urine protein: Negative"): a number or a word, with the lab's
-- reference range as printed on the report (either end may be open). "Out of range" is computed (Session 65);
-- history per test is the same TestName over time. The report itself is an attachment.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('health.LabResults'))
BEGIN
    CREATE TABLE health.LabResults
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_LabResults PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_LabResults_Users REFERENCES shared.Users(Id),
        TestName        NVARCHAR(200)     NOT NULL CONSTRAINT CK_LabResults_TestName CHECK (LEN(TestName) > 0),
        TakenOn         DATE              NOT NULL,
        Value           DECIMAL(19, 4)    NULL,
        ValueText       NVARCHAR(100)     NULL,
        Unit            NVARCHAR(30)      NULL,
        RangeLow        DECIMAL(19, 4)    NULL,
        RangeHigh       DECIMAL(19, 4)    NULL,
        Laboratory      NVARCHAR(200)     NULL,
        VisitId         INT               NULL     CONSTRAINT FK_LabResults_DoctorVisits REFERENCES health.DoctorVisits(Id),
        Notes           NVARCHAR(MAX)     NULL     CONSTRAINT CK_LabResults_NotesEncrypted CHECK (Notes LIKE 'CfDJ8%'),
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_LabResults_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_LabResults_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL,
        CONSTRAINT CK_LabResults_Result CHECK ((Value IS NOT NULL AND ValueText IS NULL) OR (Value IS NULL AND ValueText IS NOT NULL)),
        CONSTRAINT CK_LabResults_Range CHECK (RangeLow IS NULL OR RangeHigh IS NULL OR RangeLow <= RangeHigh),
        CONSTRAINT CK_LabResults_RangeNumeric CHECK (Value IS NOT NULL OR (RangeLow IS NULL AND RangeHigh IS NULL))
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('health.LabResults') AND name = 'IX_LabResults_User_Test_TakenOn')
    CREATE INDEX IX_LabResults_User_Test_TakenOn ON health.LabResults(UserId, TestName, TakenOn) WHERE IsDeleted = 0;
GO
