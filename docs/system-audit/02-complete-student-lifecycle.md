# 02 — Complete Student Lifecycle

This is the path the code actually takes. Internal database keys exist (`applicant_id`, `student_id`). They are storage keys. The public UI is not an ID lookup system. After insert, `ApplicantService.EnrollAsync` also stores `application_reference` as `ABEC-{year}-{applicant id padded to 4}`. That string is a stored reference, not a separate identifier scheme.

## 1. Visitor and registration

1. The visitor opens `/`, which redirects to `Views/Home/LandingPage.html`.
2. Course cards are static HTML until `abec-landing.js` calls `GET /api/courses` and writes the program summary (hours, training days, OJT) into the cards.
3. Enroll opens a modal. The Important Note is a step in that modal (`LandingPage.html`, “IMPORTANT NOTE”), not its own page.
4. The wizard collects name, gender, birthdate, age, contact, email, address (province, city, barangay, street, region), course, school or company fields, civil status, education, employment, TESDA screening answers, and files.
5. Required personal fields are enforced in `ApplicantService.EnrollAsync`: first name, last name, email, contact, province, city, barangay, street, gender, birthdate, age. Age must be at least 18 and must match the birthdate. Gender must be Male, Female, or Prefer Not to Say. Contact must be `09` plus 9 digits, stored as `+639...`. Email must look like an email and must not already exist on `applicants.email` (case-insensitive).
6. Optional name parts reject digits. Address length limits are 100 / 100 / 150 / 255. Profile rules continue in `ValidateRegistrationProfile` (qualification type, classification, civil status, education, employment, region from `SystemConstants.RegistrationChoices`).
7. Credential files expected by the product list are Transcript of Records, Honorable Dismissal, Certificate of Good Moral Character, and Form 138 (`SystemConstants.DocumentStatuses.ApplicantSubmittedDocuments`). Identity files use `SystemConstants.IdentityIdTypes`. Allowed types are PDF, JPG, JPEG, PNG, 20 MB (`RegistrationUploadLimits`). Storage is `App_Data/secure-uploads/applicants` via `ApplicantRegistrationStorageService`.
8. Submit calls `POST /api/applicants/enroll` and then `POST /api/applicants/enroll/files`. A validation failure returns `success: false` and does not insert. A duplicate email returns “An application with this email already exists.” A database failure is the generic API error from `Program.cs` (MySQL down message if the exception is a database failure).
9. On success the applicant row is inserted with `application_status = Pending`, `batch_id` set to whichever batch is Active at that moment (or null if none), and `email_notification_status = Pending`. Two notification rows are created: “Application Received” (applicant) and “New Applicant Registration” (admin, `student_id` null).
10. The person appears in Students & Applicants as soon as that insert commits, with status Pending. No student row exists yet. Account Activation does not list them yet.

## 2. Applicant review

Administrators open Students & Applicants, which loads `GET /api/applicants`. Search and status filters run in the page script against that list. Opening a person loads `GET /api/applicants/{id}` and registration files from `GET /api/applicants/{id}/registration-documents`. Download is `GET /api/applicants/{id}/registration-documents/{documentId}/download`. The application form PDF is `GET /api/applicants/{id}/application-form`.

`PUT /api/applicants/{id}/registration` updates registration fields through `UpdateRegistrationAsync`. `PUT /api/applicants/{id}/status` is the decision endpoint.

Allowed application statuses (`SystemConstants.ApplicationStatuses`): Pending, Approved, Rejected, Waitlisted, Confirmed Slot (legacy value Confirmed is treated as the same), Declined, Expired.

- **Approve** from Pending or Waitlisted sets status Approved, creates a new confirmation token, clears prior confirm/decline timestamps, sets slot response to AwaitingResponse or AwaitingFromWaitlist, and emails a confirm/decline link. The 24-hour deadline is stored only if that email send reports success (`ResponseDeadline = now + 24 hours`).
- **Waitlist** sets Waitlisted and clears the slot offer. From Pending it sends the waitlist email.
- **Reject** sets Rejected and clears the slot offer.
- There is no separate “incomplete documents” status. Missing files stay as absent rows. Staff use Reject, Waitlist, or leave the application Pending.
- Changes are visible on the next read of `/api/applicants`. No second publish step exists.

Expired is not a timer. `EnsureExpiredIfNeededAsync` runs when status is read or changed. If status is still Approved, the deadline has passed, and the person has not confirmed or declined, status becomes Expired.

## 3. Account activation is not enrollment

Approving an application does not create a student and does not enroll anyone.

The applicant confirms through the email link (`ConfirmSlot.html` → `ConfirmSlotAsync`):

- Token must match `applicants.confirmation_token`.
- Status must still be Approved, inside the deadline, and not declined.
- Status becomes **Confirmed Slot**, `slot_response = Confirmed`, `confirmed_at = now`.
- `EnrollConfirmedApplicantAsync` then creates the student.

That method:

- Requires a batch with status Active. If none, confirmation is saved but enrollment fails and an admin notification says automatic enrollment failed.
- Counts students whose applicant course matches, across every batch, and compares that count to `courses.slot_capacity` (default 25). At capacity, enrollment fails.
- Inserts `students` with `account_status = Inactive`, a generated `security_pin` starting with `ABEC`, and `batch_id` of the **currently Active** batch. That can differ from `applicants.batch_id` if the active batch changed after registration.
- Copies older applicant notifications onto the new student id.
- Writes “Assigned to Training Batch”.

