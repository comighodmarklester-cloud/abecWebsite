# ABEC database repair plan

Created: November 7, 2026 (Asia/Manila)  
Status: **Planned — implementation has not started**  
Purpose: the working checklist to use before and during fixes to the audited database and the application paths that read or change it.

## 1. Scope and starting point

This plan covers **all 14 findings** in the [November 7 database audit](docs/qa/database-audit-2026-11-07.md), the additional database rules in that report, and the unresolved Azure configuration/storage/recovery checks. Some fixes belong in C# controllers, services, authentication, or storage rather than SQL. They remain in scope because they determine whether the database is protected and its records are dependable.

The plan preserves the current MySQL/EF Core architecture. A database rewrite, engine change, bulk reimport, or automatic reassignment of historical records is not required by the evidence.

The following are **audit-time observations, not permanent counts or assumptions to apply to production**:

| Item | November 7 baseline |
|---|---|
| Local database | `localhost:3306/abec_system`, MySQL 8.0.46, 18 application tables, 442 rows |
| Local declared foreign-key relationships | 16; no current orphans in them or the three additional checked relationships |
| Recorded Azure state | `abecdb01`; 18 application tables plus EF history, 19 foreign-key links; synthetic QA accounts present |
| Duplicate contacts | Four normalized groups affecting 11 applicants in local historical batch 1; seven extra records beyond one per group |
| Missing documents locally | Five of 31 referenced registration files; 27 total referenced files available across registration/request storage |
| Workflow review | One confirmed applicant without a student, three Released requests without request-file paths, 19 applicants without references |
| Historical scheduling | Four schedules marked Active in closed batches |
| Startup/schema | Local integrity upgrade blocked; local and recorded Azure schemas differ |
| Azure documents | Previous report says the 27 available files were packaged but not transferred; needs fresh verification |

Azure was not directly re-inspected during the audit. Refresh its schema, grants, configuration, file inventory, and data-quality counts before preparing Azure changes. Local and Azure are separate databases with remapped IDs and different records; they are not automatically synchronized.

Source material:

- [Full audit](docs/qa/database-audit-2026-11-07.md)
- [Shareable aggregate evidence](docs/qa/database-audit-evidence-2026-11-07.json)
- [Read-only SQL checklist](docs/qa/database-audit-readonly.sql)
- [Import history and outstanding uploads](docs/qa/local-to-azure-import-review.md)
- [Azure setup](docs/azure-database-setup.md) and [deployment review](docs/deployment-secret-review.md)

Older system-audit documents are historical references. Resolve conflicts using current code, fresh schema inspection, and accepted business rules. For example, current capacity code already filters the active batch; it should not be “fixed” back to counting every historical student.

## 2. How to use this file

Each work package has checkboxes, dependencies, and completion criteria. Assign an implementer and reviewer when work starts. Record verification evidence and the change/commit or migration identifier in the execution log at the end.

Use these states: **Planned → In progress → Ready for review → Verified**. Use **Needs decision** or **Blocked by access** only for the affected work; continue independent tasks. A code change alone is not verification, and a passing EF snapshot check is not proof that a live schema matches.

“Verified” requires the relevant tests, data-preservation checks, and environment checks below. Keep unresolved historical cases explicitly recorded rather than marking them repaired because a page loads.

This document is a plan. Creating it does not perform fixes, rotate credentials, change records, send mail, deploy software, or approve unresolved business-policy choices. Once implementation is requested, proceed with the authorized work and raise only the decisions or access gaps that actually affect the next dependent step.

## 3. Execution order

| Phase | Work packages | Required outcome before dependent work |
|---|---|---|
| 0. Establish a safe baseline | W00; prepare W12 recovery measures | Current inventories, protected/restorable backups, isolated test targets, and a list of unresolved business decisions |
| 1. Close exposed access paths | W01, immediate W02 containment; credential rotation preparation in W03 | Server-enforced identity/ownership; general APIs expose no PINs; legacy activation bypass is disabled or safely replaced |
| 2. Establish the canonical schema | W04, W05, W06; schema prerequisites from other packages | Reviewed data resolutions, reproducible upgrade/fresh-install paths, explicit delete rules, collations, and constraints |
| 3. Repair business workflows | Complete W02; W07, W08, W09, W10 | Safe onboarding, seat allocation, scheduling, document processing, historical behavior, event history, and completion/time rules |
| 4. Restrict and tune runtime | Complete W03; W11 | Restricted runtime credentials, verified encrypted remote connections, bounded queries, and measured index choices |
| 5. Prove recovery and release | Complete W12 and release checklist | Verified Azure configuration/files, coordinated restore, monitoring, staged rollout, and usable recovery procedure |

Dependencies are more important than phase labels. For example, restore rehearsals and secure credential rotation can begin early; final removal of DDL privileges follows removal of runtime schema upgrades. Schema changes required by activation or audit events belong in reviewed migrations, not ad hoc startup SQL.

## 4. Decisions to settle before dependent implementation

