using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Antiforgery;
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
// Hosting information logs include query strings, including emailed bearer tokens.
// Keep safe application error references without recording full request URLs.
builder.Logging.AddFilter("Microsoft.AspNetCore.Hosting.Diagnostics", LogLevel.Warning);

const long registrationRequestBodyLimit = SystemConstants.RegistrationUploadLimits.MaxRegistrationRequestBytes;

builder.WebHost.ConfigureKestrel(options =>
{
    options.Limits.MaxRequestBodySize = registrationRequestBodyLimit;
});

builder.Services.Configure<FormOptions>(options =>
{
    options.MultipartBodyLengthLimit = registrationRequestBodyLimit;
    options.ValueLengthLimit = 1024 * 1024;
    options.MultipartHeadersLengthLimit = 16 * 1024;
});

// Optional local SMTP overrides (gitignored). Re-apply user-secrets + env afterward so a
// real App Password from secure configuration always wins over any local placeholder.
if (builder.Environment.IsDevelopment())
{
    builder.Configuration.AddJsonFile("smtp.local.json", optional: true, reloadOnChange: true);
    builder.Configuration.AddUserSecrets(typeof(Program).Assembly, optional: true);
}
builder.Configuration.AddEnvironmentVariables();

builder.Services.AddControllersWithViews(options => { options.Filters.Add<BatchAccessFilter>(); options.Filters.Add<BatchContextFilter>(); options.Filters.Add<BatchWriteFilter>(); })
    .AddJsonOptions(options =>
    {
        // Keep ñ/Ñ and other Unicode letters readable in JSON (not \u00f1 escapes).
        options.JsonSerializerOptions.Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping;
    });
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddScoped<SessionSecurity>();
builder.Services.AddAuthentication("StudentSession").AddCookie("StudentSession", options =>
{
    options.Cookie.Name = "abec-student-session";
    options.Cookie.HttpOnly = true;
    options.Cookie.SameSite = SameSiteMode.Strict;
    options.Cookie.SecurePolicy = builder.Environment.IsDevelopment() ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
    options.ExpireTimeSpan = TimeSpan.FromHours(8);
    options.SlidingExpiration = true;
    options.EventsType = typeof(SessionSecurity);
    options.Events.OnRedirectToLogin = context => { context.Response.StatusCode = 401; return Task.CompletedTask; };
    options.Events.OnRedirectToAccessDenied = context => { context.Response.StatusCode = 403; return Task.CompletedTask; };
});
builder.Services.AddAuthorization();
builder.Services.AddAntiforgery(options =>
{
    options.Cookie.Name = SlotActionPage.VerificationCookieName;
    options.Cookie.HttpOnly = true;
    options.Cookie.SameSite = SameSiteMode.Strict;
    options.Cookie.SecurePolicy = builder.Environment.IsDevelopment() ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
});
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = 429;
    options.AddPolicy("StudentLogin", context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown", _ => new FixedWindowRateLimiterOptions
        { PermitLimit = 12, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
});

builder.Services.Configure<EmailSettings>(builder.Configuration.GetSection(EmailSettings.SectionName));
builder.Services.AddOptions<AppSettings>()
    .Bind(builder.Configuration.GetSection(AppSettings.SectionName))
    .PostConfigure(settings =>
    {
        PublicAppUrl.ApplyProductionDefaults(settings, builder.Environment.IsDevelopment());
        settings.PublicBaseUrl = PublicAppUrl.Normalize(settings.PublicBaseUrl, builder.Environment.IsDevelopment());
    })
    .Validate(settings =>
    {
        try { PublicAppUrl.Normalize(settings.PublicBaseUrl, builder.Environment.IsDevelopment()); return true; }
        catch (InvalidOperationException) { return false; }
    }, "Configure App__PublicBaseUrl with the public HTTPS website origin for applicant email links.")
    .ValidateOnStart();

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
    Console.Error.WriteLine("Startup database error type: " + ex.GetType().Name);
    serverVersion = ServerVersion.Parse("8.0.36-mysql");
}

builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseMySql(connectionString, serverVersion));

builder.Services.AddScoped(typeof(IRepository<>), typeof(Repository<>));
builder.Services.AddScoped<IUnitOfWork, UnitOfWork>();

