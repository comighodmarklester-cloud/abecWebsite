using Microsoft.AspNetCore.RateLimiting;
using System.Threading.RateLimiting;
using ABEC_System.Constants;
using ABEC_System.Data;
using ABEC_System.Interfaces;
using ABEC_System.Options;
using ABEC_System.Repositories;
using ABEC_System.Services;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.FileProviders;
var builder = WebApplication.CreateBuilder(args);

const long registrationRequestBodyLimit = SystemConstants.RegistrationUploadLimits.MaxRegistrationRequestBytes;

builder.WebHost.ConfigureKestrel(options =>
{
    options.Limits.MaxRequestBodySize = registrationRequestBodyLimit;
});

builder.Services.Configure<FormOptions>(options =>
{
    options.MultipartBodyLengthLimit = registrationRequestBodyLimit;
    options.ValueLengthLimit = int.MaxValue;
    options.MultipartHeadersLengthLimit = int.MaxValue;
});

// Optional local SMTP overrides (gitignored). Re-apply user-secrets + env afterward so a
// real App Password from secure configuration always wins over any local placeholder.
builder.Configuration.AddJsonFile("smtp.local.json", optional: true, reloadOnChange: true);
if (builder.Environment.IsDevelopment())
    builder.Configuration.AddUserSecrets(typeof(Program).Assembly, optional: true);
builder.Configuration.AddEnvironmentVariables();

builder.Services.AddControllersWithViews(options => options.Filters.Add<BatchWriteFilter>())
    .AddJsonOptions(options =>
    {
        // Keep ñ/Ñ and other Unicode letters readable in JSON (not \u00f1 escapes).
        options.JsonSerializerOptions.Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping;
    });
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddAuthentication("StudentSession").AddCookie("StudentSession", options =>
{
    options.Cookie.Name = "abec-student-session";
    options.Cookie.HttpOnly = true;
    options.Cookie.SameSite = SameSiteMode.Strict;
    options.ExpireTimeSpan = TimeSpan.FromHours(8);
    options.SlidingExpiration = true;
    options.Events.OnRedirectToLogin = context => { context.Response.StatusCode = 401; return Task.CompletedTask; };
    options.Events.OnRedirectToAccessDenied = context => { context.Response.StatusCode = 403; return Task.CompletedTask; };
});
builder.Services.AddAuthorization();
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = 429;
    options.AddPolicy("StudentLogin", context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown", _ => new FixedWindowRateLimiterOptions
        { PermitLimit = 12, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
});

builder.Services.Configure<EmailSettings>(builder.Configuration.GetSection(EmailSettings.SectionName));
builder.Services.Configure<AppSettings>(builder.Configuration.GetSection(AppSettings.SectionName));

var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? throw new InvalidOperationException("Connection string 'DefaultConnection' is missing.");

ServerVersion serverVersion;
try
{
    serverVersion = ServerVersion.AutoDetect(connectionString);
}
catch (Exception ex)
{
    Console.Error.WriteLine("ABEC could not connect to MySQL during startup. The website will still start. Database features stay unavailable until MySQL is running on localhost:3306.");
    Console.Error.WriteLine(ex.GetType().Name + ": " + ex.Message);
    serverVersion = ServerVersion.Parse("8.0.36-mysql");
}

builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseMySql(connectionString, serverVersion));

builder.Services.AddScoped(typeof(IRepository<>), typeof(Repository<>));
builder.Services.AddScoped<IUnitOfWork, UnitOfWork>();

builder.Services.AddHttpContextAccessor();
builder.Services.AddMemoryCache();
builder.Services.AddHttpClient<ILocationService, LocationService>();

