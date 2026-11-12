using System.Text.RegularExpressions;
using ABEC_System.Constants;
using ABEC_System.Models;
using ABEC_System.Services;
using Microsoft.EntityFrameworkCore;

namespace ABEC_System.Data;

public static partial class DbSeeder
{
    private static readonly (string Name, string Description, string Duration)[] DefaultCourses =
    [
        ("Computer Systems Servicing NC II", "Install, configure, and maintain computer systems and networks.", CourseProgram.ComputerSystems.Label),
        ("Bookkeeping NC II", "Perform journalizing, posting, and preparation of financial reports.", CourseProgram.Bookkeeping.Label),
        ("Electronic Products Assembly and Servicing NC II", "Assemble and service electronic products and appliances.", CourseProgram.Electronics.Label),
        ("Customer Services NC II", "Deliver professional frontline and customer support services.", CourseProgram.CustomerService.Label)
    ];

    public static async Task SeedAsync(IServiceProvider services, CancellationToken cancellationToken = default)
    {
        await using var scope = services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        await db.Database.CanConnectAsync(cancellationToken);
        await EnsureCourseProgramSchemaAsync(db, cancellationToken);
        await EnsureAdminAuthSchemaAsync(db, cancellationToken);
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS student_login_credentials (
                student_id INT NOT NULL PRIMARY KEY,
                username VARCHAR(50) NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                password_login_enabled TINYINT(1) NOT NULL DEFAULT 0,
                UNIQUE KEY ux_student_login_username (username),
                CONSTRAINT fk_student_login_student FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
            """, cancellationToken);
        await EnsureApplicantConfirmationSchemaAsync(db, cancellationToken);
        await EnsureCourseScheduleSchemaAsync(db, cancellationToken);
        await EnsureDocumentRequestSchemaAsync(db, cancellationToken);
        await EnsureCourseReleaseSchemaAsync(db, cancellationToken);
        await EnsureArchiveSchemaAsync(db, cancellationToken);
        await EnsureApplicantRegistrationSchemaAsync(db, cancellationToken);
        await EnsureCourseSlotSchemaAsync(db, cancellationToken);
        await EnsureCourseHistorySchemaAsync(db, cancellationToken);
        await EnsureBatchIntegritySchemaAsync(db, cancellationToken);
        await SlotOfferDeadlineUpgrade.ApplyAsync(db, cancellationToken);
        await EnsureMissingStudentPinsAsync(db, cancellationToken);

        if (!await db.Courses.AnyAsync(cancellationToken))
        {
            foreach (var course in DefaultCourses)
            {
                db.Courses.Add(new Course
                {
                    CourseName = course.Name,
                    CourseDescription = course.Description,
                    Duration = course.Duration,
                    HoursPerDay = CourseProgram.Match(course.Name)?.HoursPerDay ?? CourseProgram.HoursPerDay,
                    TotalHours = CourseProgram.Match(course.Name)?.TotalHours ?? 0,
                    TrainingDays = CourseProgram.Match(course.Name)?.TrainingDays ?? 0,
                    OjtDays = CourseProgram.Match(course.Name)?.OjtDays ?? 0,
                    Status = SystemConstants.CourseStatuses.Available
                });
            }

            await db.SaveChangesAsync(cancellationToken);
        }

        // Admin accounts are managed outside self-registration (no public create-admin flow).

        if (!await db.Batches.AnyAsync(cancellationToken))
        {
            var year = DateTime.Now.Year;
            db.Batches.Add(new Batch
            {
                BatchName = $"Batch {year}-A",
                StartDate = new DateTime(year, 1, 1),
                EndDate = new DateTime(year, 12, 31),
                Status = SystemConstants.BatchStatuses.Active
            });
            await db.SaveChangesAsync(cancellationToken);
        }

        await ApplyOfficialCourseProgramsAsync(db, cancellationToken);
        await EnsureTrainingRoomsAsync(db, cancellationToken);
    }

    private static async Task EnsureMissingStudentPinsAsync(ApplicationDbContext db, CancellationToken ct)
    {
        // Startup must never replace issued credentials with a value derived from personal data.
        var students = await db.Students.Where(s => s.SecurityPin == null || s.SecurityPin == "").ToListAsync(ct);
        foreach (var student in students)
        {
            string pin;
            do { pin = SecurityPinGenerator.Generate(); }
            while (students.Any(s => s != student && s.SecurityPin == pin)
                || await db.Students.AnyAsync(s => s.SecurityPin == pin, ct));
            student.SecurityPin = pin;
        }
        if (students.Count > 0) await db.SaveChangesAsync(ct);
    }

    /// <summary>
    /// Keeps admin-related tables aligned with username/password auth plus profile fields.
    /// </summary>
    private static async Task EnsureAdminAuthSchemaAsync(ApplicationDbContext db, CancellationToken cancellationToken)
    {
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS admins (
              admin_id INT NOT NULL AUTO_INCREMENT,
              username VARCHAR(50) NOT NULL,
              password VARCHAR(255) NOT NULL,
              email VARCHAR(150) NULL,
              contact_number VARCHAR(30) NULL,
              created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (admin_id),
              UNIQUE KEY IX_admins_username (username)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            """, cancellationToken);

        await AddColumnIfMissingAsync(db, "admins", "email", "VARCHAR(150) NULL", cancellationToken);
        await AddColumnIfMissingAsync(db, "admins", "contact_number", "VARCHAR(30) NULL", cancellationToken);
        await DropColumnIfExistsAsync(db, "admins", "fullname", cancellationToken);
        await DropColumnIfExistsAsync(db, "admins", "security_pin", cancellationToken);
        await DropColumnIfExistsAsync(db, "admins", "pin", cancellationToken);

        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS usersettings (
              setting_id INT NOT NULL AUTO_INCREMENT,
              admin_id INT NOT NULL,
              username VARCHAR(50) NOT NULL,
              password VARCHAR(255) NOT NULL,
              email_notifications TINYINT(1) NOT NULL DEFAULT 1,
              in_app_alerts TINYINT(1) NOT NULL DEFAULT 1,
              system_alerts TINYINT(1) NOT NULL DEFAULT 1,
              student_updates TINYINT(1) NOT NULL DEFAULT 1,
              document_requests TINYINT(1) NOT NULL DEFAULT 1,
              PRIMARY KEY (setting_id),
              UNIQUE KEY IX_usersettings_admin_id (admin_id),
              CONSTRAINT FK_usersettings_admins FOREIGN KEY (admin_id) REFERENCES admins (admin_id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            """, cancellationToken);

        await DropColumnIfExistsAsync(db, "usersettings", "fullname", cancellationToken);

        await AddColumnIfMissingAsync(db, "usersettings", "email_notifications", "TINYINT(1) NOT NULL DEFAULT 1", cancellationToken);
        await AddColumnIfMissingAsync(db, "usersettings", "in_app_alerts", "TINYINT(1) NOT NULL DEFAULT 1", cancellationToken);
        await AddColumnIfMissingAsync(db, "usersettings", "system_alerts", "TINYINT(1) NOT NULL DEFAULT 1", cancellationToken);
        await AddColumnIfMissingAsync(db, "usersettings", "student_updates", "TINYINT(1) NOT NULL DEFAULT 1", cancellationToken);
        await AddColumnIfMissingAsync(db, "usersettings", "document_requests", "TINYINT(1) NOT NULL DEFAULT 1", cancellationToken);

        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS admin_activity_logs (
              activity_id INT NOT NULL AUTO_INCREMENT,
              admin_id INT NOT NULL,
              action VARCHAR(100) NOT NULL,
              device_info VARCHAR(255) NULL,
              ip_address VARCHAR(64) NULL,
              location VARCHAR(150) NULL,
              created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (activity_id),
              KEY IX_admin_activity_logs_admin_id (admin_id),
              CONSTRAINT FK_admin_activity_logs_admins FOREIGN KEY (admin_id) REFERENCES admins (admin_id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            """, cancellationToken);
    }

    /// <summary>
    /// Ensures applicants table has confirmation_token / confirmed_at used by Approve → email → Confirm Slot.
    /// </summary>
    private static async Task EnsureApplicantConfirmationSchemaAsync(ApplicationDbContext db, CancellationToken cancellationToken)
    {
        await AddColumnIfMissingAsync(db, "applicants", "confirmation_token", "VARCHAR(64) NULL", cancellationToken);
        await AddColumnIfMissingAsync(db, "applicants", "confirmed_at", "DATETIME NULL", cancellationToken);
        await AddColumnIfMissingAsync(db, "applicants", "declined_at", "DATETIME NULL", cancellationToken);
        await AddColumnIfMissingAsync(db, "applicants", "response_deadline", "DATETIME NULL", cancellationToken);
        await AddColumnIfMissingAsync(db, "applicants", "approval_email_sent_at", "DATETIME NULL", cancellationToken);
        await AddColumnIfMissingAsync(db, "applicants", "slot_response", "VARCHAR(30) NULL", cancellationToken);
        await AddColumnIfMissingAsync(db, "applicants", "assigned_training_datetime", "VARCHAR(150) NULL", cancellationToken);
        await AddColumnIfMissingAsync(db, "applicants", "age", "INT NOT NULL DEFAULT 0", cancellationToken);
        await AddColumnIfMissingAsync(db, "applicants", "batch_id", "INT NULL", cancellationToken);

        // Best-effort FK so applicants stay associated with a semester/batch.
        try
        {
            await using var command = db.Database.GetDbConnection().CreateCommand();
            if (command.Connection!.State != System.Data.ConnectionState.Open)
                await command.Connection.OpenAsync(cancellationToken);

            command.CommandText = """
                SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'applicants'
                  AND CONSTRAINT_NAME = 'FK_applicants_batches_batch_id'
                  AND CONSTRAINT_TYPE = 'FOREIGN KEY'
                """;
            var fkCount = Convert.ToInt32(await command.ExecuteScalarAsync(cancellationToken));
            if (fkCount == 0)
            {
                await db.Database.ExecuteSqlRawAsync("""
                    ALTER TABLE applicants
                    ADD CONSTRAINT FK_applicants_batches_batch_id
                    FOREIGN KEY (batch_id) REFERENCES batches (batch_id)
                    ON DELETE SET NULL
                    """, cancellationToken);
            }
        }
        catch
        {
            // FK may already exist under another name, or batches table may be unavailable.
        }

        // Stamp unassigned applicants onto the current active batch when one exists.
        try
        {
            await db.Database.ExecuteSqlRawAsync("""
                UPDATE applicants a
                JOIN batches b ON b.status = 'Active'
                SET a.batch_id = b.batch_id
                WHERE a.batch_id IS NULL
                """, cancellationToken);
        }
        catch
        {
            // Best-effort backfill only.
        }

        // Backfill age from birthdate for existing rows that still have 0.
        try
        {
            await db.Database.ExecuteSqlRawAsync("""
                UPDATE applicants
                SET age = TIMESTAMPDIFF(YEAR, birthdate, CURDATE())
                WHERE (age IS NULL OR age = 0) AND birthdate IS NOT NULL
                """, cancellationToken);
        }
        catch
        {
            // Best-effort age backfill.
        }

        // Ensure status column can store "Confirmed Slot", then migrate legacy values.
        try
        {
            await db.Database.ExecuteSqlRawAsync("""
                ALTER TABLE applicants
                MODIFY COLUMN application_status VARCHAR(30) NOT NULL
                """, cancellationToken);
        }
        catch
        {
            // Column may already be wide enough.
        }

        try
        {
            await db.Database.ExecuteSqlRawAsync("""
                UPDATE applicants
                SET application_status = 'Confirmed Slot'
                WHERE application_status = 'Confirmed'
                """, cancellationToken);
        }
        catch
        {
            // Best-effort migration for older rows.
        }

        // Unique index on confirmation_token (nullable unique is fine in MySQL).
        try
        {
            await using var command = db.Database.GetDbConnection().CreateCommand();
            if (command.Connection!.State != System.Data.ConnectionState.Open)
                await command.Connection.OpenAsync(cancellationToken);

            command.CommandText = """
                SELECT COUNT(*) FROM information_schema.STATISTICS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'applicants'
                  AND COLUMN_NAME = 'confirmation_token'
                  AND NON_UNIQUE = 0
                """;
            var count = Convert.ToInt32(await command.ExecuteScalarAsync(cancellationToken));
            if (count == 0)
            {
                await db.Database.ExecuteSqlRawAsync("""
                    CREATE UNIQUE INDEX IX_applicants_confirmation_token
                    ON applicants (confirmation_token)
                    """, cancellationToken);
            }
        }
        catch
        {
            // Index may already exist under a different name from EF model configuration.
        }
    }

    private static async Task EnsureDocumentRequestSchemaAsync(ApplicationDbContext db, CancellationToken cancellationToken)
    {
        await AddColumnIfMissingAsync(db, "documentrequests", "hold_reason", "VARCHAR(500) NULL", cancellationToken);
        await AddColumnIfMissingAsync(db, "documentrequests", "specific_reason", "VARCHAR(500) NULL", cancellationToken);
        await AddColumnIfMissingAsync(db, "documentrequests", "release_file_name", "VARCHAR(255) NULL", cancellationToken);
        await AddColumnIfMissingAsync(db, "documentrequests", "release_stored_path", "VARCHAR(500) NULL", cancellationToken);
        await AddColumnIfMissingAsync(db, "documentrequests", "release_content_type", "VARCHAR(100) NULL", cancellationToken);
        await AddColumnIfMissingAsync(db, "documentrequests", "release_size_bytes", "BIGINT NULL", cancellationToken);
        await AddColumnIfMissingAsync(db, "documentrequests", "release_uploaded_at", "DATETIME NULL", cancellationToken);
        try
        {
            await db.Database.ExecuteSqlRawAsync("""
                ALTER TABLE documentrequests
                MODIFY COLUMN request_status VARCHAR(40) NOT NULL
                """, cancellationToken);
        }
        catch
        {
            // Column width may already be sufficient.
        }

        try
        {
            await db.Database.ExecuteSqlRawAsync("""
                UPDATE documentrequests
                SET request_status = CASE
                    WHEN LOWER(TRIM(request_status)) IN ('approved', 'processing') THEN 'Processing'
                    WHEN LOWER(TRIM(request_status)) IN ('on hold', 'onhold', 'hold') THEN 'On Hold'
                    WHEN LOWER(TRIM(request_status)) IN ('rejected', 'reject') THEN 'Rejected'
                    WHEN LOWER(TRIM(request_status)) IN ('ready', 'ready for release', 'readyforrelease') THEN 'Ready for Release'
                    WHEN LOWER(TRIM(request_status)) IN ('archived', 'released') THEN 'Released'
                    WHEN LOWER(TRIM(request_status)) = 'pending' THEN 'Pending'
                    ELSE request_status
                END
                WHERE LOWER(TRIM(request_status)) IN (
                    'approved', 'processing', 'rejected', 'on hold', 'onhold', 'hold',
                    'ready', 'ready for release', 'readyforrelease', 'archived', 'released', 'pending'
                )
                """, cancellationToken);
        }
        catch
        {
            // Best-effort status migration.
        }

        // Align legacy ABEC requestable names to the three current document types.
        try
        {
            await db.Database.ExecuteSqlRawAsync("""
                UPDATE documentrequests
                SET document_type = CASE
                    WHEN LOWER(TRIM(document_type)) IN (
                        'national certificate ii', 'national certificate 2', 'nc ii', 'nc2', 'ncii'
                    ) OR LOWER(TRIM(document_type)) LIKE '%national certificate%'
                      OR LOWER(TRIM(document_type)) LIKE '%tesda%'
                        THEN 'National Certificate (TESDA)'
                    WHEN LOWER(TRIM(document_type)) LIKE '%payment%'
                      OR LOWER(TRIM(document_type)) LIKE '%receipt%'
                        THEN 'Payment Receipt'
                    WHEN LOWER(TRIM(document_type)) LIKE '%completion%'
                      OR LOWER(TRIM(document_type)) IN ('coa', 'certificate of graduation', 'official diploma')
                        THEN 'Certificate of Completion'
                    ELSE document_type
                END
                WHERE LOWER(TRIM(document_type)) IN (
                        'national certificate ii', 'national certificate 2', 'nc ii', 'nc2', 'ncii',
                        'coa', 'certificate of graduation', 'official diploma'
                    )
                   OR LOWER(TRIM(document_type)) LIKE '%national certificate%'
                   OR LOWER(TRIM(document_type)) LIKE '%tesda%'
                   OR LOWER(TRIM(document_type)) LIKE '%payment%'
                   OR LOWER(TRIM(document_type)) LIKE '%receipt%'
                   OR LOWER(TRIM(document_type)) LIKE '%completion%'
                """, cancellationToken);
        }
        catch
        {
            // Best-effort document type migration.
        }
    }

    private static async Task EnsureCourseSlotSchemaAsync(ApplicationDbContext db, CancellationToken cancellationToken)
    {
        await AddColumnIfMissingAsync(db, "courses", "slot_capacity", "INT NOT NULL DEFAULT 25", cancellationToken);
    }

    private static async Task EnsureCourseHistorySchemaAsync(ApplicationDbContext db, CancellationToken cancellationToken)
    {
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS course_management_history (
                history_id INT NOT NULL AUTO_INCREMENT,
                course_id INT NOT NULL,
                course_name VARCHAR(150) NOT NULL,
                action VARCHAR(120) NOT NULL,
                previous_value VARCHAR(500) NULL,
                new_value VARCHAR(500) NULL,
                admin_id INT NULL,
                modified_by VARCHAR(150) NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (history_id),
                KEY ix_course_history_created (created_at),
                KEY ix_course_history_course (course_id)
            )
            """, cancellationToken);
    }

    private static async Task EnsureArchiveSchemaAsync(ApplicationDbContext db, CancellationToken cancellationToken)
    {
        await AddColumnIfMissingAsync(db, "archives", "specific_reason", "VARCHAR(500) NULL", cancellationToken);
    }

    private static async Task EnsureCourseProgramSchemaAsync(ApplicationDbContext db, CancellationToken cancellationToken)
    {
        await AddColumnIfMissingAsync(db, "courses", "hours_per_day", "INT NOT NULL DEFAULT 8", cancellationToken);
        await AddColumnIfMissingAsync(db, "courses", "total_hours", "INT NOT NULL DEFAULT 0", cancellationToken);
        await AddColumnIfMissingAsync(db, "courses", "training_days", "INT NOT NULL DEFAULT 0", cancellationToken);
        await AddColumnIfMissingAsync(db, "courses", "ojt_days", "INT NOT NULL DEFAULT 0", cancellationToken);
        try
        {
            await db.Database.ExecuteSqlRawAsync("ALTER TABLE courses MODIFY COLUMN duration VARCHAR(80) NOT NULL", cancellationToken);
        }
        catch
        {
            // Column may already be wide enough.
        }

        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS student_activity_logs (
              activity_id INT NOT NULL AUTO_INCREMENT,
              student_id INT NOT NULL,
              action VARCHAR(100) NOT NULL,
              device_info VARCHAR(255) NULL,
              ip_address VARCHAR(64) NULL,
              created_at DATETIME NOT NULL,
              PRIMARY KEY (activity_id),
              KEY ix_student_activity_student (student_id, created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            """, cancellationToken);
    }

