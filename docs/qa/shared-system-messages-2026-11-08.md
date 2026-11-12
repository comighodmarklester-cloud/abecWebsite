# Shared admin and student message design

Implemented on November 8, 2026.

## Behavior

- Admin, student, login, and registration action feedback uses `AbecFeedback`.
- Success, error, warning, and information messages share one card design at the upper-right corner, including on mobile.
- Each message starts dismissing five seconds after it becomes visible. A short exit animation removes its element.
- Up to three messages appear at once. Additional messages wait rather than cutting another message's five-second display short.
- Repeated identical messages already displayed or queued are combined. Manual dismissal remains available.
- Legacy `ok` and `warn` types map to the shared success and warning variants.
- Saved actions with failed email/notification delivery appear as warnings and retain their original outcome text.
- Action-message helpers clear their old inline banners to avoid displaying duplicate feedback.
- Field validation retains invalid-field highlighting and presents its message through the shared component. Browser constraint-validation errors include their field label.
- Failed API reads use the same feedback component; write workflows retain ownership of their result messages.

Confirmation dialogs continue to require an explicit choice. Loading indicators, document statuses, empty/unavailable data states, notification inbox/history records, and form instructions retain their purpose; they are not automatically removed after five seconds.

## Scope

The implementation changes frontend JavaScript, obsolete toast markup/styles, and script cache versions. It does not change database ownership, permissions, endpoints, migrations, deployment settings, or connection configuration.

The shared API client retains its response shape, request URLs, credentials, and retry behavior. The new read-error reporting only adds presentation feedback.

## Verification

Run from the repository root:

```powershell
node scripts/BatchVerification/check-feedback.cjs
node scripts/BatchVerification/check-batch-page.cjs
node scripts/BatchVerification/check-document-active-batch.cjs
```

- Shared feedback: 43 mocked DOM/clock/API checks.
- Batch Management: 62 mocked workflow checks.
- Document Management active-batch behavior: 14 mocked workflow checks.
- Static page and JavaScript inspection checks asset references, duplicate IDs, and syntax.

These are automated source/behavior checks, not a claim of visual browser testing or real email delivery. No real applicants, accounts, document requests, or batch changes are created by these checks. No database migration or server rebuild is required for these static assets. Refresh existing tabs with Ctrl+F5.
