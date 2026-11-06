# 09 — End-to-End Test Scenarios

These scenarios were **not executed** against the live database. Run them on a copy of `abec_system` or with disposable applicants. Do not delete the existing registrar accounts, the four official courses, or current student rows to make a test pass.

Internal keys below mean the database columns. Do not build a new public ID to run the tests. Identify disposable people by the email address you type into the form.

Shared checks after any write:

- `applicants`, `students`, `archives`, `document_requests`, `student_course_documents`, `course_schedules`, and `batches` for rows you did not intend to touch are unchanged.
- `batchhistory` and `course_management_history` only grow. They are not rewritten.
- Files you did not upload are still under `App_Data/secure-uploads`.

## 1. Successful registration

**Preconditions:** Active batch exists. Email not used. Course slot count below capacity is irrelevant at this step.

**Steps:** Landing page → Important Note → complete required fields → upload a small PDF → submit.

**Expected:** `POST /api/applicants/enroll` success. New `applicants` row Pending. `batch_id` equals the Active batch. `application_reference` populated. File row and file on disk. Notifications “Application Received” and “New Applicant Registration”. Row appears in Students & Applicants. No `students` row.

**Failure:** Validation message, no row. If the file call fails after the applicant insert, the applicant remains Pending without files. Recovery is to upload from the admin review tools if that action exists, or reject and ask the person to use a new email. Do not delete the applicant as a cleanup shortcut on a shared database.

## 2. Registration validation failure

**Preconditions:** None.

**Steps:** Submit with age 17, or a birthdate that does not match age, or contact not starting with 09, or a duplicate email.

**Expected:** `success: false` and the message from `EnrollAsync`. No new applicant. No file.

## 3. Missing documents

**Preconditions:** A Pending applicant saved without the four credential files.

**Expected:** Application still Pending. Document list for that applicant is empty or partial. No automatic reject. Staff can still Approve. There is no document-completeness gate in `UpdateStatusAsync`.

## 4. Administrator reviews an applicant

**Steps:** Open Students & Applicants, search the email, open the record, download a file, edit a phone number, refresh.

**Expected:** `PUT /api/applicants/{id}/registration` persists. A second `GET` shows the new phone. Status stays Pending until a status call.

## 5. Activation and login

**Preconditions:** Applicant Approved, email link confirmed, `students` row Inactive.

**Steps:** Account Activation → Activate → download notice in a safe environment → student login with the PIN → wrong PIN → deactivate is scenario 21.

**Expected:** `account_status` Active. Login returns role Student. `student_activity_logs` gains “Logged in” only for the success. Wrong PIN does not write a log. Dashboard loads that student’s course and batch.

**History:** Applicant status stays Confirmed Slot.

## 6. Enroll and batch assignment

**Preconditions:** One Active batch, course under capacity.

**Steps:** Confirm a disposable approved applicant.

**Expected:** One student. `students.batch_id` is the Active batch at confirm time. Account Inactive until scenario 5. Second confirm does not insert another student.

**Failure:** No Active batch: applicant becomes Confirmed Slot and the response says enrollment needs attention. No student row. Recovery: activate a batch, then `POST /api/applicants/{id}/add-to-slot`.

## 7. Create and deploy a schedule

**Preconditions:** A training room for that course. No other Active schedule for that course, or deactivate it first on the copy database.

**Steps:** Course Management → create schedule Inactive → confirm students are not shown it → set it Active.

**Expected:** `course_schedules` row. History “Schedule created”. Inactive create still inserts “Class Schedule Created” notifications (current behavior). Active update notifies “Active Class Schedule Updated”. A second Active for the same course is rejected.

Do not create this on the live database if real students would be notified.

## 8. Student sees the matching schedule

**Preconditions:** Student batch id equals the Active schedule’s batch id and course id.

**Expected:** `GET /api/student/{id}/schedule` returns that row only. A schedule on another batch is absent. `trainingDays` is null in this response (current behavior).

## 9. Batch edit does not change course defaults

**Steps:** Set an assessment date. Read `courses` duration and hour columns. Read other batches.

**Expected:** Only `batches.assessment_date` and one new `batchhistory` row when the date changes. Course rows unchanged. Student `batch_id` unchanged. There is no API to change batch start or end. Attempting to invent one is out of scope.

## 10. Transfer

**Expected:** No endpoint. `PUT` of a student batch is not available. Database `batch_id` stays. This scenario fails until a transfer feature exists. Do not update the column by hand on the shared database.

## 11. Course default while batches exist

