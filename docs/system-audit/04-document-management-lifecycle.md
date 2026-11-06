# 04 — Document Management Lifecycle

Three document families exist. They do not share one status column.

## Registration documents

Submitted with enrollment. Table `applicant_registration_documents`. Files under `App_Data/secure-uploads/applicants`. Types the product treats as applicant uploads: Transcript of Records, Honorable Dismissal, Certificate of Good Moral Character, Form 138, plus an identity file (`IdentityIdTypes`).

Staff list and download them from Students & Applicants. They are not in the student request catalog (`DocumentStatuses.ApplicantSubmittedDocuments` is excluded from requests). There is no approve/reject status on the file row. Staff reject or waitlist the **application**, not the file.

## Course documents prepared by ABEC

Table `student_course_documents`. Unique on (`student_id`, `document_type`). The four types (`DocumentStatuses.PostCourseCredentials`):

- National Certificate (TESDA)
- Payment Receipt
- Certificate of Completion
- Training Certificate

`CourseDocumentService.EnsureDocuments` inserts a Not Prepared row per type when the board or student page is read. It refreshes `course_id` and `batch_id` from the student. It does not reset a status that is already Ready for Release or Released.

Preparation statuses (`CourseDocumentStatuses`): **Not Prepared → Ready for Release → Released**.

- Upload `POST /api/course-documents/{id}/file` stores the file under `App_Data/secure-uploads/course-documents` and sets Ready for Release. Upload is not release.
- Release `POST /api/course-documents/{id}/release` sets Released, timestamp, and `released_by_user_id` when the admin header parses. It then finds one open request for the same student and same document type (Pending, Processing, On Hold, or legacy Ready for Release) and sets that request to Released. Rejected requests stay Rejected.
- Download of an unreleased file checks that `X-Abec-Admin-Id` matches a real admin row. A released file can be downloaded by that student id or by an admin. The check is the header and the query string, not a login session.

## What a student may request

`DocumentRequestService.CreateAsync` (`POST /api/document-requests/student/{studentId}`):

1. Document type must be one of the four credentials.
2. The student’s course document for that type must not already be Released.
3. `CourseProgram.RequestGate` must be open (batch start plus training days and OJT days). Otherwise the message is “Document requests will become available after you complete your training.”
4. An open request for the same type (Pending, Processing, On Hold, Ready for Release) blocks a duplicate.
5. Inserts `document_requests` with status Pending and notifies the student and the admin dashboard.

The student page hides the request button until the gate is open, disables it when a request is already open, and shows download when the course document is Released. The server checks the same rules. The page check is not the only gate.

## Request status machine (enforced on the server)

`DocumentRequestService.IsTransitionAllowed`:

| From | Allowed next |
| --- | --- |
| Pending | Processing, On Hold |
| Processing | On Hold, **Released** |
| On Hold | Processing, Rejected |
| Ready for Release (legacy rows only) | On Hold, Released |
| Released | none |
| Rejected | none |

Pending does **not** go to Ready for Release. Processing does **not** go to Ready for Release. Ready for Release is not a step the current admin request screen offers. The screen maps a stored Ready for Release request to the label Processing and still allows On Hold or Release, which matches the legacy transitions above.

`PUT /api/document-requests/{id}/status` rejects any other jump. On Hold stores a reason, or “Awaiting resolution.” if none was sent. Released sets `release_date`. Any other status clears `release_date`.

File upload on a **request** (`POST /api/document-requests/{id}/file`) is allowed only while the request is Pending. Files go to `App_Data/secure-uploads/document-requests/{request id}`. Upload does not change status.

Notifications:

- Every successful status change writes a `notifications` row for that student.
- If that insert throws and the status is Released, the API returns success with `NOTIFY_FAILED` and does not send mail.
- If the status is Released through this request endpoint and the dashboard row was saved, `EmailService.SendAsync` sends “ABEC document released: {type}”. Failure returns success with `EMAIL_NOT_SENT`. The request stays Released.
- Other request statuses are dashboard-only. No email.
- Releasing the prepared course file (`CourseDocumentService.ReleaseAsync`) writes one dashboard notification and does not call `EmailService`. A failure to save that notification is swallowed after the release is already stored. The matching open request is still set to Released.

Bulk status (`POST /api/document-requests/bulk-status`) applies the same transition rules and skips illegal rows. It does not send the per-row email path used by `UpdateStatusAsync`.

## Document Archive

There is no `document_archives` table. A rejected request remains in `document_requests` with status Rejected. The admin request UI treats Rejected as the archive list. Rejected rows are not deleted and are not moved. They do not block a future request: the duplicate check ignores Rejected (only open statuses block). A new request creates a new row.

Course-document preparation has no reject status and no archive table.

## Release deadline versus request gate

These are different on purpose.

- **Request gate:** batch start + (training days + OJT days) − 1, then the next calendar day opens requests. Bookkeeping uses 56 program days (37 + 19), not 37.
- **Release timeline:** `ReleaseDeadline.Compute(start, end, null)` so the saved batch end is “expected document release”. The program summary is displayed next to it. Assessment date is stored and shown. It does not replace either date. Nothing auto-releases or auto-rejects when a date passes.

## Who the record belongs to

A request row’s `student_id` points at `students`. The person is the applicant joined through `students.applicant_id` (name, email, course). The document is `document_requests.document_type` matched as text to `student_course_documents.document_type`. There is no public student-number field on the request card.

## Failure behavior

- Empty, oversized, or wrong-type files are rejected before save.
- Missing file on download returns an error from `OpenFileAsync` / `OpenReleaseFileAsync`.
- Re-uploading a request file replaces the stored path while status stays Pending.
- Releasing a course document twice is a second call on an already Released preparation row. The service sets Released again and looks for an open request. If none is open, the preparation row stays Released and no second request is created.
- Cancelling a request is not implemented. Staff can Reject only from On Hold, not from Pending or Processing. That is a real limit of `IsTransitionAllowed`.
