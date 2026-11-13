# Live six-perspective QA — November 13, 2026

Target: the deployed ABEC Azure HTTPS site. The owner authorized testing and provided a recipient for dedicated QA notifications. The recipient address and test-account secrets are not recorded here.

## Scope and identities

Six independent browser contexts covered visitor, administrator, and student perspectives on desktop (1366×900) and mobile (390×844). Additional public checks used 320px width. These are six QA perspectives using two existing dedicated synthetic accounts and anonymous visitors, not six newly created people/accounts. Separate reviewers checked public security and source/test contracts.

The browser connected to the actual deployment without API fixtures or mocked production responses. A request guard blocked business-changing requests during the main UI pass; only normal login/logout POSTs were allowed. Those operations can produce the usual authentication/activity logs. No enrollment, applicant status, course/schedule save, credential change, notification-read update, or production-configuration write was submitted. Normal server background processing was left unchanged. No new applicants, offers, or student accounts were created and no QA email was sent.

TLS validation remained enabled for the live Chromium browser and certificate-validated public requests. A separate initial API helper inherited a local Node TLS-disable environment option; it was discarded and repeated with that option removed from the helper process before creating the verified API client. No host environment settings were changed.

## Confirmed behavior

| Perspective | Checks completed |
| --- | --- |
| Visitor desktop | Landing/course content, opening registration, barangay prefix normalization, closing registration, login-mode switching, empty admin-login submission and viewport fit. Course titles require correction below. |
| Visitor mobile | Same registration/login checks, readable address step and single Brgy. prefix, page-level width at390px; targeted menu and width checks at320/390px. |
| Administrator desktop | Real rendered login, secure session cookie, dashboard, course controls, Add Course open/cancel, Bookkeeping room filtering, same-page calendar navigation, reports, and navigation to batches, documents, applicants, activation, archives and settings. Desktop report visual defect below. |
| Administrator mobile | Same principal admin smoke checks at390px; no page-level horizontal overflow in checked modules. This does not prove every nested control/touch target is accessible. |
| Student desktop | Real password login, authenticated API identity equals dedicated QA student ID, dashboard, schedule/month controls, document catalog/tracking, account settings, navigation menu and logout. |
| Student mobile | Same student checks at390px; tracking button/close/Escape/focus restoration verified in targeted rerun. |

- No uncaught JavaScript errors were observed in any of the six main contexts.
- No unexpected failed same-origin HTTP responses were recorded in the main pass. HTTP401 after logout was expected and separately asserted.
- HTTP redirects to same-host HTTPS. Normal TLS certificate/hostname verification passed; the independent public probe negotiated TLS1.3.
- HSTS, nosniff, frame/CSP/referrer protections are present on checked responses; API responses have no-store.
- Six selected protected endpoints rejected anonymous requests with HTTP401. Missing/unknown slot-token GETs displayed clear errors without decision forms and with privacy headers. The independent public security suite passed14checks.
- Course action buttons align on desktop and Review History is below them. Add New Course and calendar dialogs can open/cancel without submitting writes.
- Bookkeeping's live schedule room options exclude Room301.
- Report callouts distinguish counts from percentages, the table says Number of Applicants, and clicking Status Breakdown does not collapse it.

## Findings