    private static async Task ApplyOfficialCourseProgramsAsync(ApplicationDbContext db, CancellationToken cancellationToken)
    {
        var courses = await db.Courses.ToListAsync(cancellationToken);
        foreach (var course in courses)
        {
            var program = CourseProgram.Match(course.CourseName);
            if (program is null) continue;
            course.HoursPerDay = program.HoursPerDay;
            course.TotalHours = program.TotalHours;
            course.TrainingDays = program.TrainingDays;
            course.OjtDays = program.OjtDays;
            course.Duration = program.Label;
        }

        await db.SaveChangesAsync(cancellationToken);
    }

    private static async Task EnsureCourseReleaseSchemaAsync(ApplicationDbContext db, CancellationToken cancellationToken)
    {
        await AddColumnIfMissingAsync(db, "batches", "assessment_date", "DATETIME NULL", cancellationToken);
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS student_course_documents (
              course_document_id INT NOT NULL AUTO_INCREMENT,
              student_id INT NOT NULL,
              course_id INT NOT NULL,
              batch_id INT NULL,
              document_type VARCHAR(80) NOT NULL,
              preparation_status VARCHAR(40) NOT NULL,
              file_name VARCHAR(255) NULL,
              stored_path VARCHAR(500) NULL,
              content_type VARCHAR(100) NULL,
              size_bytes BIGINT NULL,
              uploaded_at DATETIME NULL,
              released_at DATETIME NULL,
              released_by_user_id INT NULL,
              PRIMARY KEY (course_document_id),
              UNIQUE KEY uq_student_course_document (student_id, document_type)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            """, cancellationToken);
    }

    private static async Task EnsureTrainingRoomsAsync(ApplicationDbContext db, CancellationToken cancellationToken)
    {
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS trainingrooms (
              room_id INT NOT NULL AUTO_INCREMENT,
              room_name VARCHAR(100) NOT NULL,
              description VARCHAR(255) NULL,
              course_id INT NULL,
              PRIMARY KEY (room_id),
              UNIQUE KEY uq_trainingrooms_name (room_name)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            """, cancellationToken);
        await AddColumnIfMissingAsync(db, "courseschedules", "room_id", "INT NULL", cancellationToken);

        var courses = await db.Courses.AsNoTracking().ToListAsync(cancellationToken);
        var rooms = await db.TrainingRooms.ToListAsync(cancellationToken);
        foreach (var course in courses)
        {
            foreach (var roomName in RoomsForCourse(course.CourseName))
            {
                if (rooms.Any(room => SameRoom(room.RoomName, roomName))) continue;
                var created = new TrainingRoom
                {
                    RoomName = roomName,
                    CourseId = course.CourseId
                };
                db.TrainingRooms.Add(created);
                rooms.Add(created);
            }
        }

        var schedules = await db.CourseSchedules.ToListAsync(cancellationToken);
        foreach (var schedule in schedules)
        {
            var name = (schedule.Room ?? string.Empty).Trim();
            if (name.Length == 0) continue;
            var room = rooms.FirstOrDefault(item => SameRoom(item.RoomName, name));
            if (room is null)
            {
                room = new TrainingRoom
                {
                    RoomName = name,
                    CourseId = schedule.CourseId
                };
                db.TrainingRooms.Add(room);
                rooms.Add(room);
            }
        }

        await db.SaveChangesAsync(cancellationToken);

        foreach (var schedule in schedules)
        {
            var name = (schedule.Room ?? string.Empty).Trim();
            if (name.Length == 0) continue;
            var room = rooms.FirstOrDefault(item => SameRoom(item.RoomName, name));
            if (room is null || room.RoomId == 0) continue;
            if (schedule.RoomId != room.RoomId || !string.Equals(schedule.Room, room.RoomName, StringComparison.Ordinal))
            {
                schedule.RoomId = room.RoomId;
                schedule.Room = room.RoomName;
            }
        }

        await db.SaveChangesAsync(cancellationToken);
    }

