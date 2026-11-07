CREATE TABLE IF NOT EXISTS `__EFMigrationsHistory` (
    `MigrationId` varchar(150) CHARACTER SET utf8mb4 NOT NULL,
    `ProductVersion` varchar(32) CHARACTER SET utf8mb4 NOT NULL,
    CONSTRAINT `PK___EFMigrationsHistory` PRIMARY KEY (`MigrationId`)
) CHARACTER SET=utf8mb4;

START TRANSACTION;

ALTER DATABASE CHARACTER SET utf8mb4;

CREATE TABLE `admins` (
    `admin_id` int NOT NULL AUTO_INCREMENT,
    `username` varchar(50) CHARACTER SET utf8mb4 NOT NULL,
    `password` varchar(255) CHARACTER SET utf8mb4 NOT NULL,
    `email` varchar(150) CHARACTER SET utf8mb4 NULL,
    `contact_number` varchar(30) CHARACTER SET utf8mb4 NULL,
    `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT `PK_admins` PRIMARY KEY (`admin_id`)
) CHARACTER SET=utf8mb4;

CREATE TABLE `batches` (
    `batch_id` int NOT NULL AUTO_INCREMENT,
    `batch_name` varchar(100) CHARACTER SET utf8mb4 NOT NULL,
    `start_date` datetime(6) NOT NULL,
    `end_date` datetime(6) NOT NULL,
    `assessment_date` datetime(6) NULL,
    `status` varchar(20) CHARACTER SET utf8mb4 NOT NULL,
    CONSTRAINT `PK_batches` PRIMARY KEY (`batch_id`)
) CHARACTER SET=utf8mb4;

CREATE TABLE `course_management_history` (
    `history_id` int NOT NULL AUTO_INCREMENT,
    `course_id` int NOT NULL,
    `course_name` varchar(150) CHARACTER SET utf8mb4 NOT NULL,
    `action` varchar(120) CHARACTER SET utf8mb4 NOT NULL,
    `previous_value` varchar(500) CHARACTER SET utf8mb4 NULL,
    `new_value` varchar(500) CHARACTER SET utf8mb4 NULL,
    `admin_id` int NULL,
    `modified_by` varchar(150) CHARACTER SET utf8mb4 NULL,
    `created_at` datetime(6) NOT NULL,
    CONSTRAINT `PK_course_management_history` PRIMARY KEY (`history_id`)
) CHARACTER SET=utf8mb4;

CREATE TABLE `courses` (
    `course_id` int NOT NULL AUTO_INCREMENT,
    `course_name` varchar(150) CHARACTER SET utf8mb4 NOT NULL,
    `course_description` longtext CHARACTER SET utf8mb4 NULL,
    `duration` varchar(80) CHARACTER SET utf8mb4 NOT NULL,
    `hours_per_day` int NOT NULL,
    `total_hours` int NOT NULL,
    `training_days` int NOT NULL,
    `ojt_days` int NOT NULL,
    `status` varchar(20) CHARACTER SET utf8mb4 NOT NULL,
    `slot_capacity` int NOT NULL,
    CONSTRAINT `PK_courses` PRIMARY KEY (`course_id`)
) CHARACTER SET=utf8mb4;

CREATE TABLE `admin_activity_logs` (
    `activity_id` int NOT NULL AUTO_INCREMENT,
    `admin_id` int NOT NULL,
    `action` varchar(100) CHARACTER SET utf8mb4 NOT NULL,
    `device_info` varchar(255) CHARACTER SET utf8mb4 NULL,
    `ip_address` varchar(64) CHARACTER SET utf8mb4 NULL,
    `location` varchar(150) CHARACTER SET utf8mb4 NULL,
    `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT `PK_admin_activity_logs` PRIMARY KEY (`activity_id`),
    CONSTRAINT `FK_admin_activity_logs_admins_admin_id` FOREIGN KEY (`admin_id`) REFERENCES `admins` (`admin_id`) ON DELETE CASCADE
) CHARACTER SET=utf8mb4;

