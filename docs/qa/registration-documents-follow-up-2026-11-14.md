# Registration validation and document follow up

The existing ASP.NET Core / EF Core / MySQL registration workflow now accepts five credential types, including Birth Certificate (PSA). Missing credentials must either have a validated PDF or an explicit Follow up selection. Valid ID remains required. The legacy JSON-only registration endpoint is unchanged.

## Implementation

- `Views/Home/LandingPage.html`, `wwwroot/js/abec-landing.js`, and `wwwroot/js/abec-enroll-wizard.js`: Not Applicable wording, DOB/email validation on blur or submission, strict calendar validation, automatic age clearing/calculation, smaller Brgy. prefix, and blank ZIP with no placeholder/helper. Existing age eligibility and ZIP validation remain enforced.
- Document indicators remain hidden until upload interaction or an attempted document-step continuation. Only absent credentials show Missing and Follow up. Follow-up selections appear in the review and multipart payload; uploading that credential clears its selection.
- `ApplicantRegistrationDocument`, request/response DTOs, and `ApplicantRegistrationStorageService`: reuse the existing private document table/storage. Pending rows have `is_follow_up = 1`, no filename/path/bytes, and no download. Uploads retain signature/size checks and canonical filenames. Actual uploads override follow-up selections. Later admin uploads update the same pending row, preserving its document ID.
- `ApplicantService`: validate documents before creating an applicant, then save enrollment and document metadata in one transaction. Invalid submissions do not leave a partial applicant record. Confirmation email remains after commit.
- `ApplicantController` and `BatchWriteFilter`: authenticated admin multipart follow-up uploads use the service's own transaction; existing batch ownership, active-batch and archived-record restrictions remain in place.
- `abec-documents.js`, `abec-profile-details.js`, and `abec-add-applicant.js`: PSA is included in admin document reviews and registration profiles; pending records show Pending (Follow up), without a fake download or an uploaded count. Admins can upload a pending PDF from Documents. Historical batches remain read-only.
- Shared document/responsive CSS and affected asset references retain the existing design, with a keyboard-accessible upload control that fits narrow cards.
- Registration body limits in the existing constant and IIS `web.config` allow five credentials plus one ID at the existing 100 MB per-file limit. Deployment workflow, hosting connections, SMTP configuration, credentials, and database connection settings are unchanged.

## Database upgrade

The project's existing guarded startup schema upgrader adds only:

```sql
ALTER TABLE applicant_registration_documents
  ADD COLUMN is_follow_up TINYINT(1) NOT NULL DEFAULT 0;
```

`DbSeeder` checks column existence before using the code-owned `SchemaUpgradeSql` statement. Existing uploaded rows receive false; no existing files, applications, enrollments, or credentials are rewritten. Repeated startup preserves uploaded and pending rows. No additional table is created. `uploaded_at` on a pending row records when the pending submission was saved; it is replaced by the actual upload timestamp when supplied.

## Verification

- Release build: zero warnings/errors.
- `--registration-documents-only`: 36 isolated database and real local HTTPS checks, including PSA multipart submission, follow-up persistence, invalid/duplicate prevention, authorized later upload/download, rejected anonymous access, archived/completed guards, and repeated startup preservation. Synthetic files/accounts; email disabled.
- `scripts/check-registration-updates.cjs`: 55 browser checks at 1366 px and 390 px, covering partial native dates, invalid dates, age reset, email timing, blank ZIP, aligned Brgy., initial/remaining Missing indicators, follow-up continuation/submission, PSA upload, state reset, and admin pending-to-uploaded refresh. Synthetic APIs only; screenshots under ignored `artifacts/registration-ui`.
- Existing registration loader/retry/privacy checks and strict account/upload security checks remain in place. The full batch/enrollment/HTTP regression harness verifies the surrounding workflows.

No real applicant submission, external email, or production credential change is part of these tests.
