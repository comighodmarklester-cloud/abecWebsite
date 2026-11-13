# Live behavior-profile QA, round two — November 13, 2026

The owner explicitly authorized further production QA after updating Azure App Settings. This round uses distinct behavior profiles in isolated browser contexts, existing dedicated synthetic administrator/student accounts, and one newly created, clearly labeled synthetic applicant. Profiles are simulated usage patterns, not independent human reviewers or new real-user identities.

## Completed production configuration and mail checks

The authenticated application's effective email settings now report enabled=true, passwordConfigured=true, host=smtp.gmail.com, port=587, a present email-formatted username, and a FromAddress matching that username. The public HTTPS app URL validates. No password value was read, printed, copied into source, or changed by these tests.

Actual sending still failed:

| Stage | Observed result |
| --- | --- |
| Synthetic enrollment with uploads | Saved successfully once |
| Registration receipt email | Application reports delivery Failed |
| One approval-notification attempt | Application reports ApprovalFailed; approval persisted |
| SMTP send-completion timestamp | Not set |
| Delivery reference | `856fb9d4c57842db9f92d114c0a0eee6` |

The approval API returned HTTP200/success=true because it saved the approval, but explicitly returned EMAIL_NOT_SENT. The test checked the delivery status rather than treating HTTP200 as email success. The public error is deliberately sanitized and only says SMTP delivery failed. The precise exception type is needed from Azure Log stream; a missing/wrong password, TLS failure, account restriction, or another provider failure must not be asserted without evidence. SMTP acceptance, inbox arrival and working original-email buttons have not been established. Even a reported send failure is not a mailbox inspection; a late SMTP disconnect error can leave delivery uncertain.

### Controlled retry while Log stream was open

The owner supplied an excerpt from02:24–02:25UTC showing ordinary static-file requests, SQL command metadata, and successful administrator authentication. It did not contain the earlier SMTP failure. The displayed CORS denial message was followed by executing the login endpoint and successful sign-in; it is separate from the outgoing SMTP failure. SQL column names such as password/confirmation_token in the excerpt are not logged field values; parameters were masked.

One controlled retry for the same synthetic applicant ran on November13,10:38AM Philippine time (02:38:02–02:38:09UTC). It again reported ApprovalFailed with delivery reference **28ed879fbbbf484098d296afea37f805**. A before/after assertion verified that the original response deadline was unchanged, and no student or applicant response was created. No duplicate registration or automatic retry loop was used. The fresh sanitized exception-type line was requested from the owner's open Log stream; diagnosis remains pending that evidence. Private evidence: smtp-retry-20261113-01.json.

### SMTP exception identified from the owner's log

The owner subsequently supplied the exact matching failure at02:38:07.8570329UTC: **SmtpProtocolException**. The preceding entry reports connecting with TLS=True. This establishes an SMTP communication/protocol failure, but the current log does not distinguish ConnectAsync, AuthenticateAsync, SendAsync or DisconnectAsync. It does not by itself establish an incorrect password, a specific network restriction, or SMTP acceptance.

A proposed configuration-only diagnostic is changing Email__Port from587 to465 while retaining smtp.gmail.com and Email__UseSsl=true. Both are documented Gmail modes:587uses STARTTLS and465uses implicit TLS. Existing EmailService code already selects SslOnConnect for465, so no framework/package/code change is required to try that supported mode. This is a diagnostic trial, not an established root-cause fix; it has not been applied or tested by the agent. No new email attempt was made after the28ed... retry. If it also fails, add privacy-preserving operation-stage diagnostics instead of recording raw SMTP conversations or disabling certificate checks.