CREATE TABLE `usersettings` (
    `setting_id` int NOT NULL AUTO_INCREMENT,
    `admin_id` int NOT NULL,
    `username` varchar(50) CHARACTER SET utf8mb4 NOT NULL,
    `password` varchar(255) CHARACTER SET utf8mb4 NOT NULL,
    `email_notifications` tinyint(1) NOT NULL,
    `in_app_alerts` tinyint(1) NOT NULL,
    `system_alerts` tinyint(1) NOT NULL,
    `student_updates` tinyint(1) NOT NULL,
    `document_requests` tinyint(1) NOT NULL,
    CONSTRAINT `PK_usersettings` PRIMARY KEY (`setting_id`),
    CONSTRAINT `FK_usersettings_admins_admin_id` FOREIGN KEY (`admin_id`) REFERENCES `admins` (`admin_id`) ON DELETE CASCADE
) CHARACTER SET=utf8mb4;

CREATE TABLE `batchhistory` (
    `history_id` int NOT NULL AUTO_INCREMENT,
    `batch_id` int NOT NULL,
    `action` varchar(100) CHARACTER SET utf8mb4 NOT NULL,
    `action_date` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT `PK_batchhistory` PRIMARY KEY (`history_id`),
    CONSTRAINT `FK_batchhistory_batches_batch_id` FOREIGN KEY (`batch_id`) REFERENCES `batches` (`batch_id`) ON DELETE CASCADE
) CHARACTER SET=utf8mb4;

CREATE TABLE `applicants` (
    `applicant_id` int NOT NULL AUTO_INCREMENT,
    `first_name` varchar(50) CHARACTER SET utf8mb4 NOT NULL,
    `middle_name` varchar(50) CHARACTER SET utf8mb4 NULL,
    `last_name` varchar(50) CHARACTER SET utf8mb4 NOT NULL,
    `suffix` varchar(20) CHARACTER SET utf8mb4 NULL,
    `gender` varchar(20) CHARACTER SET utf8mb4 NOT NULL,
    `birthdate` datetime(6) NOT NULL,
    `age` int NOT NULL,
    `contact_number` varchar(20) CHARACTER SET utf8mb4 NOT NULL,
    `email` varchar(100) CHARACTER SET utf8mb4 NOT NULL,
    `address` longtext CHARACTER SET utf8mb4 NOT NULL,
    `province` varchar(100) CHARACTER SET utf8mb4 NULL,
    `city_municipality` varchar(100) CHARACTER SET utf8mb4 NULL,
    `barangay` varchar(150) CHARACTER SET utf8mb4 NULL,
    `street_details` varchar(255) CHARACTER SET utf8mb4 NULL,
    `course_id` int NOT NULL,
    `batch_id` int NULL,
    `application_status` varchar(30) CHARACTER SET utf8mb4 NOT NULL,
    `application_date` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `confirmation_token` varchar(64) CHARACTER SET utf8mb4 NULL,
    `confirmed_at` datetime(6) NULL,
    `declined_at` datetime(6) NULL,
    `response_deadline` datetime(6) NULL,
    `approval_email_sent_at` datetime(6) NULL,
    `slot_response` varchar(30) CHARACTER SET utf8mb4 NULL,
    `assigned_training_datetime` varchar(150) CHARACTER SET utf8mb4 NULL,
    `tesda_screening_status` varchar(40) CHARACTER SET utf8mb4 NULL,
    `tesda_screening_summary` longtext CHARACTER SET utf8mb4 NULL,
    `tesda_previously_enrolled` tinyint(1) NULL,
    `tesda_previous_course` varchar(150) CHARACTER SET utf8mb4 NULL,
    `tesda_previous_institution` varchar(150) CHARACTER SET utf8mb4 NULL,
    `tesda_previous_status` varchar(30) CHARACTER SET utf8mb4 NULL,
    `tesda_previous_year` int NULL,
    `tesda_currently_enrolled` tinyint(1) NULL,
    `tesda_completed_qualification` tinyint(1) NULL,
    `tesda_completed_qualification_name` varchar(150) CHARACTER SET utf8mb4 NULL,
    `identity_id_type` varchar(50) CHARACTER SET utf8mb4 NULL,
    `identity_id_number` varchar(80) CHARACTER SET utf8mb4 NULL,
    `school_name` varchar(255) CHARACTER SET utf8mb4 NULL,
    `school_address` varchar(255) CHARACTER SET utf8mb4 NULL,
    `qualification_type` varchar(40) CHARACTER SET utf8mb4 NULL,
    `coc_specification` varchar(200) CHARACTER SET utf8mb4 NULL,
    `applicant_classification` varchar(160) CHARACTER SET utf8mb4 NULL,
    `civil_status` varchar(30) CHARACTER SET utf8mb4 NULL,
    `birth_place` varchar(150) CHARACTER SET utf8mb4 NULL,
    `telephone` varchar(40) CHARACTER SET utf8mb4 NULL,
    `fax` varchar(40) CHARACTER SET utf8mb4 NULL,
    `other_contact` varchar(150) CHARACTER SET utf8mb4 NULL,
    `education_level` varchar(40) CHARACTER SET utf8mb4 NULL,
    `education_specification` varchar(150) CHARACTER SET utf8mb4 NULL,
    `employment_status` varchar(80) CHARACTER SET utf8mb4 NULL,
    `address_district` varchar(100) CHARACTER SET utf8mb4 NULL,
    `address_region` varchar(120) CHARACTER SET utf8mb4 NULL,
    `address_region_code` varchar(12) CHARACTER SET utf8mb4 NULL,
    `zip_code` varchar(10) CHARACTER SET utf8mb4 NULL,
    `application_reference` varchar(40) CHARACTER SET utf8mb4 NULL,
    `email_notification_status` varchar(40) CHARACTER SET utf8mb4 NULL,
    CONSTRAINT `PK_applicants` PRIMARY KEY (`applicant_id`),
    CONSTRAINT `FK_applicants_batches_batch_id` FOREIGN KEY (`batch_id`) REFERENCES `batches` (`batch_id`) ON DELETE SET NULL,
    CONSTRAINT `FK_applicants_courses_course_id` FOREIGN KEY (`course_id`) REFERENCES `courses` (`course_id`) ON DELETE RESTRICT
) CHARACTER SET=utf8mb4;

