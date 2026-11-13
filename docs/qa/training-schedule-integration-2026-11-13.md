# Training schedule integration — November 13, 2026

## Investigation

This repository uses ASP.NET Core 8, Entity Framework Core and MySQL. There is no Laravel application or separate enrollment model in use. The enrollment relationship is `students.applicant_id -> applicants.course_id`, with `students.batch_id` identifying the assigned training cycle. `courseschedules` already references both the course and batch.

Admin Course Management saves schedules through `ScheduleController` and `ScheduleService`. The student dashboard and Training Schedule page both read `StudentPortalService.GetScheduleAsync`. Its existing course, batch and Active schedule filters correctly isolate enrollments; the dashboard also retains an active schedule whose start date is in the past.

Read-only inspection of the local database found:

- All six existing students belong to completed Batch2026-101.
- Active Batch2026-102 has configured schedules but no enrolled students.
- Student and applicant batch assignments match; no applicants have a missing batch.
- Historical schedules exist for the existing students' courses, but their batch is completed.

The user explicitly confirmed that completed students must not view schedules because their training and assessment are finished. Consequently the service restriction, API authorization, page redirect, navigation and CSS restrictions remain intact. Existing students must not be moved into the new batch or shown its schedules to make a schedule appear.

## Changes

- Reuse the Admin schedule DTO mapping for student responses, keeping saved training days, batch dates and legacy trainer assignments consistent.
- Display the saved training weekdays on the dashboard and Training Schedule page instead of only the weekday of the start date.
- Refresh visible dashboard/schedule pages every 15 seconds and on focus or return to the tab. Requests cannot overlap, and refreshing preserves calendar navigation.
- Use the required unavailable message when the dashboard receives a genuinely empty schedule result. Retrieval errors retain their separate error message.
- Update the two affected HTML script versions so browsers load the corrected student script.
- Fix schedule startup normalization: register rooms from saved schedules but update room fields only on active-batch schedules. Previously a completed legacy schedule with a missing room ID caused startup to violate the historical-write guard and fail. Completed rows now remain unchanged across repeated startup.

No schema changes, schedule copies, enrollment transfers or default schedules were introduced. Admin CRUD, replacement, status handling and batch-write protection remain in use.

## Verification

All checks passed:

- 30 targeted MySQL schedule checks: creation, persistence, course isolation, notifications, update synchronization, past start dates, legacy trainer mapping, duplicate rejection, deactivation/reactivation, replacement, deletion, batch isolation, completed-batch restrictions, enrollment preservation and repeated startup.
- 14 Edge browser checks against synthetic API fixtures: both student pages display course/days, poll updated values, avoid duplicates, remove unavailable schedules, distinguish errors from empty results, recover when schedules become available, and retain the completed-batch restriction. No JavaScript errors occurred.
- 280 existing integration checks, including authenticated HTTP access, completed schedule restrictions, enrollment workflows, document workflows, historical preservation and fresh/repeated migrations.
- Build and JavaScript syntax checks passed; the changes pass `git diff --check`.

MySQL tests clone only the schema into disposable verification databases and remove them afterward. Browser fixtures use synthetic data and an ephemeral loopback HTTPS server. Existing local records were not modified.

Reproduction from the repository root:

```powershell
dotnet run --no-restore --project scripts/BatchVerification -- --training-schedule-only
dotnet run --no-build --no-restore --project scripts/BatchVerification
$env:ABEC_PLAYWRIGHT_MODULE = Join-Path $env:TEMP 'abec-ui-verify/node_modules/playwright'
$env:ABEC_VERIFICATION_DLL = Join-Path (Get-Location) 'scripts/BatchVerification/bin/Debug/net8.0/BatchVerification.dll'
node scripts/check-training-schedule.cjs
```

The browser command requires the existing Playwright installation and Microsoft Edge. The two MySQL commands require the known local source database and create/drop permissions for disposable verification databases.
