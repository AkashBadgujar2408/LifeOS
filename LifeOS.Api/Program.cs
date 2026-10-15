using System.Text;
using LifeOS.Api.Infrastructure;
using LifeOS.Core.Calendar.ServiceContracts;
using LifeOS.Core.Calendar.Services;
using LifeOS.Core.Dashboard.ServiceContracts;
using LifeOS.Core.Dashboard.Services;
using LifeOS.Core.Goals.ServiceContracts;
using LifeOS.Core.Goals.Services;
using LifeOS.Core.Habits.ServiceContracts;
using LifeOS.Core.Habits.Services;
using LifeOS.Core.Journal.ServiceContracts;
using LifeOS.Core.Journal.Services;
using LifeOS.Core.Models;
using LifeOS.Core.Tasks.ServiceContracts;
using LifeOS.Core.Tasks.Services;
using LifeOS.Core.Shared.ServiceContracts;
using LifeOS.Core.Shared.Services;
using LifeOS.Core.Story.ServiceContracts;
using LifeOS.Core.Story.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
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
    builder.Services.AddScoped<ITasksService, TasksService>();
    builder.Services.AddScoped<IProjectsService, ProjectsService>();
    builder.Services.AddScoped<ICalendarFeedService, CalendarFeedService>();
    builder.Services.AddScoped<IEventsService, EventsService>();
    builder.Services.AddScoped<IRemindersService, RemindersService>();
    builder.Services.AddScoped<IHabitsService, HabitsService>();
    builder.Services.AddScoped<IJournalService, JournalService>();
    builder.Services.AddScoped<IDashboardService, DashboardService>();
    builder.Services.AddScoped<IChaptersService, ChaptersService>();
    builder.Services.AddScoped<ILifeStoryService, LifeStoryService>();

    // Linkable entity types for EntityLinks — each module registers its own provider here (Goal, Task, ...).
    builder.Services.AddScoped<ILinkableEntityProvider, InboxLinkableProvider>();
    builder.Services.AddScoped<ILinkableEntityProvider, GoalLinkableProvider>();
    builder.Services.AddScoped<ILinkableEntityProvider, TaskLinkableProvider>();
    builder.Services.AddScoped<ILinkableEntityProvider, ProjectLinkableProvider>();
    builder.Services.AddScoped<ILinkableEntityProvider, EventLinkableProvider>();
    builder.Services.AddScoped<ILinkableEntityProvider, HabitLinkableProvider>();
    builder.Services.AddScoped<ILinkableEntityProvider, JournalEntryLinkableProvider>();

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
