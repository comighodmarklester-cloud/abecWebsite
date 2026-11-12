# In-page batch document history ? 8 November 2026

Selecting an earlier batch through Change Batch, View documents in the history preview, or the full Batch History dialog now keeps the administrator on Batch Management. The selected batch's document table loads below the lifecycle board. A real active-batch switch also selects the previous batch's documents there automatically.

Viewing another batch does not activate it. The active enrollment batch remains separately identified at the top of the page and in the table's context text. New registrations continue using the actual active batch. The selected document batch is retained in the Batch Management URL, so refresh/bookmark navigation returns to that selection.

## Behavior and implementation

- `Views/Admin/BatchManagement.html`, `wwwroot/css/abec-batches.css`: inline document table, viewing-batch selector, local search, status/count feedback and responsive horizontal scrolling. History actions say View documents.
- `wwwroot/js/abec-batches.js`: replaces both Document Management redirects with local selection/loading. Clears old rows immediately on selection, validates the snapshot's batch, discards late responses, retains the selected view on refresh, and shows explicit empty/error states.
- Table covers registration uploads, student document requests and prepared/released course documents, with owner, course, type, category, status, updated date and available-file links. Original record IDs and files are used. Opening a file uses a new tab/download and leaves the Batch Management page intact.
- `Services/BatchDocumentService.cs`: adds a course-document collection to the existing batch snapshot response. The query is read-only and restricts documents to students in that batch, matching batch ownership and enrollment course. Only existing DTO metadata is returned; stored paths are not exposed. Existing Document Management consumers can continue ignoring this additional property.
- File URLs include the selected BatchId and use the existing authenticated file endpoints, retaining server ownership/context checks. The table itself does not add new document mutation operations.
- Existing batch lifecycle APIs, confirmations, document status transitions and database connections remain unchanged. No schema migration or data reassignment is required.

## Verification

**257 integration checks passed**, including historical course document IDs/status/file metadata, scoped current/historical responses, absence of private storage paths, and rejection of a snapshot request whose path batch conflicts with its selected batch context. Existing lifecycle, registration, document eligibility/release/download, future-batch and cross-batch protection checks also passed.

**47 page-logic checks passed** in an isolated mocked DOM/API: no redirect on selection; table combines all document categories; mixed batch/owner/course rows are excluded; file URLs carry batch context; viewing history makes no writes; search and refresh preserve scope; actual switching selects previous-batch documents; load failures clear stale rows; out-of-order responses cannot change a newer selection.

Release build succeeded with **zero warnings/errors**. Static inspection passed all **66 JavaScript syntax checks** over **22 HTML pages**, with no missing HTML/CSS references or duplicate IDs. `git diff --check` passed, and protected connection/deployment configuration hashes match the baseline. Rendered browser verification was not performed for this follow-up.

Tests used disposable databases, ports and files with email disabled. They were cleaned up. No real batch activation or document modification was performed and no background application was left running by this change.

## Loading the update

Stop the currently running Debug session, rebuild/restart the application, and refresh Batch Management. The backend restart is needed to include prepared course documents in the extended snapshot response. No migration is needed.

Local evidence: `App_Data/batch-documents-inline-2026-11-08.log` and `App_Data/batch-documents-inline-static-2026-11-08.json`.
