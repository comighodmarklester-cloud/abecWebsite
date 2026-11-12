# Applicant approval email and slot responses

Verified locally on November 11, 2026. Deployment and production inbox verification
are deferred at the user's request. No external email was sent.

## Behavior

- Approving a Pending applicant commits the approval before attempting SMTP.
  The email includes the applicant's generated application-form PDF and links
  labeled **Confirm Slot** and **Reject Slot**.
- Each offer uses 32 cryptographically random bytes encoded as a 64-character
  token, with a saved 24-hour deadline. Both links use `App:PublicBaseUrl`.
- Opening either link displays a form. GET requests, including expired-link
  requests, do not change application status. Responses use `no-store` and
  `Referrer-Policy: no-referrer` headers.
- Submitting Confirm saves the decision and creates an Inactive student in the
  applicant's batch, visible in Account Activation > Pending. The operation is
  atomic: insufficient capacity leaves the offer unchanged.
- Submitting Reject saves Rejected/Declined on the existing applicant, preserves
  their course and batch, and leaves the token available to display the saved
  result. The applicant appears in the Applicants Rejected list and the existing
  Archives > Rejected Slots aggregation. No artificial student account or
  duplicate student archive is created for a rejected applicant.
- Repeated or opposite-button submissions display the first recorded result.
  MySQL connection-scoped application locks coordinate concurrent requests across
  application instances. Course locks serialize confirmations competing for capacity.
- A failed send returns an `EMAIL_NOT_SENT` warning while retaining the approval.
  The applicant's Approved card displays the email failure, and its modal exposes
  **Retry approval email**. Retry reuses the application, offer token and deadline;
  successful delivery removes the retry action. Retries do not create duplicate
  approval notifications. Explicitly reapproving an expired offer creates a new
  token and fresh deadline.
- Contact uniqueness validation runs for new applicants and contact edits.
  Status-only updates retain database uniqueness constraints without the broad
  contact reads that caused concurrent approval deadlocks.

## Email configuration

Development keeps the existing Email Delivery configuration interface. Production
does not load `smtp.local.json`, write mail pickup copies, or accept email-setting
file writes through that interface. Production requires TLS for SMTP and a public
HTTPS `App__PublicBaseUrl`; it uses the configured sender and provider from host
settings/secrets. SMTP supports STARTTLS and implicit TLS on port 465.

No production provider, sender verification, credentials, deployment or inbox was
changed or verified during this work.

## Verification

- Build with warnings treated as errors: zero warnings and errors.
- 47 end-to-end workflow checks using a real HTTP child application, an isolated
  MySQL database cloned from schema only, and a loopback SMTP server that receives
  actual MIME messages. Includes forced delivery failure, concurrent retries,
  scanner GETs, decision replay, conflicting choices, expiration, reoffers,
  pending activation, filtered archive counts and last-slot capacity races.
- SMTP attachment extracted and inspected using PDF text extraction: intended
  applicant name and registered email present; a different applicant absent.
- 7 applicant retry UI checks passed.
- Existing batch integration suite passed, including contact uniqueness,
  cross-batch protection, enrollment, activation, historical records and migrations.
- 178 Reports/archive controller checks and 43 feedback checks passed.
- Temporary databases and private test files were cleaned up by the integration
  harness. Existing application records were unchanged.

Run from the repository root:

```powershell
dotnet build scripts/BatchVerification/BatchVerification.csproj --no-restore -p:BaseOutputPath=artifacts/slot-workflow-build/ -p:UseAppHost=false --warnaserror
dotnet scripts/BatchVerification/artifacts/slot-workflow-build/Debug/net8.0/BatchVerification.dll --slot-workflow-only
node scripts/BatchVerification/check-applicant-email-retry.cjs
```

The workflow test uses a disposable database and fake addresses under
`example.invalid`. It requires the repository's known local MySQL source and
permissions to create and remove a schema-only test database. It cannot target
the deployed database.
