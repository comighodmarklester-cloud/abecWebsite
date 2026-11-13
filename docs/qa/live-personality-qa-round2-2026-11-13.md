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

Azure browser inspection was stopped by Computer Use because it could not confidently determine the current Windows Chrome URL. No Azure UI changes were made. A Gmail integration exists but is not connected; it had been suggested recently, so another unsolicited connection suggestion was not emitted. The owner was asked for only a sanitized Log stream error type/line. Credentials and connection strings must remain private.

## Production test data and request boundaries

Exactly one new applicant was created: **ID26, Qa Verification Email Rejection**. Its email is the owner-authorized QA recipient and is omitted from this shareable report. Names, address and contact placeholders are synthetic; none of the uploaded PDFs represents a real credential or identity document. Five PDFs explicitly labeled SYNTHETIC QA TEST DOCUMENT were uploaded: four registration credentials and one identity placeholder.

The test applicant is currently **Approved / ApprovalFailed**, with no student account and no recorded applicant response. No existing real applicant was approved/rejected, no course/schedule was saved, and no student was activated. A deadline was assigned by the normal48-hour offer policy. Its exact value is in private evidence; the API returns it without a timezone suffix. No live deadline was backdated or extended, and no48-hour wall-clock expiry was simulated on production.

The failed offer is preserved for diagnosis and a controlled retry. The script stores the created ID before subsequent checks and validates the exact synthetic name/email/batch/course before any status operation. It does not blindly resubmit enrollment or repeat approval after failure. Use the existing applicant's Retry approval email flow after diagnosis, preserving the original deadline. There is no normal applicant-delete API, so do not fabricate cleanup or silently delete database records.

Rejecting the applicant's actual offer creates in-app notices but no external administrative emails. Confirming would create an inactive student occupying capacity and send notices to eligible subscribed administrator addresses. Those effects are outside the applicant-only send performed in this round. Neither applicant decision has been submitted.

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

This remains an emulated desktop/mobile Edge test, not physical iOS/Android coverage or a load test. Public course qualification accuracy, readiness semantics, earlier PIN-recovery placeholder and operational persistence findings remain separate from the three browser-suite issues. Actual email-button GET/POST, immutable replay and48-hour elapsed expiration on production remain unverified because sending failed and no original notification links were obtained.

Private working evidence is in ignored `artifacts/live-qa-20261113-round2/`: mail-workflow.json, offer-diagnostic.json, synthetic-applicant-state.json, upload-isolation.json, public-security.json, persona-summary.json, persona-evidence.json, persona-followup-evidence.json, persona-review.md and the QA scripts/screenshots. No bearer token or password is included in this report.

The live QA phase did not change application source or framework/EF/provider/MySQL versions. The subsequent local SMTP diagnostic patch is described above and is being committed with its verification evidence for owner-controlled pushing. Azure App Settings changes were performed by the owner; no push or production deployment was performed by the agent. This report records failures and limits; it does not certify unrestricted production readiness.