    private static bool SameRoom(string left, string right)
        => string.Equals((left ?? string.Empty).Trim(), (right ?? string.Empty).Trim(), StringComparison.OrdinalIgnoreCase);

    private static string CourseKey(string name)
    {
        var key = (name ?? string.Empty).ToLowerInvariant();
        key = Regex.Replace(key, @"\bnc\s*ii\b", "");
        return Regex.Replace(key, "[^a-z]", "");
    }

    private static IReadOnlyList<string> RoomsForCourse(string courseName)
    {
        var key = CourseKey(courseName);
        if (key.Contains("electronic", StringComparison.Ordinal)) return ["Room 303", "Room 304"];
        if (key.Contains("bookkeep", StringComparison.Ordinal)) return ["Room 305", "Room 307"];
        if (key.Contains("customer", StringComparison.Ordinal)) return ["Room 302"];
        if (key.Contains("computer", StringComparison.Ordinal) && key.Contains("servic", StringComparison.Ordinal))
            return ["Room 301", "Computer Laboratory"];
        return [];
    }

    private static async Task EnsureCourseScheduleSchemaAsync(ApplicationDbContext db, CancellationToken cancellationToken)
    {
        await AddColumnIfMissingAsync(db, "courseschedules", "trainer", "VARCHAR(50) NULL", cancellationToken);
        await AddColumnIfMissingAsync(db, "courseschedules", "training_days", "VARCHAR(40) NULL", cancellationToken);
        await AddColumnIfMissingAsync(db, "courseschedules", "status", "VARCHAR(20) NOT NULL DEFAULT 'Inactive'", cancellationToken);
        await AddColumnIfMissingAsync(db, "courseschedules", "trainer_assignments", "TEXT NULL", cancellationToken);
        try
        {
            await db.Database.ExecuteSqlRawAsync("""
                UPDATE courseschedules
                SET trainer = ''
                WHERE trainer IS NULL
                """, cancellationToken);
        }
        catch
        {
            // Best-effort backfill.
        }
        try
        {
            await db.Database.ExecuteSqlRawAsync("""
                UPDATE courseschedules
                SET status = 'Inactive'
                WHERE status IS NULL OR TRIM(status) = ''
                """, cancellationToken);
        }
        catch
        {
            // Best-effort backfill.
        }
    }

