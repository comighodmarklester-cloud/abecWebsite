# Local Batch2026-102 operation ? 8 November 2026

The user authorized leaving Batch2026-101 shared phone values intact and proceeding with Batch2026-102. The existing preservation-aware upgrade was applied to the configured **local** database. No Azure/hosted deployment or database connection change was made.

## Work completed

1. Stopped the verified old local ABEC Debug executable, which predated the correction.
2. Created a fresh database dump and restored it into a disposable database. Repeated the guarded upgrade and startup schema updater on that restored copy, verifying preservation across all 18 original tables. Removed the disposable database afterward.
3. Backed up the 27 available private upload objects and verified their checksums.
4. Checked that source records still matched the fresh backup, then applied the same guarded standalone-equivalent upgrade to the local source. Compared original-column hashes afterward, allowing only documented completed-status/date conversion. Original phone values, account state, IDs and ownership remained intact. All 27 upload checksums remained unchanged.
5. Rebuilt Debug successfully with zero warnings/errors and started one updated instance using the existing `http` launch profile and port 5188.

Historical duplicate contacts were retained with seven preservation metadata exceptions covering the redundant records in four completed-history phone groups. No phone strings were edited, no people were deleted/merged, and no records were moved to Batch2026-102. Normal per-batch duplicate validation and database unique constraints remain enabled for new registrations.

## Verified local results

| Data | Batch2026-101 | Batch2026-102 |
| --- | ---: | ---: |
| Status | Completed | Active |
| Applicants | 24 | 0 |
| Enrolled students | 6 | 0 |
| Archives | 1 | 0 |
| Document requests | 8 | 0 |
| Training schedules | 7 | 0 |

The actual dashboard service returned zero for total/pending/approved/rejected/waitlisted applicants, active/enrolled students, awaiting activation, pending/released/ready documents and upcoming schedules. Available courses remain **4**, since course definitions are shared.

The restarted app's `/api/health` returned `ok=true` and `database=true`. `/api/batches/active` returned Batch2026-102 with zero students and zero active schedules. The landing page returned HTTP 200. Startup logs contain no seeding failure, hosting failure or port conflict; stderr is empty.

The expanded integration suite passed **230 checks** again against disposable test databases after this local upgrade, including registration, approval/enrollment, schedules, historical document access, future batches and backend cross-batch protection. No test registrations or test emails were sent through the real local application.

Protected configuration hashes remain unchanged: application settings, example settings, `web.config`, launch profiles and project file.

## Backups and local evidence

The fresh dump, restore verification manifest, applied-upgrade manifest and private upload backup are retained in the ignored local directory:

`App_Data/database-backups/batch-fix-20261108-143906/`

Local evidence logs:

- `App_Data/batch-apply-local-results.log`
- `App_Data/batch-local-startup-2026-11-08.log`
- `App_Data/batch-local-startup-2026-11-08.err.log`
- `App_Data/batch-active-102-validation-2026-11-08.log`

This was the manually managed local schema route. EF migration history was not fabricated and InitialCreate was not run over existing local tables. Future EF history-driven changes still require the reviewed baseline approach described in the migration guide.

## User action

Open `http://localhost:5188`, sign out/in as admin and refresh the dashboard. Batch2026-102 should show its empty current cycle. Select Batch2026-101 through the historical batch features to review preserved records. The background verification instance was subsequently stopped after it conflicted with an IDE launch. Port 5188 was verified free on both IPv4 and IPv6 loopback. Debug was rebuilt with zero warnings/errors. Start the application once from the IDE; no background ABEC instance is being retained by this session.

The hosted application still needs its own reviewed schema upgrade/deployment if these changes are to appear there. Previously missing historical upload objects remain unavailable until recovered from their original storage/backup; the 27 locally available objects were preserved.
