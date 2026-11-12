# Snyk Code Security review — November 12, 2026

> November 13 update: the project owner excluded .NET/EF Core/MySQL version changes. The earlier version-enforcement utility and CI gate were removed. See the [current remediation record](snyk-code-security-fixes-2026-11-13.md) for the final changes, scan results and verification. Counts and release-gate commands below describe the earlier review and are historical.

## Strict follow-up review

The deeper review found application vulnerabilities beyond the scanner's remaining patterns. The following fixes are implemented in the working tree:

| Area | Finding and fix |
| --- | --- |
| Authorization | Training-room endpoints were omitted from the protected-controller list. MVC controller authorization now denies access by default, with an explicit list of public actions. Anonymous callers and students cannot administer rooms. Admin profile routes require the signed-in admin's own ID. Forged identity headers do not authorize requests. |
| Disabled accounts | The legacy registration/sign-in path could reactivate an inactive account. It now requires an already active account and preserves its status and issued PIN. |
| Session revocation | Authentication cookies now carry a fingerprint of the current server-side credentials. API and admin requests revalidate it against the database. Password/PIN changes and deactivation invalidate older cookies; a successful password change refreshes the current browser's session. Existing cookies issued before this change require sign-in again. |
| Credentials | Newly generated PINs use a cryptographic generator with 80 random bits, fit the existing 20-character column, and support mobile text entry. Startup fills missing PINs without rewriting issued credentials. Admin password changes require at least eight characters and reject values over BCrypt's 72-byte UTF-8 limit. Malformed admin hashes fail closed; successful legacy plaintext admin login upgrades the stored value to a hash. |
| Cross-origin writes | API and slot POST/PUT/DELETE requests check the configured public Origin, Referer or browser Fetch Metadata. Untrusted sibling origins and cookie requests without origin evidence are rejected. Local CORS origins are restricted to Development. Authentication endpoints are rate limited, and client IP/user-agent metadata comes from the request rather than JSON fields. |
| Response policy | Production cookies are Secure, HttpOnly and SameSite Strict. Responses add MIME-sniffing, framing and base/form CSP restrictions; sensitive API/slot responses are not cached. Production responses include HSTS. This is a baseline CSP, not a complete script nonce policy. |
| File handling | Upload headers and database MIME fields are untrusted. Registration, request-release and course-document downloads derive PDF/JPEG/PNG types from the stored extension and verified signatures, enforce private-root containment, and sanitize suggested filenames. Upload validation uses the same complete signatures. This does not replace malware scanning or full document parsing. |
| Logs and schema | API/startup/expiry errors log a generated reference or error type without raw database/provider exception text. Hosting informational request logs are disabled because their URLs include email-link bearer tokens. Schema changes accept only validated identifiers and a closed set of code-defined column definitions before constructing provider-quoted DDL. |
| Delivery pipeline | Actions are pinned to reviewed commit SHAs, checkout credentials are not persisted, job permissions/timeouts are bounded, and dependency-audit warnings/feed failures fail CI. Security, frontend and support-policy checks run before publication. No scanner ignores were added. |

### Release blockers and remaining verification

**Do not treat a clean dependency report as production approval.** This project still targets `net8.0` and EF Core 8. Microsoft ended their support on November 10, 2026; the support policy covers the runtime, ASP.NET Core and EF Core. See Microsoft's [end-of-support announcement](https://devblogs.microsoft.com/dotnet/dotnet-8-9-end-of-support/) and [support policy](https://dotnet.microsoft.com/en-us/platform/support/policy).

