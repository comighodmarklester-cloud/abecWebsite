# 08 — Findings and Risk Register

Verified means the behavior is in the cited code. Design means the code works as written and the gap is a missing capability. Unverified suspicions are listed separately and were not treated as bugs.

No fix was applied.

## Verified defects and risks

### F-01 — Critical — API authorization

**Observed:** Controllers have no `[Authorize]`. Any client that can reach the site can call applicant, student, activation, archive, schedule, and document routes. `AbecApi.requireRole` only redirects HTML. `X-Abec-Admin-Id` is an optional header.

**Expected:** An administrator action should require an admin session. A student should be able to read and change only their own profile, schedule, and documents.

**Evidence:** `Program.cs` `UseAuthorization` with no policies. Controllers under `Controllers/`. `wwwroot/js/abec-api.js` `requireRole`.

**Impact:** Account activation, archive, document release, and reading another person’s files are not protected by the server.

**Recommendation:** Issue a server session or signed token at login and check it on every API, with student routes bound to the signed-in student.

**Risk if fixed:** Existing pages must send the credential. Browser session JSON alone will stop working until each script is updated. Do not rotate or print current PINs as part of that work.

### F-02 — Critical — Security PIN in profile JSON

**Observed:** `StudentPortalService.GetProfileAsync` returns `SecurityPin` on the student DTO. The settings page does not render it. The network response still contains it. Activation notice PDFs also contain the PIN by design.

**Expected:** The PIN should be shown only on the activation notice the registrar prints, not on every profile read.

**Evidence:** `Services/StudentPortalService.cs` `GetProfileAsync`. `DTOs/ResponseDtos.cs` `StudentDto`.

**Impact:** Anyone who can call `GET /api/student/{id}/profile` can sign in as that student if the account is Active.

**Recommendation:** Remove the PIN from profile and list DTOs. Keep it on the activation PDF endpoint, and protect that endpoint with F-01.

**Risk if fixed:** Any screen that accidentally displayed the PIN will show an empty value. The PIN in the database stays.

### F-03 — High — Open register endpoint activates accounts

**Observed:** `POST /api/auth/register` sets `account_status = Active` when the PIN matches and the two passwords match. The login page does not call it. The route is still public. Passwords are not stored.

**Expected:** Only staff activation should turn an account on.

**Evidence:** `AuthService.RegisterStudentAsync`. `Controllers/AuthController.cs`.

**Impact:** Someone who knows a PIN can activate an Inactive account without the registrar.

**Recommendation:** Remove or disable the route if the product no longer uses self-service registration.

**Risk if fixed:** None for the current login page. Confirm no external client still calls `/api/auth/register`.

### F-04 — High — Request eligibility ignores real training

**Observed:** Requests open when the calendar passes batch start plus training days plus OJT days. Weekends, holidays, the saved schedule, and attendance are not read. A long batch window does not delay the gate. A short batch window does not speed the release date, because release uses the batch end.

**Expected:** The stated rule is completion of the required hours and, for Bookkeeping, OJT. Elapsed calendar time is not that rule.

**Evidence:** `CourseProgram.RequestGate`. `DocumentRequestService.CreateAsync`. `CourseDocumentService.BuildTimeline` calling `ReleaseDeadline.Compute(start, end, null)`.

**Impact:** A student can request credentials before any session is held, if the batch start is old. Another student can be blocked or shown a release date that has nothing to do with the 35, 37+19, 30, or 33 day programs.

**Recommendation:** Decide one completion rule and store the result when staff mark training complete, or compute it from sessions. Keep the batch window as the semester, not as a second completion date. Do not auto-release.

**Risk if fixed:** Students who can request today might become blocked if the new rule is stricter. Do not delete requests already submitted.

### F-05 — High — No batch transfer

**Observed:** `students.batch_id` is written once, from the Active batch at confirmation. There is no transfer API. Switching the Active batch does not move anyone. The student schedule requires the schedule’s batch id to match.

**Expected:** Moving a person to another batch should update the student row, keep the old schedule as history, and show the new batch’s Active schedule.

