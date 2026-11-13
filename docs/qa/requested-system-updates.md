# Requested ABEC system updates

## Result and schedule diagnosis

The seven requested areas have been implemented using the existing ASP.NET Core, Entity Framework Core and MySQL architecture. Existing enrollments, documents, archive reasons and issued credentials were preserved. No connection strings, SMTP settings, hosting settings or deployment workflows were changed.

Read-only inspection of the local database found an Active Bookkeeping NC II schedule for Batch2026-102 (schedule 14), but **no student enrolled in that course and batch**. Both existing Bookkeeping students belong to completed Batch2026-101 and have inactive accounts. Their schedules must remain hidden under the confirmed completed-batch rule. The fix does not transfer them or substitute the current Admin batch for their actual enrollment.

The existing course/batch query is correct. A disposable Bookkeeping Batch2026-102 enrollment now specifically verifies that Admin saves and updates reach both student APIs. The student dashboard propagates schedule retrieval failures, and the Training Schedule page treats profile retrieval failure as an error rather than displaying a misleading empty result. Both pages retain loading states, expose fetching through `aria-busy`, and refresh saved schedules every 15 seconds and on returning to the page.

## Changes by area

| Area | Implementation and files |
| --- | --- |
| Student schedules | `Services/StudentPortalService.cs`, `wwwroot/js/abec-student.js`, `Views/Student/StudentDashboard.html`, `Views/Student/ClassSchedule.html`. Preserve actual course/batch matching and completed-batch restrictions; distinguish errors from successful empty responses. |
| Course actions | `Views/Admin/CourseManagement.html`. Only Manage Course Schedules remains primary beside the existing Refresh control. Schedule view has right-aligned Refresh and Calendar icons, then Create New Course Schedule and Add New Course, then the Review History text link. |
| Reports | `Controllers/ArchiveController.cs`, `Views/Admin/Reports.html`, `wwwroot/js/abec-reports.js`, `wwwroot/css/abec-reports.css`. Align status labels, counts and percentages; prevent narrow-screen clipping; use Profile statistics. The Archives report requests the three-category projection through the existing categories endpoint. |
| Archives projection | Show Deactivated, Rejected Slots and Graduated. Include active student accounts retained in completed batches as Graduated when they have no conflicting saved archive record. Explicit saved reasons remain unchanged. Pending/inactive accounts are not automatically counted as graduates. Original archive management and detailed exports retain the stored records. |
| Registration and ZIP | `Views/Home/LandingPage.html`, `wwwroot/js/abec-enroll-wizard.js`, `wwwroot/js/abec-landing.js`. Remove previous TESDA enrollment controls, payload fields and associated validation. Existing historical fields remain stored and readable. The address inputs are free text and lack an authoritative ZIP dataset, so the ZIP is left for manual confirmation and cleared when province, city or region changes. No location receives a 4500 default. |
| PIN issuance | `Services/SecurityPinGenerator.cs`, `Services/ApplicantService.cs`, `Services/ActivationService.cs`, `Services/AuthService.cs`, `Data/DbSeeder.cs`. Newly issued/reissued PINs use ABEC + uppercase first-name/surname initials + four secure random digits. Issuance stays in enrollment and explicit administrative workflows; startup no longer issues credentials. Existing numeric and historical codes remain usable under current account rules. Registered accented initials are also accepted at sign-in. |
| PIN privacy | `Services/CredentialDiagnostics.cs`, `Program.cs`, `DTOs/ResponseDtos.cs`, `Controllers/ActivationController.cs`, `wwwroot/js/abec-activation.js`. Routine JSON contains issuance status rather than the PIN. The explicit authorized reissue action can return the new code. Reissues and credential PDFs use no-store responses. Provider diagnostics that could include a duplicate credential are suppressed only inside the credential write's async flow. Normal diagnostics resume afterward. |
| Documents | `Services/StudentDocumentCatalog.cs`, `Views/Student/DocumentRequest.html`, `wwwroot/js/abec-student-documents.js`. National Certificate identifies the enrolled course and displays the exact requested explanation. Request Document is disabled until verified training/assessment completion and elapsed batch training/assessment dates permit it. The backend uses the same catalog rule. View request history remains available independently. Existing requests and released downloads are preserved. |
| Student presentation | `wwwroot/css/abec-student-refinements.css` and the four Student HTML views, including `UserSettings.html`. Consistent typography, spacing, accessible focus/disabled states and mobile readability within the existing design. |
| Login and sign-out | `Views/Home/LoginPage.html`, `Views/Home/SignOutPage.html`, `wwwroot/js/abec-login.js`. Remove Forgot PIN and obsolete numeric-format copy, preserve the password login toggle below the PIN input, and retain the signing-out module's fixed login destination. Relevant HTML asset versions were updated, including Admin login and activation pages. |

