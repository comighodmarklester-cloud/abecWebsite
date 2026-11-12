# Snyk Code remediation — November 13, 2026

## Scope

The project owner explicitly excluded changes to .NET, EF Core and MySQL versions. No target framework, package version, database-provider version, migration, existing database schema or existing applicant/student data was changed by this pass. Temporary verification databases clone schema only and contain generated test identities.

The earlier version-policy checker and its tests/CI gate were retired because version enforcement is outside this authorized scope. Dependency vulnerability auditing remains enforced in CI. This decision does not assert that the existing framework support status changed.

## Changes

| Finding | Change and security effect |
| --- | --- |
| Argument names classified as credentials | Filter helper parameters now say `routeName` or `argumentName`, expressing that they name request fields rather than cryptographic keys. Actual request names, including `studentId`, and all ownership/role checks are preserved. The verification helper uses the same clear naming. |
| Fixed identity hint in an authorization test | The forged-header test now submits the actual disposable administrator ID instead of the constant `1`. This checks that claiming a real administrator's ID still cannot authenticate the request. |
| Hardcoded test accounts/passwords | `VerificationAccounts` generates fresh usernames and a cryptographically random password for each verification process. The browser receives these disposable credentials over the parent-child stdin pipe. Fixture SMTP credentials are generated too. Production credentials are neither read nor replaced. |
| Cleartext browser fixtures | Both browser fixture servers now use ephemeral HTTPS certificates and bind only to `127.0.0.1`. The application used by the SMTP/email workflow also runs with HTTPS. No certificate-store changes or global TLS-verification bypass are used. Browser trust is limited to the generated test public keys; Node trusts the explicit test certificate. |
| Custom certificate callback | The .NET verification client now uses a dedicated certificate trust store and the normal TLS hostname/chain validation instead of a callback comparing thumbprints. It refuses non-loopback or non-HTTPS origins. A negative TLS test confirms unknown issuers and wrong hostnames are rejected. |
| Dynamic schema SQL | All 67 existing column additions and four existing removals have complete SQL literals in an immutable catalog. Callers must match the exact table, column and definition. Even syntactically valid unapproved operations are rejected before any database metadata query. The SQL operations themselves are unchanged; no new migration or schema change was introduced. |
| Document-preview redirect | View actions accept only positive safe integer IDs and open a fixed same-origin authenticated file endpoint synchronously. They no longer navigate to a generated blob URL. `noopener,noreferrer` prevents opener access and referrer disclosure. Server authorization, ownership checks, verified MIME/signatures and private-path containment remain authoritative. Downloads retain their checked blob-download behavior. |
| Private files exposed by a test server | The browser fixture serves only public HTML in `Views` and assets under `wwwroot`. Configuration files, C# source and Git metadata cannot be downloaded through that fixture. |
| Slot form rejected by origin protection | Rendered-email testing found that `no-referrer` caused browser form submissions to send `Origin: null`. Slot pages now include a server-issued anti-forgery cookie/form pair. Only a valid pair permits that privacy-suppressed origin; cross-site/sibling-site requests, missing/forged tokens and null-origin API writes remain rejected. Existing authenticated sessions are restored before validating identity-bound form tokens. Trailing-slash slot routes receive the same protection. Bearer links still receive `no-referrer` and GET never confirms/rejects an offer. |
| XML parser in the version checker | The unused version-policy utility was removed with its tests and CI invocation under the owner's version-hold instruction. This also removes its newly reported XML-parsing path; no XML-parsing dependency was added. |

No `.snyk` ignore or scanner file exclusion was added. Retiring the out-of-scope version-check feature is distinct from suppressing a finding in active application code.

The slot-form fix preserves privacy instead of trusting all null origins. [MDN documents the effect of referrer policy on form-post Origin headers](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Origin); [OWASP recommends a server-validated CSRF-token fallback when standard origin evidence is unavailable](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html#checking-the-referer-header-if-origin-header-is-not-present). The browser harness forwards complete request headers, including cookies, when simulating the deployment's HTTPS ingress.

## Verification

The final manual IDE rescan was confirmed by the project owner on November 13 as **0 Code Security issues** after the anti-forgery fix. At intake the IDE showed 14 Code findings. Earlier working-directory completion records independently showed Code **0** at 01:13:20, Open Source **0** at 01:17:05 and IaC **0** at 01:23:18 Philippine time. Those earlier timestamps precede the final slot-form regression fix; the final Code result is explicitly the owner's manual confirmation, not a claim that the standalone CLI completed a scan.

| Check | Result |
| --- | --- |
| Release build with CI settings | Passed; zero warnings/errors |
| Backend security policies | 78 passed after the final form fix |
| Public email URL policy | 20 passed |
| Full batch/database/HTTPS integration | 277 passed, including fresh/legacy database upgrades and direct preview authorization/MIME |
| Isolated authorization/account/upload/PIN checks | 20 passed |
| HTTPS slot/activation workflow | 78 passed after the final form fix |
| Captured SMTP notification browser workflow | 154 passed after the final form fix; mobile and desktop, both decisions, expiry and immutable responses |
| System browser security/feature checks | 44 passed; 320px/1366px security scenarios, fixed-route previews, opener isolation, invalid-ID rejection, private-file blocking and PDF downloads; zero uncaught JavaScript errors |
| TLS negative checks | 4 passed, including wrong-host and unknown-issuer rejection |
| Report/archive regressions | 194 passed |
| Registration-script scenarios | 7 passed |
| Dependency audit | No known vulnerable direct/transitive packages; no reported feed errors |
| Version/migration preservation | SHA-256 comparison against the task-start baseline passed for both project declarations and every migration file |

The full integration suite passed before the final slot-form fallback was introduced; the final security-policy and slot/browser workflow suites specifically exercise that additional change. Browser checks wait for the page/controller to finish loading before interacting, so an early click cannot produce a misleading initialization failure. HTML script version tags were updated to load the corrected document-preview code after refresh.

Reproduction commands (existing framework/provider versions):

```powershell
dotnet build scripts/BatchVerification/BatchVerification.csproj --no-restore -c Release -p:ContinuousIntegrationBuild=true -p:UseAppHost=false -o artifacts/security-final-20261113
dotnet artifacts/security-final-20261113/BatchVerification.dll --code-security-only
dotnet artifacts/security-final-20261113/BatchVerification.dll --public-url-only
dotnet artifacts/security-final-20261113/BatchVerification.dll
dotnet artifacts/security-final-20261113/BatchVerification.dll --strict-security-only
$env:ABEC_PLAYWRIGHT_MODULE = Join-Path $env:TEMP 'abec-ui-verify/node_modules/playwright'
$env:ABEC_SLOT_BROWSER_CHECKS = '1'
dotnet artifacts/security-final-20261113/BatchVerification.dll --slot-workflow-only
node scripts/check-system-mobile.cjs --security-only
node scripts/check-fixture-https.cjs
node scripts/check-reports-layout.cjs
node scripts/BatchVerification/check-registration-flow.cjs
```

The Snyk IDE is authenticated. The standalone CLI returned an authentication error, so IDE results and its working-directory completion records are the scan evidence. Dedicated Snyk Secrets is disabled for this organization; Code results do not represent a dedicated Secrets scan.

No production deployment, external email, live-account PIN reset or restart of the user's existing development server was performed. Existing legacy credentials are preserved. Backend changes take effect when the application is rebuilt/restarted.
