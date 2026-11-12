# Batch management implementation and rollout

Specification: [batch-management-sdd.md](batch-management-sdd.md). Implementation date: 7 November 2026.

Latest complete review: [full batch management verification](qa/batch-management-full-verification-2026-11-07.md), including the eight requested scenarios, verified existing ownership, modified files, configuration protection and remaining release prerequisites.

## Behavior delivered

Completing a batch records `completed_at` and changes its status to `Completed`. Opening its records in Document Management only changes the selected view. It never activates the batch. Applicant, student, archive, assessment-date and schedule changes remain blocked for completed batches. Authorized admins can still prepare, process and release their documents. New batches retain no previous batch's applicants or students.

Registration checks email and phone independently within the active batch. Email is trimmed and case normalized; Philippine international phone notation is normalized to its local equivalent. Generated database keys enforce the same per-batch uniqueness for concurrent submissions. A contact used in another batch can be reused. A database constraint also prevents two batches from being active simultaneously.

Repeat enrollment also preserves globally unique student PINs: activation and startup standardization reserve existing historical PINs instead of assigning a conflicting standardized value to the new enrollment.

Document Management defaults to the active batch, supports explicit historical selection, and uses a server-filtered batch snapshot for applicants, enrolled students, archived students, registration documents and requests. The Batches menu shows red unread document counts. Opening a request or marking its notification read updates the count. Request creation, status updates, uploads and course-document releases carry batch and affected-record identifiers.

Students see their enrollment's batch name and the completion message. Completed students retain Documents and their released downloads; their Training Schedule link is hidden, the schedule API returns 403, and directly opening its HTML page redirects to the dashboard. File downloads check server-issued identity and record ownership. Client-supplied student IDs or admin headers do not grant access.

Each of the three document cards has its own request eligibility and guidelines confirmation. The server checks eligibility again when accepting a request, including existing open requests and already released documents. Existing request processing and file storage are reused. Viewing a student's document catalog no longer inserts document records.

## Registrar verification

The existing application has no reliable per-student fees-paid or training-and-assessment completion record. Batch dates and batch completion cannot establish those facts. The implementation adds `student_document_eligibility` with separate verification timestamps and an admin activity entry.

In **Document Management → select batch → open the student's record**, an admin records:

- All required fees paid: enables a Payment Receipt request.
- Required training complete **and** assessment complete: together enable a Certificate of Completion request.
- An unreleased TESDA National Certificate needs neither of those attestations.

No legacy student is automatically marked paid or individually complete. Existing released files remain downloadable regardless of these new attestations. Verification is an administrative attestation, not a payment gateway or attendance tracker. The server rejects student self-verification. Archived students remain available to admins for document processing; existing account-status rules still determine student sign-in access.

## Database changes and preservation

Migration: `20261107092514_BatchLifecycleDocuments`.

- Adds completion timestamps where missing and converts legacy `Closed` to `Completed`.
- Preserves known completion dates. Where available, derives missing dates from existing `Batch Completed` or `Moved to Batch History` events; unknown dates remain null.
- Adds a generated unique active-batch key and normalized email/phone keys scoped to `batch_id`. Superseded single-column global email/phone unique indexes are removed only after their replacements exist.
- Creates the initially empty eligibility table and batch/document links for notifications.
- Recovers null course-document batch IDs from the student's existing enrollment. Conflicting document batch/course ownership stops preflight for human review.
- Keeps enrollment IDs, applicant IDs, student IDs, requests, released paths and stored files. Neither migration route deletes records or relocates uploads.

Preflight rejects unassigned applicants, mismatched student/applicant batches, conflicting document enrollment, multiple active batches, duplicate normalized emails, and duplicate normalized contacts in any unfinished batch **before permanent schema changes**.

Shared phones already present in completed history are preserved. The migration records `legacy_contact_conflict=1` only on the additional historical applicants sharing a normalized phone in the same completed batch, keeping the lowest applicant ID indexed. Those additional records receive a null generated contact key; their original phone, identity, enrollment and batch remain unchanged. This is preservation metadata, not a corrected phone value. It is never exposed as an editable request field. Application writes cannot add or change an exception, and historical enrollment records remain read-only. New records default to no exception and retain database-level normalized uniqueness per batch. Email conflicts and unresolved ownership still require verified source information.

