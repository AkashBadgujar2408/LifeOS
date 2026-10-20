using System.Text;
using LifeOS.Api.Infrastructure;
using LifeOS.Core.Calendar.ServiceContracts;
using LifeOS.Core.Calendar.Services;
using LifeOS.Core.Dashboard.ServiceContracts;
using LifeOS.Core.Dashboard.Services;
using LifeOS.Core.Documents.ServiceContracts;
using LifeOS.Core.Documents.Services;
using LifeOS.Core.Goals.ServiceContracts;
using LifeOS.Core.Goals.Services;
using LifeOS.Core.Habits.ServiceContracts;
using LifeOS.Core.Habits.Services;
using LifeOS.Core.Journal.ServiceContracts;
using LifeOS.Core.Journal.Services;
using LifeOS.Core.Career.ServiceContracts;
using LifeOS.Core.Career.Services;
using LifeOS.Core.Finance.ServiceContracts;
using LifeOS.Core.Finance.Services;
using LifeOS.Core.Family.ServiceContracts;
using LifeOS.Core.Family.Services;
using LifeOS.Core.Health.ServiceContracts;
using LifeOS.Core.Health.Services;
using LifeOS.Core.Home.ServiceContracts;
using LifeOS.Core.Home.Services;
using LifeOS.Core.Purchases.ServiceContracts;
using LifeOS.Core.Purchases.Services;
using LifeOS.Core.Learning.ServiceContracts;
using LifeOS.Core.Learning.Services;
using LifeOS.Core.Models;
using LifeOS.Core.Tasks.ServiceContracts;
using LifeOS.Core.Tasks.Services;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using LifeOS.Core.Shared.Services;
using LifeOS.Core.Story.ServiceContracts;
using LifeOS.Core.Story.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Serilog;

Log.Logger = new LoggerConfiguration()
    .MinimumLevel.Information()
    .MinimumLevel.Override("Microsoft", Serilog.Events.LogEventLevel.Warning)
    .WriteTo.Console()
    .WriteTo.File("logs/lifeos-.log", rollingInterval: RollingInterval.Day)
    .CreateLogger();

