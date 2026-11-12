# Active batch isolation correction

## Explanation

The database already kept the enrollments in their original batches. The remaining problem was in the operational read queries: dashboard totals, activation summaries and several lists still selected all batches when no `batchId` was supplied. An account's `Active` status means the student can sign in; it does not mean their enrollment belongs to the current batch.

A read-only check of the configured local database on 7 November 2026 found:

| Batch | Status before the pending lifecycle migration | Applicants | Students | Archived students | Document requests | Schedules |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Batch2026-101 (ID 1) | Closed | 24 | 6 | 1 | 8 | 7 |
| Batch 2026-A (ID 4) | Closed | 0 | 0 | 0 | 0 | 0 |
| Batch2026-102 (ID 5) | Active | 0 | 0 | 0 | 0 | 0 |

Therefore, the current batch should show zero enrollment-related activity until new records are added. The previous records do not need deletion, reassignment, or account deactivation. Global course definitions, configured capacities, rooms and other reusable setup remain available for the new batch.

## Changes

- Added a shared server-side batch resolver: omitted batch ID means the current Active batch; an explicit ID selects that batch for history. With no active batch, operational reads return empty results rather than all history.
- Scoped dashboard counters, recent applicants/search, applicants, enrolled accounts, activation summaries, archives, schedules, document request lists/statistics, registration uploads and course enrollment registries.
- Corrected the registration-document query, which previously accepted a batch argument without using it.
- Made the course release board default to the current batch, including an empty current batch. Removed its fallback to the historical batch with the most students.
- Scoped the operational notification bell to the current batch. Completed-batch document notifications remain available through the Document Management batch selector and its unread badges.
- Kept explicit historical batch snapshots, enrollment lists, document processing and student-owned downloads accessible under the existing authorization rules.
- Refreshed all dashboard data after batch completion/activation and cleared stale search results. Schedule creation rechecks the current batch instead of using a cached batch ID.
- Added a current-batch explanation to operational admin pages. Changed the archive history action from Restore to View records; it opens that batch's Document Management view without activating it.
- Updated frontend asset versions so browsers fetch the correction.

## Verification

Final results: **162 integration checks passed**, Release build/publish succeeded, and all **65 JavaScript syntax checks passed**. HTML inspection found no missing literal asset references or duplicate IDs. The three previously known Leaflet CSS image references remain outside this correction.

The BatchVerification harness covers three distinct states: a populated completed batch with no active batch, a newly activated empty batch, and a populated current batch alongside historical records. It checks every scoped service above, then exercises the real HTTP list, summary, dashboard, course registry and historical document endpoints using an authenticated admin session. It also reruns the existing lifecycle, eligibility, access, download-preservation and migration checks.

The local database check uses only SELECT statements in a read-only session. Mutation tests create disposable databases and synthetic files; existing local and Azure records are unchanged. Rendered browser checks remain pending because the browser host was unavailable during the preceding SDD implementation.

## Running the update

This correction changes application queries and frontend assets; it adds no further database migration. The preceding SDD's `20261107092514_BatchLifecycleDocuments` migration is still required before running the full updated application. Follow the [rollout guide](../batch-management-implementation.md), including its existing duplicate-contact preflight and the separate route for databases without EF history.

Rebuild/restart the updated application, or deploy the updated build to the hosted application, then refresh the browser. A previously running or deployed build continues to use its old queries until it is replaced. Afterward, Batch2026-102's operational pages should show zero applicants/students/requests/schedules in the inspected local data, while Batch History and explicit Document Management selection retain Batch2026-101's records.
