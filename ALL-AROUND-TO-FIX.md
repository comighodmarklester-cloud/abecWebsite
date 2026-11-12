# ABEC all-around system repair plan

Created: November 7, 2026 (Asia/Manila)  
Status: **Planned — no repairs applied by this audit**  
Purpose: master implementation checklist for the backend, frontend, business processes, security, database, integrations, deployment, and operations.

## 1. Assessment and how to use this plan

**The application has a usable foundation but is not ready for unrestricted production use with personal records.** Access control and email-configuration exposure are immediate concerns. Correct business transactions, supported runtime, safe documents, and reliable recovery are also release requirements.

Read the [full system audit](docs/qa/system-audit-2026-11-07.md) for understandable explanations, source evidence, severity, and limitations. Its 21 findings are identified as SYS-01 through SYS-21. This plan includes every one, all 14 previous database findings, and the areas that still need live/browser verification. It does not claim every possible defect has been discovered.

This file is the **master roadmap**. [DATABASE-TO-FIX.md](DATABASE-TO-FIX.md) remains the detailed database subplan with packages W00–W12. Carry out each mapped database task once and link its evidence in both logs. Do not run two competing correction/migration efforts. If a business decision changes, update both affected plans before implementing that decision.

Use **Planned → In progress → Ready for review → Verified**. Record implementer, reviewer, change/migration reference, environment, and test evidence. “Verified” means the acceptance checks passed; it does not mean only that code was written. Isolate items needing product decisions or external access and continue unrelated authorized work.

Creating this plan does not authorize or perform deployment, production data corrections, secret rotation, mass email, account deletion, or historical reassignment. When implementation is requested, proceed within the authorized scope and raise only the specific decisions/access gaps that block dependent work. Preserve unrelated user changes.

## 2. What the audit established

| Evidence | Result / boundary |
|---|---|
| Current source | 20 controller files, 92 HTTP-action attributes, 25 service files, 27 application JS files, 21 HTML pages |
| Access control | Only StudentAccountController has an authorization attribute; no fallback policy; Admin login has no authenticated Admin session |
| Syntax | 65/65 application/extracted-inline JavaScript syntax checks passed |
| Static pages | No missing checked literal HTML asset/page targets or duplicate static IDs; three Leaflet CSS image references missing |
| Client reliability | Mocked lost-response POST executed twice; standard validation ProblemDetails lost its message |
| Publish | Release publish succeeded; 309 files and 21 HTML pages; checked local settings/private paths excluded |
| Dependencies | Current NuGet query reported no vulnerable entries; this does not certify the hosted runtime, browser/CDN assets, native libraries, or unknown issues |
| Prior local DB audit | 18 tables, 442 rows, existing FK checks clean; duplicate contacts, workflow exceptions, schema drift, and missing files remain in the database subplan |
| Production/browser coverage | Current Azure configuration/storage, authenticated browser journeys, accessibility/mobile rendering, email delivery, load, and full recovery were not newly verified |

The web application was not booted against business data during this system audit because startup changes schema/data. No real registration, upload, status change, email, or exploit test was submitted. Helpers/build outputs are under ignored `App_Data/system-audit/`.

