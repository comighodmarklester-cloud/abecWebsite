# Security PIN workflow review

## Required behavior and existing implementation

Newly issued and explicitly reset PINs use `ABEC` + the uppercase first letter of the registered first name + the uppercase first letter of the registered surname + four random ASCII digits. For Mark Comighod, the format is `ABECMC0000` through `ABECMC9999`. Leading/trailing name whitespace is ignored; the first letter of a multiword name is used. Invalid initials produce a controlled error rather than a made-up credential.

The previous release already implemented this format in the shared backend `SecurityPinGenerator`. Enrollment calls it when creating the student record; activation calls it only when a PIN is missing; the existing Admin Generate PIN action is the explicit replacement workflow. Login, profile reads, routine activation, and startup do not replace an existing credential.

The generator uses `RandomNumberGenerator` to choose from unused four-digit combinations. It checks all student accounts, including archived and inactive students, reserves legacy printed aliases, and keeps the student's current code out of the replacement pool. A database-scoped MySQL advisory lock coordinates application instances with the same initials. The unique database index is authoritative and a duplicate-key conflict retries a different candidate. When all 10,000 combinations for an initials pair are occupied, issuance fails explicitly and preserves the previous credential.

## Changes in this review

- `Services/ActivationService.cs`: an explicit Admin activation now fills a missing PIN even if the account is already Active. The idempotent early return still preserves every existing nonempty PIN. Existing batch restrictions, archive reactivation, notifications, enrollment relationships, and activation email behavior remain in place.
- `Services/SecurityPinGenerator.cs`: restore the previous PIN in the tracked entity when issuance fails or is cancelled. A later unrelated save cannot accidentally persist the unissued candidate. A successful write and existing collision retry behavior remain unchanged.
- `scripts/BatchVerification/SecurityPinWorkflowChecks.cs`: focused integration coverage for creation, trimmed/multiword/lowercase names, pending and active missing-PIN activation, repeated actions, legacy access, explicit reset, archive restrictions/reactivation, and failed/cancelled writes followed by another save and retry.
- `scripts/BatchVerification/Program.cs`: expose those checks through `--security-pin-workflow-only` using the existing disposable-database harness.

No frontend change is needed: the current login, activation, credential notice and authorized reset interfaces already support this format.

## Database and existing accounts

The existing `students.security_pin` field is required text with a 20-character limit, and the existing unique index covers the entire students table. EF configuration and the initial migration already define the index. No new table, column, index, schema migration, or connection setting is required.

Read-only inspection of the known local database found six accounts using older PINs, zero missing PINs, zero duplicate PIN groups, and the existing unique `security_pin` index. No source records or credentials were changed by this review.

Existing PINs remain unchanged. To move a particular existing account to the new format, an authorized Admin uses the existing Generate PIN action and provides the replacement through the existing activation notice workflow. Archived students retain their reserved credentials and cannot receive a replacement until authorized reactivation under the existing system rules. There is no bulk credential rewrite or automatic migration that could lock out existing users. Existing username/password settings are unaffected.

Tests use schema-only clones and synthetic students; source records are not copied or changed. Activation mail tests use test doubles or loopback SMTP, never external recipients. Hosting, deployment workflow, database connection and email configuration files are unchanged.

## Verification

| Check | Result |
| --- | --- |
| Release verification build | Passed with zero warnings and errors |
| Focused PIN workflows | 28 checks passed |
| Existing requested-update regressions | 27 checks plus fixture setup passed, including simultaneous issuance, exhaustion and duplicate retry |
| Authorization and account security | 27 checks passed |
| HTTPS enrollment/activation/email workflow | 78 checks passed with an isolated database and loopback SMTP inbox |

The initial parallel regression attempt encountered MySQL command timeouts during fixture cleanup while the local machine was under memory pressure. The affected suites were rerun one at a time and passed, removing their own isolated test databases and files. Automatic approval review blocked separate cleanup of inactive temporary databases/folders from interrupted runs without a specific reason; those local temporary artifacts were left untouched. This does not affect the application database or production deployment.

Run from the repository root:

```powershell
dotnet build scripts/BatchVerification/BatchVerification.csproj --no-restore -c Release -p:UseAppHost=false -o artifacts/security-pin-review
dotnet artifacts/security-pin-review/BatchVerification.dll --security-pin-workflow-only
dotnet artifacts/security-pin-review/BatchVerification.dll --requested-updates-only
dotnet artifacts/security-pin-review/BatchVerification.dll --strict-security-only
dotnet artifacts/security-pin-review/BatchVerification.dll --slot-workflow-only
```

The existing requested-updates suite additionally tests concurrent issuance into the final two available combinations (`0000` and `0001`), full namespace exhaustion, archived reservations, independent unique-index rejection, forced duplicate-key retry, accented initials and credential-log privacy. The slot-workflow suite tests real authenticated activation, persistence before email delivery and subsequent sign-in using an isolated HTTPS server and loopback inbox.