CREATE TABLE `courseschedules` (
    `schedule_id` int NOT NULL AUTO_INCREMENT,
    `course_id` int NOT NULL,
    `batch_id` int NOT NULL,
    `schedule_date` datetime(6) NOT NULL,
    `start_time` time(6) NOT NULL,
    `end_time` time(6) NOT NULL,
    `room` varchar(100) CHARACTER SET utf8mb4 NOT NULL,
    `room_id` int NULL,
    `trainer` varchar(50) CHARACTER SET utf8mb4 NOT NULL,
    `trainer_assignments` longtext CHARACTER SET utf8mb4 NULL,
    `training_days` varchar(40) CHARACTER SET utf8mb4 NULL,
    `status` varchar(20) CHARACTER SET utf8mb4 NOT NULL,
    CONSTRAINT `PK_courseschedules` PRIMARY KEY (`schedule_id`),
    CONSTRAINT `FK_courseschedules_batches_batch_id` FOREIGN KEY (`batch_id`) REFERENCES `batches` (`batch_id`) ON DELETE RESTRICT,
    CONSTRAINT `FK_courseschedules_courses_course_id` FOREIGN KEY (`course_id`) REFERENCES `courses` (`course_id`) ON DELETE RESTRICT
) CHARACTER SET=utf8mb4;

CREATE TABLE `trainingrooms` (
    `room_id` int NOT NULL AUTO_INCREMENT,
    `room_name` varchar(100) CHARACTER SET utf8mb4 NOT NULL,
    `description` varchar(255) CHARACTER SET utf8mb4 NULL,
    `course_id` int NULL,
    CONSTRAINT `PK_trainingrooms` PRIMARY KEY (`room_id`),
    CONSTRAINT `FK_trainingrooms_courses_course_id` FOREIGN KEY (`course_id`) REFERENCES `courses` (`course_id`)
) CHARACTER SET=utf8mb4;

CREATE TABLE `applicant_registration_documents` (
    `document_id` int NOT NULL AUTO_INCREMENT,
    `applicant_id` int NOT NULL,
    `category` varchar(20) CHARACTER SET utf8mb4 NOT NULL,
    `document_label` varchar(80) CHARACTER SET utf8mb4 NULL,
    `original_file_name` varchar(255) CHARACTER SET utf8mb4 NOT NULL,
    `stored_relative_path` varchar(500) CHARACTER SET utf8mb4 NOT NULL,
    `content_type` varchar(100) CHARACTER SET utf8mb4 NOT NULL,
    `size_bytes` bigint NOT NULL,
    `uploaded_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT `PK_applicant_registration_documents` PRIMARY KEY (`document_id`),
    CONSTRAINT `FK_applicant_registration_documents_applicants_applicant_id` FOREIGN KEY (`applicant_id`) REFERENCES `applicants` (`applicant_id`) ON DELETE CASCADE
) CHARACTER SET=utf8mb4;

CREATE TABLE `students` (
    `student_id` int NOT NULL AUTO_INCREMENT,
    `applicant_id` int NOT NULL,
    `batch_id` int NOT NULL,
    `security_pin` varchar(20) CHARACTER SET utf8mb4 NOT NULL,
    `account_status` varchar(20) CHARACTER SET utf8mb4 NOT NULL,
    `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT `PK_students` PRIMARY KEY (`student_id`),
    CONSTRAINT `FK_students_applicants_applicant_id` FOREIGN KEY (`applicant_id`) REFERENCES `applicants` (`applicant_id`) ON DELETE RESTRICT,
    CONSTRAINT `FK_students_batches_batch_id` FOREIGN KEY (`batch_id`) REFERENCES `batches` (`batch_id`) ON DELETE RESTRICT
) CHARACTER SET=utf8mb4;

