# System updates — November 12, 2026

Implemented the seven requested changes in the existing application.

- Registration shows a fixed `Brgy.` prefix while users type the barangay name. Pasted prefixes are removed from the name input. The server normalizes saved values, and API profiles, addresses, registration information, and application PDFs format existing records consistently without changing their stored historical data.
- Course Management provides aligned **Create New Course Schedule** and **Add New Course** actions, with a simple **Review History** action below them. Admin-only course creation validates names, duration and capacity, rejects duplicate names, saves an audit entry atomically, and uses the shared course catalog. New courses appear in management cards, schedules, registration, the public course list, activation filters, and other catalog-backed lists. Their saved program lengths also work in student profiles and document eligibility.
- Bookkeeping excludes Room/Lab 301 from course rooms, all-room options and restored selections. Schedule creation and editing enforce the restriction on the server.
- The calendar action uses a calendar icon and opens a native modal on the current page. It supports month navigation, recurring training dates and details for a selected day, including course, trainer, room and time. The older standalone schedule URL redirects to the maintained schedule view.
- Status Breakdown expands and collapses with a chevron. Report labels distinguish applicant counts from percentages, and the count heading is **Number of Applicants**. Phone layouts display readable status/count/percentage labels below the chart.
- Responsive overrides apply at widths up to 900px. They cover touch navigation, readable form controls, scrollable tables and dialogs, schedule details, page scrolling, focus handling and modal background scroll locking. Desktop layouts retain their existing behavior, with scrolling added where the new course catalog exceeds the original four cards.
- New and reoffered slots receive 48 hours. Confirmation rejects responses at the deadline; a hosted worker persists unattended expiry on startup and every minute. It reuses the existing workflow lock and preserves confirmed/declined decisions. A transactionally marked, one-time startup upgrade extends recognizable delivered offers under the former 24-hour policy. Repeated startup does not extend them again.

## Verification

- .NET build: passed with zero warnings and errors using a separate output directory, leaving the existing running developer process alone.
- Requested feature integration checks: **24 passed**, including course persistence, duplicates, history, address normalization, deadline upgrade idempotency, expiry, and approval retries.
- Slot/activation HTTP and SMTP workflow: **73 checks passed**, including an unattended offer expired by the running hosted worker and rejection of anonymous course creation. SMTP used a loopback inbox; no external email was sent.
- Full existing batch integration suite: **passed**, covering registration, batch ownership, schedules, activation, document requests and release, historical access, and migration behavior.
- Report and archive controller checks: **194 passed**.
- Registration browser-script scenarios: **7 passed**.
- Shared feedback checks: **43 passed**.
- Edge browser review: **107 checks passed** across 21 page/view URLs at **320, 390, 768 and 1366px**, including course creation, course visibility, room filtering, calendar interactions, report expansion and barangay input handling.
- Additional phone/tablet review: **149 checks passed** at 390 and 768px, including vertically reachable controls and horizontal table scrolling.
- Final focused browser checks: **17 passed**, including modal background scroll locking, the new course/registration dialogs, month navigation, and complete desktop schedule details after adding a fifth course. Mobile and desktop screenshots were visually reviewed.

Browser page checks use synthetic API fixtures. Database/service/HTTP checks use disposable local MySQL databases, preserving existing application records. This is automated browser emulation, rather than physical-device testing.

Screenshots and browser evidence are generated in `artifacts/system-mobile/` (ignored by Git).

## Reproducing the checks

```powershell
dotnet build scripts/BatchVerification/BatchVerification.csproj -p:UseAppHost=false -o artifacts/feature-tests
dotnet artifacts/feature-tests/BatchVerification.dll --feature-updates-only
dotnet artifacts/feature-tests/BatchVerification.dll --slot-workflow-only
dotnet artifacts/feature-tests/BatchVerification.dll
node scripts/check-reports-layout.cjs
node scripts/BatchVerification/check-registration-flow.cjs
node scripts/BatchVerification/check-feedback.cjs

npm.cmd install --prefix "$env:TEMP/abec-ui-verify" playwright --no-save --no-package-lock
$env:ABEC_PLAYWRIGHT_MODULE = Join-Path $env:TEMP 'abec-ui-verify/node_modules/playwright'
node scripts/check-system-mobile.cjs
```

Restart the application normally to load the backend changes and run the startup deadline upgrade. No production deployment or restart of the pre-existing developer process was performed.