These are proposed defaults, **not already agreed product requirements**. Document the selected rule and its effect on existing data. Routine technical implementation can proceed without waiting for unrelated product decisions.

| Decision | Proposed direction | Affected work |
|---|---|---|
| Shared phone numbers within a batch | Confirm whether a shared family contact is valid. Enforce uniqueness only if that is the actual business rule; otherwise change the rule consistently and use another duplicate-review signal. | W04, W05 |
| Account onboarding | Registrar approval plus random, expiring, single-use activation, followed by password setup; preserve a supported transition for existing accounts. Decide token lifetime and delivery channel. | W02 |
| Occupied seat definition | Preserve the current inclusion of pending activation until explicitly decided otherwise. Decide whether archive/withdrawal releases a seat and which statuses reserve one. | W07, W09 |
| Active batch and schedules | At most one Active institute batch; allow zero between semesters if intended. Decide whether schedule Active means operationally current or historical last-known state. Scope schedule uniqueness accordingly. | W05, W08 |
| Completed-batch access | Historical records stay readable and protected from ordinary edits. Decide how authenticated alumni requests are processed after submission; preserve the intended historical-request exception. | W01, W07, W09 |
| Record deletion | Prefer deactivation and retained business history. Choose FK delete rules explicitly rather than copying Azure's cascades blindly. | W05, W10 |
| Training completion and release | Prefer explicit authorized completion evidence, including OJT where required. Decide whether calendar dates alone may open requests, and whether physical release without a digital file is valid. | W09 |
| Historical snapshots | Decide which registration details, course program, schedule, and completion facts must remain as they were at the time. | W09, W10 |
| Time and ambiguous old timestamps | UTC for event instants, Asia/Manila for business dates/display, DATE for true date-only fields. Establish the timezone provenance of old values before converting them. | W05, W09 |
| Recovery objectives | Set acceptable data loss and recovery duration, backup retention, storage durability, and restore frequency. | W12 |
| Privacy and test data | Define retention by data category and how QA accounts/synthetic contacts are excluded from operational messaging and reporting. | W10, W12 |

## 5. Work packages

### W00 — Baseline, isolation, and preservation

**Covers:** prerequisites for every finding.  
**Primary responsibility:** database engineer and application developer, with operations for Azure access.  
**Depends on:** no earlier package.

- [ ] Record the current Git state and preserve unrelated user changes. Identify running app instances and which database each actually uses without printing credentials.
- [ ] Refresh local and Azure metadata: versions, migrations, tables, exact counts, columns/defaults/nullability, generated expressions, keys, indexes, collations, delete rules, triggers, and checks.
- [ ] Refresh aggregate quality checks and file inventory using read-only SQL or a dedicated collector. Do not start the current web app merely to inspect data; startup and some GETs can write.
- [ ] Capture grants, TLS behavior, hosting settings, timezone, and network scope through authorized access. Record unavailable evidence explicitly.
- [ ] Back up each target database and its corresponding private files. Record checksums, time, retention location, encryption/access controls, and which database snapshot the file manifest belongs to.
- [ ] Restore a baseline into an isolated target before the first corrective migration. Disable outbound email and use synthetic recipients/accounts in tests.
- [ ] Establish separate fresh-install, legacy-upgrade, and Azure-like test databases. Keep private data and credentials outside tracked source and publish output.
- [ ] Create a private correction register containing environment, record IDs, original value, proposed value, reason, evidence, and authorization/provenance where necessary. Shared reports contain aggregates only.

**Done when:** each environment has a timestamped baseline and recoverable snapshot, test connections cannot accidentally point to production, and missing Azure access is recorded without treating historical evidence as current verification.

### W01 — Server authentication, authorization, and ownership

**Covers:** DB-01; actor attribution portions of DB-12.  
**Primary responsibility:** application developer; security/QA review.  
**Depends on:** W00; no schema cleanup required for immediate access protection.

Relevant code: `Program.cs`, `Controllers/*`, `Services/CourseHistoryRecorder.cs`, admin-ID checks in document services, and frontend API/session code.

- [ ] Inventory every endpoint: intended audience, authentication, role, ownership, file exposure, and whether it changes state. Include legacy routes, PDFs, uploads, notifications, bulk actions, and minimal endpoints in `Program.cs`.
- [ ] Implement authenticated Admin login/session and logout. Retain working Student authentication and define how Admin and Student sessions coexist or switch.
- [ ] Apply explicit Admin policies and a deny-by-default/fallback approach with a reviewed public-route allowlist. Do not accidentally make enrollment, public course lookup, or intentional token-link pages unusable.
- [ ] Bind student-specific reads/writes to validated Student claims. If staff can act on a student, require the Admin policy and log that actor.
- [ ] Remove `X-Abec-Admin-Id` and browser session JSON as authority for permissions or event actors. Update clients to use the actual authenticated session.
- [ ] Protect file/PDF downloads and ensure a supplied `studentId`, document ID, applicant ID, or header cannot bypass ownership.
- [ ] Define cookie lifetime, secure-cookie behavior behind the host/proxy, sign-out/revocation behavior, and handling of a deactivated account with an existing session.
- [ ] Add appropriate CSRF protection for cookie-authenticated state changes, review credentialed CORS, and apply authentication throttling to relevant login/activation attempts, including Admin login.
- [ ] Return consistent 401/403/404 behavior without exposing whether another user's protected record exists.