| ID | Priority | Evidence and required action |
| --- | --- | --- |
| LIVE-01 | Blocks email QA | Authenticated production `/api/admin/email-settings` reported `enabled=false` and `passwordConfigured=false`; public URL validation was true. This is the app's effective configuration at observation time, not an Azure secret-value inspection. Configure/verify the Email__ settings and restart before sending QA offers. The owner is applying settings; recheck afterward. |
| LIVE-02 | High usability | At1366×900, the report legend was224px wide and1671px tall. Its first status cell was40px wide; the first row alone was121px tall. Chart top was741px and its height689px. Repeating the measurement two seconds later was stable, excluding a continuing resize loop in this sample. Narrow columns/padding cause excessive status-name wrapping and push the chart down. Correct desktop legend width/column sizing/padding without hiding rows. |
| LIVE-03 | Content accuracy | Public landing headings say **Bookkeeping NC III**, twice including the detail heading. Live `/api/courses` says **Bookkeeping NC II**. Derive displayed course names consistently from the authoritative catalog or correct both static headings. Do not change the official qualification without owner confirmation. |
| LIVE-04 | Incomplete feature | Student **Forget PIN?** points to `#`. This is a placeholder, not an implemented recovery destination. Supply an approved assisted recovery path or implement a secure recovery process without exposing PINs. |
| LIVE-05 | Accessibility | Public mobile drawer physically opens/closes at320/390px and updates the drawer's aria-hidden, but its trigger has no aria-expanded state. Add appropriate trigger state/controls semantics; this was not a functional menu failure. |
| LIVE-06 | Production readiness, source-confirmed | `/api/health` hardcodes HTTP200/ok=true even when its database flag is false, and startup catches schema initialization failure. The current live database flag is true. Add readiness semantics returning503 for required dependency/schema failure. No deliberate live outage was induced. |

The source reviewer also noted institutional privacy-notice placeholders. This was a source observation, not a newly completed public policy-compliance review. Institutional contacts, retention and sharing statements need owner-approved content.

## Test corrections and honest limits

Raw main evidence contains four initial harness failures: two public-course selectors looked only for newly added cards, and two tracking-close attempts targeted the backdrop center underneath the modal panel. Targeted reruns used existing static course headings and the actual close button. The catalog exists and tracking closes correctly on desktop/mobile; those four results are not counted as application defects. A separate exact public/API comparison established LIVE-03 rather than treating permissive title matching as proof of qualification consistency.

Two initial menu checks incorrectly expected an aria-expanded value as proof of closure. Physical display/geometry and aria-hidden checks confirmed closure; the missing trigger state is retained separately as LIVE-05. Stable report dimensions passed the no-growth check but failed the compact-layout check; width-only smoke assertions did not catch LIVE-02 until visual review.

The main UI pass attempted108assertions across the six contexts, with the four harness failures above corrected through targeted reruns. Do not interpret that as108independent features or a clean release certification: the content, visual, recovery, accessibility and readiness findings remain open.

Actual delivered email buttons, Confirm/Reject persistence and immutable replay on production remain **blocked/not tested** until mail is configured and dedicated offers can be sent. No48-hour wall-clock expiration test was performed on production and no production deadline was backdated. Earlier isolated workflow tests are separate evidence and do not replace these live tests. Confirmation also sends normal email alerts to subscribed administrators, so recipient effects must be accounted for before a live confirmation test.

Course creation/schedule saves, registration uploads, existing-file availability, all cross-account authorization combinations, load/concurrency, backup restoration, restart persistence, Always On and Data Protection persistence were not established by this read-oriented smoke pass. The pending email step also requires access to the dedicated notification links/inbox; SMTP acceptance alone will not be described as inbox delivery.

## Evidence and next steps

Private/ignored working evidence is under `artifacts/live-qa-20261113/`: public-security.json, browser-evidence.json, followup-evidence.json, targeted-evidence.json, catalog-labels.json and mail-preflight.json. Screenshots remain local; tables/password fields were masked where appropriate. No browser storage-state exports, passwords or real bearer tokens were saved in this report.

1. Apply production SMTP settings privately and recheck effective flags.
2. Fix LIVE-02/LIVE-03 and readiness behavior, then validate targeted desktop/mobile checks before deploying those changes.
3. Complete dedicated live notification tests when mail and inbox access are available; record any synthetic data created and its reviewed cleanup.
4. Complete persistent-storage/file inventory and operational recovery checks from the production-readiness review.

No application fix, source dependency/version change, commit, push, or deployment was performed during this QA pass. .NET, EF Core and MySQL versions were preserved.