References: [MailKit protocol exception documentation](https://mimekit.net/docs/html/T_MailKit_Net_Smtp_SmtpProtocolException.htm), [Google's supported Gmail SMTP ports](https://developers.google.com/workspace/gmail/imap/imap-smtp?hl=en).

### Port465 result and local operation-stage diagnostics

The owner applied465. An authenticated settings read confirmed smtp.gmail.com:465, enabled/password-configured flags and the valid public URL. One retry on November13,10:53AM Philippine time (02:53:49–02:53:59UTC) again reported ApprovalFailed, reference **9867052873c04b1ab9b5505afba2cacb**. The original response deadline remained byte-identical and no student was created. Private evidence: smtp-retry-20261113-02-port465.json. The exception type for this latest attempt was not read from server logs; do not assume it was identical solely from the generic response. Switching ports did not resolve the observed failure.

A local diagnostic patch now labels SMTP operations with code-defined prepare/connect/authenticate/send/disconnect stages. It logs successful connection, authentication and SMTP message acceptance, and includes the failed stage in sanitized protocol-error results. This preserves TLS selection, certificate verification, timeouts and retry/delivery behavior. No raw exception, provider reply, subject, address, password, attachment or email token is logged. Message acceptance is an SMTP event, not a claim of inbox delivery.

Three loopback-only synthetic server cases fail during connection, authentication and sending. Eighteen assertions verify correct failure phases and absence of credential/provider-text disclosure or false acceptance logs. The Release verification build passed with zero warnings/errors; all96code-security checks passed (the previous78plus18new assertions). Existing project declarations and migration files match the task-start SHA-256 baseline. An independent source reviewer found no blocking/privacy regression. The pre-existing caveat that a post-acceptance cleanup error may report failure remains a diagnostic consideration; the patch adds no automatic retry.

This source change must be deployed before another production trial can reveal the stage in the API result. No diagnostic build has been pushed or deployed by the agent, and no further mail retry was made after the465trial.

### Deployed diagnostics: authentication-stage failure

After the owner reported deployment of commit `154955d`, one controlled retry ran at03:06:27–03:06:36UTC on November13 (11:06AM Philippine time). Effective settings still reported Gmail port465, enabled/password-configured flags and a valid public HTTPS URL. The response now specifically reported **SMTP communication failed during authenticate**, reference **c963c5c0569045ad9464fde0e2bed215**. This confirms that the deployed diagnostic code ran and ConnectAsync completed before the failure. SMTP authentication did not complete and SendAsync was not reached. A protocol failure during authentication does not, by itself, prove incorrect credentials or identify the provider-side cause.

The existing synthetic applicant remained Approved / ApprovalFailed, with no send timestamp, no student account and no applicant response. Its original deadline remained identical. No duplicate registration, reoffer or further retry was performed. Private evidence: `smtp-retry-20261113-03-deployed-diagnostics.json`. The next account-side check is whether Email__Password is a Google-generated App Password belonging to the exact Email__Username account; no secret value was requested or inspected. Actual notification-email button tests remain blocked by delivery failure.

### App Password correction: SMTP send succeeded

The owner confirmed that Email__Password contained their normal Gmail password, then generated a Google App Password and reported applying it in Azure. One controlled retry ran at04:31:50–04:32:02UTC on November13 (12:31–12:32PM Philippine time). It returned the successful approval-notification message and changed delivery status from ApprovalFailed to **ApprovalSent**, with approvalEmailSentAt populated. The App Password correction resolved the observed SMTP failure on this attempt. No password value was read or recorded by the agent.

The original offer deadline remained identical, no duplicate registration or reoffer was made, and no student account or applicant response was created. Private evidence: `smtp-retry-20261113-04-app-password.json`. No further retry is needed for this successfully sent notification. SMTP send success does not prove inbox placement: the owner was asked to check Inbox/Spam for the synthetic applicant's notification and leave its response unsubmitted pending the original-email link checks. Inbox receipt and live button/replay tests remain unverified at this point.

The owner subsequently confirmed **Received in Inbox** for this notification. Inbox arrival is therefore owner-verified, in addition to the application-recorded SMTP success. The original email or its button links have not yet been provided to the agent, so actual-email button destinations, live decision submission and replay protection remain pending. The owner was asked to attach the downloaded original `.eml` message and leave both actions unsubmitted.

### Original inbox email: desktop/mobile link and rejection checks

The owner provided the downloaded notification in the workspace. MIME parsing verified the exact synthetic applicant and authorized recipient, both clearly labeled action buttons, the configured public HTTPS origin, the expected /confirm-slot and /reject-slot routes, and the same offer token. Its single application/pdf attachment was79,344bytes and had a valid PDF signature. Gmail's Authentication-Results header reported SPF, DKIM and DMARC pass. These are received-header observations, not a new mail-server audit.

The original decoded email HTML and its actual links were exercised in desktop Edge emulation at1366px and mobile emulation at390px and320px. **184 browser/API assertions passed with zero failures.** All six pre-response link openings showed the correct identity, course, training information, offer/deadline details and explicit choice button, without any decision POST or saved response. The displayed offer was November13at10:19AM and deadline November15at10:19AM, both Philippine time. Email/intent layouts fit each viewport; keyboard focus, mobile button sizing, no-store/no-referrer/noindex headers and secure verification-cookie attributes passed.

Exactly one explicit **Reject Slot** form submission was made on the390px mobile page. It changed only synthetic applicant26 to Rejected / Declined, populated declinedAt, and created no student account or confirmation. The original deadline, course and batch were preserved. The separate dedicated QA student's applicant snapshot remained identical throughout.

After rejection, both original email links displayed the saved rejection and already-responded notice without a decision form at all three widths. Stale same-origin POST submissions to both /confirm-slot and /reject-slot at every width preserved the original rejection and timestamp. An untrusted-origin confirmation POST was denied with HTTP403. Missing and unknown-token links showed clear non-actionable messages at all three widths. No further mail retry, reoffer, activation or other applicant decision was made.

Private evidence: `original-email-live-evidence.json`, `original-email-mime-evidence.json`, the original-email browser script and screenshots in the ignored round-two artifact directory. The supplied email contains a bearer action token, so its exact path was added to the repository-local .git/info/exclude; neither it nor decoded private fixtures should be committed. No token or recipient address is reproduced in this report. These tests rendered the original email HTML in Edge, rather than controlling Gmail's inbox UI, and do not establish physical-device or every-email-client rendering coverage.

Successful live confirmation remains a separate test: it creates a pending student, consumes a Bookkeeping slot and sends emails to subscribed administrators. Explicit approval was requested for a second synthetic applicant for that operation. Actual elapsed48-hour expiration was not accelerated or observed in production. Earlier isolated captured-SMTP confirmation/expiry tests are separate evidence and must not be described as a successful live confirmation.

### Owner-authorized confirmation case: second offer sent

The owner explicitly approved proceeding with a second synthetic applicant, including the pending student, occupied Bookkeeping slot and subscribed-administrator emails caused by confirmation. The application enforces one email address per batch even after rejection. A Gmail plus-address variation of the owner's approved recipient was therefore used for this second record; Google routes it to the same inbox. The first rejection record was not edited or reset, and no uniqueness constraint was bypassed or changed.

Exactly one new applicant was registered: **ID27, Qa Verification Email Confirmation**, in the same active batch and Bookkeeping course. Five clearly labeled synthetic PDFs were uploaded. All17registration/offer checks passed, including authenticated previews with matching hashes, receipt/approval SMTP success, exact synthetic identity and a deadline approximately48hours from the offer (allowing SMTP completion time). The state is Approved / ApprovalSent with no student account and no applicant response. The owner must supply this second original notification before its actual inbox buttons can be used for the authorized confirmation test. Private evidence: `confirmation-mail-workflow.json` and `confirmation-applicant-state.json`.

### Second original email: confirmation recorded, follow-up verification

The owner supplied the second original inbox notification. MIME parsing verified the exact confirmation applicant/plus-address recipient, correct HTTPS action routes and an offer token distinct from the earlier rejection. Its PDF attachment was valid; received Authentication-Results reported SPF, DKIM and DMARC pass. The exact supplied email path was excluded in .git/info/exclude before processing it. Private MIME evidence: `confirmation-email-mime-evidence.json`.

Both original-email actions were opened at1366px,390px and320px before any decision. Identity, displayed details, explicit buttons, layout, security headers/cookie and unchanged applicant/control snapshots passed. Each displayed offer/deadline pair was exactly48hours apart. Exactly one initial Confirm Slot form was then submitted on the desktop page. The successful result was recorded for applicant27 at05:13:14UTC on November13. The application saved Confirmed Slot / Confirmed, populated confirmedAt and created a student account without a decline or changed deadline.

The first harness had149passing assertions, then its student verification failed because it searched the full combined name while the API searches first name, last name, email and contact fields separately. This was not evidence that student creation failed. No initial confirmation was resubmitted. A separate follow-up uses the exact QA email and verified exactly one matching student: **student8**, applicant27, batch1, course2, **Inactive** pending activation. Course capacity remained27; filled slots changed0to1 and remaining slots27to26. One admin and one student in-app confirmation event existed. Full combined-name search is a usability limitation of the current course-student search, distinct from successful confirmation.

Follow-up link reopening/opposing POST replay checks completed at all three widths. Both links displayed the saved confirmation and already-responded message without a decision form. Same-origin POSTs to both actions preserved the exact confirmation timestamp, applicant identity and single inactive student. Missing/unknown links were non-actionable, foreign-origin rejection attempts returned HTTP403, and there were no uncaught JavaScript errors. Earlier rejection and separate QA student snapshots remained identical.

The follow-up recorded150passing assertions before its final global slot-count assertion failed: the live occupied total had increased from1to2 during testing. Read-only reconciliation then found the QA student's single record plus a different applicant/student confirmed at05:16:25UTC, after the QA confirmation at05:13:14UTC. The count correctly matched two distinct current-course students; capacity remained27 and remaining slots were25. This concurrent confirmation was not submitted by these QA scripts. The test assumption that no other applicant could change aggregate occupancy was invalid for a shared production site. No slot capacity or other applicant was changed to make the assertion pass.

All17read-only reconciliation assertions passed, including exact target identity, one unchanged inactive QA student, original response timestamps, unchanged controls, aggregate occupancy matching distinct students and no duplicate in-app notices. The target still has exactly one admin and one student confirmation event. Both original failed verification assertions remain in raw evidence alongside the corrected checks: `confirmation-email-live-evidence.json`, `confirmation-email-followup-evidence.json` and `confirmation-concurrency-evidence.json`. No initial confirmation was repeated, and no more decision POSTs were made during reconciliation. Administrator email inboxes were not inspected; in-app event existence does not prove delivery of best-effort administrative email.

Current confirmation case: **applicant27 → student8, Confirmed Slot / Confirmed, account Inactive pending activation, one occupied QA slot**. Its original deadline is unchanged. This completes one successful initial desktop confirmation and one successful initial mobile rejection across the two synthetic applicants, with both original links and recorded-choice replays checked on desktop and mobile widths. Actual elapsed48-hour production expiration and physical-device testing remain unverified.

Azure browser inspection was stopped by Computer Use because it could not confidently determine the current Windows Chrome URL. No Azure UI changes were made. A Gmail integration exists but is not connected; it had been suggested recently, so another unsolicited connection suggestion was not emitted. The owner was asked for only a sanitized Log stream error type/line. Credentials and connection strings must remain private.

## Production test data and request boundaries

Exactly two new applicants were created in this QA sequence: **ID26, Qa Verification Email Rejection**, and, after separate explicit approval, **ID27, Qa Verification Email Confirmation**. They use the owner-authorized QA mailbox and a plus-address variation of that same mailbox; recipient addresses are omitted from this shareable report. Names, address and contact placeholders are synthetic; none of the uploaded PDFs represents a real credential or identity document. Each applicant received five PDFs explicitly labeled SYNTHETIC QA TEST DOCUMENT: four registration credentials and one identity placeholder. Applicant26 remains rejected with no student; applicant27 is confirmed with inactive student8 awaiting activation. No student was activated by QA.

The test applicant initially remained Approved / ApprovalFailed during SMTP diagnosis. After the App Password correction, notification sending succeeded and the owner confirmed Inbox arrival. The original-email test above then recorded its explicit rejection; the latest state is **Rejected / Declined**, with no student account. No existing real applicant was approved/rejected, no course/schedule was saved, and no student was activated. A deadline was assigned by the normal48-hour offer policy. Its exact value is in private evidence; the API returns it without a timezone suffix. No live deadline was backdated or extended, and no48-hour wall-clock expiry was simulated on production.

The offer was preserved through diagnosis and controlled retries. Scripts stored the created ID before subsequent checks and validated the exact synthetic name/email/batch/course before any status operation. No duplicate enrollment was submitted. Its saved rejection is now final: do not retry approval or reset this applicant for confirmation testing. There is no normal applicant-delete API, so do not fabricate cleanup or silently delete database records.

Rejecting applicant26's actual offer created in-app notices but no external administrative emails. Confirming applicant27 created one inactive student occupying capacity and invoked the application's subscribed-administrator notification flow, within the owner's explicit approval. In-app events were verified; administrative email inboxes were not inspected. Neither saved response should be reset for further testing.

## Verified uploads, PDFs and authorization

- All five uploaded files were recorded and retrieved through authenticated preview endpoints; each downloaded SHA-256 matched its generated input, with application/pdf content type.
- Production application-form PDF generation returned HTTP200 and a valid79,344-byte PDF.
- Anonymous access to the new private QA upload returned HTTP401.
- A different dedicated QA student received HTTP403 for the same applicant upload.
- A student received HTTP403 when attempting to read administrator SMTP settings.
- Authentication and logout tests produce normal activity/session events; ordinary server background jobs were not disabled or altered.

## Public checks and retained findings

The independent public reviewer completed16check groups:15passed, with the retained public course-label mismatch failing. All14security checks passed, including certificate/hostname validation, HTTPS redirect, expected headers, live database connectivity, anonymous denial and safe missing/unknown slot-token pages. All15sampled same-origin landing-page assets returned HTTP200. An initial transient TLS handshake timeout was inconclusive; the completed pass validated normally.

The landing page still says **Bookkeeping NC III**, while the live course catalog says **Bookkeeping NC II**. The readiness endpoint still hardcodes HTTP200/ok=true and does not establish schema readiness; this remains source-confirmed and was not tested by inducing a live outage.

The prior desktop report visual defect remains: its224px-wide legend stretches to1671px, with a40px status cell and excessive wrapping. Counts/percentages and report tabs were checked independently of visual sizing.

Course-student search matches first name, last name, email and contact fields individually; a full combined first-and-last-name query did not find the confirmation student's record. An exact-email query did. This search usability limitation remains separate from the verified confirmation/response-locking workflow.

## Completed behavior-profile results

Eight profiles completed **70 effective checks:67passed and3confirmed issues**. There were zero uncaught JavaScript exceptions, zero attempted business writes in the browser suite, and zero unexpected HTTP failures. Seven initial harness assertions were superseded by seven successful targeted checks; their raw results remain preserved. Expected401responses after logout were deliberately asserted.

| Behavior profile | Completed coverage |
| --- | --- |
| Novice desktop applicant | Public catalog presence, enrollment entry, incomplete-form validation with aria-invalid and readable toast alerts, empty-login validation and desktop fit. |
| Hurried320px visitor | Drawer opening/closing, registration viewport, validation feedback and preserving a synthetic draft when closing/reopening. |
| Careful390px privacy reader | Notice opening, scrolling, width, focus and Escape restoration. Found three unfinished institutional sections. Access to the review step used assisted navigation; this was not a second enrollment submission. |
| Keyboard-only administrator | Actual login, Enter to open Add Course, Tab behavior, Escape/opener restoration and keyboard calendar/month controls without page navigation. No background page control received focus. |
| Meticulous reporting administrator | Counts reconcile, percentages reconcile, status callouts distinguish both values, breakdown stays visible and every report tab opens. Reproduced the desktop sizing defect. |
| Returning desktop student | Password-mode preference, correct authenticated identity, secure cookie and logout invalidation. Checked Remember this device still produced a session-only cookie. |
| Keyboard-only student | Tracking opened by Enter; Tab/Shift+Tab confinement, Close/Enter, Escape and opener focus restoration all passed. |
| Small-screen320px student | Dashboard, schedule, document catalog and settings fit; menu/calendar/day actions and reachable tracking controls passed. |

The three browser-suite issues are:

1. Desktop report status legend/column sizing, confirmed by live geometry above.
2. Remember this device checked still leaves authentication cookie expires=-1. The login-method preference is stored separately; this does not mean the password was saved. Persistence was assessed from cookie metadata, not by restarting the user's browser.
3. Three institutional privacy-notice placeholders remain for sharing, retention and privacy contact. The institution must supply approved content; QA did not invent these policy decisions.

The mobile drawer physically closes correctly and updates aria-hidden. Its missing trigger aria-expanded remains a semantics improvement rather than a functional close failure. Native dialog Tab cycling can stop at document.body/browser chrome; the corrected test checks for actual background-page control focus rather than misclassifying this browser stop. Blank-form messages are accessible toast alerts, not text left in the emptied inline placeholders.

| Suite | Outcome |
| --- | --- |
| Eight behavior profiles | 67/70 effective checks passed; three genuine content/behavior/layout issues |
| Independent public checks | 15/16 groups passed; course-label inconsistency persists; all14security checks and15sampled assets passed |
| Synthetic registration/uploads/mail preflight | 12/13 checks passed; registration email delivery status failed |
| Single approval email diagnostic | Approval persisted but email reported ApprovalFailed; not delivered/accepted proof |
| Additional PDF/ownership isolation | 4/4 passed |
| Original rejection notification | 184/184 browser/API assertions passed; one initial mobile rejection; both link/replay routes checked at three widths |
| Confirmation registration/uploads/offer | 17/17 passed; second original inbox email supplied by owner |
| Original confirmation notification | 149passing assertions, then a full-name verification lookup mismatch; exact-email follow-up verified the saved student |
| Confirmation replay follow-up | 150passing assertions, then a global occupancy assumption invalidated by another applicant's concurrent confirmation |
| Read-only confirmation reconciliation | 17/17 passed; one QA student/slot, unchanged response/controls and no duplicate in-app events |

This remains an emulated desktop/mobile Edge test, not physical iOS/Android coverage or a load test. Public course qualification accuracy, readiness semantics, earlier PIN-recovery placeholder, full-name search and operational persistence findings remain separate from the three browser-suite issues. Later original-email testing above verifies live GET safety, initial rejection and confirmation POSTs and immutable replay. Actual48-hour elapsed production expiration and administrative email inbox delivery remain unverified.

Private working evidence is in ignored `artifacts/live-qa-20261113-round2/`: mail-workflow.json, offer-diagnostic.json, synthetic-applicant-state.json, upload-isolation.json, public-security.json, persona-summary.json, persona-evidence.json, persona-followup-evidence.json, persona-review.md and the QA scripts/screenshots. No bearer token or password is included in this report.

Application source and framework/EF/provider/MySQL versions were unchanged by these live email-button tests. The earlier SMTP diagnostic patch was committed as154955d and deployed by the owner before the successful App Password correction and button tests. Azure App Settings changes were performed by the owner; no push or production deployment was performed by the agent. Only QA evidence/reporting and repository-local exclusions were updated during the button tests. This report records failures and limits; it does not certify unrestricted production readiness.
