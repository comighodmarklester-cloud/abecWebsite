# Student activation email

Verified locally on November 11, 2026. Production deployment and inbox testing
remain deferred, as requested in the preceding email-workflow task.

When a non-archived Inactive student (Pending Activation) becomes Active, both
individual and bulk activation use the same service method. It commits the
activation, saved PIN and in-app notification before sending email through the
existing configured ABEC email service.

The email uses the exact subject **Your ABEC Student Account Is Now Active**,
addresses the student by full name, confirms the account is ready to use, and
includes their saved security PIN and a **Student Portal** link to
`{App:PublicBaseUrl}/Views/Home/LoginPage.html`.

A student-scoped lock prevents repeated/concurrent activation requests from
sending duplicate emails and prevents PIN regeneration during the send.
Already Active accounts do not send again. Reactivating an archived account
preserves the existing workflow and does not trigger the Pending Activation
email. Delivery failures retain Active status and return an `EMAIL_NOT_SENT`
warning that the individual and bulk admin actions display.

## Verification

- Build with warnings as errors: zero warnings/errors.
- 65 end-to-end approval, slot-response and activation checks passed using real
  HTTP requests, an isolated MySQL database and an SMTP inbox on loopback only.
- The inbox checked, through a separate database connection while receiving each
  activation email, that the recipient's account was already Active and that
  the name and PIN in the message matched that student's saved record.
- Individual, concurrent and bulk activations were verified. Duplicate IDs and
  already Active accounts did not generate additional activation emails.
- Emailed PINs successfully signed in using the student-login API.
- Failed and unauthorized activation attempts sent no email. A forced SMTP
  failure left the account Active and returned the admin warning.
- Existing feedback and applicant email-retry checks passed.
- The full existing batch integration suite passed, including activation,
  reactivation, historical-account access, batch isolation and migrations.

No external email was sent. Test databases and private test files were removed
by the integration harness; existing application records were unchanged.

```powershell
dotnet build scripts/BatchVerification/BatchVerification.csproj --no-restore -p:BaseOutputPath=artifacts/activation-email-build/ -p:UseAppHost=false --warnaserror
dotnet scripts/BatchVerification/artifacts/activation-email-build/Debug/net8.0/BatchVerification.dll --slot-workflow-only
```