**Verification:** anonymous denial, wrong role, Student A accessing Student B, forged admin header, bulk mixed ownership, file/PDF routes, account deactivation, logout, and valid Admin/Student operations. Test public routes separately. No unauthorized test may change a record, file, or email queue.

**Done when:** all sensitive endpoints enforce identity and permission on the server, while intended public flows remain usable.

### W02 — PIN containment and safe account activation

**Covers:** DB-02 and plaintext credential compatibility in DB-12.  
**Primary responsibility:** application developer and database engineer.  
**Depends on:** W01 for secure delivery/admin operations; W05/W06 for new schema and removal of startup PIN rewrites.

- [ ] Immediately remove PINs and other reusable secrets from general profile/list/dashboard DTOs, logs, exports, and cached frontend session objects. Use a dedicated authorized activation delivery response if still needed temporarily.
- [ ] Disable or redesign public `/api/auth/register` so possession of a legacy PIN cannot independently activate an account.
- [ ] Stop generating authentication secrets from names, dates, or contact digits. Stop startup from rewriting existing student PINs.
- [ ] Introduce cryptographically random activation tokens stored as hashes, with expiry, owner, consumed/revoked timestamps, and single-use consumption in a transaction. Do not log token values.
- [ ] Define first-use password setup, existing-account transition, account recovery, reissue/revocation, and the supported behavior of old activation notices/links.
- [ ] Inventory credential formats privately in both databases. Remove plaintext password fallback only with a verified reset/migration path for any affected account.
- [ ] Ensure password hashes have one authoritative store. Coordinate removal of `usersettings.password`/duplicated username with W10 and compatibility rollout.
- [ ] Prepare a controlled revocation/reset plan for exposed PINs after secure onboarding is ready; avoid locking out all existing users without a recovery method.

**Verification:** expired/reused/revoked tokens fail; concurrent redemption succeeds once; guessed or another user's token fails; deactivated users cannot bypass staff policy; password login/recovery works; no secret appears in general API responses or logs.

**Done when:** onboarding no longer relies on a publicly exposed or predictable reusable PIN, and existing users have a tested transition path.

### W03 — Database accounts, secrets, and transport

**Covers:** DB-03; secret-handling and runtime configuration portions of DB-14.  
**Primary responsibility:** operations/database engineer.  
**Depends on:** W00 for inventories; W06 before removing DDL privileges from the runtime account.

- [ ] Prepare and execute rotation of the local password exposed in the audit tool transcript. Identify dependent tools/apps, update secure configuration privately, verify access, and retire the old credential. Never place the replacement in this document or command output.
- [ ] Inspect actual Azure privileges and connection configuration; do not infer privileges from an account name.
- [ ] Provision separate migration and runtime accounts, scoped to their jobs and application schema. Runtime gets only required table operations; no global administration, grant, FILE, or schema-change privileges.
- [ ] Move runtime secrets to development secret configuration or hosting secret settings. Keep local configuration/examples usable without real passwords; inspect tracked files, history, and deploy artifacts for exposures before deciding further rotations.
- [ ] Verify remote connections use encrypted transport and server identity validation (`VerifyFull` with the supported trust configuration). Test certificate failures; do not disable validation to make a test pass.
- [ ] Review firewall/private-network scope, allowed hosts, HTTPS/proxy handling, and access to secret configuration and private backup directories.
- [ ] Verify the app with the restricted account after startup DDL is removed; separately verify the migration account can run approved migrations.

**Done when:** the app works with documented minimum privileges, old exposed credentials no longer work, remote TLS/identity checks pass, and no secret is present in source/publish artifacts or shared evidence.

### W04 — Data-quality decisions and historical corrections

**Covers:** DB-04; historical exceptions in DB-09; QA/synthetic provenance in DB-14.  
**Primary responsibility:** database engineer with registrar/business review.  
**Depends on:** W00; relevant decisions in section 4.

- [ ] Privately classify the four local phone-duplicate groups. Determine whether records are valid shared contacts, accidental duplicates, test data, or incorrect details.
- [ ] Implement the accepted contact rule consistently. If uniqueness is retained, correct verified errors before adding normalized unique indexes. If shared contacts are valid, revise both application validation and database uniqueness design.
- [ ] Use one canonical contact/email normalization specification across C#, SQL generated keys, imports, and validation. Cover `09`/`+63`, allowed punctuation, case, whitespace, and invalid inputs; do not allow different layers to disagree.
- [ ] Preserve original values and record-level explanations privately. Do not merge applicants, invent contact details, delete history, or move batches to make validation pass.
- [ ] Review the confirmed applicant without a student and the three Released requests without file paths. Apply only evidence-backed corrections under the chosen lifecycle/release rules.
- [ ] Review the 19 missing application references. Define stable reference generation/backfill, uniqueness scope, legacy-year behavior, and collision checks without renumbering existing references or remapping IDs.
- [ ] Locate/recover the five missing registration originals or record their unavailable state. Coordinate with W07; never fabricate substitutes.
- [ ] Record QA identities and the Azure import's synthetic contact replacements so messaging/reporting can exclude or clearly identify them. Do not copy synthetic replacements back to local by assumption.
- [ ] Recheck current batch/account/archive consistency and valid status values; preserve legitimate historical differences and active accounts in closed batches according to policy.