builder.Services.AddScoped<IEmailService, EmailService>();
builder.Services.AddScoped<IEmailConfigService, EmailConfigService>();
builder.Services.AddScoped<IPdfService, PdfService>();
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<IApplicantService, ApplicantService>();
builder.Services.AddScoped<ApplicantRegistrationStorageService>();
builder.Services.AddScoped<IBatchService, BatchService>();
builder.Services.AddScoped<IBatchDocumentService, BatchDocumentService>();
builder.Services.AddScoped<CourseHistoryRecorder>();
builder.Services.AddScoped<ICourseService, CourseService>();
builder.Services.AddScoped<IActivationService, ActivationService>();
builder.Services.AddScoped<IScheduleService, ScheduleService>();
builder.Services.AddScoped<ITrainingRoomService, TrainingRoomService>();
builder.Services.AddScoped<IDocumentRequestService, DocumentRequestService>();
builder.Services.AddScoped<ICourseDocumentService, CourseDocumentService>();
builder.Services.AddScoped<INotificationService, NotificationService>();
builder.Services.AddScoped<IArchiveService, ArchiveService>();
builder.Services.AddScoped<IAdminProfileService, AdminProfileService>();
builder.Services.AddScoped<IStudentPortalService, StudentPortalService>();

builder.Services.AddCors(options =>
{
    options.AddPolicy("AbecCors", policy =>
        policy
            .WithOrigins(
                "http://127.0.0.1:5500",
                "http://localhost:5500",
                "http://127.0.0.1:5188",
                "http://localhost:5188",
                "https://localhost:7162")
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials());
});

var app = builder.Build();

try
{
    var emailOpts = app.Services.GetRequiredService<Microsoft.Extensions.Options.IOptions<EmailSettings>>().Value;
    var startupLog = app.Services.GetRequiredService<ILoggerFactory>().CreateLogger("EmailStartup");
    var passwordSet = !string.IsNullOrWhiteSpace(emailOpts.Password)
        && !emailOpts.Password.Contains("REPLACE", StringComparison.OrdinalIgnoreCase)
        && !emailOpts.Password.Contains("YOUR_", StringComparison.OrdinalIgnoreCase)
        && !emailOpts.Password.Contains("APP_PASSWORD", StringComparison.OrdinalIgnoreCase);
    startupLog.LogInformation(
        "Email SMTP: Enabled={Enabled} Host={Host}:{Port} From={FromName} <{FromAddress}> User={User} AppPasswordConfigured={PasswordSet}",
        emailOpts.Enabled,
        emailOpts.Host,
        emailOpts.Port,
        emailOpts.FromName,
        emailOpts.FromAddress,
        emailOpts.Username,
        passwordSet);

    var appOpts = app.Services.GetRequiredService<Microsoft.Extensions.Options.IOptions<ABEC_System.Options.AppSettings>>().Value;
    startupLog.LogInformation("PublicBaseUrl for applicant email links: {PublicBaseUrl}", appOpts.PublicBaseUrl);
}
catch
{
    // Non-fatal diagnostics only.
}

try
{
    await DbSeeder.SeedAsync(app.Services);
}
catch (Exception ex)
{
    var logger = app.Services.GetRequiredService<ILoggerFactory>().CreateLogger("Startup");
    logger.LogWarning(ex, "Database seeding skipped or failed. Ensure MySQL is running.");
}

var listensOnHttps = (app.Configuration["ASPNETCORE_URLS"] ?? "")
    .Contains("https://", StringComparison.OrdinalIgnoreCase);
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Error");
    // Redirect only when this process is actually listening on HTTPS.
    // An http-only site must not send API calls to a port that is not open.
    if (listensOnHttps)
    {
        app.UseHsts();
        app.UseHttpsRedirection();
    }
}

app.Use(async (context, next) =>
{
    try
    {
        await next();
    }
    catch (BatchIntegrityException ex)
    {
        context.Response.StatusCode = StatusCodes.Status409Conflict;
        await context.Response.WriteAsJsonAsync(new { success = false, message = ex.Message });
    }
    catch (Microsoft.EntityFrameworkCore.DbUpdateException ex) when (ex.InnerException is MySqlConnector.MySqlException { Number: 1062 })
    {
        context.Response.StatusCode = StatusCodes.Status409Conflict;
        await context.Response.WriteAsJsonAsync(new { success = false, message = "A record in this batch already uses that email or contact number, or another unique identifier is already in use." });
    }
    catch (Exception ex)
    {
        if (!context.Request.Path.StartsWithSegments("/api") || context.Response.HasStarted)
            throw;

        var log = context.RequestServices.GetRequiredService<ILoggerFactory>().CreateLogger("ApiErrors");
        log.LogError(ex, "API {Method} {Path} failed", context.Request.Method, context.Request.Path);
        context.Response.StatusCode = StatusCodes.Status500InternalServerError;
        var databaseDown = IsDatabaseFailure(ex);
        await context.Response.WriteAsJsonAsync(new
        {
            success = false,
            message = databaseDown
                ? "The ABEC database is not available. Start MySQL on localhost port 3306, then refresh this page."
                : "The server could not complete this request."
        });
    }
});