**Time-sensitive:** the project and CI target .NET 8, whose support ends **November 10, 2026**, three days after this plan's date. Prioritize A14 immediately alongside access containment; validate a compatible supported target rather than blindly changing versions. See [Microsoft's notice](https://devblogs.microsoft.com/dotnet/dotnet-8-9-end-of-support/).

**Documentation correction:** the current Student schedule service filters by course/Active status, but not by Student batch, and omits training weekdays in the mapped response. Older descriptions claiming that batch filtering already occurs are superseded by the current system audit.

## 3. Severity and implementation phases

| Priority | Meaning | Initial work |
|---|---|---|
| Critical | Exposes privileged operations or authentication secrets | A01 authorization, A02 PIN/activation containment, A03 email-settings/configuration protection |
| High | Can compromise workflow correctness, availability, privacy, deployment safety, or recovery | A04–A10, A14–A16 and their database prerequisites |
| Medium | Reporting, growth, frontend, maintainability, and validation gaps | A11–A13, A17; elevate specific failures if testing shows greater impact |

| Phase | Packages | Exit condition |
|---|---|---|
| 0. Baseline and preservation | A00; early A16 backup/access inventory | Correct environment targets, recoverable baseline, isolated test mode |
| 1. Contain security exposure | A01, immediate A02/A03/A04 work; A14 starts now | Server-controlled access/configuration; no routine PIN disclosure; bounded exposed inputs |
| 2. Stabilize foundation | A02/A03 completion, A05, A06, A14 | Supported compatible runtime, consistent session/API contracts, explicit schema upgrades |
| 3. Correct business behavior | A07–A11, A13 | Same rules across APIs/UI/jobs; correct schedule, request, messaging, and reporting scope |
| 4. Build quality and operability | A12, A15–A17 | Deterministic assets, useful tests/telemetry, safe rollout and recoverability |
| 5. Prove release readiness | A18 | Security, workflow, browser, environment, and recovery evidence meets agreed criteria |

Phases express dependencies, not a requirement to postpone independent work. Credential-rotation preparation, browser baselines, restore rehearsals, and CI test scaffolding can begin early. Removing runtime DDL privileges follows removal of startup DDL. A runtime support deadline must not delay immediate API containment.

## 4. Business and operational decisions

These proposed directions are not already agreed requirements. Record the accepted choice before dependent changes; do not silently alter historical data to enforce a new policy.

| Decision | Proposed direction / question to settle | Packages |
|---|---|---|
| Public endpoints and staff roles | Public enrollment/lookups and intentional token-link pages only; sensitive actions require server roles. Decide whether more than one staff permission level is needed. | A01 |
| Existing PIN users | Registrar-controlled random single-use activation plus password setup; define recovery and transition for existing notices/accounts. | A02 |
| Remember device / logout | Define actual persistent session duration, revocation, shared-device behavior, and account switching. | A02 |
| Email settings authority | Prefer host-managed secrets and approved domains/providers; decide whether any UI edits remain supported and who may make them. | A03, A10 |
| Required registration evidence | Decide Draft/Incomplete/Submitted states and whether legacy no-file enrollment is a supported staff/public workflow. | A04, A05, A07 |
| Upload limits | Agree practical per-file/request/count limits and quarantine/scanning needs within actual hosting capacity. | A04 |
| Shared contacts | Decide whether family/shared phones are valid before enforcing per-batch phone uniqueness. | A06; database W04/W05 |
| Seats | Define reservation, pending activation, archive, withdrawal, graduation, waitlist promotion, and capacity reduction behavior. | A07 |
| Batch and schedule history | Preserve completed history; decide operational Active meaning, recurrence, replacement, and alumni service policy. | A07, A08 |
| Documents and completion | Decide physical versus digital release, required OJT/attendance evidence, rejection/cancellation, and alumni processing after batch closure. | A07 |
| Notifications | Define per-admin versus shared read state, Student archive persistence, recipients, and meaningful event types. | A09 |
| Metrics | Define batch/time/status populations, historical snapshots, and exclusion/labeling of QA identities/synthetic contacts. | A11 |
| Time | UTC instants, Manila business dates, true date-only fields, and provenance of ambiguous legacy timestamps. | A06, A07, A11 |
| Recovery/privacy | Agree maximum acceptable data loss/outage, retention by data category, deployment persistence, and cleanup of test data. | A16 |
| Runtime and rollout | Candidate supported LTS target, compatible provider versions/host OS, staging availability, deployment promotion and recovery policy. | A14, A15 |

## 5. Work packages

### A00 — Current baseline, environment map, and protection

**Covers:** prerequisites for all SYS findings; database W00.  
**Responsibility:** application/database engineer, operations, QA.  
**Dependencies:** none.

- [ ] Record current source/Git state, deployed revision if available, local/Azure database targets, app instances, storage locations, runtime versions, and environment configuration sources without printing secret values.
- [ ] Inventory actual routes and their audience, ownership, side effects, rate/size limits, file behavior, and related JS callers. Do not infer route protection from page redirects.
- [ ] Refresh Azure database/schema/configuration/storage evidence through authorized access; retain old QA/import reports as dated evidence rather than current truth.
- [ ] Create protected database/file snapshots and manifests; prove a baseline restore in an isolated target before corrections. Include required cookie keys/configuration recovery in the operational inventory.
- [ ] Establish synthetic users, isolated databases/storage, disabled or captured outbound mail, and no-real-recipient test mode. Make target selection explicit and fail closed on unexpected production targets.
- [ ] Record known data exceptions and unresolved product decisions privately. Shared plans/results contain no passwords, tokens, PINs, personal records, or private upload paths.
- [ ] Set baseline success/error/performance measures and browser/device coverage to compare after changes. Record unavailable access without blocking independent source work.

**Acceptance:** reproducible baseline, protected/recoverable data, safe test targets, complete route/environment map, and clearly dated evidence.

### A01 — Server authorization and trusted actor identity

**Covers:** SYS-01, authorization parts of SYS-02/SYS-10; DB-01; database W01.  
**Responsibility:** backend/security implementer with frontend and QA review.  
**Dependencies:** A00.

- [ ] Implement authenticated Admin login/logout and explicit Admin policies; retain working Student claims-based identity.
- [ ] Establish a default-deny/fallback strategy plus a reviewed public-route allowlist. Verify public course/address lookup, enrollment, and intentional slot links remain usable.
- [ ] Bind Student reads/writes/downloads to authenticated ownership. Staff acting on another record require an appropriate staff policy and recorded actor.
- [ ] Protect every sensitive route: list/detail/export/PDF, uploads/downloads, Admin profile/settings/SMTP, activation/archive, capacity/batches/schedules, requests, notifications, and bulk operations.
- [ ] Remove `X-Abec-Admin-Id`, URL IDs, and sessionStorage roles as proof of permission or event attribution. Use validated server identity and explicit ownership queries.
- [ ] Update API consumers for authenticated sessions, 401/403 responses, and safe return navigation. Static HTML shell availability must not grant data access.
- [ ] Review CSRF protection for cookie-authenticated state changes, credentialed CORS, allowed origins, and anonymous endpoint abuse controls.
- [ ] Create an automated permission matrix for anonymous, Admin, Student A, Student B, deactivated accounts, and forged headers, including file/PDF and mixed-owner bulk cases.

**Acceptance:** every protected operation denies the wrong caller before database, storage, mail, or other side effects; public routes still work.

### A02 — Account activation, credentials, sessions, and browser identity

**Covers:** SYS-03/SYS-04; DB-02 and credential portions of DB-12; database W02/W10.  
**Responsibility:** backend/security and frontend implementers.  
**Dependencies:** A01; A06 migrations; A03/A16 host/key decisions.

- [ ] Remove PINs and reusable secrets from ordinary DTOs, lists, logs, caches, exports, and browser session objects. Restrict any transitional delivery response to the intended authorized flow.
- [ ] Disable or safely replace public legacy registration that activates accounts by PIN. Stop personal-information-derived secrets and startup PIN rewrites.
- [ ] Implement random expiring single-use activation tokens stored as hashes, with transactional redemption, revoke/reissue, and recovery. Define the lifetime/delivery policy with the business owner.
- [ ] Provide a supported migration for existing PIN users and old notices. Do not invalidate all users without a tested recovery method.
- [ ] Inventory credential formats privately, remove plaintext fallback through a controlled transition, and retain one authoritative password store. Remove duplicated settings credentials compatibly.
- [ ] Load current identity from an authenticated server session endpoint; treat local browser identity as display-only state. Clear sensitive UI on expired/denied sessions and user switches.
- [ ] Implement agreed remember-device persistence, session expiry, awaited logout/failure handling, and revocation after deactivation/password or security changes.
- [ ] Verify secure/HttpOnly/SameSite cookie policy, authentication/activation throttling, and key persistence across restart/scale/slot behavior. Do not assume platform defaults are broken; inspect and test them.

**Acceptance:** token replay/concurrent redemption, expired/revoked sessions, logout, account switching, password changes, and existing-user migration pass; no general response exposes a login secret.

### A03 — Protect configuration, secrets, and the hosting boundary

**Covers:** SYS-02/SYS-17; DB-03; database W03.  
**Responsibility:** security/backend and operations.  
**Dependencies:** A01 for API control; A06 before final runtime privilege removal; A14 hosting compatibility.

- [ ] Immediately secure email-settings endpoints and restrict who can alter SMTP or link domains. Avoid retaining an unprotected configuration writer during the wider refactor.
- [ ] Decide the single source of truth for production SMTP/database secrets and link-domain configuration. Remove unnecessary password-bearing file mirrors and document development overrides.
- [ ] Restrict approved SMTP hosts/ports/transport modes and HTTPS public-link domains; validate ownership/configuration rather than accepting arbitrary destinations. Redact effective-setting diagnostics.
- [ ] Prepare/execute controlled rotation of the previously exposed local database password when fixing is authorized: identify dependents, replace privately, verify, and retire the old credential. Review other exposures before deciding additional rotations.
- [ ] Separate runtime/migration accounts; verify actual Azure grants and scope. Runtime must not require global administration, FILE/grant powers, or startup schema rights.
- [ ] Verify remote TLS server identity, App Service networking, HTTPS-only behavior, trusted scheme/client-IP forwarding, host allowlists, and secure cookies against actual hosting integration.
- [ ] Define Data Protection key persistence/protection and deployment/slot behavior according to the host. Verify session continuity or intentional reauthentication under restart/scale.
- [ ] Test environment-variable precedence and read-only deployment filesystems. A UI save must report the effective result or clearly state that host configuration overrides it.
- [ ] Inspect Git history/artifacts and deployment permissions without printing secrets. Rotation is distinct from removing a file from Git.

**Acceptance:** unauthorized configuration writes fail; approved destinations/settings are effective; old exposed credentials are retired; runtime privileges/TLS/host boundary are verified and documented.

### A04 — Registration evidence, upload security, and private document storage

**Covers:** SYS-05/SYS-06/SYS-14; DB-08; database W04/W07.  
**Responsibility:** backend/storage implementer and operations, with registrar input.  
**Dependencies:** A01, A00 backups; A05/A07 submission semantics; A06 for new states/metadata.

- [ ] Agree limits for file count, per-file/aggregate size, field/header lengths, request duration, concurrent uploads, and per-caller quotas. Align UI, Kestrel, IIS/proxy, and actual App Service behavior.
- [ ] Validate registration and required evidence before final submission; preserve a resumable Draft/Incomplete state if staged storage is required. Define the legacy no-file route explicitly.
- [ ] Validate supported content beyond filename/client MIME, derive response MIME from accepted types, and apply safe attachment/inline rules. Decide quarantine/scanning and isolated rendering policy for sensitive uploads.
- [ ] Canonicalize stored paths and enforce allowed-root containment for reads/writes/deletes across all storage services. Generated names remain; client filenames are display metadata only.
- [ ] Stage immutable replacement objects, commit metadata, and retire old objects afterward. Add idempotent cleanup for abandoned staged objects with a retention window.
- [ ] Reconcile five missing registration originals and other current references without fabricating files. Expose a truthful missing/quarantined/available state.
- [ ] Verify current Azure ID/path mappings and the old upload package before transfer; validate hashes/size, owners, and authorized downloads after transfer. Do not blindly reuse an outdated package.
- [ ] Prove storage persistence across deploy/restart/scale, keep private files out of public static paths, and coordinate database/file backup manifests.
- [ ] Render representative synthetic application/activation/document PDFs on the deployment OS: Unicode names, long addresses, missing fields, multi-page layout, fonts/images, and safe download names. Record component/native dependencies and license review ownership.

**Acceptance:** invalid/oversized/maliciously typed/out-of-root files fail safely; partial writes/replacements are recoverable; required references are available or explicitly accounted for; private PDFs/files remain owner-protected.

### A05 — API contracts, validation, safe retries, and failure UX

**Covers:** SYS-06/SYS-07 and API aspects of SYS-19.  
**Responsibility:** backend/frontend implementer and QA.  
**Dependencies:** A01 authentication behavior; A07 command semantics.

- [ ] Define a consistent success/error contract with HTTP status, stable error code, field errors, correlation ID, and safe message; support framework ProblemDetails responses in the client.
- [ ] Validate manually deserialized DTOs explicitly or use consistent model binding/validators. Align DTO/service/entity limits, null handling, enum/status rules, and bulk bounds.
- [ ] Use appropriate HTTP status distinctions for validation, unauthenticated/forbidden, missing records, conflicts, rate limits, and unavailable dependencies. Migrate clients compatibly rather than changing all responses blindly.
- [ ] Replace generic write retries with idempotency keys/command identifiers and server-side deduplication where retries are required. Retry only safe reads or explicitly repeatable commands for selected transient conditions.
- [ ] Define deadlines/AbortController and cancellation behavior. Cancellation of a response must not be interpreted as proof a command was not committed.
- [ ] Disable duplicate submit controls and support result lookup/resumption after ambiguous completion; preserve user input and provide clear recovery action.
- [ ] Preserve validation details for accessible inline display and distinguish 401/403/409/413/429/5xx. Respect retry/backoff guidance and avoid retrying permanent validation failures.
- [ ] Cover JSON/form uploads/downloads consistently, remove redundant request implementations, and protect tokens from referrer/log/history exposure where applicable.

**Acceptance:** the isolated duplicate-POST and empty-validation-message cases no longer occur; lost responses, double-clicks, timeouts, denied sessions, and validation failures produce one intended command and actionable feedback.

### A06 — Canonical database, data corrections, and versioned upgrades

**Covers:** SYS-13 and schema prerequisites across packages; DB-03 through DB-06, DB-10/DB-11; database W00/W03/W04/W05/W06/W11.  
**Responsibility:** database/backend engineer.  
**Dependencies:** A00; accepted contact/delete/status/history rules.

- [ ] Execute the mapped database-plan tasks for fresh Azure/local inventories, reviewed contact resolutions, missing references/lifecycle exceptions, canonical constraints/collations, delete policy, and intended indexes.
- [ ] Preserve private correction provenance and QA/synthetic-contact mapping. No silent merging, replacement contacts, reassignment, or fabricated records.
- [ ] Reconcile local legacy schema, current Azure, EF model/snapshot, and a fresh install. Handle generated normalized keys and `completed_at` intentionally.
- [ ] Baseline occupied legacy databases safely; do not rerun InitialCreate over existing data or fake migration history without proving schema equivalence.
- [ ] Move startup DDL, legacy data normalization, catalog overwrite, and credential rewrites into explicit migrations/jobs or remove them under accepted ownership rules.
- [ ] Make boot validate required schema/version without hidden changes. Keep the design-time factory independent from app startup.
- [ ] Test empty installs, local upgrades, Azure-like upgrades, partial-DDL recovery, repeated boot, and restricted runtime privileges. Include all new schema needs from activation/outbox/events/storage metadata.

**Acceptance:** reproducible supported schemas, reviewed data exceptions, compatible migrations, and no hidden schema/business rewrites on restart. Detailed checkboxes/evidence remain in the database subplan.

### A07 — Business state machines, transaction boundaries, capacity, and time

**Covers:** SYS-09 and lifecycle parts of SYS-06; DB-09/DB-12/DB-13; database W04/W09/W10.  
**Responsibility:** system/backend/database engineer with registrar decisions.  
**Dependencies:** A01/A05; A06 schema; accepted decisions in section 4.

- [ ] Document allowed transitions and actor permissions for application, slot offer, enrollment, activation, archive/reactivation, batch, preparation, request, and release. Make unsupported transitions fail consistently.
- [ ] Define who owns each field/state, where history is stored, and what the UI calls success. Preserve resumption for incomplete registration and confirmed-but-not-enrolled cases.
- [ ] Put transactions in the owning service and cover decision reads through writes for API, minimal HTML endpoints, jobs, bulk operations, and direct service callers. Avoid nested/conflicting controller transactions.
- [ ] Protect final-seat allocation and capacity edits with a stable course/batch lock or equivalent atomic design. Apply one occupied/reserved-seat rule to dashboards, waitlist, archive/withdrawal, and admission.
- [ ] Make commands idempotent and retry the complete unit only when safe. Keep SMTP/file network work outside database lock duration; enqueue delivery after durable intent is recorded.
- [ ] Replace business writes on GET with display-only computation or explicit commands/jobs, including expiry and lazy document creation. Handle uniqueness races without retaining failed tracked entities.
- [ ] Preserve completed-batch history while supporting approved alumni request processing end to end; do not allow a general write guard to strand submissions.
- [ ] Align request/preparation/file/physical/digital release through one transition authority. Do not repair counters by marking unavailable documents Prepared/Released.
- [ ] Establish training/OJT completion authority and consistent request eligibility/release deadlines. Version/snapshot programs using stable identifiers rather than editable-name matching/startup overwrite.
- [ ] Centralize clock/time handling, UTC instants and Manila business dates. Preserve true dates and establish legacy timezone provenance before conversions.
- [ ] Protect mutable state with concurrency versions/conditional updates and useful conflict feedback. Separate current profile changes from retained registration/program facts.
- [ ] Retain append-only authenticated events for material transitions; preserve old unknown actors truthfully.

**Acceptance:** parallel final-seat claims, repeated confirms, batch switches, partial failures, historical requests, release variants, Manila midnight/year/OJT boundaries, and stale edits preserve agreed invariants and history.

### A08 — Scheduling, recurrence, Student calendar, and recipient scope

**Covers:** SYS-08, scheduling parts of SYS-09; DB-07; database W08.  
**Responsibility:** backend/frontend implementer with registrar/QA review.  
**Dependencies:** A01, A06/A07; accepted recurrence/status policy.

- [ ] Correct the occupied-room conflict result contract and propagate failures in create/update/replacement. Add a targeted regression test first.
- [ ] Protect closed-batch schedule creation/edit/reassignment/delete at the service boundary; preserve retirement/replacement events and historical facts.
- [ ] Define recurrence using saved weekdays, effective date range, time zone, exceptions/holidays as needed, and all trainers; do not invent attendance/completion from recurrence alone.
- [ ] Check overlapping room and primary/secondary trainer assignments across recurring occurrences, including adjacent sessions and replacement exclusions. Prove concurrent conflicts cannot both save.
- [ ] Filter Student schedule output by authenticated enrollment/course/batch. Return recurrence, relevant date boundaries, and required trainer details through a consistent DTO.
- [ ] Render actual occurrences in dashboard/calendar/day views and show next relevant occurrence rather than only the schedule's initial date.
- [ ] Scope notifications to affected batch/enrollments and meaningful published changes. Inactive drafts must not imply a live class to unrelated students.
- [ ] Review the four historically Active schedules under the accepted status rule; do not bulk rewrite them solely to clear a guard.
- [ ] Validate date-range/year/future rules and error text consistently with supported semester planning.

**Acceptance:** no cross-batch schedule exposure; saved weekdays appear correctly; valid adjacent/nonoverlapping classes work; room/trainer/history/concurrency conflicts are rejected consistently.

### A09 — Notification privacy, ownership, events, and unread counts

**Covers:** SYS-10 and notification portion of SYS-08.  
**Responsibility:** backend/frontend implementer.  
**Dependencies:** A01, A02 session/identity, A07 event semantics.

- [ ] Replace or safely migrate the shared localStorage archive so one Student cannot see another's notification content on the same browser profile. Prefer authenticated owner-scoped persistence; define device-local behavior if retained.
- [ ] Clear sensitive account caches/UI on logout, session denial, and switching users. Do not restore legacy shared content into the wrong account.
- [ ] Enforce ownership for read/mark-all/archive/restore/detail routes. A supplied notification/student ID must not grant permission.
- [ ] Use stable event type/audience/target identifiers instead of parsing titles; preserve safe rendering and history of prior messages.
- [ ] Decide per-admin versus shared read status; implement that schema/behavior explicitly, including preferences and actor attribution.
- [ ] Return unread counts independently of the latest-50 list; paginate history and preserve batch/category filtering semantics.
- [ ] Deduplicate delivery from retried commands and batch relevant writes. Pause/back off polling on hidden/offline/expired sessions and avoid duplicate timers.

**Acceptance:** Student A logout/Student B login on one browser exposes no A content; counts remain correct beyond 50 items; recipient scope, preference, read/archive state, and retries match policy.

### A10 — Reliable email, safe configuration, and truthful delivery status

**Covers:** SYS-02/SYS-12; database outbox work in W09.  
**Responsibility:** backend/integration engineer and operations.  
**Dependencies:** A03 configuration authority, A06 outbox schema, A07 command semantics.

- [ ] Introduce a durable transactional outbox and controlled worker with message identity, pending/sent/failed/retry states, bounded attempts/backoff, and recovery after restart.
- [ ] Deduplicate logical messages and record delivery outcomes independently of HTTP response loss. Do not hold business transaction locks while waiting for SMTP.
- [ ] Distinguish accepted command, queued message, SMTP acceptance, and actual delivery/bounce where provider evidence supports it. Do not label a pickup HTML copy as sent.
- [ ] Configure explicit SMTP modes/ports/timeouts and validate effective settings after host overrides. Report unsupported settings accurately.
- [ ] Keep provider failures/correlation details in protected redacted diagnostics; show users safe actionable messages. Do not log original sensitive exception content while claiming only the sanitized string is logged.
- [ ] Restrict/test public link domains, token expiry/replay/referrer handling, correct HTTPS host, and clear behavior when email is disabled.
- [ ] Make troubleshooting copies opt-in with restricted access, retention, and redaction policy; exclude them from deploy artifacts.
- [ ] Verify actual production configuration first, then delivery to an explicitly authorized controlled test recipient when that testing is authorized. Suppress all unintended historical/QA notifications during migrations.

**Acceptance:** provider outage/restart/retry creates no duplicate logical delivery or blocked DB transaction; status is truthful; links point to the approved host; effective settings and retention are verified.

### A11 — Accurate reporting, bounded APIs, and measured performance

**Covers:** SYS-11 and growth aspects of SYS-13; DB-11/DB-13; database W11.  
**Responsibility:** analyst/backend/database engineer, frontend/QA support.  
**Dependencies:** A07 lifecycle/time and A09 event definitions; A06 schema.

- [ ] Publish a metric dictionary: label, formula, population, statuses, batch/date scope, timezone, historical versus current meaning, and QA/test-data treatment.
- [ ] Separate archived Inactive accounts from genuinely AwaitingActivation; label inclusive Approved/Rejected aggregates honestly or change formulas according to policy.
- [ ] Apply explicit all-time/selected-batch filters consistently across dashboards, lists, course capacity, reports, and exports. Historical account Active and batch Active remain distinct concepts.
- [ ] Move sensitive aggregates to authorized server endpoints and avoid shipping every underlying personal row for charts. Expose incomplete-data warnings rather than silently treating failed sources as zero.
- [ ] Use historical events/snapshots for point-in-time metrics or state the limitation. Do not claim prior-period outcomes from mutable current state alone.
- [ ] Paginate/cap lists, stabilize ordering, batch/group counts, project required fields, and replace full-batch duplicate-contact loads with indexed lookups under the accepted rule.
- [ ] Capture query count, EXPLAIN, response latency, rows examined, locks, and write overhead at representative scale; choose indexes based on measured access patterns and remove only proven duplicates.
- [ ] Decide realistic performance/upload concurrency targets before benchmarking. Keep exports separately authorized/bounded and test formula-like strings if spreadsheet/CSV export is implemented.

**Acceptance:** sample metrics reconcile to underlying accepted facts, batch/time filters agree, partial data is visible, and measured endpoints meet agreed targets without excessive queries or personal-data transfer.

### A12 — Deterministic frontend assets, browser security, accessibility, and UX

**Covers:** SYS-16 and pending browser/accessibility validation.  
**Responsibility:** frontend engineer with security/UX/QA review.  
**Dependencies:** A01/A02/A05 contracts; A08/A09/A11 display behavior; A15 build integration.

- [ ] Replace Tailwind Play CDN with a pinned build-time CSS workflow and lockfile, preserving existing styling/plugins and dynamic classes through reviewed source scanning/safelists.
- [ ] Version/self-host appropriate assets and inventory fonts/icons/libraries, licenses, update ownership, integrity/CORS needs, and offline/CDN-failure behavior.
- [ ] Restore required Leaflet image assets or remove unused references after verifying map usage. Recheck dynamic as well as literal asset/navigation paths.
- [ ] Replace `document.write` loading and reduce inline handlers through incremental shared modules/components. Avoid a wholesale UI rewrite purely for code style.
- [ ] Review DOM sinks and context-specific escaping; use textContent/DOM construction for untrusted text. Test controlled payloads only in isolated targets; do not label all innerHTML as exploitable.
- [ ] Design CSP/frame/content-type/referrer and related headers for actual document/inline/CDN requirements. Use report-only rollout where needed, then enforce after violations are resolved.
- [ ] Test keyboard navigation, visible focus, modal focus trap/return/Escape, accessible labels/descriptions, validation announcements, contrast, reduced motion, zoom, and screen-reader flows.
- [ ] Test landing/login, registration wizard, Admin tables/modals, Student schedules/documents/settings/notifications on agreed desktop/mobile widths and supported browsers.
- [ ] Verify loading/empty/error/success states, disabled submissions, session expiry, offline/slow responses, stale data, and safe back navigation. Avoid misleading success or raw technical messages.

**Acceptance:** deterministic styled publish without Play CDN, safe DOM/header behavior, no required broken assets, and recorded manual/browser/accessibility checks. Static alt/lang/syntax checks alone do not satisfy this package.

### A13 — Address lookup reliability and portable reference-data updates

**Covers:** SYS-21.  
**Responsibility:** backend/integration engineer.  
**Dependencies:** A00 safe environment, A05 validation/error conventions.

- [ ] Allowlist PSGC code shape/length and known parent-child relationships before using input in paths, URLs, cache keys, or logs. Reject traversal/separator/unbounded variants.
- [ ] Enforce canonical local data-root containment and typed deserialization; keep upstream destination fixed and time/response sizes bounded.
- [ ] Define cache-key bounds, negative-cache policy, timeout/backoff/circuit behavior, concurrent cache misses, and upstream outage fallback without misleading completeness claims.
- [ ] Verify local province/city/barangay coverage including NCR and Unicode names, selection resets, unsupported/missing data, and offline operation.
- [ ] Replace the hardcoded old-checkout maintenance path with explicit repository-relative/configured output, safe atomic writes, source/version/checksum metadata, and a reproducible update command.

**Acceptance:** invalid input performs no unintended file access/upstream work; upstream outage gives usable truthful fallback; reference updates work from this checkout and preserve valid Unicode/relationships.

### A14 — Supported runtime, dependency compatibility, and reproducible builds

**Covers:** SYS-15 and dependency aspects of SYS-16/SYS-20.  
**Responsibility:** backend/DevOps engineer, database/provider and PDF review.  
**Dependencies:** start immediately; A00 inventory and focused tests before promotion.

- [ ] Record the installed/deployed runtime, build SDK, OS, direct/transitive NuGet assets, browser libraries, and PDF/native dependencies separately. Establish the supported target and patch policy.
- [ ] Evaluate .NET 10 LTS compatibility with EF/Pomelo/MySQL provider versions, native PDF rendering, authentication/data protection, Linux/Windows hosting, and actual Azure runtime availability.
- [ ] Prepare a small compatibility branch/change set with reviewed package graph and breaking-change notes. Do not assume all package major versions must change together or that the latest provider supports the chosen EF major.
- [ ] Pin an appropriate SDK/toolchain (`global.json` or equivalent) and dependency/restore reproducibility; update CI and host runtime together with a tested migration path.
- [ ] Run unit/contract/integration checks, MySQL translation/migrations, PDF rendering on target OS, publish/artifact checks, and staging smoke before production.
- [ ] Record advisory scan sources/time and native/frontend inventory; schedule ongoing update review. No vulnerable entries in a feed query is not a security warranty.

**Acceptance:** deployment runs a supported compatible runtime, tooling is reproducible, tests/artifacts pass, and the support deadline is addressed explicitly. If not ready by November 10, document exposure/operational response rather than claiming support remains.

### A15 — CI/CD quality, artifact protection, staged rollout, and rollback

**Covers:** SYS-18; deployment aspects of SYS-15/SYS-17/SYS-19.  
**Responsibility:** DevOps engineer with backend/security review.  
**Dependencies:** A14 toolchain; A06 migration contract; A17 targeted tests; A16 health/recovery.

- [ ] Add PR validation with targeted meaningful tests, frontend syntax/build, dependency advisory checks, secret/artifact checks, and schema contract checks in isolated databases.
- [ ] Build once, identify the source revision, produce a reproducible artifact/checksum and dependency inventory, and promote that artifact rather than rebuilding different binaries for each environment.
- [ ] Verify publish contents including required HTML/static/native files; exclude local settings, runtime data, email copies, backups, private keys, and nested build outputs. Perform actual private content secret scanning as well as path checks.
- [ ] Inspect repository branch/environment protections, federated Azure identity scope, workflow permissions, and available deployment controls; do not assume external protections are absent merely because YAML lacks them.
- [ ] Pin actions to reviewed immutable revisions as appropriate, add job timeouts and deployment concurrency/serialization, and retain protected verification artifacts.
- [ ] Run explicit reviewed migrations with the migration identity and target preflight. Separate them from ordinary web boot and do not automatically rerun old imports.
- [ ] Use a staging slot/environment if supported, otherwise a documented controlled rollout. Gate promotion on schema readiness, intended APIs/assets, protected access, file availability, and safe synthetic smoke checks.
- [ ] Define code/schema compatibility windows, additive rollout, feature switches where useful, forward repair, last-good artifact, and restore/cutover procedures. Coordinate private storage and cookie keys with slot behavior.

**Acceptance:** a failing relevant test or readiness check blocks promotion, overlapping deployments cannot race, the deployed artifact is identifiable, and rollback/forward repair is rehearsed without losing newer data or restoring exposed secrets.

### A16 — Observability, privacy, persistence, and coordinated recovery

**Covers:** SYS-14/SYS-17/SYS-19; DB-12/DB-14; database W10/W12.  
**Responsibility:** DevOps/database engineer with security/privacy review.  
**Dependencies:** A00 backup baseline early; A03 boundary; A06/A10/A15 final readiness integration.

- [ ] Separate process liveness from readiness; readiness checks supported schema/connectivity and required storage/critical state. Avoid declaring `ok=true` as release readiness when the database is down.
- [ ] Classify malformed configuration, connectivity, constraint/business conflict, transient DB failure, and provider outage accurately. Remove localhost-specific production advice.
- [ ] Add correlation IDs and structured redacted logs/metrics for requests, domain commands, actor identity, outbox delivery, uploads, migrations, and jobs. Avoid unnecessary recipient/identity detail or raw secret-bearing exceptions.
- [ ] Verify actual host telemetry/alerts for authentication anomalies, error/latency spikes, deadlocks, queue failures/age, missing files, pool/disk saturation, readiness, backup age, and restore failures. Define responsible responders.
- [ ] Agree recovery time/data-loss objectives; configure database/file/key/configuration backups and retention/access/encryption appropriately, with off-host protection where needed.
- [ ] Verify actual Azure storage persistence, backup/PITR/redundancy, encryption/network settings, runtime identity, and App Service deployment behavior through authorized access.
- [ ] Rehearse coordinated recovery to an isolated target: schema/data/files/configuration and required keys, integrity checks, synthetic login, and protected document downloads. Measure recovery time and recovered boundary.
- [ ] Establish retention/cleanup by category: identity documents, mail pickup, logs, private snapshots, backups, QA accounts, and synthetic contacts. Preserve required history and recorded provenance.
- [ ] Maintain incident, restore, credential-rotation, failed-migration, missing-file, provider-outage, and deployment runbooks. Test alert delivery and diagnostic access without sending unsolicited messages.

**Acceptance:** readiness reflects usability, failures are diagnosable without leaking secrets, backups demonstrably restore the complete service within agreed objectives, and outstanding host assumptions are resolved or explicitly limited.

### A17 — Maintainability, regression tests, and usable documentation

**Covers:** SYS-20; regression foundation for all packages.  
**Responsibility:** full-stack engineer with QA/system analyst review.  
**Dependencies:** A00; build tests alongside each changed behavior rather than waiting until the end.

- [ ] Turn README into a verified setup guide: supported SDK/tools, database creation/upgrade, secret configuration, reference data, build/run/test/publish, and environment selection without real credentials.
- [ ] Add focused automated contract/unit/integration tests for changed security and business rules; adapt the useful BatchVerification cases into repeatable isolated checks where appropriate.
- [ ] Add browser journeys for representative roles and failure states with synthetic fixtures; keep real uploads/accounts/mail outside routine CI.
- [ ] Incrementally separate large service responsibilities and duplicated status/time/validation/rendering logic. Keep service transaction ownership explicit and avoid layering that hides authorization or side effects.
- [ ] Consolidate repeated frontend shells/modals/form behavior and define consistent API/types/contracts. Preserve existing navigation and usability while extracting shared pieces.
- [ ] Inventory placeholder/unused models/controllers/Razor pages/scripts; remove or label only after proving no route/build/runtime dependency. Document actual framework responsibilities.
- [ ] Record architecture/decision notes, metric definitions, accepted policies, migration references, source/deployed revision, known limitations, and component/license ownership.
- [ ] Update stale setup/QA/system-audit guidance with links to implementation evidence; retain dated historical reports rather than rewriting past results as current verification.

**Acceptance:** another developer can set up/test/deploy safely from docs, key behaviors have meaningful regression coverage, and maintenance improvements preserve verified behavior.

### A18 — End-to-end verification and release acceptance

**Covers:** final validation for every finding and the audit's untested areas.  
**Responsibility:** QA/system analyst plus implementer/reviewer/operations.  
**Dependencies:** applicable packages A00–A17 and accepted decisions.

- [ ] Exercise public registration through controlled review, slot response, enrollment, activation, login, schedule, document request/preparation/release, archive/reactivate, and alumni service using synthetic records.
- [ ] Execute negative role/ownership/file tests, session revocation, token replay, CSRF policy, upload limits/type/containment, and configuration-permission checks in isolated targets.
- [ ] Exercise parallel last-seat/booking commands, response loss, retry/deduplication, stale edits, partial file/DB failures, provider outages, jobs/restarts, and historical-batch operations.
- [ ] Compare displayed reports/counts/statuses with accepted SQL/event facts and verify QA/synthetic exclusion or labeling.
- [ ] Record browser/keyboard/screen-reader/mobile/zoom behavior and PDF layout on target OS. Resolve actual accessibility/usability failures rather than marking static checks sufficient.
- [ ] Verify current Azure runtime/settings/grants/headers/files/health and deployed revision. Do not substitute local success or earlier smoke results.
- [ ] Complete representative load/failure tests and coordinated recovery against agreed objectives. Record warnings/limits honestly.
- [ ] Publish a final implementation review with completed change IDs, migrations, test evidence, deployment/rollback state, remaining risks, and owners for any accepted deferral.

**Acceptance:** no unresolved Critical security issue for public use; no unexplained data loss or cross-owner access; agreed business workflows, supported runtime, host/storage controls, and recovery are demonstrated.

## 6. Verification matrix

| Area | Minimum cases | Required evidence |
|---|---|---|
| Authorization | Anonymous/wrong role/other Student/forged header; lists, bulk, PDF/files/configuration | Denials before side effects and successful allowed cases |
| Credentials/session | Activation expiry/replay, existing-user migration, remember behavior, logout failure, account switch, revocation | No leaked reusable secrets; server/UI identity agreement |
| Registration/uploads | Invalid JSON/null/long fields, missing evidence, oversized/wrong MIME, traversal, retry/resume, storage failure | Correct field/status feedback and recoverable submission |
| Transactions | Final seat, duplicate confirm, batch switch, capacity edit, response loss, deadlock, outbox restart | Accepted counts/states, no duplicate commands/messages |
| Scheduling | Other batch, recurring days/date boundaries, all trainers, room overlap, adjacency, replace/history, simultaneous booking | Correct calendar/recipients and conflict enforcement |
| Documents/history | Missing original, replacement interruption, physical/digital release, alumni processing, archive/reactivate | Truthful availability, preserved events, authorized access |
| Reporting | Known fixtures, selected batch/all-time, Manila boundaries, archived accounts, QA data, failed data source | Reconciled formulas and explicit partial-data state |
| Frontend/accessibility | CDN unavailable, desktop/mobile, keyboard/modals, screen reader, zoom, slow/offline, expired login | Recorded usable behavior and no required missing assets |
| Deploy/platform | Fresh and legacy upgrade, restricted DB account, TLS/proxy/cookies, runtime compatibility, artifact contents, concurrent deploy | Repeatable install/promotion and compatible recovery |
| Operations | Alert delivery test, provider outage, database/file/key restore, representative load | Measured service/recovery targets and working runbooks |

## 7. Change, deployment, and recovery procedure

Use small reviewable changes with the tests appropriate to their risk. Do not make every fix depend on one large rewrite.

### Prepare

- [ ] Identify package/finding, selected policy, target environment, affected endpoints/tables/files/settings, expected changes, compatibility window, and verification/recovery steps.
- [ ] Refresh target fingerprint and confirm backups. Review SQL/data plans with preconditions, expected row counts, lock/rebuild/collation effects, and private record-level provenance.
- [ ] Test in isolated targets, including empty install and upgrade when relevant; suppress real outgoing messages and avoid public synthetic-contact delivery.
- [ ] Prepare a concrete deployable artifact/migration/result before any final production approval that is actually required by the user's authorized scope or platform controls.

### Apply and observe

- [ ] Prefer additive schema, compatible app changes, controlled backfill/constraint enforcement, then retired-code/column cleanup after compatibility ends.
- [ ] Record source/artifact/migration IDs, target, time, implementer, and sanitized before/after assertions. Apply with the correct restricted/migration identity.
- [ ] Account for MySQL implicit DDL commits, external file persistence, and already-sent mail; an application transaction cannot roll back all three.
- [ ] Verify permissions, schema/readiness, business counts/states, documents, sessions, links, and safe synthetic smoke before expanding traffic.
- [ ] Observe error/latency/queue/lock/storage signals for the defined rollout window and document remaining warnings.

### Recover if a check fails

- [ ] Stop dependent rollout and capture sanitized evidence; determine exactly which operations committed. Do not blindly rerun imports or disable constraints.
- [ ] Choose a tested forward repair, compatible last-good artifact, or isolated restore/cutover; reconcile writes since the snapshot before replacing a live target.
- [ ] Preserve the last valid file object, event/correction history, and current data. Do not restore an exposed old password or assume code rollback reverses schema/data changes.
- [ ] Record cause, recovery result, and any unresolved impact before resuming dependent work.

## 8. Finding coverage and database-plan alignment

| Finding | Master packages | Detailed database packages where applicable |
|---|---|---|
| SYS-01 — authorization | A01, A02 | W01 |
| SYS-02 — email configuration exposure | A01, A03, A10 | W01, W03 |
| SYS-03 — PIN/activation/credential stores | A02, A06 | W02, W10 |
| SYS-04 — sessions/browser identity | A02, A03 | W01, W02 |
| SYS-05 — upload/type/path/resource safety | A04, A03 | W07 |
| SYS-06 — registration/validation/partial success | A04, A05, A07 | W09 |
| SYS-07 — retries/error contract | A05, A07, A10 | W09 |
| SYS-08 — Student schedule/recurrence/audience | A08, A09 | W08 |
| SYS-09 — lifecycle/capacity/time/history | A06, A07, A08 | W04, W08, W09, W10 |
| SYS-10 — notification privacy/read state | A01, A02, A09 | W01, W05, W10 |
| SYS-11 — report semantics | A07, A11 | W09, W10, W11 |
| SYS-12 — email reliability/effective settings | A03, A10 | W09, W12 |
| SYS-13 — database integrity/startup/privileges | A03, A06, A11 | W00–W06, W09–W11 |
| SYS-14 — private files/recovery | A04, A16 | W07, W12 |
| SYS-15 — runtime end of support | A14, A15 | Provider/migration compatibility in W05/W06 |
| SYS-16 — frontend assets/browser hardening | A12, A15 | — |
| SYS-17 — proxy/cookies/key persistence | A02, A03, A16 | W03, W12 |
| SYS-18 — deployment quality/gates | A14, A15, A17 | W06, W12 |
| SYS-19 — readiness/diagnostics | A05, A06, A16 | W06, W12 |
| SYS-20 — maintenance/tests/docs | A17, A15 | Tests/runbooks across W00–W12 |
| SYS-21 — location inputs/fallback/update script | A13 | — |

| Previous database finding | Master packages |
|---|---|
| DB-01 | A01 |
| DB-02 | A02 |
| DB-03 | A03, A06 |
| DB-04 | A06 |
| DB-05 | A06 |
| DB-06 | A06, A16 |
| DB-07 | A08, A07 |
| DB-08 | A04, A16 |
| DB-09 | A05, A06, A07, A10 |
| DB-10 | A06 |
| DB-11 | A11, A06 |
| DB-12 | A01, A02, A07, A16 |
| DB-13 | A07, A11 |
| DB-14 | A00, A03, A04, A15, A16 |

Pending validation coverage: UX/accessibility → A12/A18; production controls → A03/A14/A15/A16/A18; PDFs → A04/A18; performance/recovery → A11/A16/A18; dynamic security verification → A01–A05/A18. These are requirements to verify, not invented claims of proven failure.

## 9. Final acceptance checklist

- [ ] Every SYS/DB finding has verified evidence or a clearly owned, explicitly accepted deferral with impact. No unresolved Critical issue remains for unrestricted public use with personal records.
- [ ] Identity/ownership/configuration are enforced on the server; no ordinary response/cache/log contains a reusable login secret.
- [ ] Registration, admission, schedule, completion, notifications, reporting, and historical requests use the accepted policies consistently across entry points.
- [ ] Canonical schema/migrations and current data exceptions are verified without fabricated documents, contact replacements, lost history, or unreviewed reassignment.
- [ ] The deployed runtime is supported and compatible; builds/assets/dependencies are reproducible and the deployed revision is identifiable.
- [ ] Database accounts, TLS, proxy/HTTPS/cookies/key persistence, private storage, and current Azure settings have recorded verification.
- [ ] Files/PDFs, keyboard/mobile/screen-reader flows, API failure states, concurrency, performance, and provider failure behavior pass the relevant tests.
- [ ] CI/promotion/readiness checks protect deployment; rollback/forward repair and complete database/file/key recovery have been demonstrated within agreed objectives.
- [ ] Privacy/retention/QA cleanup, monitoring/alerts, and setup/incident/recovery documentation have owners and usable procedures.
- [ ] Final review states what changed, why, what was tested, and remaining limitations without relabeling inherited evidence as new checks.

## 10. Execution tracker

All packages remain Planned. Creating this document closes no implementation item.

| Package | Status | Implementer / reviewer | Change / decision reference | Verification / next dependency |
|---|---|---|---|---|
| A00 — baseline | Planned | Unassigned | — | Refresh targets, preserve data |
| A01 — authorization | Planned | Unassigned | — | Immediate containment |
| A02 — accounts/sessions | Planned | Unassigned | — | PIN removal and transition design |
| A03 — configuration/hosting boundary | Planned | Unassigned | — | Secure SMTP settings and secrets |
| A04 — uploads/documents | Planned | Unassigned | — | Submission/storage policy |
| A05 — API/client reliability | Planned | Unassigned | — | Idempotency and field errors |
| A06 — database/upgrades | Planned | Unassigned | — | Database subplan and decisions |
| A07 — business invariants | Planned | Unassigned | — | Accepted state/seat/time rules |
| A08 — schedules/calendars | Planned | Unassigned | — | Batch filter and conflict contract |
| A09 — notifications | Planned | Unassigned | — | Shared-device privacy and ownership |
| A10 — email integration | Planned | Unassigned | — | Outbox and effective settings |
| A11 — reports/performance | Planned | Unassigned | — | Metric definitions and measurements |
| A12 — frontend/accessibility | Planned | Unassigned | — | Deterministic assets and browser checks |
| A13 — location integration | Planned | Unassigned | — | Validated codes and portable updates |
| A14 — supported runtime | Planned | Unassigned | — | Start now; .NET 8 support ends Nov 10 |
| A15 — CI/CD | Planned | Unassigned | — | Tests, artifact checks, safe promotion |
| A16 — operations/recovery | Planned | Unassigned | — | Early backup/access inventory |
| A17 — maintainability/docs | Planned | Unassigned | — | Tests alongside each change |
| A18 — acceptance | Planned | Unassigned | — | Complete applicable dependencies |

| Date (Asia/Manila) | Decision / result | Scope and evidence |
|---|---|---|
| 2026-11-07 | System audit and master plan created; no fixes applied | Source/static checks, mocked-client behavior, local publish/advisory query; production/browser limits recorded |