**Verification:** rerun duplicate, missing-reference, ownership, status, and orphan checks; reconcile each correction to its private register; compare expected counts and mapped values. Unresolved legitimate cases remain visible with a reason.

**Done when:** every known exception is corrected with evidence or deliberately supported by the accepted business rule, and correction jobs can be safely rerun or refuse already-processed records.

### W05 — Canonical schema, constraints, and collations

**Covers:** DB-05, DB-10, and all additional database rules in the audit.  
**Primary responsibility:** database engineer and application developer.  
**Depends on:** W00/W04 preflight; accepted data/delete/status policies. Coordinate migration ownership with W06.

- [ ] Produce a reviewed schema-difference manifest for local, current Azure, the EF model/snapshot, and a fresh migration-created database.
- [ ] Define the canonical schema in the EF configuration/migrations, including intended generated columns, unique keys, defaults, precision, indexes, charset/collation, and legacy-column treatment.
- [ ] Reconcile the missing local relationships: student activity → student; course document → student; training room → course. Preflight orphans before adding constraints.
- [ ] Decide existence/ownership protection for course-document course/batch, schedule room, release actor, and related notification owners. Add appropriate FKs/composite constraints or service enforcement; do not assume an FK proves ownership.
- [ ] Align applicant/student batch rules. Make applicant batch required if the accepted lifecycle requires it, and choose a compatible delete policy. Test migration and history/import compatibility.
- [ ] Enforce at most one Active batch if adopted; allow the intentional zero-active state. Consider a generated nullable key/unique index suitable for MySQL rather than assuming filtered-index support.
- [ ] Enforce one current archive-state row per student, separate from append-only events. Evaluate a conditional key for one open request per student/canonical document type.
- [ ] Scope Active schedule uniqueness to the accepted course/batch policy. Do not use a simple unique start-time index as a substitute for overlap protection.
- [ ] Add appropriate checks for time/date ranges, nonnegative sizes/capacity, and other stable invariants after preflight. Choose one status-domain strategy across environments; avoid leaving local ENUM and Azure unconstrained VARCHAR behavior inconsistent.
- [ ] Decide how `batches.completed_at` is populated and mapped. Preserve existing values; do not remove the column merely because it is absent from the current model.
- [ ] Standardize collations after checking changed equality/uniqueness behavior. Test accents, ñ/Ñ, case, trimmed emails, room joins, and combined document reports.
- [ ] Review timestamp precision and DATE versus DATETIME semantics; coordinate old-value conversion with W09.
- [ ] Reconcile operational indexes and remove only demonstrated duplicates, preserving uniqueness and FK dependencies. Coordinate measured index design with W11.
- [ ] Baseline the occupied legacy database explicitly. Do not run `InitialCreate` over existing tables or mark history applied without proving equivalent schema.

**Verification:** apply migrations to both an empty target and restored legacy/Azure-like targets; compare resulting schema contracts and data invariants; verify orphan counts, required fields, uniqueness, delete restrictions, Unicode behavior, and existing-file ownership. EF model/snapshot agreement is an additional check, not the sole check.

**Done when:** fresh install and upgrade reach the intended compatible schema, every deliberate environment difference is documented, and no unexplained drift remains.

### W06 — Versioned migrations and safe application startup

**Covers:** DB-06; operational readiness portions of DB-05/DB-14.  
**Primary responsibility:** application developer and database engineer.  
**Depends on:** W05 schema design; W04 resolutions needed by individual migrations.

- [ ] Inventory every startup `CREATE`, `ALTER`, `UPDATE`, default seed, status normalization, course overwrite, and PIN rewrite. Classify each as migration, explicit maintenance action, first-install seed, or behavior to remove.
- [ ] Move schema changes and one-time data corrections into versioned migrations/jobs with preconditions, row-count expectations, clear failure reporting, and rerun/resume behavior.
- [ ] Keep first-install default seeding explicit and transactional where appropriate. Ordinary restarts must not overwrite program settings or credentials.
- [ ] Preserve the design-time DbContext factory's separation from web-app startup.
- [ ] Run migrations once through deployment tooling with the migration account; avoid multiple web instances racing through check-then-alter logic.
- [ ] Add schema/version readiness checks. Separate process liveness, database connectivity, and actual application readiness; report missing requirements accurately for local/Azure hosts.
- [ ] Replace swallowed upgrade errors with actionable failure evidence. Do not leak credentials or personal fields in diagnostics.
- [ ] Prepare forward-repair and restore procedures for partial DDL. MySQL schema changes cannot be treated as one rollbackable application transaction.