builder.Services.AddHttpContextAccessor();
builder.Services.AddMemoryCache();
builder.Services.AddSingleton<ApplicationReadiness>();
builder.Services.AddHttpClient<ILocationService, LocationService>();

builder.Services.AddScoped<IEmailService, EmailService>();
builder.Services.AddScoped<IEmailConfigService, EmailConfigService>();
builder.Services.AddScoped<IPdfService, PdfService>();
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<IApplicantService, ApplicantService>();
builder.Services.AddHostedService<SlotOfferExpiryWorker>();
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

builder.Services.AddCors();
builder.Services.AddOptions<Microsoft.AspNetCore.Cors.Infrastructure.CorsOptions>()
    .Configure<Microsoft.Extensions.Options.IOptions<AppSettings>>((options, appSettings) =>
{
    options.AddPolicy("AbecCors", policy =>
        policy
            .WithOrigins(builder.Environment.IsDevelopment() ? RequestSecurityMiddleware.DevelopmentOrigins.ToArray()
                : new[] { appSettings.Value.PublicBaseUrl })
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials());
});

var app = builder.Build();
app.UseMiddleware<RequestSecurityMiddleware>();

try
{
    var emailOpts = app.Services.GetRequiredService<Microsoft.Extensions.Options.IOptions<EmailSettings>>().Value;
    var startupLog = app.Services.GetRequiredService<ILoggerFactory>().CreateLogger("EmailStartup");
    var passwordSet = !string.IsNullOrWhiteSpace(emailOpts.Password)
        && !emailOpts.Password.Contains("REPLACE", StringComparison.OrdinalIgnoreCase)
        && !emailOpts.Password.Contains("YOUR_", StringComparison.OrdinalIgnoreCase)
        && !emailOpts.Password.Contains("APP_PASSWORD", StringComparison.OrdinalIgnoreCase);
    startupLog.LogInformation(
        "Email SMTP: Enabled={Enabled} AppPasswordConfigured={PasswordSet}", emailOpts.Enabled, passwordSet);

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
    app.Services.GetRequiredService<ApplicationReadiness>().MarkSchemaReady();
}
catch (Exception ex)
{
    var logger = app.Services.GetRequiredService<ILoggerFactory>().CreateLogger("Startup");
    logger.LogWarning("Database seeding skipped or failed ({ErrorType}). Check database availability and schema.", ex.GetType().Name);
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
        await context.Response.WriteAsJsonAsync(new { success = false, message = ex.Message, field = ex.Field });
    }
    catch (Microsoft.EntityFrameworkCore.DbUpdateException ex) when (ex.InnerException is MySqlConnector.MySqlException { Number: 1062 })
    {
        context.Response.StatusCode = StatusCodes.Status409Conflict;
        var detail = ex.InnerException!.Message;
        var field = detail.Contains("contact", StringComparison.OrdinalIgnoreCase) ? "contactNumber"
            : detail.Contains("email", StringComparison.OrdinalIgnoreCase) ? "email" : null;
        await context.Response.WriteAsJsonAsync(new { success = false, field, message = field == "contactNumber"
            ? "Another registration in this batch already uses this contact number."
            : field == "email" ? "Another registration in this batch already uses this email address." : "This identifier is already in use." });
    }
    catch (Exception ex)
    {
        if (!context.Request.Path.StartsWithSegments("/api") || context.Response.HasStarted)
            throw;

        var log = context.RequestServices.GetRequiredService<ILoggerFactory>().CreateLogger("ApiErrors");
        var errorReference = Guid.NewGuid().ToString("N");
        log.LogError("API request failed ({ErrorType}); reference {ErrorReference}", ex.GetType().Name, errorReference);
        context.Response.StatusCode = StatusCodes.Status500InternalServerError;
        var databaseDown = IsDatabaseFailure(ex);
        await context.Response.WriteAsJsonAsync(new
        {
            success = false,
            message = databaseDown
                ? "The ABEC database is temporarily unavailable. Please try again later. Reference: " + errorReference
                : "The server could not complete this request. Reference: " + errorReference
        });
    }
});