// Existing HTML uses ../../wwwroot/... relative asset paths.
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(app.Environment.WebRootPath),
    RequestPath = "/wwwroot"
});
app.UseStaticFiles();

// Serve completed frontend HTML pages with their relative navigation intact.
var viewsPath = Path.Combine(app.Environment.ContentRootPath, "Views");
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(viewsPath),
    RequestPath = "/Views"
});

app.UseRouting();
app.UseCors("AbecCors");
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Home}/{action=Index}/{id?}");

app.MapGet("/", () => Results.Redirect("/Views/Home/LandingPage.html"));
app.MapGet("/api/health", async (ApplicationDbContext db, CancellationToken cancellationToken) =>
{
    var database = false;
    try
    {
        database = await db.Database.CanConnectAsync(cancellationToken);
    }
    catch
    {
        database = false;
    }

    return Results.Json(new
    {
        ok = true,
        service = "ABEC System",
        database,
        databaseMessage = database ? null : "MySQL is not accepting connections on localhost:3306."
    });
});
app.MapGet("/confirm-slot", async (string? token, IApplicantService applicants, CancellationToken ct) =>
    Results.Content(await SlotPageAsync("confirm", token, applicants, ct), "text/html; charset=utf-8"));

app.MapPost("/confirm-slot", async (HttpRequest request, IApplicantService applicants, CancellationToken ct) =>
    Results.Content(await SlotPostAsync(true, request, applicants, ct), "text/html; charset=utf-8"));

app.MapGet("/decline-slot", async (string? token, IApplicantService applicants, CancellationToken ct) =>
    Results.Content(await SlotPageAsync("decline", token, applicants, ct), "text/html; charset=utf-8"));

app.MapPost("/decline-slot", async (HttpRequest request, IApplicantService applicants, CancellationToken ct) =>
    Results.Content(await SlotPostAsync(false, request, applicants, ct), "text/html; charset=utf-8"));

app.Run();

static async Task<string> SlotPageAsync(string action, string? token, IApplicantService applicants, CancellationToken ct)
{
    try
    {
        var status = await applicants.DescribeSlotLinkAsync(token, ct);
        return SlotActionPage.Intent(action, token, status);
    }
    catch (Exception)
    {
        return SlotActionPage.Failed("The slot link could not be opened. Please try again in a moment.");
    }
}

static async Task<string> SlotPostAsync(bool confirm, HttpRequest request, IApplicantService applicants, CancellationToken ct)
{
    try
    {
        if (!request.HasFormContentType)
            return SlotActionPage.Failed("The slot response could not be read. Open the link from your ABEC email and try again.");

        var form = await request.ReadFormAsync(ct);
        var token = form["token"].ToString();
        var result = confirm
            ? await applicants.ConfirmSlotAsync(token, ct)
            : await applicants.DeclineSlotAsync(token, ct);
        if (!result.Success)
            return SlotActionPage.Failed(result.Message);

        return SlotActionPage.Done(confirm, result.Data?.FullName);
    }
    catch (Exception)
    {
        return SlotActionPage.Failed("The slot response could not be saved. Please try again in a moment.");
    }
}

static bool IsDatabaseFailure(Exception ex)
{
    for (var current = ex; current is not null; current = current.InnerException)
    {
        var name = current.GetType().Name;
        if (name.Contains("MySql", StringComparison.OrdinalIgnoreCase)
            || name.Contains("DbException", StringComparison.Ordinal)
            || name.Contains("DbUpdate", StringComparison.Ordinal))
            return true;
    }
    return false;
}