**Steps:** Restart the app. Read the four courses.

**Expected:** Official labels from `CourseProgram` are on the course rows. Batch start and end are unchanged. Existing schedule rows are unchanged. Slot capacities are unchanged.

## 12. Redeploy

**Steps:** On a copy, set the current Active schedule Inactive, then set another Active.

**Expected:** Only one Active per course. Students whose batch matches see the new row. The Inactive row remains. Notifications added. Old notification rows remain.

## 13. Training not complete

**Preconditions:** Disposable student whose batch start plus program days is still today or in the future.

**Steps:** Open Documents. `POST` a request.

**Expected:** UI and `CreateAsync` refuse with “Document requests will become available after you complete your training.” No request row.

## 14. Training complete under the current rule

**Preconditions:** Batch start old enough that start + program days − 1 is before today. Bookkeeping uses 37 + 19.

**Expected:** Requests open. The release timeline still shows the batch end, which may be a different date. No attendance row is created.

## 15. Request an eligible document

**Preconditions:** Gate open. Course document not Released. No open request for that type.

**Expected:** New `document_requests` Pending. Student and admin notifications. Preparation status stays Not Prepared until staff upload.

## 16. Already released

**Preconditions:** `student_course_documents.preparation_status` Released for that type.

**Expected:** `CreateAsync` rejects. No new request.

## 17. Duplicate open request

**Preconditions:** Pending, Processing, On Hold, or Ready for Release already exists for that type.

**Expected:** Second create is rejected. Rejected history does not block a new request.

## 18. Process and release

**Steps:** Pending → Processing → Released through `PUT /api/document-requests/{id}/status`. Separately, on a copy, upload a course file (becomes Ready for Release) and call release.

**Expected:** Illegal jumps such as Pending → Rejected fail. Processing → Released succeeds. Course-file release sets the preparation row Released and the matching open request Released. `release_date` set on the request.

## 19. Notification

**Expected:** A `notifications` row for the student on each request status change. Email only when status becomes Released through `UpdateStatusAsync`. If SMTP fails, the request is still Released and the message contains `EMAIL_NOT_SENT`. Schedule notices are dashboard-only.

## 20. Reject and document archive

**Steps:** Pending → On Hold → Rejected.

**Expected:** Same request row, status Rejected, still in `document_requests`. It appears in the rejected list. It is not deleted. A new request for that type can be created later.

## 21. Graduate, withdraw, deactivate, dismiss

**Steps:** From Account Activation, deactivate four disposable students with Graduated, Withdrawal, Deactivated, and Academic Dismissal. One with Other and a sentence. One with Other and blank text.

**Expected:** Blank Other fails. Each success sets Inactive and one `archives` row. Login fails. Requests and schedules remain. Slot count still includes them. A second reason replaces the first on the same archive row (current behavior).

## 22. Archived history for staff

**Expected:** Archive list still shows name, course, batch name, and reason via joins. Schedules are still on `course_schedules` for that batch. Documents are still on the student. Staff can open them through the existing admin APIs. The student cannot sign in.

## 23. Deactivated login

**Expected:** `StudentLoginAsync` returns not active. No new `student_activity_logs` row.

## 24. Another student’s data

**Steps:** Sign in as student A in the browser, then call `GET /api/student/{B}/profile` and `GET /api/student/{B}/schedule` without a server session.

**Expected under current code:** Both succeed. This is F-01 and F-02. The test passes only when those calls start returning unauthorized. Do not copy the PIN out of the response into notes or tickets.

## 25. Server errors

**Registration:** Stop MySQL and submit. Expected: HTTP 500 JSON, database-unavailable message, no partial success the UI should treat as saved.

**Upload:** Send a `.exe` or an empty file. Expected: validation error, status unchanged.

**Transfer:** There is no transfer call to fail.

**Release:** Release with SMTP disabled. Expected: status Released, `EMAIL_NOT_SENT`, dashboard row present if the notification insert worked.

**Recovery:** Fix MySQL or SMTP. Retry the action. Do not delete the half-finished applicant if the row was committed.

## 26. Cross-module refresh

**Steps:** Activate an account. Open Students & Applicants and Account Activation. Confirm a slot. Open Document Management for that course and batch. Archive the student. Open Archive and try student login.

**Expected:** Activation shows Active immediately on the next GET. Students & Applicants still shows Confirmed Slot. Document board includes the student because the student row remains. Archive shows the reason. Login fails. Batch student counts include the archived row. Course capacity numbers do not decrease.
