# 05 — Database and Data Relationships

Engine: MySQL, accessed by EF Core. Mapped tables are the `DbSet` properties in `Data/ApplicationDbContext.cs`. Empty files `Models/Enrollment.cs`, `Models/Schedule.cs`, `Models/LoginHistory.cs`, and `Models/DocumentType.cs` are not entities.

Surrogate keys (`applicant_id`, `student_id`, and the rest) identify rows inside the database. They are not a student-facing ID product.

## Entities

### applicants

Purpose: one registration. Created by `ApplicantService.EnrollAsync`. Updated by registration edit, status changes, and slot confirm/decline.

Key: `applicant_id`. Foreign keys: `course_id` (restrict delete), `batch_id` (set null if the batch is deleted). Unique `confirmation_token`. Unique index is not declared on email; uniqueness is checked in code.

Lifecycle: inserted Pending. May become Approved, Waitlisted, Rejected, Expired, Declined, or Confirmed Slot. The row is not deleted when the person is archived.

Readers: Students & Applicants, activation (through the student), dashboard, PDFs, document board.

### students

Purpose: the account and the batch seat. Created only by `EnrollConfirmedApplicantAsync`.

Key: `student_id`. `applicant_id` unique. `security_pin` unique. `batch_id` required (restrict delete). `account_status` Active or Inactive.

Deleting a student is rare. `ReleaseStudentSlotAsync` deletes the row if a slot is released before confirmation completes. That cascades notifications’ student link is nulled first, then the student row is removed. Document requests are configured to cascade on student delete. Archive rows cascade too.

### admins, user_settings, admin_activity_logs

Admin login account, one settings row, and activity rows. Activity cascades if the admin is deleted. Password hash stays in `admins`. This audit does not record hash values or SMTP secrets.

### courses

Catalog row: name, status Available/Unavailable, `slot_capacity`, `duration`, `hours_per_day`, `total_hours`, `training_days`, `ojt_days`. Official numbers are reapplied at startup for names `CourseProgram.Match` recognizes. A course that does not match keeps whatever was stored and has no program gate.

### batches, batchhistory

Semester window and Active/Closed. History rows cascade if a batch is deleted. Normal operations do not delete batches. History actions seen in code: Batch Created, Batch Activated, Restored as Active Batch, Moved to Batch History, Batch Completed, plus an assessment-date note.

### course_schedules, trainingrooms

A schedule belongs to one course and one batch (both restrict delete). `training_days` is a string on the schedule. `trainingrooms` is the room catalog. Deleting a schedule removes the row. History remains in `course_management_history`.

### course_management_history

Append-only notes for slot capacity and schedule create/update/delete. Stores course id, action, previous value, new value, optional admin id from the header, and a timestamp. It is not a login log.

### applicant_registration_documents

Files for one applicant. Cascade if the applicant is deleted. Applicants are not deleted by the archive flow.

### student_course_documents

One row per student and document type. Status is preparation, not the request. Cascade if the student is deleted.

### document_requests

One row per request. `student_id` cascades on student delete. Status string, optional hold reason, optional release file path, `request_date`, `release_date`. Rejected rows stay here. That is the document archive.

### notifications

Optional `student_id` and optional `applicant_id`. Either side cascades on delete. Admin-facing notices are rows with no student, created by `CreateAdminAsync`. There is no separate admin notification table.

### archives

One intended row per student (the service updates the latest row rather than inserting a second). Cascade on student delete. Reactivation deletes the row.

### student_activity_logs

Written only after a successful student login. Columns: activity id, student id, action, device, IP, created at. No foreign key is declared in `OnModelCreating` (the table is created by raw SQL in the seeder). Deactivating an account does not delete these rows.

## Who writes what

| Data | Source of truth | Other copies |
| --- | --- | --- |
| Official hours and day counts | `CourseProgram.cs` | Copied onto `courses` at startup. Landing cards and course cards display the API, which prefers the program summary. |
| Slot capacity | `courses.slot_capacity` | Count of student rows for that course is computed, not stored. |
| Semester dates | `batches.start_date` and `end_date` | Release timeline is computed, not stored. |
| Training-complete for requests | Computed: batch start + program days | Not stored. |
| Active class | `course_schedules` where status is Active | Student API filters again by batch. |
| Account | `students.account_status` and `archives` | Inactive plus an archive row means archived. Inactive without an archive row means pending activation. |
| Application decision | `applicants.application_status` plus slot columns | Not copied onto the student. |
| Released credential | `student_course_documents.preparation_status` and, if a request existed, `document_requests.request_status` | Both must be read. Release of the file updates the open request. A request can also be set Released without a preparation upload if staff use the request endpoint. |

## Consistency risks

1. **Two clocks.** Request eligibility uses program length from the batch start. Expected release uses the batch end date. They disagree whenever the batch window is not the program length.
2. **Startup overwrite.** Course duration columns are not a stable admin setting for the four official courses.
3. **Batch id copied twice.** `applicants.batch_id` at registration and `students.batch_id` at confirmation can differ.
4. **Capacity ignores batch and archive.** Every student row for the course fills a slot, including Inactive and archived students, in every batch.
5. **One Active batch for the whole institute**, not per course. One Active schedule per course, not per batch.
6. **Student schedule omits `training_days`.** The saved weekday string is invisible to the student API.
7. **Archive reason is overwritten** in place. Reactivation deletes it.
8. **Schedule delete** drops the row. **Student delete** in `ReleaseStudentSlotAsync` drops the account and cascades requests.
9. **Email unique check is application-level**, not a database unique index. Two parallel enrollments can race.
10. **Course-document ensure** inserts four rows on read. A concurrent first read can deadlock; the service catches `DbUpdateException` and reloads. It does not retry the insert.
11. **APIs trust the caller** for `studentId` and admin id. See the findings register.
12. **No orphan cleanup** for files if a row is removed. The inverse also happens: a row can point at a file that was deleted on disk.

`GET /api/health` reports whether MySQL accepts a connection. It does not migrate data.