**Verification:** start the app repeatedly and concurrently against a supported schema; prove no unexpected DDL, credential rewrites, or catalog mutations. Start against missing/incompatible schema and prove readiness fails clearly without attempting hidden repairs. Verify normal boot with the restricted runtime account.

**Done when:** schema deployment is explicit and reproducible, and restarting the website has no hidden migration or business-data side effects.

### W07 — File storage, missing-document handling, and recovery

**Covers:** DB-08; file aspects of DB-09/DB-14.  
**Primary responsibility:** application developer and operations/database engineer.  
**Depends on:** W00; W01 for protected file access; W04 for historical resolutions.

- [ ] Reconcile references against files per environment using owner IDs and the correct storage root. Include registration, request, and course documents; also inventory unreferenced files without deleting them automatically.
- [ ] Recover the five missing originals if available; otherwise keep metadata/history and expose an explicit missing-file state and staff follow-up.
- [ ] Reverify the Azure upload package against the current destination mapping and expected file hashes/size. Transfer only through authenticated deployment/storage access and verify ownership and download permissions afterward.
- [ ] Choose durable private storage appropriate for the host, with explicit persistence across redeploy/restart/scale. Keep identity documents outside public static-file access.
- [ ] Stage new uploads before updating metadata; retain the previous object until the database commit succeeds. Clean staged/retired objects through an idempotent job with a retention window.
- [ ] Handle retries, duplicate submissions, cancellation, partial writes, and concurrent replacement so the database and file store can be reconciled.
- [ ] Separate “path recorded,” “file available,” and “released to student” states. A populated path alone must not claim availability.
- [ ] Add reconciliation metrics/reporting, private-storage backup/versioning, and coordinated database/file manifests.

**Verification:** simulate storage write failure, database save failure, missing file, replacement interruption, concurrent replacement, restore, and deployment persistence. Authorized users receive the correct document; unrelated students and anonymous callers are denied.

**Done when:** each required reference is available or explicitly accounted for, replacements do not lose the last valid file, and restore recovers usable documents with their owners.

### W08 — Scheduling correctness and closed-batch protection

**Covers:** DB-07.  
**Primary responsibility:** application developer with registrar/QA review.  
**Depends on:** W01; W05 for any added constraints; accepted schedule/history rules.

- [ ] Replace the ambiguous conflict response contract. A detected room/trainer conflict or validation failure must stop both create and update; propagate failures consistently.
- [ ] Validate room membership/availability and use room IDs as authority; keep display names synchronized or snapshot them deliberately.
- [ ] Evaluate recurring date ranges and training weekdays, primary and secondary trainers, and time overlap. Do not compare only the first class date.
- [ ] Define whether adjacent times may share a room/trainer and how replacement excludes only the intended old schedule.
- [ ] Apply the Active/closed-batch policy inside the service for create, update, replacement, and delete, including direct service callers. Prevent silent historical reassignment.
- [ ] Review the four Active schedules in closed batches; preserve their history and apply the accepted meaning of status rather than bulk deactivating without a policy.
- [ ] Scope the single-active-schedule guard consistently and protect concurrent scheduling with transaction/locking or another demonstrated mechanism.
- [ ] Preserve schedule history and authenticated actor information before destructive changes; decide whether operational deletion becomes retirement.
- [ ] Validate schedule date bounds against the accepted business rule, including future dates and year boundaries; keep error messages consistent with the actual rule.

**Verification:** occupied room, overlapping/nonoverlapping times, adjacent sessions, shared secondary trainer, different weekdays, multiweek recurrence, replacement, inactive schedules, closed-batch writes, and simultaneous conflicting submissions.

**Done when:** conflicting bookings cannot be saved through any entry point and historical schedules cannot be silently changed by ordinary operations.

### W09 — Transactions, capacity, document lifecycle, and time/completion rules

**Covers:** DB-09, DB-13; GET side effects, normalization, and copied-state consistency.  
**Primary responsibility:** application developer and database engineer, with registrar decisions.  
**Depends on:** W01; W05/W06 schema support; accepted seat, release, and completion rules.