**Evidence:** `ApplicantService.EnrollConfirmedApplicantAsync`. `BatchService.ActivateAsync` (status only). `StudentPortalService.GetScheduleAsync`.

**Impact:** After a semester switch, current students still look at the old batch’s schedule. New confirms look at the new batch, which may have no Active schedule.

**Recommendation:** Add an explicit transfer that writes the new `batch_id`, appends batch history, and does not delete the old schedule.

**Risk if fixed:** Doing it by rewriting rows in bulk would hide who moved. An append-only history row avoids that.

### F-06 — High — Schedule weekdays never reach the student

**Observed:** Admin schedules store `training_days`. `GetScheduleAsync` does not copy `TrainingDays` onto `CourseScheduleDto`.

**Expected:** The Training Schedule calendar should mark the saved weekdays.

**Evidence:** `StudentPortalService.GetScheduleAsync` object initializer (no `TrainingDays`). `ScheduleService` persists `TrainingDays` on create and update.

**Impact:** Students see the single `schedule_date` and clock times, not the Monday–Friday pattern staff saved.

**Recommendation:** Map `TrainingDays` in the student DTO and teach the calendar to use it. Do not invent sessions that were not saved.

**Risk if fixed:** Display only. No row changes.

### F-07 — High — Second Active schedule is blocked, and create notifies Inactive schedules

**Observed:** `EnsureSingleActiveAsync` rejects a new Active schedule instead of retiring the old one. Separately, `CreateAsync` notifies every student on the course even when status is Inactive.

**Expected:** Redeploy should be an explicit replace, and students should be notified when the schedule they can see changes.

**Evidence:** `ScheduleService.EnsureSingleActiveAsync`, `CreateAsync` else branch “Class Schedule Created”.

**Impact:** Staff can think a new schedule is live when the old one is still the only Active row. Students get notices for schedules that the portal will not show.

**Recommendation:** Keep a single Active row, but make replace a deliberate action that sets the previous row Inactive and writes history. Notify only for Active changes, or only for students whose batch matches.

**Risk if fixed:** Existing Inactive notices remain. Do not delete notification history.

### F-08 — Medium — Course program reset on startup

**Observed:** `ApplyOfficialCourseProgramsAsync` overwrites duration and hour columns for matched course names every startup. Slot capacity is left alone.

**Expected:** Either the seeder is the only editor, or an admin edit survives a restart. Today an admin cannot edit those fields, so the practical source of truth is `CourseProgram.cs`.

**Evidence:** `Data/DbSeeder.cs`. `CourseService` has no duration update.

**Impact:** Database values and the C# constants cannot drift for long. A renamed course that no longer matches keeps stale numbers and loses the request gate (`Match` returns null, gate stays closed).

**Recommendation:** Document the seeder as the owner, or stop rewriting rows that staff have edited. Do not change the four official numbers without a product decision.

**Risk if fixed:** Stopping the overwrite leaves the last seeded values in place. No student rows change.

### F-09 — Medium — Archive history is destroyed

**Observed:** A second archive updates the same row’s reason and date. Reactivate deletes archive rows.

**Expected:** Graduated, withdrawn, and later restored should remain readable.

**Evidence:** `ArchiveService.ArchiveInternalAsync`. `ActivationService.ActivateAsync` `RemoveRange` on `archives`.

**Impact:** The Archive screen shows only the latest reason. After reactivation there is no archive row. Document requests and schedules are otherwise kept.

**Recommendation:** Insert a new history row on each change. Reactivate should mark the archive closed instead of deleting it.

**Risk if fixed:** The Archive list must filter to the current open row or it will show duplicates. Old rows stay.

### F-10 — Medium — Capacity counts archived students

**Observed:** `EnrollConfirmedApplicantAsync` counts all students for the course. Archive does not remove the student row.

**Expected:** A withdrawn or graduated seat should be free if the capacity is a class size.

**Evidence:** count query in `EnrollConfirmedApplicantAsync`. `ArchiveService` does not delete the student.

**Impact:** Courses can report zero slots while many of those rows are archived.

**Recommendation:** Count students who are not archived, and define whether Inactive pending-activation seats count. Do not delete archived people to free a slot.

