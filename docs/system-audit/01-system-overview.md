# 01 — System Overview

Investigation date: 29 October 2026. This document describes the code as it exists. It does not change behavior.

## Stack

ABEC is an ASP.NET Core application (`net8.0`) with Entity Framework Core and Pomelo MySQL. The database name used by the running app is `abec_system`. Schema changes are additive SQL in `Data/DbSeeder.cs` (`CREATE TABLE IF NOT EXISTS`, `AddColumnIfMissingAsync`). There is no EF migration history in use.

The website is static HTML under `Views/`, served at `/Views/...` (`Program.cs`, physical file provider on the Views folder). Scripts and styles live in `wwwroot/`. The site root redirects to `/Views/Home/LandingPage.html`. JSON APIs use camelCase and are same-origin at the HTTP launch profile (`http://localhost:5188`).

There is no `[Authorize]` attribute on any controller. `app.UseAuthorization()` is registered, but endpoints do not require a server session. The browser stores a session in `sessionStorage` under the key `abec-session` (`wwwroot/js/abec-api.js`). `AbecApi.requireRole` only checks that JSON before showing a page. API calls are not tied to that session except where a page optionally sends `X-Abec-Admin-Id`. That header is read by `CourseDocumentController` and `CourseHistoryRecorder` as an actor hint. It is not a credential.

CORS (`AbecCors` in `Program.cs`) allows localhost ports 5188, 5500, and 7162, any header, any method.

## How a request travels

1. A page loads HTML and calls `AbecApi.get` / `post` / `put` / `postForm`.
2. The matching controller action calls a service.
3. The service reads or writes MySQL through `ApplicationDbContext`.
4. The JSON response is rendered by the page script.

There is no background worker (`IHostedService` / `BackgroundService` were not found). Time-based rules run when a request is processed, for example the 24-hour slot deadline in `ApplicantService.EnsureExpiredIfNeededAsync`.

## Module inventory

Status words used below: **implemented** means the UI calls a real endpoint that persists data; **partial** means part of the story is missing or only some callers are wired; **UI-only** means the control does not persist; **broken** means the path fails against its own rules. Nothing below was left unverified unless marked **UNVERIFIED**.

### Public website

| Surface | File | Access | Status |
| --- | --- | --- | --- |
| Landing, About, Courses, Contact | `Views/Home/LandingPage.html`, `wwwroot/js/abec-landing.js` | Anyone | Implemented. Course hour lines are filled from `GET /api/courses`. |
| Registration | Enroll modal on the landing page, `wwwroot/js/abec-enroll-wizard.js` | Anyone | Implemented. `POST /api/applicants/enroll` and `POST /api/applicants/enroll/files`. |
| Important Note | Same modal, heading in `LandingPage.html` around the enroll step | Anyone, before the form continues | Implemented as a step inside the modal, not a separate route. |
| Confirm or decline slot | `Views/Home/ConfirmSlot.html` | Anyone with the email token | Implemented. `POST /api/applicants/confirm-slot` and `decline-slot`. |
| Student sign-in | `Views/Home/LoginPage.html`, `abec-login.js` | Anyone | Implemented. `POST /api/auth/student-login`. |
| Admin sign-in | `Views/Home/AdminLoginPage.html` | Anyone | Implemented. `POST /api/auth/admin-login`. |
| Sign out | `Views/Home/SignOutPage.html` | Browser only | Implemented as clearing `abec-session`. The server has no logout endpoint. |

### Admin module

Pages call `AbecApi.requireRole('Admin')`. That check is client-side only.

| Page | Script | Main APIs | Status |
| --- | --- | --- | --- |
| Dashboard `Views/Admin/AdminDashboard.html` | `abec-dashboard.js` | `GET /api/admin/dashboard/stats`, notifications, applicants | Implemented. “Released Documents” counts request status Released. |
| Students & Applicants | `abec-students-applicants.js`, `abec-applicants.js` | `GET/PUT /api/applicants`, status, registration documents | Implemented. |
| Account Activation | `abec-activation.js` | `/api/activations` | Implemented. |
| Course Management | `abec-courses.js` plus schedule UI in `CourseManagement.html` | `/api/courses`, `/api/schedules`, `/api/training-rooms`, `/api/batches` | Partial. Slot capacity can be saved. Course name and duration have no edit API. `Views/Admin/CourseSchedule.html` is an unused stub. |
| Document Management | `abec-documents.js` | `/api/course-documents`, `/api/document-requests` | Implemented. Preparation and requests are separate. |
| Archive | `abec-archive.js`, `StudentArchive.html` | `/api/archives` | Implemented. |
| User Settings | `abec-admin-settings.js` | `/api/admin/profile`, email settings, activity | Implemented for profile, password, SMTP, and login activity. |
| Login activity | Same settings page | `admin_activity_logs` | Implemented for admin sign-in and profile actions only. |

### Student module

Pages call `AbecApi.requireRole('Student')`. The student shell has no sidebar (`abec-student-shell.js`).

| Page | Script | Main APIs | Status |
| --- | --- | --- | --- |
| Dashboard | `abec-student.js` | `GET /api/student/{id}/dashboard` | Implemented. |
| Training Schedule | `ClassSchedule.html` (route name kept) | `GET /api/student/{id}/schedule`, `GET /api/notifications/student/{id}` | Implemented, with the schedule gaps in document 03. |
| Documents | `DocumentRequest.html`, `abec-student-documents.js` | course documents and document requests | Implemented. |
| User Settings | `abec-student-settings.js` | profile and login activity | Partial. Profile save works. There is no student password change. Notification checkboxes were removed. |
| Notifications | `Notifications.html` | Redirects to `StudentDashboard.html#notifications` | Implemented as a redirect. |

## Shared dependencies

- **Courses** (`courses`) are the catalog. Official lengths are hardcoded in `Services/CourseProgram.cs` and copied onto the four known course rows on every startup by `DbSeeder.ApplyOfficialCourseProgramsAsync`.
- **Batches** (`batches`) are semesters. Exactly one row is expected to have status Active. Students, applicants, and schedules point at a batch id. They are not rewritten when a different batch becomes Active.
- **Applicants** (`applicants`) are the registration record. A **student** row (`students`) is created only after slot confirmation, in `ApplicantService.EnrollConfirmedApplicantAsync`.
- **Accounts** are the student row’s `account_status` and `security_pin`. Admins are a separate `admins` table.
- **Schedules** are `course_schedules`. The student portal returns only rows that are Active, match the student’s course, and match the student’s batch.
- **Documents** split into registration files (`applicant_registration_documents`), course preparation (`student_course_documents`), and requests (`document_requests`).
- **Notifications** are rows in `notifications`. Email is SMTP via `EmailService`, with an HTML copy under `App_Data/email-outbox` when mail is sent or attempted.
- **Archive** is a row in `archives` plus `students.account_status = Inactive`. The applicant and student rows stay.

## What this audit could not execute

No production data was changed. No destructive test was run. Behavior described here was read from controllers, services, and page scripts. Live rows mentioned in earlier work (batch names, schedule dates) were not re-queried for this write-up.