try
{
    var builder = WebApplication.CreateBuilder(args);

    const string AngularDevCorsPolicy = "AngularDev";

    builder.Host.UseSerilog();

    // Add services to the container.

    builder.Services.AddControllers()
        .ConfigureApiBehaviorOptions(options => options.InvalidModelStateResponseFactory = ValidationResponse.Create);

    builder.Services.AddDbContext<AppDbContext>(options =>
        options.UseSqlServer(builder.Configuration.GetConnectionString("LifeOS")));

    builder.Services.AddEndpointsApiExplorer();
    builder.Services.AddSwaggerGen();

    builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
    builder.Services.AddProblemDetails();

    builder.Services.AddHttpContextAccessor();
    builder.Services.AddScoped<ICurrentUserService, CurrentUserService>();
    builder.Services.AddScoped<IJwtTokenService, JwtTokenService>();
    builder.Services.AddScoped<IAuthService, AuthService>();
    builder.Services.AddScoped<ITagsService, TagsService>();
    builder.Services.AddScoped<IEntityLinksService, EntityLinksService>();
    builder.Services.AddScoped<IInboxService, InboxService>();
    builder.Services.AddScoped<ILifeAreasService, LifeAreasService>();
    builder.Services.AddScoped<IGoalsService, GoalsService>();
    builder.Services.AddScoped<IGoalMilestonesService, GoalMilestonesService>();
    // Measured goals (Sessions 71d–71h): one progress rule, and the kinds of things a goal can be counted from —
    // each module registers its own IGoalProgressSource below, next to its linkable provider.
    builder.Services.AddScoped<IGoalProgressService, GoalProgressService>();
    builder.Services.AddScoped<IGoalMeasureService, GoalMeasureService>();
    builder.Services.AddScoped<GoalSourceReader>();
    builder.Services.AddScoped<MilestoneLinksService>();
    builder.Services.AddScoped<ITasksService, TasksService>();
    builder.Services.AddScoped<IProjectsService, ProjectsService>();
    builder.Services.AddScoped<ICalendarFeedService, CalendarFeedService>();
    builder.Services.AddScoped<IEventsService, EventsService>();
    builder.Services.AddScoped<IRemindersService, RemindersService>();
    builder.Services.AddScoped<IHabitsService, HabitsService>();
    builder.Services.AddScoped<IRoutinesService, RoutinesService>();
    builder.Services.AddScoped<IJournalService, JournalService>();
    builder.Services.AddScoped<IDecisionsService, DecisionsService>();
    builder.Services.AddScoped<IDashboardService, DashboardService>();
    builder.Services.AddScoped<IKpisService, KpisService>();
    builder.Services.AddScoped<ILifeVisionService, LifeVisionService>();
    builder.Services.AddScoped<ISkillsService, SkillsService>();
    builder.Services.AddScoped<ICoursesService, CoursesService>();
    builder.Services.AddScoped<IBooksService, BooksService>();
    builder.Services.AddScoped<IRoadmapsService, RoadmapsService>();
    builder.Services.AddScoped<IStudySessionsService, StudySessionsService>();
    builder.Services.AddScoped<ICertificationsService, CertificationsService>();
    builder.Services.AddScoped<IKnowledgeNotesService, KnowledgeNotesService>();
    builder.Services.AddScoped<IChaptersService, ChaptersService>();
    builder.Services.AddScoped<ILifeStoryService, LifeStoryService>();
    builder.Services.AddScoped<IMissionsService, MissionsService>();
    builder.Services.AddScoped<ILifeAreasStoryService, LifeAreasStoryService>();
    builder.Services.AddScoped<IAchievementsService, AchievementsService>();
    builder.Services.AddScoped<ISearchService, SearchService>();
    builder.Services.AddScoped<ISettingsService, SettingsService>();
    builder.Services.AddScoped<IDocumentsService, DocumentsService>();
    builder.Services.AddScoped<IVaultService, VaultService>();
    builder.Services.AddScoped<IAttachmentsService, AttachmentsService>();
    builder.Services.AddScoped<IContactsService, ContactsService>();
    builder.Services.AddScoped<IEmploymentsService, EmploymentsService>();
    builder.Services.AddScoped<ISalaryRecordsService, SalaryRecordsService>();
    builder.Services.AddScoped<ICareerAchievementsService, CareerAchievementsService>();
    builder.Services.AddScoped<IJobApplicationsService, JobApplicationsService>();
    builder.Services.AddScoped<IInterviewsService, InterviewsService>();
    builder.Services.AddScoped<IInterviewQuestionsService, InterviewQuestionsService>();
    builder.Services.AddScoped<IResumeVersionsService, ResumeVersionsService>();
    builder.Services.AddScoped<IPerformanceReviewsService, PerformanceReviewsService>();
    builder.Services.AddScoped<ISideIncomeSourcesService, SideIncomeSourcesService>();
    builder.Services.AddScoped<IAccountsService, AccountsService>();
    builder.Services.AddScoped<ITransactionsService, TransactionsService>();
    builder.Services.AddScoped<IRecurringTransactionsService, RecurringTransactionsService>();
    builder.Services.AddScoped<IBudgetsService, BudgetsService>();
    builder.Services.AddScoped<IHoldingsService, HoldingsService>();
    builder.Services.AddScoped<ILoansService, LoansService>();
    builder.Services.AddScoped<IWealthService, WealthService>();
    builder.Services.AddScoped<IExchangeRatesService, ExchangeRatesService>();
    builder.Services.AddScoped<IInsurancePoliciesService, InsurancePoliciesService>();
    builder.Services.AddScoped<ITaxItemsService, TaxItemsService>();
    builder.Services.AddScoped<IHealthProfileService, HealthProfileService>();
    builder.Services.AddScoped<IMedicalConditionsService, MedicalConditionsService>();
    builder.Services.AddScoped<IDoctorVisitsService, DoctorVisitsService>();
    builder.Services.AddScoped<IMedicationsService, MedicationsService>();
    builder.Services.AddScoped<IWorkoutsService, WorkoutsService>();
    builder.Services.AddScoped<ISleepService, SleepService>();
    builder.Services.AddScoped<IMeasurementsService, MeasurementsService>();
    builder.Services.AddScoped<INutritionService, NutritionService>();
    builder.Services.AddScoped<ILabResultsService, LabResultsService>();
    builder.Services.AddScoped<IWellnessService, WellnessService>();
    builder.Services.AddScoped<IGoalTargetsService, GoalTargetsService>();
    builder.Services.AddScoped<HomeReminders>();
    builder.Services.AddScoped<IPropertiesService, PropertiesService>();
    builder.Services.AddScoped<IAssetsService, AssetsService>();
    builder.Services.AddScoped<IVehiclesService, VehiclesService>();
    builder.Services.AddScoped<IFuelLogsService, FuelLogsService>();
    builder.Services.AddScoped<IForecastService, ForecastService>();
    builder.Services.AddScoped<IPlanService, PlanService>();
    builder.Services.AddScoped<IScenariosService, ScenariosService>();
    builder.Services.AddScoped<IWarrantiesService, WarrantiesService>();
    builder.Services.AddScoped<IMaintenanceService, MaintenanceService>();
    builder.Services.AddScoped<IHomeAgendaService, HomeAgendaService>();
    builder.Services.AddScoped<IUtilityBillsService, UtilityBillsService>();
    builder.Services.AddScoped<IHouseholdProjectsService, HouseholdProjectsService>();
    builder.Services.AddScoped<IPurchasesService, PurchasesService>();
    builder.Services.AddScoped<IShoppingListsService, ShoppingListsService>();
    builder.Services.AddScoped<IWishlistService, WishlistService>();
    builder.Services.AddScoped<IBenefitsService, BenefitsService>();
    builder.Services.AddScoped<ISubscriptionsService, SubscriptionsService>();
    builder.Services.AddScoped<IReturnsService, ReturnsService>();
    builder.Services.AddScoped<IStatementImportService, StatementImportService>();
    builder.Services.AddScoped<IFinanceReportsService, FinanceReportsService>();
    builder.Services.AddScoped<IAccountDataService, AccountDataService>();
    builder.Services.AddRecoveryRateLimit();

    // Files (document files, attachments) live on disk outside any web root, one folder per user (IFileStore).
    // Vault files and vault unlocks are protected with Data Protection; its key ring lives in its own folder (kept
    // out of the repo, DPAPI-wrapped on Windows) — without it vault files can't be read, so it's backed up with them.
    var fileStorage = builder.Configuration.GetSection(FileStorageOptions.Section).Get<FileStorageOptions>() ?? new FileStorageOptions();
    var dataProtection = builder.Services.AddDataProtection()
        .SetApplicationName("LifeOS")
        .PersistKeysToFileSystem(new DirectoryInfo(DiskFileStore.ResolveKeysPath(fileStorage.KeysPath)));
    if (OperatingSystem.IsWindows())
    {
        dataProtection.ProtectKeysWithDpapi();
    }

    builder.Services.AddSingleton<IFileStore>(services => new DiskFileStore(
        DiskFileStore.ResolveRoot(fileStorage.RootPath, builder.Environment.WebRootPath), fileStorage.MaxFileBytes,
        services.GetRequiredService<IDataProtectionProvider>()));

    // Linkable entity types for EntityLinks — each module registers its own provider here (Goal, Task, ...).
    builder.Services.AddScoped<ILinkableEntityProvider, InboxLinkableProvider>();
    builder.Services.AddScoped<ILinkableEntityProvider, GoalLinkableProvider>();
    builder.Services.AddScoped<ILinkableEntityProvider, TaskLinkableProvider>();
    builder.Services.AddScoped<ILinkableEntityProvider, ProjectLinkableProvider>();
    builder.Services.AddScoped<IGoalProgressSource, TaskGoalSources>();
    builder.Services.AddScoped<ILinkableEntityProvider, EventLinkableProvider>();
    builder.Services.AddScoped<ILinkableEntityProvider, HabitLinkableProvider>();
    builder.Services.AddScoped<IGoalProgressSource, HabitGoalSource>();
    builder.Services.AddScoped<ILinkableEntityProvider, JournalEntryLinkableProvider>();
    builder.Services.AddScoped<ILinkableEntityProvider, DocumentLinkableProvider>();
    builder.Services.AddScoped<ILinkableEntityProvider, DecisionLinkableProvider>();
    builder.Services.AddScoped<ILinkableEntityProvider, SkillLinkableProvider>();
    builder.Services.AddScoped<ILinkableEntityProvider, CourseLinkableProvider>();
    builder.Services.AddScoped<ILinkableEntityProvider, BookLinkableProvider>();
    builder.Services.AddScoped<ILinkableEntityProvider, RoadmapLinkableProvider>();
    builder.Services.AddScoped<IGoalProgressSource, LearningGoalSources>();
    builder.Services.AddScoped<ILinkableEntityProvider, CertificationLinkableProvider>();
    builder.Services.AddScoped<ILinkableEntityProvider, KnowledgeNoteLinkableProvider>();
    builder.Services.AddScoped<ILinkableEntityProvider, ContactLinkableProvider>();
    builder.Services.AddScoped<ILinkableEntityProvider, EmploymentLinkableProvider>();
    builder.Services.AddScoped<ILinkableEntityProvider, CareerAchievementLinkableProvider>();
    builder.Services.AddScoped<ILinkableEntityProvider, JobApplicationLinkableProvider>();
    builder.Services.AddScoped<ILinkableEntityProvider, InterviewQuestionLinkableProvider>();
    builder.Services.AddScoped<ILinkableEntityProvider, ResumeVersionLinkableProvider>();
    builder.Services.AddScoped<ILinkableEntityProvider, AccountLinkableProvider>();
    builder.Services.AddScoped<ILinkableEntityProvider, TransactionLinkableProvider>();
    builder.Services.AddScoped<ILinkableEntityProvider, HoldingLinkableProvider>();
    builder.Services.AddScoped<ILinkableEntityProvider, LoanLinkableProvider>();
    builder.Services.AddScoped<ILinkableEntityProvider, InsurancePolicyLinkableProvider>();
    builder.Services.AddScoped<ILinkableEntityProvider, TaxItemLinkableProvider>();
    builder.Services.AddScoped<ILinkableEntityProvider, DoctorVisitLinkableProvider>();
    builder.Services.AddScoped<ILinkableEntityProvider, MedicationLinkableProvider>();
    builder.Services.AddScoped<ILinkableEntityProvider, MedicalConditionLinkableProvider>();
    builder.Services.AddScoped<ILinkableEntityProvider, LabResultLinkableProvider>();
    builder.Services.AddScoped<IGoalProgressSource, WorkoutGoalSource>();
    builder.Services.AddScoped<IRelationshipsService, RelationshipsService>();
    builder.Services.AddScoped<ISignificantDatesService, SignificantDatesService>();
    builder.Services.AddScoped<ILinkableEntityProvider, PropertyLinkableProvider>();
    builder.Services.AddScoped<ILinkableEntityProvider, AssetLinkableProvider>();
    builder.Services.AddScoped<ILinkableEntityProvider, VehicleLinkableProvider>();
    builder.Services.AddScoped<ILinkableEntityProvider, WarrantyLinkableProvider>();
    builder.Services.AddScoped<ILinkableEntityProvider, MaintenanceTaskLinkableProvider>();
    builder.Services.AddScoped<ILinkableEntityProvider, UtilityBillLinkableProvider>();
    builder.Services.AddScoped<ILinkableEntityProvider, PurchaseLinkableProvider>();
    builder.Services.AddScoped<ILinkableEntityProvider, ShoppingListLinkableProvider>();
    builder.Services.AddScoped<ILinkableEntityProvider, WishlistItemLinkableProvider>();
    builder.Services.AddScoped<ILinkableEntityProvider, ReturnLinkableProvider>();
    builder.Services.AddScoped<ILinkableEntityProvider, BenefitLinkableProvider>();
    builder.Services.AddScoped<ILinkableEntityProvider, SubscriptionLinkableProvider>();

    builder.Services.AddAutoMapper(cfg => { }, typeof(AppDbContext).Assembly);

    builder.Services
        .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
        .AddJwtBearer(options =>
        {
            options.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidIssuer = builder.Configuration["Jwt:Issuer"],
                ValidateAudience = true,
                ValidAudience = builder.Configuration["Jwt:Audience"],
                ValidateIssuerSigningKey = true,
                IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(builder.Configuration["Jwt:Key"]!)),
                ValidateLifetime = true,
                ClockSkew = TimeSpan.FromMinutes(1),
            };
        });
    builder.Services.AddAuthorization();

    builder.Services.AddCors(options =>
    {
        options.AddPolicy(AngularDevCorsPolicy, policy =>
            policy.WithOrigins("http://localhost:4200")
                  .AllowAnyHeader()
                  .AllowAnyMethod());
    });

    var app = builder.Build();

    app.UseExceptionHandler();

    // Configure the HTTP request pipeline.
    if (app.Environment.IsDevelopment())
    {
        app.UseSwagger();
        app.UseSwaggerUI();
    }

    app.UseHttpsRedirection();

    app.UseCors(AngularDevCorsPolicy);

    app.UseAuthentication();
    app.UseAuthorization();
    app.UseRateLimiter();

    app.MapControllers();

    app.Run();
}
catch (Microsoft.Extensions.Hosting.HostAbortedException)
{
    // Expected: EF Core design-time tooling (e.g. `dotnet ef`) builds the host then aborts it deliberately.
}
catch (Exception ex)
{
    Log.Fatal(ex, "LifeOS.Api terminated unexpectedly");
}
finally
{
    Log.CloseAndFlush();
}
