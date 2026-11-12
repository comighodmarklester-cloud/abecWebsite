# Full batch management verification — 7 November 2026

This follows the full eight-scenario batch management request and the earlier [SDD implementation](../batch-management-implementation.md) and [active-batch isolation correction](active-batch-isolation-2026-11-07.md).

## Verified ownership in the existing local database

The read-only [ownership inspection](batch-ownership-readonly.sql) was run against the configured local database without starting the application or its startup seed routines.

| Existing batch | Applicants | Students | Archives | Requests | Schedules | Registration documents | Course document records |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Batch2026-101, ID 1 | 24 | 6 | 1 | 8 | 7 | 31 | 15 |
| Batch 2026-A, ID 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Batch2026-102, ID 5, Active | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

No applicant lacked a valid batch. Student/applicant ownership, registration documents, requests, archives, schedules, course document enrollment/course ownership, and student/applicant notification links had zero detected conflicts or missing owners. No course document needed its batch inferred in this database. Existing relationships already associate the applicable legacy records with Batch2026-101; no reassignment was needed or performed.

Documents, requests, archives and activity retain ownership through their applicant/student foreign keys. Those parent enrollments are immutable across batches. Additional direct batch values, such as a course document's stored batch ID, must agree with that enrollment. Batch creation changes lifecycle metadata and creates a new group; it does not copy enrollments or deactivate/reactivate accounts.

## Root causes and final behavior

The remaining historical records on active pages came from unscoped server list and aggregation queries. An Active account was counted across batches, and an empty course release board could select the historical batch with the most students. The earlier correction addressed those operational reads. This deeper pass also found approval-email schedule lookup across batches, missing persisted batch links on student notifications, inconsistent handling of explicit batch selection on summary endpoints, and no general check that a supplied selected batch agreed with a record ID.

Operational reads now resolve the actual Active batch on the server. If none is active, they return empty batch data. Explicit history selection pins every relevant list and summary to that batch. Global course definitions, capacities, rooms, administrators and settings remain shared. Normal application queries do not hardcode the names or IDs of batches 101, 102 or 103.

The update additionally:

- Uses the applicant's own batch when preparing an approval email's training date. A missing current schedule falls back to that batch's start date rather than a previous cycle's schedule.
- Stores the relevant batch on new student/applicant notifications and rejects conflicting ownership links.
- Provides separate enrolled-student and ready-to-release counters, while retaining existing dashboard fields and layout.
- Checks an explicit selected-batch context against a record before reading it or performing write/file side effects. Applicant, activation, archive, student, schedule, notification, document and batch routes use the check. Authorization remains an independent server requirement.
- Rejects moving existing schedules or documents to a different enrollment/batch. Schedule creation, replacement and updates validate the active batch, preserve previous schedules, and use transactions for related writes and notices. A failed conflict check now stops the schedule operation.
- Adds a Reports batch selector using the existing filters and charts. Applicant, enrollment, demographic, document and archive sources share the selected batch. Occupancy is computed from that batch's students, rather than the active batch's course summary. The course configuration/schedule audit log is explicitly labeled as an overall history across batches.
- Sends Document Management's selected batch with its record API calls, so the server can reject stale or mismatched context.
- Refreshes the dashboard after lifecycle changes and refreshes other open operational tabs when the active batch changes. Historical report/document selections keep their explicit batch IDs when refreshed.

## Files changed for the deeper correction

| Area | Main files and purpose |
| --- | --- |
| Selected batch protection | `Services/BatchContextFilter.cs`, `Program.cs`: register and run the record/context check before action side effects |
| Ownership rules | `Data/BatchIntegrity.cs`: immutable schedule ownership, course document/student consistency, notification ownership validation |
| Dashboard and summaries | `DTOs/ResponseDtos.cs`, `Interfaces/IServices.cs`, `Services/ApplicantService.cs`, `ActivationService.cs`, `DocumentRequestService.cs`, `CourseService.cs`: scope summaries and course registries consistently, expose additional counters |
| API contracts | `Controllers/AdminController.cs`, `ApplicantController.cs`, `ActivationController.cs`, `DocumentRequestController.cs`, `CourseController.cs`: honor optional selected batches and keep aggregate dashboard reads on one resolved batch |
| Approval and notifications | `Services/ApplicantService.cs`, `NotificationService.cs`: batch-correct schedule lookup and notification links |
| Schedule workflow | `Services/ScheduleService.cs`: active-batch validation, transactional writes, same-batch replacement and conflict handling |
| Reports and document UI | `wwwroot/js/abec-reports.js`, `abec-documents.js`, `Views/Admin/Reports.html`: explicit report scope and selected-batch record requests |
| Lifecycle refresh | `wwwroot/js/abec-admin.js`, `abec-dashboard.js`, admin HTML asset references: refresh stale operational tabs and load new script versions |
| Overall audit history | `Views/Admin/CourseManagement.html`: label shared course/schedule audit history across batches |
| Verification | `scripts/BatchVerification/Program.cs`, this report and `batch-ownership-readonly.sql` |