app.UseAuthentication();
app.Use(async (context, next) =>
{
    if (context.Request.Path.Equals("/Views/Student/ClassSchedule.html", StringComparison.OrdinalIgnoreCase))
    {
        var user = context.User;
        if (!user.IsInRole("Student") || !int.TryParse(user.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value, out var studentId))
        { context.Response.StatusCode = 401; return; }
        var db = context.RequestServices.GetRequiredService<ApplicationDbContext>();
        if (!await db.Students.AnyAsync(s => s.StudentId == studentId && s.AccountStatus == "Active" && s.Batch!.Status == "Active", context.RequestAborted))
        { context.Response.Redirect("/Views/Student/StudentDashboard.html"); return; }
    }
    await next();
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
    RequestPath = "/Views",
    OnPrepareResponse = context =>
    {
        if (string.Equals(Path.GetExtension(context.File.Name), ".html", StringComparison.OrdinalIgnoreCase))
        {
            context.Context.Response.Headers.CacheControl = "no-store, no-cache, max-age=0, must-revalidate";
            context.Context.Response.Headers.Pragma = "no-cache";
            context.Context.Response.Headers.Expires = "0";
        }
    }
});

app.UseRouting();
app.UseCors("AbecCors");
app.UseRateLimiter();
app.UseAuthorization();

app.MapControllers();
app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Home}/{action=Index}/{id?}");

app.MapGet("/", () => Results.Redirect("/Views/Home/LandingPage.html"));
app.MapGet("/api/health", (ApplicationReadiness readiness, ApplicationDbContext db, CancellationToken ct) => readiness.CheckAsync(db, ct));
app.MapGet("/api/health/live", () => Results.Json(new { ok = true, service = "ABEC System" }));
app.Use(async (context, next) =>
{
    if (context.Request.Path is var path && (path == "/confirm-slot" || path == "/reject-slot" || path == "/decline-slot"))
    {
        context.Response.Headers.CacheControl = "no-store";
        context.Response.Headers["Referrer-Policy"] = "no-referrer";
        context.Response.Headers["X-Robots-Tag"] = "noindex, nofollow";
    }
    await next();
});
app.MapGet("/confirm-slot", async (string? token, IApplicantService applicants, HttpContext context, IAntiforgery antiforgery, CancellationToken ct) =>
    Results.Content(await SlotPageAsync("confirm", token, applicants, context, antiforgery, ct), "text/html; charset=utf-8"));

app.MapPost("/confirm-slot", async (HttpRequest request, IApplicantService applicants, CancellationToken ct) =>
    Results.Content(await SlotPostAsync(true, request, applicants, ct), "text/html; charset=utf-8"));

app.MapGet("/decline-slot", async (string? token, IApplicantService applicants, HttpContext context, IAntiforgery antiforgery, CancellationToken ct) =>
    Results.Content(await SlotPageAsync("decline", token, applicants, context, antiforgery, ct), "text/html; charset=utf-8"));

app.MapPost("/decline-slot", async (HttpRequest request, IApplicantService applicants, CancellationToken ct) =>
    Results.Content(await SlotPostAsync(false, request, applicants, ct), "text/html; charset=utf-8"));

app.MapGet("/reject-slot", async (string? token, IApplicantService applicants, HttpContext context, IAntiforgery antiforgery, CancellationToken ct) =>
    Results.Content(await SlotPageAsync("decline", token, applicants, context, antiforgery, ct), "text/html; charset=utf-8"));
app.MapPost("/reject-slot", async (HttpRequest request, IApplicantService applicants, CancellationToken ct) =>
    Results.Content(await SlotPostAsync(false, request, applicants, ct), "text/html; charset=utf-8"));

app.Run();

static async Task<string> SlotPageAsync(string action, string? token, IApplicantService applicants, HttpContext context, IAntiforgery antiforgery, CancellationToken ct)
{
    try
    {
        var status = await applicants.DescribeSlotLinkAsync(token, ct);
        return SlotActionPage.Intent(action, token, status, antiforgery.GetAndStoreTokens(context));
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

        return SlotActionPage.Done(result.Data?.IsSlotConfirmed == true, result.Data?.FullName,
            result.Message.Contains("already", StringComparison.OrdinalIgnoreCase));
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