CREATE TABLE `archives` (
    `archive_id` int NOT NULL AUTO_INCREMENT,
    `student_id` int NOT NULL,
    `archive_reason` longtext CHARACTER SET utf8mb4 NOT NULL,
    `specific_reason` varchar(500) CHARACTER SET utf8mb4 NULL,
    `archive_date` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT `PK_archives` PRIMARY KEY (`archive_id`),
    CONSTRAINT `FK_archives_students_student_id` FOREIGN KEY (`student_id`) REFERENCES `students` (`student_id`) ON DELETE CASCADE
) CHARACTER SET=utf8mb4;

CREATE TABLE `documentrequests` (
    `request_id` int NOT NULL AUTO_INCREMENT,
    `student_id` int NOT NULL,
    `document_type` varchar(100) CHARACTER SET utf8mb4 NOT NULL,
    `reason` longtext CHARACTER SET utf8mb4 NOT NULL,
    `specific_reason` varchar(500) CHARACTER SET utf8mb4 NULL,
    `request_status` varchar(40) CHARACTER SET utf8mb4 NOT NULL,
    `request_date` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `release_date` datetime(6) NULL,
    `hold_reason` varchar(500) CHARACTER SET utf8mb4 NULL,
    `release_file_name` varchar(255) CHARACTER SET utf8mb4 NULL,
    `release_stored_path` varchar(500) CHARACTER SET utf8mb4 NULL,
    `release_content_type` varchar(100) CHARACTER SET utf8mb4 NULL,
    `release_size_bytes` bigint NULL,
    `release_uploaded_at` datetime(6) NULL,
    CONSTRAINT `PK_documentrequests` PRIMARY KEY (`request_id`),
    CONSTRAINT `FK_documentrequests_students_student_id` FOREIGN KEY (`student_id`) REFERENCES `students` (`student_id`) ON DELETE CASCADE
) CHARACTER SET=utf8mb4;

CREATE TABLE `student_activity_logs` (
    `activity_id` int NOT NULL AUTO_INCREMENT,
    `student_id` int NOT NULL,
    `action` varchar(100) CHARACTER SET utf8mb4 NOT NULL,
    `device_info` varchar(255) CHARACTER SET utf8mb4 NULL,
    `ip_address` varchar(64) CHARACTER SET utf8mb4 NULL,
    `created_at` datetime(6) NOT NULL,
    CONSTRAINT `PK_student_activity_logs` PRIMARY KEY (`activity_id`),
    CONSTRAINT `FK_student_activity_logs_students_student_id` FOREIGN KEY (`student_id`) REFERENCES `students` (`student_id`) ON DELETE CASCADE
) CHARACTER SET=utf8mb4;

CREATE TABLE `student_course_documents` (
    `course_document_id` int NOT NULL AUTO_INCREMENT,
    `student_id` int NOT NULL,
    `course_id` int NOT NULL,
    `batch_id` int NULL,
    `document_type` varchar(80) CHARACTER SET utf8mb4 NOT NULL,
    `preparation_status` varchar(40) CHARACTER SET utf8mb4 NOT NULL,
    `file_name` varchar(255) CHARACTER SET utf8mb4 NULL,
    `stored_path` varchar(500) CHARACTER SET utf8mb4 NULL,
    `content_type` varchar(100) CHARACTER SET utf8mb4 NULL,
    `size_bytes` bigint NULL,
    `uploaded_at` datetime(6) NULL,
    `released_at` datetime(6) NULL,
    `released_by_user_id` int NULL,
    CONSTRAINT `PK_student_course_documents` PRIMARY KEY (`course_document_id`),
    CONSTRAINT `FK_student_course_documents_students_student_id` FOREIGN KEY (`student_id`) REFERENCES `students` (`student_id`) ON DELETE CASCADE
) CHARACTER SET=utf8mb4;

