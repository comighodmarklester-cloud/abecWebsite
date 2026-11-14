# Remove the empty legacy sample batch

The live Admin page showed `Batch 2026-A` as Completed, January 1–December 31, 2026, with zero students and zero document requests. Its live ID differs from the previously removed local sample, so cleanup resolves the stored name instead of hardcoding an ID. Batch2026-101 showed Completed with six students; Batch2026-102 showed Active with four students. A read-only active-batch API snapshot also recorded one active schedule for Batch2026-102.

## Implementation

- `Data/DbSeeder.cs` no longer creates a default `Batch {year}-A` in an empty installation. Real batches continue to be created through Batch Management. Startup invokes the bounded repair after existing integrity/schema upgrades.
- `Data/LegacySeedBatchCleanup.cs` recognizes only `Batch 2026-A` or `Batch2026-A`, with the original 2026 calendar-year dates and Completed/Closed status. It requires Batch2026-101 Completed, Batch2026-102 Active, and exactly one active batch. Ambiguous names, other dates and unrelated empty batches are preserved.
- The repair locks batch rows in a Serializable transaction. It checks every base-table `batch_id` column, including unconstrained legacy columns, and every declared foreign key to batches, including differently named columns. Cross-schema/nonstandard-key dependencies, history dependencies and delete triggers require review. Any linked operational record prevents removal; students, applicants, schedules and notifications are never deleted by this repair.
- After all guards pass, the exact empty batch and its own lifecycle events are backed up to private `App_Data/database-backups/legacy-seed-batch/batch-<id>-<guid>.json`. Backup failure rolls back without deleting anything. Only that empty batch's lifecycle events and batch row are then removed. The helper is idempotent and handles concurrent startup.
- No UI filtering hides the entry. There is no new deletion endpoint, schema, connection setting or batch activation step. Current-batch selection and both valid batches' records are preserved.

## Verification

`scripts/BatchVerification/LegacySeedBatchChecks.cs` uses disposable schema-only clones and synthetic records. It covers linked students, applicants, schedules, notifications, unknown references, cascading foreign keys, triggers, invalid current/status/date conditions, ambiguous names, private backup failure/content, concurrent cleanup, both stored name formats, preservation snapshots, unrelated batches, repeat startup, and startup on an empty installation.

```powershell
dotnet build scripts/BatchVerification/BatchVerification.csproj --no-restore -c Release -p:UseAppHost=false -o artifacts/seed-batch-cleanup
dotnet artifacts/seed-batch-cleanup/BatchVerification.dll --legacy-seed-batch-only
dotnet artifacts/seed-batch-cleanup/BatchVerification.dll --training-schedule-only
node scripts/BatchVerification/check-batch-page.cjs
```

The page check's old sidebar assertion required a particular HTML attribute order. It now checks the existing active class and `aria-current` independently; the interface itself was not changed. All 72 Batch Management page checks passed. The training-schedule suite passed, including repeated startup and preservation of completed schedules and the active student's assigned schedule.

The final Release build completed with zero warnings/errors, and all 23 guarded cleanup checks passed. These checks modify only disposable verification databases; the configured local database is inspected but its records are not changed.