`scripts/check-release-policy.py` intentionally exits with failure for this stack, and the deployment workflow now runs it before publish/deploy. Retargeting the runtime alone is insufficient: migrate EF Core and the MySQL provider together, verify existing databases/migrations and documents, and update the Azure runtime. The reviewed [Pomelo compatibility table](https://github.com/PomeloFoundation/Pomelo.EntityFrameworkCore.MySql#compatibility) lists stable 9.0.0 for EF Core 9 and 8.0.3 for EF Core 8, with no stable EF Core 10 provider listed. No preview provider or unverified database migration was substituted.

Issued legacy PINs remain unchanged to avoid silently locking out applicants/students. Administrators must rotate weak historical PINs through a controlled credential-delivery process or move those users to password login. No bulk reset or external email was performed. Verify Azure HTTPS-only/TLS settings and trusted proxy forwarding before release; the limiter currently partitions by the connection IP, which may be shared behind a proxy.

The last completed IDE scans before this strict pass reported **12 Code findings (0 high, 5 medium, 7 low)** at 21:42:04 and **0 Open Source findings** at 21:44:27 Philippine time. The desktop automation connection timed out during the attempted new scan. Those figures are historical evidence, not a fresh scan of the final changes. Re-run the authenticated Snyk Code scan before release and assess every remaining flow; do not suppress categories to obtain zero findings. The current NuGet vulnerability check independently reports no known vulnerable packages, including transitive dependencies.

### Strict verification evidence

Debug and Release builds passed with zero warnings/errors, including the CI build settings. The backend suite passed **71** privacy, origin, response, upload, schema and password checks and **20** public-URL policy checks. The isolated database security suite passed **20** authorization, disabled-account, hostile-MIME/path and PIN checks. The final Release integration suite passed **273** checks, including HTTPS behavior and fresh/legacy database migrations. HTTPS tests use a temporary self-signed certificate pinned to the fixture thumbprint, real Production cookie settings, schema-only disposable databases, and synthetic identities. They verify profile/room access, cross-origin denial, Secure cookie flags, password-change session revocation, a sign-in burst returning HTTP 429, and absence of a supplied email-link bearer token from framework stdout/stderr logs. No existing applicant/student records are copied or changed.

The **73** slot/activation email workflow checks passed with the new request/session policy. They use HTTP, isolated MySQL and a loopback SMTP inbox, and cover scanner-safe link openings, explicit actions, expiration, response immutability and activation notifications. No external notification was sent.

The current dependency audit found no known vulnerable direct/transitive packages; restore also passed with CI audit warnings treated as errors. Workflow YAML and changed JavaScript syntax checks passed. All four support-policy tests passed, and the actual support gate correctly rejected the current runtime/EF versions. Report/archive checks (**194**) and registration-script scenarios (**7**) passed.

All **37** browser checks passed with zero uncaught JavaScript errors, including security scenarios at 320px and 1366px, literal address/trainer payload handling, registration controls and PDF downloads. Screenshot inspection exposed a timing gap in the desktop layout assertion: it could pass before any schedule cards loaded. The check now waits for visible populated cards and explicitly rejects an empty detail list. Its **17** relevant browser scenarios passed again after that correction. One earlier browser run stalled during local machine pressure and was terminated; the separate rerun completed successfully.

Reproduce the strict checks with:

```powershell
dotnet build scripts/BatchVerification/BatchVerification.csproj -p:UseAppHost=false -o artifacts/strict-security
dotnet artifacts/strict-security/BatchVerification.dll --code-security-only
dotnet artifacts/strict-security/BatchVerification.dll --public-url-only
dotnet artifacts/strict-security/BatchVerification.dll --strict-security-only
dotnet artifacts/strict-security/BatchVerification.dll
dotnet artifacts/strict-security/BatchVerification.dll --slot-workflow-only
dotnet list 'ABEC System.csproj' package --vulnerable --include-transitive
python scripts/test_release_policy.py
python scripts/check-release-policy.py # Expected failure while net8.0 / EF Core 8 remain.
```

No deployment or restart of the existing developer server was performed. Browser checks use emulated screen sizes and synthetic API fixtures; they do not establish physical-device or external-mailbox delivery results.

## Earlier Snyk remediation outcome

The follow-up implementation reduced the refreshed Code scan from **29 to 12 findings**, with **zero high, five medium and seven low**. The logging, personal-data and DOM-XSS findings cleared. No scanner ignores or file exclusions were added.

- Shared email logs now contain only a random delivery reference, operation result and code-defined error type. Raw provider exceptions, recipients, subjects, SMTP usernames and passwords are excluded. Delivery failures return a useful category and reference rather than provider exception text.
- Email pickup copies require `Email:SaveDevelopmentCopies=true` **and** Development mode. The default is off. Copies cannot be saved inside the public web root, and filenames do not contain addresses. Explicitly enabled copies still contain sensitive notification content: keep them private and remove them when local troubleshooting is complete.
- Province and city codes must contain nine or ten ASCII digits before filesystem/network use. Location errors omit request values and provider exception text. SMTP settings validate address/host/port/sender fields, use configured identities, and log only a fixed success message. The unused password hint no longer returns a fabricated password mask.
- Both registration entry points use `wwwroot/js/abec-enroll-modal.js`. The admin page fetches its same-origin markup with redirects disabled and loads a fixed script path; it no longer executes inline JavaScript extracted from an HTML response.
- Location/trainer/room options are created with DOM text/value properties. Report and activation download anchors remain detached from the page DOM. Document previews verify PDF/JPEG/PNG response types and release temporary blob URLs.

The remaining 12 scanner findings are individually reviewed patterns: five route/argument/header-name warnings, two disposable test-identity warnings, one disposable test-password warning, two loopback HTTP fixture servers, one code-defined schema upgrade, and one generated document-preview blob URL. They remain visible for review; this change does not claim a zero-finding scan. The schema helper uses provider-quoted identifiers and private code-defined definitions; preview uploads are restricted and response types are checked.

Verification commands:

Results: build passed with zero warnings/errors; 34 backend security checks, 73 SMTP/slot workflow checks, 37 browser checks (zero uncaught JavaScript errors), 194 report/archive checks and seven registration-script scenarios passed.

```powershell
dotnet build scripts/BatchVerification/BatchVerification.csproj -p:UseAppHost=false -o artifacts/code-security
dotnet artifacts/code-security/BatchVerification.dll --code-security-only
dotnet artifacts/code-security/BatchVerification.dll --slot-workflow-only
node scripts/check-reports-layout.cjs
node scripts/BatchVerification/check-registration-flow.cjs
$env:ABEC_PLAYWRIGHT_MODULE = Join-Path $env:TEMP 'abec-ui-verify/node_modules/playwright'
node scripts/check-system-mobile.cjs --security-only
```

The dedicated backend checks exercise log privacy and control-character payloads, provider/parsing failures, production/development copy policy, public-directory rejection, valid and invalid location codes, and SMTP settings validation. The workflow suite uses isolated MySQL and loopback SMTP, with no external email. Browser security checks use synthetic fixtures and cover admin registration, close confirmation, literal address/trainer payloads and PDF downloads at 320px and 1366px. These are emulated viewport checks, not physical-device tests. Deploy/restart the app to activate backend changes.

## Original scan review

The refreshed working-directory Snyk Code scan completed at 21:07:13 Philippine time and reported **29 findings: 1 high, 9 medium, 19 low**. The findings were inspected in the VS Code Snyk panel and checked against the current source. Application code and scanner ignore rules were not changed during this review.

The highlighted line can be a source or an intermediate call rather than the final operation. For example, the controller logging findings lead into `EmailConfigService` and `LocationService`; they are not stale merely because the controllers do not contain a logger. Snyk describes this source-to-sink analysis in its [data flow documentation](https://github.com/snyk/user-docs/blob/main/scan-fix-and-prevent/scan-with-snyk/snyk-code/manage-code-vulnerabilities/breakdown-of-code-analysis.md).

## Assessment

| Finding category | Count | Assessment and recommended action |
| --- | ---: | --- |
| DOM-based XSS | 5 | The high finding is the Reports PDF download. Its location input is URL encoded; the response must be PDF; a generated blob URL is assigned to a download anchor. No direct HTML injection was identified in that path. Activation uses the same checked PDF download pattern. Trainer options escape their values and labels. Location options escape quotes in values and `<` in labels. The admin registration feature intentionally imports markup and executes an inline script from the app's LandingPage; moving that initializer into a shared external script would reduce reliance on dynamic code execution. See individual entries below. |
| Open redirect | 1 | Document preview opens a generated blob URL, rather than an attacker-supplied redirect URL. The server restricts uploads to PDF/JPEG/PNG and checks file headers. No arbitrary external redirect was identified in this path. |
| SQL injection | 1 | Startup flows into schema creation. The private schema helpers receive code-defined table names, column names, and definitions. Identifiers are quoted with the EF provider's SQL helper. No request-controlled SQL was identified. Keep schema definitions code-controlled. |
| Log forging | 3 | Actionable hardening: request-derived SMTP settings and location values reach logs. Bound and validate location codes and remove control characters from logged request values; do not rely on message-template parameters alone to establish input safety for every log provider. |
| Personal information exposure | 6 | Actionable privacy hardening: six callers lead into the shared email service, which logs recipients and subjects. Reduce or mask these values and use record/correlation IDs for diagnosis. Limit access and retention for logs and email pickup copies. The review did not establish public access to these logs or copies. |
| Hardcoded credentials/passwords | 11 | The flagged values consist of argument/header names, an SMTP username fallback, a password-display mask, and isolated test identities/passwords. No production password was established by these findings. Keep production SMTP credentials in host configuration and keep fixture credentials confined to disposable tests. |
| HTTP instead of HTTPS | 2 | Both are browser-test servers explicitly bound to `127.0.0.1` with synthetic/isolated fixtures. They do not establish a production cleartext transport issue. Preserve loopback binding. |

These are manual assessments, not proof that every possible execution path is safe. In particular, extracting trusted registration scripts and using DOM option APIs would make the JavaScript safety properties easier to maintain and analyze. Do not suppress entire files or categories to obtain a clean scan.

## Individual findings

Line numbers are the locations displayed by the refreshed scan, using one-based numbering.

| # | File:line | Snyk finding | Review |
| ---: | --- | --- | --- |
| 1 | `Controllers/AdminProfileController.cs:79` | Log forging | SMTP settings flow into the log in `EmailConfigService.SaveSettingsAsync`. Sanitize or omit request values there. |
| 2 | `Controllers/LocationController.cs:21` | Log forging | Province code flows into `LocationService` URL/error logging. Validate numeric code format and sanitize logged values. |
| 3 | `Controllers/LocationController.cs:25` | Log forging | City code follows the same location-service logging path. |
| 4 | `Program.cs:165` | SQL injection | Startup invokes schema helpers with code-defined definitions and provider-quoted identifiers. No request SQL injection identified. |
| 5 | `Services/ActivationService.cs:263` | Personal information exposure | Activation email recipient flows into shared email logging/pickup handling. |
| 6 | `Services/ApplicantService.cs:555` | Personal information exposure | Applicant email flows into shared email logging/pickup handling. |
| 7 | `Services/ApplicantService.cs:1181` | Personal information exposure | Same shared email sink. |
| 8 | `Services/ApplicantService.cs:1238` | Personal information exposure | Same shared email sink. |
| 9 | `Services/ApplicantService.cs:1268` | Personal information exposure | Same shared email sink. |
| 10 | `Services/ApplicantService.cs:1304` | Personal information exposure | Same shared email sink. |
| 11 | `Services/BatchAccessFilter.cs:28` | Hardcoded credentials | `studentId` is a route-key name, not a credential. |
| 12 | `Services/BatchContextFilter.cs:18` | Hardcoded credentials | `studentId` is an action-argument key. |
| 13 | `Services/BatchWriteFilter.cs:24` | Hardcoded credentials | Action-argument lookup, not authentication material. |
| 14 | `Services/BatchWriteFilter.cs:83` | Hardcoded credentials | Action-argument lookup helper, not authentication material. |
| 15 | `Services/EmailConfigService.cs:49` | Hardcoded credentials | Default SMTP username. Configuration cleanup is reasonable; this is not a hardcoded password. |
| 16 | `Services/EmailConfigService.cs:65` | Hardcoded credentials | Same default SMTP username. |
| 17 | `Services/EmailConfigService.cs:53` | Hardcoded credentials | Password-display mask, not the password. |
| 18 | `scripts/BatchVerification/Program.cs:364` | Hardcoded credentials | `X-Abec-Admin-Id` header name in an authorization rejection test. |
| 19 | `scripts/BatchVerification/Program.cs:90` | Hardcoded credentials | Disposable integration-test admin identity; password is hashed. |
| 20 | `scripts/BatchVerification/Program.cs:277` | Hardcoded credentials | Disposable integration-test student login fixture. |
| 21 | `scripts/check-slot-email-browser.cjs:14` | HTTP instead of HTTPS | Synthetic inbox bound to loopback. |
| 22 | `scripts/check-slot-email-browser.cjs:19` | Hardcoded passwords | Login credential for the isolated integration-test account. |
| 23 | `scripts/check-system-mobile.cjs:22` | HTTP instead of HTTPS | Synthetic fixture server bound to loopback. |
| 24 | `wwwroot/js/abec-activation.js:240` | DOM-based XSS | Generated blob URL on a download anchor after checking PDF content type; no HTML injection identified. |
| 25 | `wwwroot/js/abec-add-applicant.js:124` | DOM-based XSS | Executes the app's fetched registration initializer. Extract to a shared static script for simpler trust boundaries. No user-controlled script source was demonstrated. |
| 26 | `wwwroot/js/abec-courses.js:888` | DOM-based XSS | Stored trainer names pass through `optionHtml`/`esc`, escaping attribute and text contexts. DOM `Option` objects would avoid HTML construction. |
| 27 | `wwwroot/js/abec-documents.js:1107` | Open redirect | Generated preview blob URL; no arbitrary external redirect identified. |
| 28 | `wwwroot/js/abec-landing.js:331` | DOM-based XSS | Option values escape double quotes and labels escape `<`. Prefer DOM `Option` objects for maintainability. |
| 29 | `wwwroot/js/abec-reports.js:616` | DOM-based XSS — high | Encoded batch ID, PDF response check, generated blob URL, sanitized filename and download anchor. No direct HTML injection identified. |

## Suggested remediation order

1. Remove raw recipient/subject values from shared email logs; restrict pickup copies to the intended environment and retention policy.
2. Validate location identifiers and clean control characters from remaining request-derived log values.
3. Extract the registration initializer into a shared external script and use DOM APIs for dropdown options.
4. Retain narrow written justifications for confirmed false positives. Rescan after changes and assess any remaining findings individually.

This review concerns the Code Security results. The earlier dependency update addressed the separate Open Source findings. No production deployment or external email was performed for this review.