- [ ] Make services own their business transactions, covering decision reads through writes. Cover API and HTML confirm/decline routes equally; remove reliance on MVC filters as the only transaction boundary.
- [ ] Allocate seats by locking a stable course/batch capacity record or another proven atomic mechanism. Apply the same occupied/reserved-seat definition to allocation, dashboard, capacity edits, waitlist, archive/withdrawal, and release.
- [ ] Ensure concurrent final-seat confirmations cannot overbook, and applicant uniqueness makes retrying confirmation idempotent.
- [ ] Define the transaction/state boundary for confirmation and student creation. Either commit the intended transition atomically or record a clear recoverable pending-enrollment state without misleading success.
- [ ] Add safe retries for selected transient/deadlock failures only around the entire idempotent business unit. Do not retry just the last save after side effects or lower isolation globally without proof.
- [ ] Keep network/email/file operations outside long database locks. Queue committed notifications through a durable outbox with deduplication, delivery status, retry limits, and safe test mode.
- [ ] Review all multi-save operations: registration/reference assignment, notifications, activation/archive, document release, batch switch, schedule replacement, and bulk status changes.
- [ ] Make GET/read endpoints free of business writes. Move lazy document-row creation and applicant expiration into explicit commands/jobs or make reads compute display-only state. Handle uniqueness races without leaving failed tracked entities pending.
- [ ] Preserve safe historical-request submission and define authorized staff processing after a batch closes. Do not let a general “view-only” guard strand legitimate alumni requests.
- [ ] Define one document lifecycle that distinguishes preparation, request status, file availability, physical release, and digital release. Reconcile legacy cases without inventing files or marking all course documents Prepared.
- [ ] Preserve existing reference numbers and make new reference generation atomic/idempotent under its agreed uniqueness rule.
- [ ] Adopt an injectable clock/time provider: UTC event instants and Asia/Manila business-date decisions. Preserve date-only fields; verify legacy timestamp provenance before backfill.
- [ ] Establish one training-completion authority including OJT. Align request eligibility and release timeline with it; decide attendance/scheduled-days treatment rather than adding calendar days by accident.
- [ ] Introduce stable/versioned course program identifiers and enrollment snapshots where needed; remove editable-name matching and startup overwrite as the historical authority.
- [ ] Separate editable current profile fields from registration snapshots. Keep age-at-registration and address components/full display address consistent with the selected policy.
- [ ] Add concurrency versions or conditional updates to sensitive concurrent configuration/profile/state edits so a stale screen cannot silently overwrite a newer change.

**Verification:** repeated/concurrent confirms, capacity reduction versus enrollment, batch switch versus write, partial save failure, mail failure after commit, retry deduplication, read-only GETs, expiry boundaries, Manila midnight, year transitions, OJT completion, and historical requests through release. Include two simultaneous users editing the same sensitive state.

**Done when:** all entry points preserve the same business invariants, retries do not duplicate seats/messages, and completion/deadline decisions have one documented source of truth.

### W10 — Trustworthy history and credential/data ownership

**Covers:** DB-12; historical preservation portions of DB-05/DB-13.  
**Primary responsibility:** application developer/database engineer with privacy/registrar review.  
**Depends on:** W01 for trusted actors; W05 for migration; W02 for credential transition.

- [ ] Remove duplicated password storage from `usersettings` using a compatible staged migration. Keep preferences separate from authentication data and reference the authoritative Admin identity.
- [ ] Add append-only lifecycle/security events with actor type/ID, entity type/ID, action, UTC time, correlation ID, reason, and necessary redacted before/after values.
- [ ] Record archive/reactivation as events while maintaining current archive state separately. Do not erase past reasons when reactivating or updating a current reason.
- [ ] Cover activation, credential changes, applicant decisions, confirmation/enrollment, capacity changes, batch switches, schedule changes, and document releases; include relevant authentication failures without storing submitted secrets.
- [ ] Reconcile FK delete behavior with retained audit history. Decide deactivation/pseudonymization/retention rules for accounts and personal data; do not cascade away the only business evidence by default.
- [ ] Preserve legacy audit entries honestly. Label imported/unknown actor information rather than fabricating an authenticated historical actor.
- [ ] Define retention, access, and purge procedures for identity uploads, email pickup copies, logs, backups, historical profiles, and test accounts. Minimize sensitive before/after payloads.

**Verification:** archive/update/reactivate preserves an event sequence, client headers cannot forge actors, failed/rolled-back business operations do not produce misleading success events, and audit access is restricted. Test retained history under each chosen deletion policy.

**Done when:** one authoritative credential store remains and history can explain relevant changes without depending on mutable current-state rows or caller-supplied identities.

### W11 — Query efficiency, indexes, and bounded workloads

**Covers:** DB-11.  
**Primary responsibility:** database engineer/application developer.  
**Depends on:** W05 canonical schema; stable business query semantics from W08/W09.

- [ ] Capture representative query shapes, query counts, EXPLAIN plans, latency, and expected data volume in an isolated workload. The current small-table scan is not itself a production performance incident.
- [ ] Add bounded pagination with stable ordering and maximum page size to growing lists. Keep exports explicit, authorized, and separately bounded/streamed.
- [ ] Replace per-item mapping queries and repeated dashboard counts with grouped aggregates/projections where practical. Return only needed fields.
- [ ] Replace full-batch contact loads with indexed canonical-key lookups under the accepted duplicate policy; keep database constraints as the final race protection where applicable.
- [ ] Review unnecessary `ToLower()` and substring searches; use agreed collation/normalized equality for exact matching and choose a measured search approach for contains queries.
- [ ] Evaluate, rather than blindly add, applicant batch/status/date, notification student/status/date, document queue status/date, and course-history course/date indexes with stable ID tie-breakers.
- [ ] Compare overlapping/duplicate indexes across environments, including Admin username and applicant batch/email pairs. Preserve required uniqueness/FK support before removing any index.
- [ ] Measure rows examined, query count, response time, write/index overhead, lock duration, and deadlocks. Set workload-specific targets before claiming an improvement.

