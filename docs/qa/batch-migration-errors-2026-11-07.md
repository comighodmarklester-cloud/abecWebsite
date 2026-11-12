# Batch migration error correction — 7 November 2026

The historical-contact migration failure and missing map images are fixed in the source. Existing applicant contact values were preserved. Connection strings, database endpoints, credentials and deployment settings were not edited. The running local Debug process and actual source database were left unchanged.

## Root cause and correction

The previous upgrade tried to introduce a normalized unique phone key over completed historical records that already shared phone numbers. Both the migration and a separate startup updater rejected those records. Changing or deleting people merely to install the index would be incorrect.

The revised upgrade distinguishes immutable completed history from unfinished batches:

- Unassigned applicants, inconsistent ownership, multiple active batches, normalized duplicate emails and normalized duplicate phones in unfinished batches still fail preflight before permanent DDL.
- Completed historical phone duplicates retain their exact original contact strings, identities, relationships and batch ownership. Within each duplicate group, the lowest applicant ID retains its indexed phone key; additional historical records receive `legacy_contact_conflict=1`, making only their generated contact key null.
- This flag is preservation metadata, absent from editable request DTOs. The server rejects attempts to create an applicant with the flag or change it on an existing applicant. New records default to false. The normalized unique index remains effective for active/future registrations and protects against writes that race past application validation.
- Repeating the upgrade preserves the same exception set. No phones are fabricated, no applicants are merged, and nobody is reassigned between batches.
- Startup now runs the shared guarded upgrade statements rather than maintaining an independent, stricter version that could fail after a successful migration. This also aligns lifecycle/document/notification schema setup across routes.

The missing Leaflet image directory was restored from the official v1.9.4 release, matching the existing bundled JavaScript. Five images cover the CSS layer icons and dynamically loaded marker/retina/shadow assets. The upstream license was included.

## Files changed

| Files | Purpose |
| --- | --- |
| `Data/BatchLifecycleUpgrade.cs`, `Migrations/BatchLifecycleDocuments.sql` | Preserve completed-history phone conflicts with explicit metadata; retain unfinished-batch duplicate preflight; support repeated/earlier-compatible upgrades |
| `Data/BatchSchema.cs` | Use the shared upgrade during startup, retaining the notification request link setup |
| `Data/ApplicationDbContext.cs`, `Migrations/ApplicationDbContextModelSnapshot.cs`, `Migrations/20261107092514_BatchLifecycleDocuments.Designer.cs` | Map the internal flag and revised generated phone key consistently |
| `Data/BatchIntegrity.cs` | Prevent application creation/modification of historical contact exceptions |
| `scripts/BatchVerification/Program.cs` | Exercise historical preservation, repeatability, active duplicate rejection, exception tampering and database uniqueness |
| `wwwroot/lib/leaflet/images/*`, `wwwroot/lib/leaflet/LICENSE` | Restore missing matching upstream assets |
| `docs/batch-management-implementation.md`, earlier full verification report, this report | Document the correction and current migration state |

The existing unreleased `20261107092514_BatchLifecycleDocuments` upgrade was revised; this correction does not introduce a destructive migration or alter deployment configuration.

## Verification

- Release build: **0 warnings, 0 errors**.
- Integration suite: **230 passing checks**, including the active/completed/future batch workflows, HTTP ownership protection, individual document rules and migration paths.
- Direct SQL insertion into a new batch confirms the database itself rejects an equivalent normalized phone, even without application validation.
- Existing completed duplicate contact strings and applicant IDs remain unchanged after migration, a repeated upgrade and the startup updater. Application attempts to remove an existing exception or opt a new applicant out of uniqueness are rejected.
- JavaScript syntax: **65 checks passed**. Static inspection: **21 HTML pages**, no missing literal HTML references, no missing CSS assets, no duplicate IDs.
- EF reports **no pending model changes**; Release publish succeeded; `git diff --check` passed.
- Hash comparison confirms all six protected configuration/project files match the baseline, including both application settings files, the example settings, `web.config`, launch settings and project file.

### Real-data backup restoration rehearsal

A full local MySQL dump was created and restored to a uniquely named disposable database. The source was used for backup/read operations only. The upgrade was applied twice to the restored copy, followed by the startup schema updater.

All original-column values across **18 tables** were compared using table hashes, allowing only the documented `Closed` ? `Completed` conversion and completion-date derivation from existing history. Original phone values, record identifiers, enrollment ownership, account state and file-path metadata were preserved. The four historical duplicate phone groups affecting eleven applicants produced **seven additional-record exceptions**. Batch2026-102 remained active with **zero applicants and zero students**. The disposable database was removed afterward.

Verified backup and a checksum/verification manifest are retained locally under:

`App_Data/database-backups/batch-fix-20261107-230559/`

This ignored directory contains personal enrollment data and must remain outside source control and public web storage. The database backup preserves file metadata; it is not a backup of private uploaded file bytes.

## Applying the correction

The real local schema was **not upgraded**, because the existing Debug application was running. Its loaded binary also remains unchanged. No hosted deployment or Azure migration was performed.

1. Stop the running Debug application and pause other application writers.
2. Back up the private upload storage as well as the target database. The local database backup above was restore-tested.
3. Follow the [migration guide](../batch-management-implementation.md#deployment-steps). The existing local database has no EF baseline: execute `Migrations/BatchLifecycleDocuments.sql` in one connection, stopping on any error. Do not run InitialCreate over existing tables. For an EF-managed target, follow the EF route in that guide using its existing private configuration.
4. Rebuild/restart the updated application, sign in again as admin, confirm empty Batch2026-102 operational views, and select Batch2026-101 to review preserved history and representative downloads.

Previously missing historical uploads cannot be reconstructed from database file paths; their original file objects or a storage backup are required. Browser layout/cross-tab behavior and real SMTP delivery remain unverified. These limitations do not affect the successful service, HTTP, schema and preservation checks above.


## Applied locally on 8 November 2026

Following the user's instruction to preserve historical shared contacts and proceed with Batch2026-102, the upgrade was applied to the local database and the updated Debug app was started. Earlier statements above about an unapplied local schema describe the prior state. See [local activation evidence](batch-102-local-activation-2026-11-08.md) for backup, preservation and operational checks. Hosted/Azure deployment remains separate.