The local snapshot contains four historical phone groups affecting eleven applicants. A restored-backup rehearsal preserved all original contact values and recorded seven redundant historical exceptions. See [migration blocker verification](qa/batch-migration-errors-2026-11-07.md). The runtime schema updater now uses the same guarded statements as EF and standalone SQL, preventing startup from retaining the old duplicate-phone failure.

The preflight check error names `abec_batch_sdd_resolve_data_before_upgrade`; the failing statement identifies the category. Do not bypass ownership/active-contact checks, invent replacement contacts, or remove people to satisfy an index.

## Deployment steps

1. Back up the target database and the application's private upload storage (`App_Data`, including registration and released files). Verify that the backup can be restored. Pause application writes during the upgrade.
2. Confirm the intended database privately through deployment configuration. Never paste connection strings or passwords into tickets, command output or this document.
3. Choose the route below based on the target's actual migration history. Upgrade the database before starting the new application build.
4. Deploy the Release build, resume the application, and sign out/in as admin. The updated workflows require a server-issued session cookie; old session-storage data alone is insufficient.
5. Check batch counts, completion dates and representative released downloads against the backup, then perform the browser checklist below.

### Databases already managed by EF migrations

For example, the previously inspected Azure import recorded `20261107031554_InitialCreate`. Verify that history on the target before proceeding. Supply its connection through your existing private configuration or secret environment variable `ConnectionStrings__DefaultConnection`.

```powershell
dotnet build "ABEC System.csproj" --configuration Release
dotnet ef database update 20261107092514_BatchLifecycleDocuments --project "ABEC System.csproj" --context ApplicationDbContext --configuration Release --no-build
```

A fresh empty database can use the same command; EF applies InitialCreate followed by this migration.

### Existing manually created databases without EF history

The previously inspected local schema had no EF history. **Do not apply InitialCreate over its existing tables.** Use the reviewed standalone [BatchLifecycleDocuments.sql](../Migrations/BatchLifecycleDocuments.sql) in MySQL Workbench or an equivalent client:

1. Select and verify the intended schema (`SELECT DATABASE();`). The script intentionally does not hardcode a database name.
2. Execute the whole script in **one connection/session**, stopping on the first error. Temporary tables and prepared statements require the same session. Do not use a client's “continue on error” or `--force` option.
3. Inspect the resulting schema and record deployment completion. This route does **not** insert or fabricate EF migration history. Establish a reviewed EF baseline separately before future history-driven upgrades.

The SQL and EF migration share the same upgrade statements. Both tolerate already present compatible columns/indexes and were exercised repeatedly. MySQL DDL commits implicitly: if an unexpected error occurs after preflight, leave writes paused, inspect the failure, then repair and rerun the idempotent upgrade. There is deliberately no automatic destructive `Down`; recovery uses a verified backup or a reviewed forward migration.

**No upgrade has been applied to the existing local or Azure data as part of implementation.** All database mutations used disposable test databases.

## Acceptance verification

Initial SDD verification on 7 November 2026: **99 integration checks passed**. The Release publish succeeded, EF reported no pending model changes, and all 65 JavaScript syntax checks passed. The HTML inspection found no missing literal HTML references or duplicate IDs. `git diff --check` found no whitespace errors. Rendered browser verification remains pending as described below. See the [active batch isolation correction](qa/active-batch-isolation-2026-11-07.md) for the subsequent fix to operational dashboard/list defaults and its additional verification.

The repository harness is [scripts/BatchVerification/Program.cs](../scripts/BatchVerification/Program.cs). It clones schema only into randomly named local test databases, creates synthetic accounts and files, disables outgoing mail, runs the checks, and removes its test databases/files. It refuses an unexpected source host/database.

```powershell
dotnet run --project scripts/BatchVerification/BatchVerification.csproj --configuration Release --no-restore
```

