using System.Collections.Frozen;

namespace ABEC_System.Data;

// Exact code-owned operations only: never construct DDL from caller-supplied SQL fragments.
public static class SchemaUpgradeSql
{
    private static readonly FrozenDictionary<(string Table, string Column, string Definition), string> Additions =
        new Dictionary<(string, string, string), string>
        {
            [("applicant_registration_documents", "is_follow_up", "TINYINT(1) NOT NULL DEFAULT 0")] = "ALTER TABLE `applicant_registration_documents` ADD COLUMN `is_follow_up` TINYINT(1) NOT NULL DEFAULT 0",
            [("notifications", "request_id", "INT NULL")] = "ALTER TABLE `notifications` ADD COLUMN `request_id` INT NULL",
            [("admins", "contact_number", "VARCHAR(30) NULL")] = "ALTER TABLE `admins` ADD COLUMN `contact_number` VARCHAR(30) NULL",
            [("admins", "email", "VARCHAR(150) NULL")] = "ALTER TABLE `admins` ADD COLUMN `email` VARCHAR(150) NULL",
            [("applicants", "address_district", "VARCHAR(100) NULL")] = "ALTER TABLE `applicants` ADD COLUMN `address_district` VARCHAR(100) NULL",
            [("applicants", "address_region", "VARCHAR(120) NULL")] = "ALTER TABLE `applicants` ADD COLUMN `address_region` VARCHAR(120) NULL",
            [("applicants", "address_region_code", "VARCHAR(12) NULL")] = "ALTER TABLE `applicants` ADD COLUMN `address_region_code` VARCHAR(12) NULL",
            [("applicants", "age", "INT NOT NULL DEFAULT 0")] = "ALTER TABLE `applicants` ADD COLUMN `age` INT NOT NULL DEFAULT 0",
            [("applicants", "applicant_classification", "VARCHAR(160) NULL")] = "ALTER TABLE `applicants` ADD COLUMN `applicant_classification` VARCHAR(160) NULL",
            [("applicants", "application_reference", "VARCHAR(40) NULL")] = "ALTER TABLE `applicants` ADD COLUMN `application_reference` VARCHAR(40) NULL",
            [("applicants", "approval_email_sent_at", "DATETIME NULL")] = "ALTER TABLE `applicants` ADD COLUMN `approval_email_sent_at` DATETIME NULL",
            [("applicants", "assigned_training_datetime", "VARCHAR(150) NULL")] = "ALTER TABLE `applicants` ADD COLUMN `assigned_training_datetime` VARCHAR(150) NULL",
            [("applicants", "batch_id", "INT NULL")] = "ALTER TABLE `applicants` ADD COLUMN `batch_id` INT NULL",
            [("applicants", "birth_place", "VARCHAR(150) NULL")] = "ALTER TABLE `applicants` ADD COLUMN `birth_place` VARCHAR(150) NULL",
            [("applicants", "civil_status", "VARCHAR(30) NULL")] = "ALTER TABLE `applicants` ADD COLUMN `civil_status` VARCHAR(30) NULL",
            [("applicants", "coc_specification", "VARCHAR(200) NULL")] = "ALTER TABLE `applicants` ADD COLUMN `coc_specification` VARCHAR(200) NULL",
            [("applicants", "confirmation_token", "VARCHAR(64) NULL")] = "ALTER TABLE `applicants` ADD COLUMN `confirmation_token` VARCHAR(64) NULL",
            [("applicants", "confirmed_at", "DATETIME NULL")] = "ALTER TABLE `applicants` ADD COLUMN `confirmed_at` DATETIME NULL",
            [("applicants", "declined_at", "DATETIME NULL")] = "ALTER TABLE `applicants` ADD COLUMN `declined_at` DATETIME NULL",
            [("applicants", "education_level", "VARCHAR(40) NULL")] = "ALTER TABLE `applicants` ADD COLUMN `education_level` VARCHAR(40) NULL",
            [("applicants", "education_specification", "VARCHAR(150) NULL")] = "ALTER TABLE `applicants` ADD COLUMN `education_specification` VARCHAR(150) NULL",
            [("applicants", "email_notification_status", "VARCHAR(40) NULL")] = "ALTER TABLE `applicants` ADD COLUMN `email_notification_status` VARCHAR(40) NULL",
            [("applicants", "employment_status", "VARCHAR(80) NULL")] = "ALTER TABLE `applicants` ADD COLUMN `employment_status` VARCHAR(80) NULL",
            [("applicants", "fax", "VARCHAR(40) NULL")] = "ALTER TABLE `applicants` ADD COLUMN `fax` VARCHAR(40) NULL",
            [("applicants", "identity_id_number", "VARCHAR(80) NULL")] = "ALTER TABLE `applicants` ADD COLUMN `identity_id_number` VARCHAR(80) NULL",
            [("applicants", "identity_id_type", "VARCHAR(50) NULL")] = "ALTER TABLE `applicants` ADD COLUMN `identity_id_type` VARCHAR(50) NULL",
            [("applicants", "other_contact", "VARCHAR(150) NULL")] = "ALTER TABLE `applicants` ADD COLUMN `other_contact` VARCHAR(150) NULL",
            [("applicants", "qualification_type", "VARCHAR(40) NULL")] = "ALTER TABLE `applicants` ADD COLUMN `qualification_type` VARCHAR(40) NULL",
            [("applicants", "response_deadline", "DATETIME NULL")] = "ALTER TABLE `applicants` ADD COLUMN `response_deadline` DATETIME NULL",
            [("applicants", "school_address", "VARCHAR(255) NULL")] = "ALTER TABLE `applicants` ADD COLUMN `school_address` VARCHAR(255) NULL",
            [("applicants", "school_name", "VARCHAR(255) NULL")] = "ALTER TABLE `applicants` ADD COLUMN `school_name` VARCHAR(255) NULL",
            [("applicants", "slot_response", "VARCHAR(30) NULL")] = "ALTER TABLE `applicants` ADD COLUMN `slot_response` VARCHAR(30) NULL",
            [("applicants", "telephone", "VARCHAR(40) NULL")] = "ALTER TABLE `applicants` ADD COLUMN `telephone` VARCHAR(40) NULL",
            [("applicants", "tesda_completed_qualification", "TINYINT(1) NULL")] = "ALTER TABLE `applicants` ADD COLUMN `tesda_completed_qualification` TINYINT(1) NULL",
            [("applicants", "tesda_completed_qualification_name", "VARCHAR(150) NULL")] = "ALTER TABLE `applicants` ADD COLUMN `tesda_completed_qualification_name` VARCHAR(150) NULL",
            [("applicants", "tesda_currently_enrolled", "TINYINT(1) NULL")] = "ALTER TABLE `applicants` ADD COLUMN `tesda_currently_enrolled` TINYINT(1) NULL",
            [("applicants", "tesda_previous_course", "VARCHAR(150) NULL")] = "ALTER TABLE `applicants` ADD COLUMN `tesda_previous_course` VARCHAR(150) NULL",
            [("applicants", "tesda_previous_institution", "VARCHAR(150) NULL")] = "ALTER TABLE `applicants` ADD COLUMN `tesda_previous_institution` VARCHAR(150) NULL",
            [("applicants", "tesda_previous_status", "VARCHAR(30) NULL")] = "ALTER TABLE `applicants` ADD COLUMN `tesda_previous_status` VARCHAR(30) NULL",
            [("applicants", "tesda_previous_year", "INT NULL")] = "ALTER TABLE `applicants` ADD COLUMN `tesda_previous_year` INT NULL",
            [("applicants", "tesda_previously_enrolled", "TINYINT(1) NULL")] = "ALTER TABLE `applicants` ADD COLUMN `tesda_previously_enrolled` TINYINT(1) NULL",
            [("applicants", "tesda_screening_status", "VARCHAR(40) NULL")] = "ALTER TABLE `applicants` ADD COLUMN `tesda_screening_status` VARCHAR(40) NULL",
            [("applicants", "tesda_screening_summary", "TEXT NULL")] = "ALTER TABLE `applicants` ADD COLUMN `tesda_screening_summary` TEXT NULL",
            [("applicants", "zip_code", "VARCHAR(10) NULL")] = "ALTER TABLE `applicants` ADD COLUMN `zip_code` VARCHAR(10) NULL",
            [("archives", "specific_reason", "VARCHAR(500) NULL")] = "ALTER TABLE `archives` ADD COLUMN `specific_reason` VARCHAR(500) NULL",
            [("batches", "assessment_date", "DATETIME NULL")] = "ALTER TABLE `batches` ADD COLUMN `assessment_date` DATETIME NULL",
            [("courses", "hours_per_day", "INT NOT NULL DEFAULT 8")] = "ALTER TABLE `courses` ADD COLUMN `hours_per_day` INT NOT NULL DEFAULT 8",
            [("courses", "ojt_days", "INT NOT NULL DEFAULT 0")] = "ALTER TABLE `courses` ADD COLUMN `ojt_days` INT NOT NULL DEFAULT 0",
            [("courses", "slot_capacity", "INT NOT NULL DEFAULT 25")] = "ALTER TABLE `courses` ADD COLUMN `slot_capacity` INT NOT NULL DEFAULT 25",
            [("courses", "total_hours", "INT NOT NULL DEFAULT 0")] = "ALTER TABLE `courses` ADD COLUMN `total_hours` INT NOT NULL DEFAULT 0",
            [("courses", "training_days", "INT NOT NULL DEFAULT 0")] = "ALTER TABLE `courses` ADD COLUMN `training_days` INT NOT NULL DEFAULT 0",
            [("courseschedules", "room_id", "INT NULL")] = "ALTER TABLE `courseschedules` ADD COLUMN `room_id` INT NULL",
            [("courseschedules", "status", "VARCHAR(20) NOT NULL DEFAULT 'Inactive'")] = "ALTER TABLE `courseschedules` ADD COLUMN `status` VARCHAR(20) NOT NULL DEFAULT 'Inactive'",
            [("courseschedules", "trainer", "VARCHAR(50) NULL")] = "ALTER TABLE `courseschedules` ADD COLUMN `trainer` VARCHAR(50) NULL",
            [("courseschedules", "trainer_assignments", "TEXT NULL")] = "ALTER TABLE `courseschedules` ADD COLUMN `trainer_assignments` TEXT NULL",
            [("courseschedules", "training_days", "VARCHAR(40) NULL")] = "ALTER TABLE `courseschedules` ADD COLUMN `training_days` VARCHAR(40) NULL",
            [("documentrequests", "hold_reason", "VARCHAR(500) NULL")] = "ALTER TABLE `documentrequests` ADD COLUMN `hold_reason` VARCHAR(500) NULL",
            [("documentrequests", "release_content_type", "VARCHAR(100) NULL")] = "ALTER TABLE `documentrequests` ADD COLUMN `release_content_type` VARCHAR(100) NULL",
            [("documentrequests", "release_file_name", "VARCHAR(255) NULL")] = "ALTER TABLE `documentrequests` ADD COLUMN `release_file_name` VARCHAR(255) NULL",
            [("documentrequests", "release_size_bytes", "BIGINT NULL")] = "ALTER TABLE `documentrequests` ADD COLUMN `release_size_bytes` BIGINT NULL",
            [("documentrequests", "release_stored_path", "VARCHAR(500) NULL")] = "ALTER TABLE `documentrequests` ADD COLUMN `release_stored_path` VARCHAR(500) NULL",
            [("documentrequests", "release_uploaded_at", "DATETIME NULL")] = "ALTER TABLE `documentrequests` ADD COLUMN `release_uploaded_at` DATETIME NULL",
            [("documentrequests", "specific_reason", "VARCHAR(500) NULL")] = "ALTER TABLE `documentrequests` ADD COLUMN `specific_reason` VARCHAR(500) NULL",
            [("usersettings", "document_requests", "TINYINT(1) NOT NULL DEFAULT 1")] = "ALTER TABLE `usersettings` ADD COLUMN `document_requests` TINYINT(1) NOT NULL DEFAULT 1",
            [("usersettings", "email_notifications", "TINYINT(1) NOT NULL DEFAULT 1")] = "ALTER TABLE `usersettings` ADD COLUMN `email_notifications` TINYINT(1) NOT NULL DEFAULT 1",
            [("usersettings", "in_app_alerts", "TINYINT(1) NOT NULL DEFAULT 1")] = "ALTER TABLE `usersettings` ADD COLUMN `in_app_alerts` TINYINT(1) NOT NULL DEFAULT 1",
            [("usersettings", "student_updates", "TINYINT(1) NOT NULL DEFAULT 1")] = "ALTER TABLE `usersettings` ADD COLUMN `student_updates` TINYINT(1) NOT NULL DEFAULT 1",
            [("usersettings", "system_alerts", "TINYINT(1) NOT NULL DEFAULT 1")] = "ALTER TABLE `usersettings` ADD COLUMN `system_alerts` TINYINT(1) NOT NULL DEFAULT 1",
        }.ToFrozenDictionary();

    private static readonly FrozenDictionary<(string Table, string Column), string> Removals =
        new Dictionary<(string, string), string>
        {
            [("admins", "fullname")] = "ALTER TABLE `admins` DROP COLUMN `fullname`",
            [("admins", "pin")] = "ALTER TABLE `admins` DROP COLUMN `pin`",
            [("admins", "security_pin")] = "ALTER TABLE `admins` DROP COLUMN `security_pin`",
            [("usersettings", "fullname")] = "ALTER TABLE `usersettings` DROP COLUMN `fullname`",
        }.ToFrozenDictionary();

    public static string AddColumn(string table, string column, string definition) =>
        Additions.TryGetValue((table, column, definition), out var statement) ? statement
            : throw new ArgumentException("This exact schema addition is not approved in the application catalog.");

    public static string DropColumn(string table, string column) =>
        Removals.TryGetValue((table, column), out var statement) ? statement
            : throw new ArgumentException("This exact schema removal is not approved in the application catalog.");

    public static void Validate(string table, string column, string? definition = null)
    {
        _ = definition is null ? DropColumn(table, column) : AddColumn(table, column, definition);
    }
}
