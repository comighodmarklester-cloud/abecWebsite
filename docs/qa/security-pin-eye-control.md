# Admin Security PIN visibility

The Account Activation student table has five columns: Applicant Name, Course, Confirmation, Status and Date Created. Its Security PIN column, header, values, masks and eye buttons are removed. Column widths total 100%, and the empty-state row spans all five columns. The old positional PIN cell updater was removed so status changes cannot overwrite the Confirmation cell or reintroduce a PIN column.

Student Activation Details retains the fixed mask and eye button for active, nonarchived accounts. Clicking the button reads that student's saved PIN; clicking again removes the value from the page. Opening/closing details, filtering, refreshing account data, leaving the browser window/tab, or waiting thirty seconds hides revealed values. Copy PIN is available only while the details PIN is revealed. Removing the table column does not change the backend issuer, storage, verification, reset, authorization or activation workflow.

Routine account responses still exclude PIN values. The new `GET /api/activations/{id}/security-pin` action uses the existing Admin authorization and selected-batch checks, returns `Cache-Control: no-store`, and reads the existing student field without tracking or saving changes. It rejects missing, inactive and archived accounts and missing PINs. Each reveal fetches the current saved value; no secret is stored in HTML attributes, browser storage or a client-side PIN cache. Hiding an in-flight request invalidates its result so a late response cannot reveal a hidden or different student's PIN.

No schema, connection configuration or PIN-generation behavior changes. Viewing a legacy credential preserves its saved value and does not convert it to the new format. The existing authorized format-update operation remains separate. Fresh Activation Notices continue to use the same saved credential.

## Files

- `Controllers/ActivationController.cs`, `Interfaces/IServices.cs`, `Services/ActivationService.cs`, `DTOs/ResponseDtos.cs`: explicit private read endpoint and response.
- `Views/Admin/AccountActivation.html`, `wwwroot/js/abec-activation.js`: accessible eye buttons, masks, copy behavior, lifecycle cleanup and cache-version update.
- `scripts/check-enrolled-pin-updates.cjs`: browser reveal/hide, fresh reads, cancellation, failures, details/copy, automatic hiding, responsive layout and existing update regressions.
- `scripts/BatchVerification/SlotWorkflowChecks.cs`, `scripts/BatchVerification/SecurityPinWorkflowChecks.cs`: real HTTP authentication, batch boundaries, unchanged saved values and archive restrictions in disposable MySQL schemas.

## Verification

```powershell
dotnet build scripts/BatchVerification/BatchVerification.csproj --no-restore -c Release -p:UseAppHost=false -o artifacts/pin-table
$env:ABEC_PLAYWRIGHT_MODULE = Join-Path $env:TEMP 'abec-ui-verify/node_modules/playwright'
$env:ABEC_VERIFICATION_DLL = Join-Path (Get-Location) 'artifacts/pin-table/BatchVerification.dll'
node scripts/check-enrolled-pin-updates.cjs
dotnet artifacts/pin-table/BatchVerification.dll --security-pin-workflow-only
dotnet artifacts/pin-table/BatchVerification.dll --slot-workflow-only
dotnet artifacts/pin-table/BatchVerification.dll --code-security-only
```

Browser fixtures contain synthetic accounts only. Screenshots in ignored `artifacts/pin-eye-desktop.png` and `artifacts/pin-eye-mobile.png` are captured with values masked. The database suites clone schema only, never production records, and use a local SMTP inbox instead of external email.

The browser suite checks the five-column table before opening details, while a PIN is revealed, after filtering, on mobile and after PIN resets/reloads. It also verifies reveal/hide, copy, delayed-response cancellation, errors, automatic hiding, pending/archive restrictions, single/bulk resets and notice downloads. Masked screenshots cover the desktop/mobile table and mobile details.

Verified on 2026-11-14 after removing the table column: Release build passed with zero warnings/errors; 36 browser checks, 94 authenticated HTTPS workflow checks and 38 focused PIN workflow checks passed. Desktop table and mobile details screenshots were visually inspected. Backend code, stored credentials, schema and connection settings are unchanged by the table removal.