The student now appears in Account Activation as Inactive / pending activation. They still cannot sign in.

`POST /api/activations/{id}/activate` (`ActivationService.ActivateAsync`):

- Sets `account_status = Active`.
- Generates a PIN if the current value is missing or does not look like an ABEC PIN.
- If archive rows exist, they are **deleted** and the account becomes Active again (this is also reactivation).
- Writes a dashboard notification. It does not email the PIN. Staff download a PDF from `GET /api/activations/{id}/activation-notice` and hand it over. The PDF includes the PIN (`PdfService.GenerateActivationNoticePdf`).

`POST /api/auth/student-login` accepts the PIN only when `account_status` is Active. Inactive and archived accounts get “Student account is not active.”

`POST /api/auth/register` is a second path: if the PIN matches a student and the submitted passwords match, it sets the account Active even when an administrator has not pressed Activate. The student login page does not call this route (`abec-login.js` uses `student-login` only). The route is still open.

There is no student password after that. Sign-in is the PIN. Admin passwords are separate (`admins.password_hash`, change via `POST /api/admin/profile/{id}/change-password`).

Duplicate email is blocked at registration. Duplicate PIN is avoided by `GenerateUniquePinAsync`. A second confirm is idempotent and does not insert a second student.

## 4. When someone is enrolled

Enrollment, in this codebase, is the insert into `students` during slot confirmation (or `POST /api/applicants/{id}/add-to-slot` if confirmation happened but the student row is missing). Activation does not enroll. Batch assignment is that same insert. Nothing later moves `students.batch_id`.

The student is tied to a course only through `students.applicant_id` → `applicants.course_id`. There is no enrollment table. `Models/Enrollment.cs` is an empty file and is not mapped.

## 5. Training on the student side

After login, `GET /api/student/{id}/dashboard` and `GET /api/student/{id}/profile` read the student, applicant, course, and batch. `GET /api/student/{id}/schedule` returns Active `course_schedules` for that course **and** that batch. Other batches are not returned. If none match, the Training Schedule page states that no schedule is available.

The student schedule DTO does not copy `training_days` (`StudentPortalService.GetScheduleAsync`). The calendar therefore cannot reconstruct the weekday pattern from the API even when the admin saved Monday–Friday.

Class Schedule Update is not a separate table. The page filters `GET /api/notifications/student/{id}` to messages about schedule, class, trainer, instructor, or room.

Creating or editing a schedule notifies every student on that course, including when the new schedule is Inactive (`ScheduleService.CreateAsync`). The student still does not see an Inactive schedule on the Training Schedule page.

## 6. Training completion

The system does not record attendance, holidays, cancellations, or completed sessions.

Official program lengths live in `CourseProgram.cs` and are written onto `courses` at startup:

| Course match | Hours / day | Total hours | Training days | OJT days |
| --- | --- | --- | --- | --- |
| name contains “computer” and “servic” | 8 | 280 | 35 | 0 |
| name contains “bookkeep” | 8 | 448 | 37 | 19 |
| name contains “customer” | 8 | 240 | 30 | 0 |
| name contains “electronic” | 8 | 264 | 33 | 0 |

Bookkeeping program days are 37 + 19. Those 19 days are OJT, not extra classroom days. `CourseProgram.RequestGate` adds them together only to decide when document requests open.

Request gate (`DocumentRequestService.CreateAsync` and the student documents page):

- Completion calendar date = batch start date + (training days + OJT days) − 1.
- Requests open only when today’s date is **after** that date.
- Missing start or day counts: requests stay closed and the message is exactly “Document requests will become available after you complete your training.”
- Weekends are counted as ordinary days. No holiday table exists.

A second clock is the document release timeline in `CourseDocumentService.BuildTimeline`. It calls `ReleaseDeadline.Compute(batch.StartDate, batch.EndDate, null)`. The saved batch end is the release date. The program length is displayed beside it and does not replace the batch span. Passing a duration string that contains “days” would override the batch span; the timeline deliberately does not do that.

Nothing sets a “graduated” or “training complete” column when the date passes. Completion is only this date comparison.

## 7. Documents

See document 04. Short version: registration files are reviewed by staff and are not requestable. The four ABEC credentials are prepared per student, then a student may request one after the gate opens, if it is not already released and no open request exists. Staff move the request with `PUT /api/document-requests/{id}/status`. Release of the course-document file can also mark the matching open request Released.

## 8. Leaving the active list

An administrator archives from Account Activation (`POST /api/activations/{id}/deactivate`) or Archive (`POST /api/archives`). Reasons: Graduated, Deactivated, Academic Dismissal, Withdrawal, Inactive Lead, Other (Other requires text).

`ArchiveService.ArchiveInternalAsync` inserts or **updates** the single archive row, sets `account_status = Inactive`, and writes “Account Archived”. The student, applicant, batch link, schedules, and document rows stay. Login fails because the account is Inactive.

Reactivate is `ActivateAsync`, which deletes archive rows and sets Active. The previous reason is gone because the archive row is removed.

Pending document requests are not cancelled. Batch slot counts still include the student, because capacity counts student rows by course, not by account status.

No operation archives a batch. Closing a batch (`POST /api/batches/{id}/complete` or switching the active batch) only changes `batches.status` and appends `batchhistory`. Students remain on their original `batch_id`.