## Database and credential compatibility

**No database migration or manual record update is required.** The existing unique index on `students.security_pin` remains authoritative across all students, including archived and inactive accounts. New codes fit the existing column.

Issuance uses a database-scoped advisory lock for each initials namespace, selects with `RandomNumberGenerator` from unused four-digit combinations, and retries a database duplicate-key conflict. It reserves historical display aliases and the student's current credential. Exhaustion returns a controlled error and preserves the old credential; it does not switch to another format or issue a duplicate. The existing login rate limiter remains in place.

The existing database stores issued PINs as uniquely indexed text, rather than salted hashes. This change preserves that storage design and activation-notice reprinting; no hash or protected-lookup migration was introduced. Existing codes are not rewritten by startup, login or profile reads. Routine JSON and credential-write diagnostics no longer expose them.

National Certificate eligibility reuses `StudentDocumentEligibilities` and the enrolled batch's `EndDate` and `AssessmentDate`. Training and assessment must be individually verified, both periods must have ended in Asia/Manila time, and the assessment date must be recorded. Existing open/released-document checks continue to apply. Existing request history is not retroactively changed.

## Verification

All test databases are disposable schema clones; source records are never copied or modified. Email tests use a loopback inbox, and browser checks use synthetic APIs.

| Check | Result |
| --- | --- |
| Build | Zero warnings and errors |
| Requested backend cases | 27 focused assertions plus fixture setup passed: reported Bookkeeping case, legacy login, accented initials, PIN privacy, certificate eligibility, concurrent issuance, forced leading zeros, full 10,000-code namespace, duplicate rejection/retry, credential log privacy, Graduated projection and completed-batch restrictions |
| Existing integration suite | 281 assertions passed, including authenticated HTTP access, enrollment, documents, account workflows and fresh/repeated migrations |
| Schedule service suite | 30 focused assertions plus fixture setup passed |
| Schedule browser suite | 14 checks passed, including real polling on both pages, removals, errors and completed-batch behavior |
| Requested UI cases | 41 checks passed at desktop and mobile sizes, including column clipping/vertical alignment, action placement, document gating/history, ZIP input, login and both sign-out destinations |
| Browser security/mobile scenarios | 45 checks passed, including 320px and 1366px input, modal, download and markup-isolation scenarios |
| Full responsive layout sweep | 237 browser checks passed across 21 pages at 320px, 390px, 768px and 1366px, including all four Student views |
| Reports and archive management | 192 checks passed |
| Activation and email workflow | 78 end-to-end checks passed using isolated HTTPS, MySQL and loopback SMTP |
| Existing security suites | 103 privacy/schema/input checks and 27 authorization/account/PIN/upload checks passed |
| Syntax and whitespace | Changed JavaScript files pass syntax checks; `git diff --check` passes |

Screenshots are in `artifacts/requested-updates-ui/`. Additional regression checks are recorded in `artifacts/requested-updates-*.log`.

New tests: `scripts/BatchVerification/RequestedUpdatesChecks.cs` and `scripts/check-requested-updates.cjs`. The existing verification runner, security/activation checks, report assertions and mobile scenarios were updated for the final behavior and relocated actions.

Reproduce from the repository root:

```powershell
dotnet build scripts/BatchVerification/BatchVerification.csproj --no-restore -p:UseAppHost=false -o artifacts/system-update-20261114
dotnet artifacts/system-update-20261114/BatchVerification.dll --requested-updates-only
dotnet artifacts/system-update-20261114/BatchVerification.dll --training-schedule-only
dotnet artifacts/system-update-20261114/BatchVerification.dll
dotnet artifacts/system-update-20261114/BatchVerification.dll --slot-workflow-only
dotnet artifacts/system-update-20261114/BatchVerification.dll --strict-security-only
dotnet artifacts/system-update-20261114/BatchVerification.dll --code-security-only
$env:ABEC_PLAYWRIGHT_MODULE = Join-Path $env:TEMP 'abec-ui-verify/node_modules/playwright'
$env:ABEC_VERIFICATION_DLL = Join-Path (Get-Location) 'artifacts/system-update-20261114/BatchVerification.dll'
node scripts/check-requested-updates.cjs
node scripts/check-training-schedule.cjs
node scripts/check-reports-layout.cjs
node scripts/check-system-mobile.cjs --security-only
```

## Runtime handoff

The running local app holds the default Debug assembly open, so verification builds were written to the isolated artifact directory. Restart/rebuild the normal local application to load the backend changes; no hosting or connection configuration change is needed.

Real production confirmation still requires an actual active Bookkeeping Batch2026-102 enrollment, since the inspected database has none. Production email delivery and production hosting were not changed or exercised. The loopback activation tests verify the issued credential, recipient, commit-before-email ordering and successful sign-in without sending external mail.