**Risk if fixed:** A course that looks full today might accept another confirm. That is the point of the fix. It does not remove anyone.

### F-11 — Medium — Permanent deletes

**Observed:** `ScheduleService.DeleteAsync` removes `course_schedules`. `ApplicantService.ReleaseStudentSlotAsync` removes a `students` row. Document requests cascade with the student.

**Expected:** The audit asked to preserve history. Close and archive already do that. Delete does not.

**Evidence:** `ScheduleService.DeleteAsync`. `ReleaseStudentSlotAsync`. `ApplicationDbContext` cascade on `DocumentRequest`.

**Impact:** A removed schedule cannot be shown later. A released student slot loses the account and its requests.

**Recommendation:** Deactivate schedules instead of deleting them. Avoid calling slot release once a student has documents or logins.

**Risk if fixed:** Hiding Delete changes staff workflow. Existing deleted rows cannot be restored from the application.

### F-12 — Medium — Email uniqueness is not a constraint

**Observed:** Duplicate email is checked with `AnyAsync` then insert. No unique index was declared on `applicants.email`.

**Evidence:** `ApplicantService.EnrollAsync`. `ApplicationDbContext` applicant configuration (unique token only).

**Impact:** Two simultaneous submits can create two Pending applications for one email.

**Recommendation:** Add a unique index after checking current data for duplicates. Do not merge rows automatically.

**Risk if fixed:** The migration fails if duplicates already exist. Clean those first in a reviewed script. This audit did not scan production for duplicates.

### F-13 — Medium — Request cancel path is narrower than the screen story

**Observed:** Reject is allowed only from On Hold. Pending and Processing cannot be rejected. Course-file release can jump an open request straight to Released, including from Pending, because that path does not use `IsTransitionAllowed`.

**Evidence:** `IsTransitionAllowed`. `CourseDocumentService.ReleaseAsync` request update.

**Impact:** Staff cannot reject a Pending request without parking it On Hold first. Releasing the prepared file can close a request that was still Pending.

**Recommendation:** Choose one release authority. If the prepared-file release is the real release, say so in the UI and still write the request history. If requests must follow the state machine, make file release call the same transition rules.

**Risk if fixed:** In-flight requests keep their current status until staff move them.

### F-14 — Low — Student activity has no foreign key

**Observed:** `student_activity_logs` is created with raw SQL and is not configured in `OnModelCreating`.

**Evidence:** `DbSeeder.EnsureCourseProgramSchemaAsync` (table SQL). `ApplicationDbContext` has the `DbSet` only.

**Impact:** A deleted student can leave activity rows with a dangling student id. Archive does not delete them, so normal use is safe.

**Recommendation:** Add a foreign key when a future migration is approved. Do not purge the table.

### F-15 — Low — Bulk document update skips mail

**Observed:** `BulkUpdateStatusAsync` changes status and does not call the email branch.

**Evidence:** `DocumentRequestService.BulkUpdateStatusAsync`.

**Impact:** A bulk Release looks released in the database and may not notify.

**Recommendation:** Reuse `UpdateStatusAsync` per id.

**Risk if fixed:** Bulk release would send one email per request.

## Design gaps (not defects in a working path)

- No student batch transfer (tracked as F-05 because the schedule filter makes the missing feature change what students see).
- No course change after a student row exists.
- No batch date edit. Release dates cannot be corrected without a new feature.
- No batch archive. Close is status only.
- No attendance, holiday, or cancellation records.
- No student password. PIN is the credential. Admin password change exists.
- Student notification preferences are not stored. The decorative checkboxes were removed.
- `CourseSchedule.html` is unused. Scheduling lives on Course Management.
- Important Note is a modal step, not a route.
- Internal `application_reference` is generated and is not the public navigation key.

## Unverified

- Whether production MySQL already has a unique index on email that the EF model does not show. **UNVERIFIED** without a schema dump. This audit did not query the database.
- Whether any reverse proxy adds authentication in deployment. The repository does not. **UNVERIFIED** outside this repo.
- Delivery of a specific historical email. Outbox HTML files exist under `App_Data/email-outbox`. Their recipients are personal data and are not listed here.