**Done when:** growing endpoints have bounded work, representative query plans support the expected access patterns, and the chosen indexes show a measured benefit without weakening integrity.

### W12 — Azure verification, coordinated recovery, monitoring, and release

**Covers:** DB-14 and final operational verification of all packages.  
**Primary responsibility:** operations/database engineer and QA, with application developer support.  
**Depends on:** W00 backups early; completed applicable packages before production acceptance.

- [ ] Obtain authorized access to current Azure database settings, App Service configuration, and private storage; record any remaining access blocker specifically.
- [ ] Verify current schema/history, runtime grants, TLS, firewall/private access, HTTPS/proxy settings, timezone, secret configuration, backup retention/redundancy, encryption settings, and connection/pool limits.
- [ ] Confirm Azure uploads are available with correct ownership and access rules; do not equate database-import success with file-delivery completion.
- [ ] Set recovery point objective (maximum acceptable data loss) and recovery time objective (maximum acceptable outage). Configure database and file backups to meet both.
- [ ] Verify managed point-in-time restore where required, and confirm local binlogs/backups have off-host protection if they are part of the recovery design. Enabled binlogs alone are insufficient.
- [ ] Rehearse an isolated recovery of database plus files, run integrity checks, download selected recovered documents, and sign in synthetic accounts. Record actual recovery time and data-loss boundary.
- [ ] Monitor liveness/readiness separately; alert on failed migrations, schema drift, authentication anomalies, deadlocks, failed outbox delivery, unavailable files, pool saturation, disk use, backup age, and restore-check failures.
- [ ] Ensure logs/alerts omit passwords, tokens, PINs, private document paths, and unnecessary personal fields.
- [ ] Review and retire/disable QA accounts when appropriate; preserve synthetic-contact provenance and prevent accidental messaging to synthetic or unverified numbers.
- [ ] Update runbooks and stale audit/setup/account guides with final behavior and evidence. Keep historical reports intact but link the implementation result.

**Done when:** production claims are backed by current configuration evidence, a successful coordinated recovery, useful alerts, and the deployment/recovery checklist below.

## 6. Migration and deployment procedure

Use this procedure for each actual change set, scaled to its impact. Do not combine every work package into one large irreversible migration.

### Before applying a change

- [ ] State the problem, chosen policy, impacted tables/endpoints/files, dependencies, expected row changes, and rollback/forward-repair options.
- [ ] Refresh the target fingerprint and check for drift since the reviewed snapshot. Abort if preconditions no longer match.
- [ ] Restore the relevant backup into an isolated database and test the exact script/migration. Include both empty-install and legacy-upgrade checks when schema behavior changes.
- [ ] Review generated SQL for locks/table rebuilds, implicit commits, delete cascades, collation/unique collisions, data conversion, and retained-column compatibility.
- [ ] Verify data and file backups, suppression of migration-triggered outbound mail, and a maintenance/write-pause plan where concurrent writes would invalidate the correction.
- [ ] Use parameterized values and fixed/reviewed identifiers. No credentials or private record dumps in scripts, Git, command arguments, or shared logs.

### Apply and validate

- [ ] Prefer additive changes first, compatible application changes second, backfill/constraint enforcement next, and destructive cleanup only after compatibility is retired.
- [ ] Apply versioned migrations with the migration account and record migration ID/checksum/time/target. Treat each MySQL DDL step as potentially committed if a later step fails.
- [ ] Compare row counts, expected changed values, owners, generated references, foreign keys, duplicate groups, statuses, and file manifests against the change-specific assertions.
- [ ] Deploy compatible application code and verify using the restricted runtime account. Run targeted security/business smoke checks with synthetic accounts and controlled recipients.
- [ ] Observe readiness, error rate, locks, failed outbox items, and file access before expanding traffic or declaring success.

### If validation fails

- [ ] Stop the dependent rollout and capture sanitized failure evidence. Do not blindly rerun imports, disable FK checks, drop occupied tables, or start the old seeder to “repair” the target.
- [ ] Determine which schema steps committed and which data transaction rolled back. Resume only through an explicit preconditioned forward repair or a tested compatible rollback.
- [ ] Restore into a separate target when necessary and reconcile writes since the snapshot before cutover. Do not overwrite newer production work without accounting for it.
- [ ] Code rollback requires schema compatibility. Credential rollback must not restore an exposed credential; use a new replacement. File rollback must preserve/repoint to the last valid object.

## 7. Required verification matrix

Tests should demonstrate a business/security guarantee or migration safety, rather than merely reproduce the implementation. Use synthetic data and isolated targets for destructive/failure/concurrency cases.