CREATE TABLE `student_login_credentials` (
    `student_id` int NOT NULL,
    `username` varchar(50) CHARACTER SET utf8mb4 NOT NULL,
    `password_hash` varchar(255) CHARACTER SET utf8mb4 NOT NULL,
    `password_login_enabled` tinyint(1) NOT NULL,
    CONSTRAINT `PK_student_login_credentials` PRIMARY KEY (`student_id`),
    CONSTRAINT `FK_student_login_credentials_students_student_id` FOREIGN KEY (`student_id`) REFERENCES `students` (`student_id`) ON DELETE CASCADE
) CHARACTER SET=utf8mb4;

CREATE TABLE `notifications` (
    `notification_id` int NOT NULL AUTO_INCREMENT,
    `request_id` int NULL,
    `student_id` int NULL,
    `applicant_id` int NULL,
    `title` varchar(150) CHARACTER SET utf8mb4 NOT NULL,
    `message` longtext CHARACTER SET utf8mb4 NOT NULL,
    `status` varchar(20) CHARACTER SET utf8mb4 NOT NULL,
    `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT `PK_notifications` PRIMARY KEY (`notification_id`),
    CONSTRAINT `FK_notifications_applicants_applicant_id` FOREIGN KEY (`applicant_id`) REFERENCES `applicants` (`applicant_id`) ON DELETE CASCADE,
    CONSTRAINT `FK_notifications_documentrequests_request_id` FOREIGN KEY (`request_id`) REFERENCES `documentrequests` (`request_id`) ON DELETE SET NULL,
    CONSTRAINT `FK_notifications_students_student_id` FOREIGN KEY (`student_id`) REFERENCES `students` (`student_id`) ON DELETE CASCADE
) CHARACTER SET=utf8mb4;

CREATE INDEX `IX_admin_activity_logs_admin_id` ON `admin_activity_logs` (`admin_id`);

CREATE UNIQUE INDEX `IX_admins_username` ON `admins` (`username`);

CREATE INDEX `IX_applicant_registration_documents_applicant_id` ON `applicant_registration_documents` (`applicant_id`);

CREATE INDEX `IX_applicants_batch_id` ON `applicants` (`batch_id`);

CREATE UNIQUE INDEX `IX_applicants_confirmation_token` ON `applicants` (`confirmation_token`);

CREATE INDEX `IX_applicants_course_id` ON `applicants` (`course_id`);

CREATE INDEX `IX_archives_student_id` ON `archives` (`student_id`);

CREATE INDEX `IX_batchhistory_batch_id` ON `batchhistory` (`batch_id`);

CREATE INDEX `IX_courseschedules_batch_id` ON `courseschedules` (`batch_id`);

CREATE INDEX `IX_courseschedules_course_id` ON `courseschedules` (`course_id`);

CREATE INDEX `IX_documentrequests_student_id` ON `documentrequests` (`student_id`);

CREATE INDEX `IX_notifications_applicant_id` ON `notifications` (`applicant_id`);

CREATE INDEX `IX_notifications_request_id` ON `notifications` (`request_id`);

CREATE INDEX `IX_notifications_student_id` ON `notifications` (`student_id`);

CREATE INDEX `IX_student_activity_logs_student_id` ON `student_activity_logs` (`student_id`);

CREATE UNIQUE INDEX `IX_student_course_documents_student_id_document_type` ON `student_course_documents` (`student_id`, `document_type`);

CREATE UNIQUE INDEX `IX_student_login_credentials_username` ON `student_login_credentials` (`username`);

CREATE UNIQUE INDEX `IX_students_applicant_id` ON `students` (`applicant_id`);

CREATE INDEX `IX_students_batch_id` ON `students` (`batch_id`);

CREATE UNIQUE INDEX `IX_students_security_pin` ON `students` (`security_pin`);

CREATE INDEX `IX_trainingrooms_course_id` ON `trainingrooms` (`course_id`);

CREATE UNIQUE INDEX `IX_usersettings_admin_id` ON `usersettings` (`admin_id`);

INSERT INTO `__EFMigrationsHistory` (`MigrationId`, `ProductVersion`)
VALUES ('20261107031554_InitialCreate', '8.0.11');

COMMIT;

