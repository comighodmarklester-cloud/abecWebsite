# Enrolled student PIN format updates and Activation Notices

## Behavior

Admin can update existing enrolled students through **Account Activation > Active Accounts > Select > Update Security PINs**. The confirmation names the affected accounts and explains that replaced PINs stop working and fresh Activation Notices must be downloaded. A PIN that already matches the registered initials and the required `ABEC` + two uppercase initials + four digits remains unchanged in this format-update action. The single-account Generate PIN action remains an explicit replacement operation.

Existing accounts previously could not use this workflow because their Generate PIN button was disabled. The existing backend issuer already supported authorized replacement. The UI now uses that issuer for both individual updates and selected accounts. Its former browser-only fallback generator was removed: a missing backend script shows an error and cannot fabricate a credential.

Requests run sequentially and report completed changes and individual failures. Duplicate clicks are blocked. Each request includes the account's last PIN issue event ID, and the backend verifies it under the existing student workflow lock. A stale page or replay cannot silently replace a just-issued credential again. Requests do not use the API client's automatic transport retry. The format-only operation requires a version and also rechecks the saved format on the server.

Activation Notices read the saved credential and the most recent existing **Security PIN Generated** notification date. Their sign-in steps match the current student login workflow. Downloading a notice does not generate another PIN. Previously downloaded PDFs remain unchanged and must be downloaded again. Notice/reissue responses retain `Cache-Control: no-store`.

## Storage and scope

No database migration, new table, new column or connection configuration is needed. The existing uniquely indexed `students.security_pin` field and notification records are reused. Credential generation continues to use the centralized cryptographic generator, namespace lock, duplicate-key retry and database-wide unique index.

The account API provides only nonsecret issuance metadata (current-format flag, issue event version and issue date); routine JSON still excludes the credential. The selected-account flow does not display PIN values in the account list. The authorized per-account operation and Activation Notice retain their existing private credential access.

Only selected active, nonarchived accounts are eligible in the UI. The existing backend authorization, archive checks and completed-batch write restrictions remain in force. Enrollment relationships, documents, account status and username/password credentials are preserved. This is an explicit Admin action; no credential migration runs during startup, login or profile reads. No external email is sent by a PIN-format update.

## Files

- `Services/SecurityPinGenerator.cs`: shared saved-format check using the registered first name and surname.
- `Services/ActivationService.cs`: load issue events, enforce the expected version, skip already-correct credentials in format-only updates, and map current issue metadata.
- `Interfaces/IServices.cs`, `Controllers/ActivationController.cs`: optional version and format-only arguments on the existing authorized issuance endpoint; response indicates whether the PIN changed.
- `DTOs/ResponseDtos.cs`: nonsecret format/version/date metadata.
- `Services/PdfService.cs`: saved generation date and current sign-in instructions within the existing notice layout.
- `Views/Admin/AccountActivation.html`, `wwwroot/js/abec-activation.js`: active-account controls, selected format updates, confirmation, single-attempt requests, partial-result reporting and no fabricated client PINs.
- `scripts/BatchVerification/SecurityPinWorkflowChecks.cs`, `scripts/BatchVerification/SlotWorkflowChecks.cs`: service, concurrency, real PDF and authenticated HTTP coverage.
- `scripts/check-enrolled-pin-updates.cjs`, `scripts/check-enrolled-pin-notice.py`: browser cases and content/render checks for a synthetic Activation Notice.

## Verification

Tests use disposable schema clones and synthetic students. Source records are not copied or modified. Email checks use a loopback SMTP inbox only.

| Check | Result |
| --- | --- |
| Release build | Zero warnings and errors |
| PIN service workflows | 35 passed, including format-only preservation/conversion and concurrent replay rejection |
| Browser cases | 16 passed, including mobile selection, cancellation, duplicate clicks, partial/unknown outcomes, repeat preservation and missing-script failure |
| Authenticated HTTPS workflows | 85 passed, including versioned format updates, unauthorized access rejection, notice downloads and existing activation/email behavior |
| Existing security checks | 103 passed |
| Real notice PDF | Five content/page checks passed; rendered one-page layout visually verified |

```powershell
dotnet build scripts/BatchVerification/BatchVerification.csproj --no-restore -c Release -p:UseAppHost=false -o artifacts/enrolled-pin-updates
dotnet artifacts/enrolled-pin-updates/BatchVerification.dll --security-pin-workflow-only
python scripts/check-enrolled-pin-notice.py
dotnet artifacts/enrolled-pin-updates/BatchVerification.dll --slot-workflow-only
dotnet artifacts/enrolled-pin-updates/BatchVerification.dll --code-security-only
$env:ABEC_PLAYWRIGHT_MODULE = Join-Path $env:TEMP 'abec-ui-verify/node_modules/playwright'
$env:ABEC_VERIFICATION_DLL = Join-Path (Get-Location) 'artifacts/enrolled-pin-updates/BatchVerification.dll'
node scripts/check-enrolled-pin-updates.cjs
```

The notice fixture is in ignored `artifacts/enrolled-pin-notice-fixture/`; its PIN belongs only to a disposable synthetic account. The rendered one-page notice was visually inspected for legibility, spacing, alignment and clipping.