    private static async Task AddColumnIfMissingAsync(
        ApplicationDbContext db,
        string table,
        string column,
        string definition,
        CancellationToken cancellationToken)
    {
        var sql = SchemaUpgradeSql.AddColumn(table, column, definition);
        if (await ColumnExistsAsync(db, table, column, cancellationToken)) return;
        // The statement is an immutable, complete SQL literal from the approved catalog.
        await db.Database.ExecuteSqlRawAsync(sql, cancellationToken);
    }

    private static async Task EnsureApplicantRegistrationSchemaAsync(ApplicationDbContext db, CancellationToken cancellationToken)
    {
        await AddColumnIfMissingAsync(db, "applicants", "tesda_screening_status", "VARCHAR(40) NULL", cancellationToken);
        await AddColumnIfMissingAsync(db, "applicants", "tesda_screening_summary", "TEXT NULL", cancellationToken);
        await AddColumnIfMissingAsync(db, "applicants", "tesda_previously_enrolled", "TINYINT(1) NULL", cancellationToken);
        await AddColumnIfMissingAsync(db, "applicants", "tesda_previous_course", "VARCHAR(150) NULL", cancellationToken);
        await AddColumnIfMissingAsync(db, "applicants", "tesda_previous_institution", "VARCHAR(150) NULL", cancellationToken);
        await AddColumnIfMissingAsync(db, "applicants", "tesda_previous_status", "VARCHAR(30) NULL", cancellationToken);
        await AddColumnIfMissingAsync(db, "applicants", "tesda_previous_year", "INT NULL", cancellationToken);
        await AddColumnIfMissingAsync(db, "applicants", "tesda_currently_enrolled", "TINYINT(1) NULL", cancellationToken);
        await AddColumnIfMissingAsync(db, "applicants", "tesda_completed_qualification", "TINYINT(1) NULL", cancellationToken);
        await AddColumnIfMissingAsync(db, "applicants", "tesda_completed_qualification_name", "VARCHAR(150) NULL", cancellationToken);
        await AddColumnIfMissingAsync(db, "applicants", "identity_id_type", "VARCHAR(50) NULL", cancellationToken);
        await AddColumnIfMissingAsync(db, "applicants", "identity_id_number", "VARCHAR(80) NULL", cancellationToken);
        await AddColumnIfMissingAsync(db, "applicants", "school_name", "VARCHAR(255) NULL", cancellationToken);
        await AddColumnIfMissingAsync(db, "applicants", "school_address", "VARCHAR(255) NULL", cancellationToken);
        await AddColumnIfMissingAsync(db, "applicants", "qualification_type", "VARCHAR(40) NULL", cancellationToken);
        await AddColumnIfMissingAsync(db, "applicants", "coc_specification", "VARCHAR(200) NULL", cancellationToken);
        await AddColumnIfMissingAsync(db, "applicants", "applicant_classification", "VARCHAR(160) NULL", cancellationToken);
        await AddColumnIfMissingAsync(db, "applicants", "civil_status", "VARCHAR(30) NULL", cancellationToken);
        await AddColumnIfMissingAsync(db, "applicants", "birth_place", "VARCHAR(150) NULL", cancellationToken);
        await AddColumnIfMissingAsync(db, "applicants", "telephone", "VARCHAR(40) NULL", cancellationToken);
        await AddColumnIfMissingAsync(db, "applicants", "fax", "VARCHAR(40) NULL", cancellationToken);
        await AddColumnIfMissingAsync(db, "applicants", "other_contact", "VARCHAR(150) NULL", cancellationToken);
        await AddColumnIfMissingAsync(db, "applicants", "education_level", "VARCHAR(40) NULL", cancellationToken);
        await AddColumnIfMissingAsync(db, "applicants", "education_specification", "VARCHAR(150) NULL", cancellationToken);
        await AddColumnIfMissingAsync(db, "applicants", "employment_status", "VARCHAR(80) NULL", cancellationToken);
        await AddColumnIfMissingAsync(db, "applicants", "address_district", "VARCHAR(100) NULL", cancellationToken);
        await AddColumnIfMissingAsync(db, "applicants", "address_region", "VARCHAR(120) NULL", cancellationToken);
        await AddColumnIfMissingAsync(db, "applicants", "address_region_code", "VARCHAR(12) NULL", cancellationToken);
        await AddColumnIfMissingAsync(db, "applicants", "zip_code", "VARCHAR(10) NULL", cancellationToken);
        await AddColumnIfMissingAsync(db, "applicants", "application_reference", "VARCHAR(40) NULL", cancellationToken);
        await AddColumnIfMissingAsync(db, "applicants", "email_notification_status", "VARCHAR(40) NULL", cancellationToken);

        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS applicant_registration_documents (
              document_id INT NOT NULL AUTO_INCREMENT,
              applicant_id INT NOT NULL,
              category VARCHAR(20) NOT NULL,
              document_label VARCHAR(80) NULL,
              original_file_name VARCHAR(255) NOT NULL,
              stored_relative_path VARCHAR(500) NOT NULL,
              content_type VARCHAR(100) NOT NULL,
              size_bytes BIGINT NOT NULL,
              uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (document_id),
              KEY IX_applicant_registration_documents_applicant_id (applicant_id),
              CONSTRAINT FK_applicant_registration_documents_applicants
                FOREIGN KEY (applicant_id) REFERENCES applicants (applicant_id)
                ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            """, cancellationToken);
    }

    private static async Task DropColumnIfExistsAsync(
        ApplicationDbContext db,
        string table,
        string column,
        CancellationToken cancellationToken)
    {
        var sql = SchemaUpgradeSql.DropColumn(table, column);
        if (!await ColumnExistsAsync(db, table, column, cancellationToken)) return;

        await db.Database.ExecuteSqlRawAsync(sql, cancellationToken);
    }

    private static async Task<bool> ColumnExistsAsync(
        ApplicationDbContext db,
        string table,
        string column,
        CancellationToken cancellationToken)
    {
        await using var command = db.Database.GetDbConnection().CreateCommand();
        if (command.Connection!.State != System.Data.ConnectionState.Open)
            await command.Connection.OpenAsync(cancellationToken);

        command.CommandText = """
            SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = @table
              AND COLUMN_NAME = @column
            """;
        var tableParam = command.CreateParameter();
        tableParam.ParameterName = "@table";
        tableParam.Value = table;
        command.Parameters.Add(tableParam);

        var columnParam = command.CreateParameter();
        columnParam.ParameterName = "@column";
        columnParam.Value = column;
        command.Parameters.Add(columnParam);

        var count = Convert.ToInt32(await command.ExecuteScalarAsync(cancellationToken));
        return count > 0;
    }
}