| Area | Required scenarios | Evidence |
|---|---|---|
| Access | Anonymous, wrong role, wrong student, forged admin header, revoked session, file/PDF ownership | Route coverage and expected denial with no side effects |
| Activation | Expiry, replay, concurrent redemption, reissue, legacy bypass, recovery | Single-use behavior; no general secret exposure |
| Schema | Empty install, local legacy upgrade, Azure-like upgrade, partial migration recovery | Schema contract, migration history, unchanged required data |
| Data corrections | Phone formats/shared-contact policy, reference collision, historical exceptions, provenance | Private case register and sanitized aggregate comparison |
| Capacity | Parallel last-seat claims, duplicate confirm, withdrawal/archive, capacity edit, batch switch | No overbooking/duplicates; correct final states |
| Scheduling | Room/trainer overlap, recurring days, secondary trainer, adjacent times, replacement, closed batch, concurrency | Conflict denied; valid booking succeeds; retained history |
| Documents | File loss, DB failure, replacement failure, unauthorized download, physical/digital release, historical request processing | Correct availability/state and recoverable files |
| Time/history | Manila midnight, timezone-independent host, year boundary, OJT, profile/program edits, archive/reactivate | Stable eligibility and preserved historical facts |
| Performance | Representative volume, pagination, grouped counts, exact lookup, concurrent writes | Query counts/plans/latency and lock metrics against agreed targets |
| Recovery | Restore schema/data/files, recover latest required point, synthetic login/download | Measured recovery time/data-loss boundary and successful access |

## 8. Release completion checklist

- [ ] W00–W12 have verified evidence, or an explicitly documented deferred item with owner and impact. No unresolved Critical issue remains for public use with personal records.
- [ ] Actual local/Azure schemas match their supported contract; no hidden startup upgrade is required.
- [ ] No unreviewed deletion, batch reassignment, credential change, synthetic contact substitution, or fabricated document was used to clear a check.
- [ ] Sensitive APIs/files enforce server identity and ownership; routine responses contain no reusable authentication secret.
- [ ] Runtime privileges and remote TLS have been tested; exposed credentials have been replaced securely.
- [ ] Known data exceptions are resolved or truthfully represented under the accepted rules.
- [ ] All required documents are available or explicitly flagged; Azure file status is independently verified.
- [ ] Concurrency, scheduled recurrence, historical access, and completion/time rules have passed their targeted tests.
- [ ] Database plus file recovery meets the agreed objectives, and alerts/runbooks are usable.
- [ ] Application build, relevant automated tests, model/snapshot checks, schema comparisons, and targeted deployment checks pass. Record any remaining warnings rather than labeling them all clean.
- [ ] Final documentation identifies changes, migrations, remaining limitations, and environment-specific verification dates.

## 9. Audit-to-plan coverage

| Audit finding | Work packages |
|---|---|
| DB-01 — API authorization | W01 |
| DB-02 — exposed/predictable PIN and activation | W01, W02 |
| DB-03 — privileges, secrets, transport | W03, W06 |
| DB-04 — duplicate contacts block integrity upgrade | W04, W05, W06 |
| DB-05 — local/model/Azure schema drift | W00, W05, W06, W10 |
| DB-06 — startup upgrades and rewrites | W06, W02, W09 |
| DB-07 — schedule conflict/history protection | W08, W05 |
| DB-08 — missing/nontransactional files | W07, W12 |
| DB-09 — partial workflows and inconsistent lifecycle | W04, W07, W09 |
| DB-10 — mixed collations | W05 |
| DB-11 — query/index growth risks | W11, W05 |
| DB-12 — audit history and credential duplication | W01, W02, W10 |
| DB-13 — time/completion/history authority | W09, W10 |
| DB-14 — recovery and production operations | W00, W03, W07, W12 |
| Additional database invariants | W05, W08, W09, W10 |

## 10. Execution and decision log

No repair is marked complete by the creation of this file. Keep evidence sanitized and link private records by location, not by copying their contents here.

| Package | Status | Implementer / reviewer | Decision or change reference | Verification / remaining issue |
|---|---|---|---|---|
| W00 | Planned | Unassigned | — | Refresh inventories and backups |
| W01 | Planned | Unassigned | — | Server authentication/ownership |
| W02 | Planned | Unassigned | — | Activation and credential transition |
| W03 | Planned | Unassigned | — | Rotate exposed local credential; restrict runtime |
| W04 | Planned | Unassigned | — | Review data exceptions and contact policy |
| W05 | Planned | Unassigned | — | Canonical schema and upgrade paths |
| W06 | Planned | Unassigned | — | Remove runtime schema/data upgrades |
| W07 | Planned | Unassigned | — | Restore/flag files and safe storage |
| W08 | Planned | Unassigned | — | Conflict handling and history guards |
| W09 | Planned | Unassigned | — | Transaction/lifecycle/time consistency |
| W10 | Planned | Unassigned | — | Authoritative credentials and append-only events |
| W11 | Planned | Unassigned | — | Measured query/index improvements |
| W12 | Planned | Unassigned | — | Azure verification, recovery, and release |

| Date (Asia/Manila) | Decision / result | Reason and scope | Evidence / owner |
|---|---|---|---|
| 2026-11-07 | Repair plan created; no implementation started | Covers the November 7 audit and outstanding verification | This document |
