# Dedicated Batch Management page ? 8 November 2026

Moved the dashboard's Batch Management board and its lifecycle/history dialogs to `Views/Admin/BatchManagement.html`. A Batch Management sidebar entry, with the same navigation styling and icon sizing as the other modules, appears immediately after Document Management on every primary admin sidebar. The new page marks that entry active and uses the shared admin shell, typography, cards, notification/refresh helpers and responsive layout.

The existing create/change/complete confirmations, completion dates, batch history previews and View records navigation are preserved. They use the same protected server APIs. No batch was created, completed, reassigned or deleted during this change. Batch2026-102 remains governed by the existing active-batch rules. Connection/deployment configuration was not modified and no schema migration is required.

## Implementation

- `Views/Admin/BatchManagement.html`: new page containing the moved active-batch board, history, change, switch confirmation, completion and creation dialogs.
- `wwwroot/js/abec-batches.js`: extracted lifecycle logic, refresh and history loading; no dashboard applicant/course queries. Failed loads show an error and disable completion.
- `wwwroot/css/abec-batches.css`: dedicated styles at normal module-page spacing, shared-shell colors and responsive widths. Dialogs use the standard centered presentation.
- `Views/Admin/AdminDashboard.html`, `wwwroot/js/abec-dashboard.js`: removed lifecycle controls/dialogs and their logic/styles; expanded recent applicants to the available width. Dashboard batch search results link to the new page's history view.
- Primary admin HTML pages: added one sidebar link each and refreshed the shared script version.
- `wwwroot/js/abec-admin.js`: refresh helper recognizes the new page controller; active-batch cross-tab refresh includes Batch Management.
- `Controllers/AdminController.cs`: authenticated `/Admin/BatchManagement` convenience route redirects to the physical HTML page. As with other compiled controller changes, a running older Debug binary needs a normal stop/rebuild/restart before this optional route is available. Direct sidebar HTML navigation uses the existing static-page serving workflow.

## Verification

- Release build: **0 warnings, 0 errors**.
- **252 integration checks passed** in disposable databases, including six new HTTP checks for page content, moved dashboard controls, authenticated convenience route and dedicated JS/CSS resources.
- **26 batch page checks passed** using an isolated mocked DOM/API: active/history rendering; sidebar consistency; change/history dialogs; acknowledged creation; cancellation without writes; original create/complete API contracts; local refresh and cross-tab publish; empty-batch/error handling. These are logic tests, not rendered browser checks.
- **66 JavaScript syntax checks passed**, covering **22 HTML pages**. Static inspection found no missing literal HTML/CSS references or duplicate IDs.
- `git diff --check` passed; protected configuration hashes match the baseline.

Commands:

```powershell
dotnet build "ABEC System.csproj" --configuration Release --no-restore
node scripts/BatchVerification/check-batch-page.cjs
dotnet run --project scripts/BatchVerification/BatchVerification.csproj --configuration Release --no-restore
python App_Data/system-audit/inspect.py
```

The running Debug application locked its DLL, so Debug output could not be replaced during verification. Its process was left intact. No background application was started and no process was left occupying an additional local port. Release verification ran independently and all disposable test servers/databases/files were cleaned up.

Computer-use visual verification ended because the tool cannot enforce browser URL policy in the current Firefox browser. No further browser interaction or fallback UI automation was attempted. Desktop/narrow-screen rendering and pointer/keyboard interactions still need a visual review.

Refresh an admin page and open **Batch Management** from the sidebar. Direct page: `/Views/Admin/BatchManagement.html`.

The sidebar order was subsequently updated at the user's request: Document Management, Batch Management, then Reports. All ten primary admin sidebars were checked for this ordering and exactly one Batch Management link.

## Follow-up: keep historical documents on Batch Management

Historical selection and View documents now render an inline table here instead of redirecting to Document Management. Actual active-batch switching also opens the previous batch's documents locally. See [in-page document verification](batch-management-inline-documents-2026-11-08.md) for the current behavior, the extended read-only snapshot, 257 integration checks and 47 page checks.
