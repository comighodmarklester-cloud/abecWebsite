# ABEC interface updates — 2026-11-14

Scope: HTML, CSS and browser JavaScript only. No controllers, services, models, SQL, stored records, configuration, or deployment connections changed.

## Behavior

- Registration credentials accept case-insensitive full titles and existing abbreviations, excluding the extension. Invalid filenames show an inline recommendation and are not silently assigned to another document type. Existing PDF/size limits and Follow up handling remain in place. The Age placeholder was removed without changing age calculation.
- Dashboard applicant dates and the hero subtitle were removed. Confirmed/Confirm are display labels; existing status values, confirmation guards, and the add-to-slot API remain unchanged.
- Batch2026-101 hides its Viewing batch control. The batch creation Continue button still opens the original confirmation step.
- Document Management shows the existing course dropdown alongside search, applies both filters together, and omits course counts.
- Settings uses a boxed Back link. Sign-out now waits for Return to Log In before calling the existing logout API. Cancel returns to the current role's dashboard. Failed logout preserves the session and allows retry.
- Student Login has one heading. The dashboard greeting uses the profile's registered lastName. Dashboard, Training Schedule, and Student Settings omit their top batch banners; completed-batch restrictions remain unchanged.
- Training Schedule retains sessions and relevant notifications in its two sections. Deep links highlight sessions without hiding the others.
- Student Documents retains released-file links and the complete existing request history. Removed request controls and their unused frontend handlers no longer create navigation targets.
- Changed shared assets have updated cache versions, including the dynamically loaded registration wizard.

## Verification

`scripts/check-interface-updates.cjs` runs the actual frontend in headless Microsoft Edge at 1366px and 390px, served over local HTTPS with synthetic API responses. It does not use live accounts, send email, or write to a database.

Coverage includes accepted/rejected filenames through file selection and drag-and-drop, Follow up preservation, combined filters, batch controls, applicant navigation and the original confirmation endpoint, Settings navigation, surname display, sessions/announcements, all existing history rows, released downloads, both sign-out actions for both roles, and failed-logout recovery. Screenshots are saved under ignored `artifacts/interface-ui/` and reviewed at both sizes.

Results: 110 desktop/mobile checks passed with no JavaScript runtime errors. Changed JavaScript passed syntax checks; registration flow regressions, 192 Reports/archive checks, and 103 repository security checks also passed. Deployment uses the existing GitHub Actions workflow without configuration changes.