The existing uncommitted SDD/isolation work remains in place, including `Data/BatchReadScope.cs`, the lifecycle migration, batch access/write guards and historical document workflows. Unrelated pre-existing edits were preserved.

## Eight requested scenarios

The expanded harness passed **225 integration checks** using disposable databases and synthetic accounts/files. The test fixtures use Batch2026-101, Batch2026-102 and Batch2026-103 names only inside those isolated databases. Release build/publish succeeded, EF reported no pending model changes, all 65 JavaScript syntax checks passed, and HTML inspection found no missing literal HTML references or duplicate IDs. The three previously known Leaflet CSS image references remain outside this correction.

| Requested test | Result and evidence |
| --- | --- |
| 1. Existing records | Read-only local audit confirms the actual records already belong to 101 and have consistent relationships. Migration tests preserve IDs, enrollment links, completion history and released paths. |
| 2. Empty new active batch | The harness activates 102 and checks all operational lists and counters are empty while global courses remain available. It also verifies no-active-batch behavior. |
| 3. New registration | Registration service assigns a new applicant to 102; its pending and total counts increase, and 101's applicant count stays unchanged. Cross-batch contact reuse remains supported. |
| 4. Applicant enrollment | Actual approval, slot confirmation, idempotent manual add-to-slot, activation, deactivation and reactivation services are exercised. Enrollment stays in 102; pending activation and enrolled counts change only for 102. Deactivated accounts are excluded from pending activation; historical archives/account state and PINs stay valid. |
| 5. Training schedule | Actual schedule creation uses a reusable room/trainer while the previous schedule remains historical. A previous schedule ID cannot be used as the new batch's replacement; an existing schedule cannot be moved to another batch. |
| 6. Historical records | Explicit service and HTTP batch selections return previous applicants, students, archives, documents and summaries. Original released file bytes remain downloadable by their owner. |
| 7. Future batch | Actual creation/activation of 103 starts empty. IDs, ownership, account status, PINs and file metadata in 101/102 remain unchanged. New registrations enter 103, and neither prior schedule becomes current. |
| 8. Cross-batch protection | Real HTTP wrong-batch reads, applicant writes, mixed-batch bulk updates, document eligibility writes and file access are rejected. A schedule's body batch ID cannot reassign it. Correct historical access and original record values remain valid afterward. |

The harness also exercises unauthorized/student ownership cases, forged admin headers, eligibility rules, historical document release, unread badge counts, normalized contact constraints and fresh/legacy migration paths. Failed migration preflight on unverified ownership or duplicate contacts makes no permanent schema changes.

```powershell
dotnet build "ABEC System.csproj" --configuration Release --no-restore
dotnet run --project scripts/BatchVerification/BatchVerification.csproj --configuration Release --no-restore
dotnet ef migrations has-pending-model-changes --project "ABEC System.csproj" --configuration Release --no-build
```

## Configuration, migration and release limits

Hash comparison against the beginning of this deeper pass confirmed no changes to `appsettings.json`, `appsettings.Development.json`, `appsettings.json.example`, `web.config`, `Properties/launchSettings.json`, or the existing `ABEC System.csproj`. Connection strings, credentials, server endpoints, deployment settings and application environment configuration were left unchanged. Temporary test processes receive isolated test database configuration without editing these files.

No migration or data correction was applied to the actual local/Azure databases during this pass. This deeper correction adds no further schema migration. The earlier SDD's `20261107092514_BatchLifecycleDocuments` migration is still required before deploying the complete updated application; see the [migration guide](../batch-management-implementation.md). The existing local database has no EF baseline, so it needs the documented reviewed standalone SQL route rather than InitialCreate over existing tables.

Historical normalized phone duplicates remain a preflight blocker: the read-only inspection confirmed **four groups affecting eleven records**. They need verified source information to resolve while preserving the correct contact details. The migration intentionally stops instead of inventing new contact values or reassigning people. Null legacy applicants also stop preflight until their ownership is verified; the inspected database has none.

Rendered browser, responsive layout and cross-tab interaction checks remain pending because browser automation was unavailable during the implementation session. SMTP delivery was simulated/disabled in the isolated tests; no email/deployment configuration was changed. Previously missing legacy upload objects are not recreated by this change. Available file contents and released metadata are preserved by the tested lifecycle/migration paths.

Replace/restart the running application with the updated build only after its required schema upgrade has passed. The updated code has not been deployed to the hosted application as part of this task.

## Follow-up: reported errors

The historical phone migration blocker and missing Leaflet assets were addressed after this report. The current result is 230 passing integration checks, with a preservation exception for verified completed-history phone conflicts and full duplicate protection for new batches. See [the follow-up report](batch-migration-errors-2026-11-07.md) for the restored-backup rehearsal, changed files and remaining deployment steps. Earlier blocker statements above describe the state before that correction.