| SDD criterion | Automated coverage |
| --- | --- |
| 1. Completed records stay readable and general writes are rejected | Historical snapshots; applicant create/edit, student deletion, assessment and schedule guards; real HTTP completed applicant write rejected; reopening preserves status/date |
| 2. New batch starts empty | Applicant/student/archive/request snapshot counts before creating new records |
| 3. Contacts unique per batch | Cross-batch registration reuse, separate email and normalized phone rejection, direct database unique-index checks |
| 4. Selected-batch isolation and completed processing | Snapshot isolation, notification batch/request links, exact unread increment/decrement, other-batch count isolation, historical upload/process/release |
| 5. Student batch identity, documents and schedule access | Dashboard profile and empty completed schedule, active schedule access, real cookie-authenticated HTTP denial/redirect, owner-only download and unchanged released bytes |
| 6. Individual request rules | TESDA independent eligibility; unpaid receipt denial; training without assessment denial; completion status/date alone insufficient; duplicate/open/released requests blocked |

Migration checks cover a populated InitialCreate database, active-contact duplicate preflight failure before permanent DDL, subsequent successful EF upgrade, completion-history preservation, released metadata preservation, null document-batch recovery, empty eligibility and migration history. Separate repeated standalone upgrades exercise the manually managed schema route.

Additional checks cover repeat-enrollment activation without a historical PIN collision, historical sign-in after application startup, and batch-linked notifications for bulk document updates.

JavaScript syntax and literal HTML references are checked separately. The matching Leaflet 1.9.4 images and license were restored in the follow-up correction; static inspection now reports no missing CSS image references.

### Browser checks still required

The browser automation host was unavailable in this environment. Actual rendered UI behavior is **not** marked verified by the service/HTTP tests. Before release, use active and completed fixtures to check:

- Open Document Management with no batch parameter: active batch selected. Select a completed batch and navigate applicant, enrolled and archived views; only that batch appears and general mutation controls remain disabled.
- Submit an eligible request as a completed student. Observe a red badge on the correct batch, open/mark the notification read, and confirm only that unread count decreases.
- Prepare, process, upload and release in the completed batch; reopen it and confirm status and completion date stay unchanged.
- Sign in as an active student: batch name and Training Schedule visible. Complete the batch, refresh: completion message visible, navigation/schedule tiles hidden, direct schedule access denied, Documents still available.
- For each document, check blocked reasons and eligibility changes after registrar verification. Click its own request button; verify existing guidelines appear before submission. Confirm the general Request New Documents section is absent.
- Open and download representative released request files and course documents from both batches; check a different student's account cannot access them.
- Check desktop and narrow-screen layouts, dropdown badge placement, modal focus/close behavior and browser console errors.

Frontend references to changed scripts/styles include a new version token so browsers fetch the updated workflow.

## Limits

This implements the batch/document SDD; it does not complete every item in the separate database and all-around audit plans. Previously missing legacy upload files are not recreated by a schema migration. Replacement uploads retain the previous stored object instead of deleting it before the database change commits; storage cleanup/retention policy remains a separate operational task. A batch completion announcement does not certify an individual's payment, attendance or assessment result.

## Follow-up error correction

The historical-contact migration blocker and startup updater divergence were corrected after the 225-check pass. The expanded suite now passes **230 checks**, including immutable historical exceptions and direct database duplicate rejection for a new batch. Follow the deployment sequence above; no connection or deployment configuration change is required. The running local Debug application was left intact, and the real source schema has not been upgraded during this correction. Stop it before applying the reviewed upgrade and restarting the updated build.

## Local application update ? 8 November 2026

The corrected upgrade has now been applied to the local database after a fresh restore-tested backup and private upload backup. The updated Debug app was rebuilt and started on the existing port 5188. Batch2026-101 retained 24 applicants and 6 students with original contact values; active Batch2026-102 has zero batch-specific records. All 230 integration checks passed again. This supersedes earlier statements that the actual local schema remained unmodified. No hosted/Azure upgrade or configuration change was performed. See [local activation evidence](qa/batch-102-local-activation-2026-11-08.md).
