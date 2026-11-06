# 06 — Status Transitions

All of the following are enforced in services unless noted as display-only. There is no nightly job that advances them.

## Application (`applicants.application_status`)

| From | To | How |
| --- | --- | --- |
| (none) | Pending | Successful enroll |
| Pending | Approved | Staff status update. Emails a token. Deadline starts if the email send succeeds |
| Pending | Waitlisted | Staff. Waitlist email |
| Pending | Rejected | Staff. Slot offer cleared |
| Waitlisted | Approved | Staff. Waitlist-to-approved email kind |
| Approved | Confirmed Slot | Applicant opens the confirm link inside 24 hours |
| Approved | Expired | Next status read or update after `response_deadline` |
| Approved | Rejected with slot response Declined | Applicant opens the decline link. Token cleared |
| Expired, Declined, or Rejected-after-decline | Approved | Staff may offer the slot again |
| Confirmed Slot | Approved | Rejected by the service (“already confirmed”) |
| Confirmed Slot | (student row) | Same confirm action, separate table |

Decline after a student row exists is refused.

## Slot response (`applicants.slot_response`)

AwaitingResponse, AwaitingFromWaitlist, Confirmed, Declined, Expired. Cleared by `ClearSlotOffer` when staff move the application back to Pending, Waitlisted, or Rejected before confirmation.

## Account (`students.account_status`)

| From | To | How |
| --- | --- | --- |
| (no row) | Inactive | Slot confirmation creates the row |
| Inactive | Active | `POST /api/activations/{id}/activate`, bulk activate, or `POST /api/auth/register` with a matching PIN |
| Active or Inactive | Inactive + archive row | Deactivate or `POST /api/archives` with a valid reason |
| Archived | Active, archive row deleted | Activate or reactivate |

Login requires Active. Pending activation and archived are the same column value. The archive table is what distinguishes them.

## Batch (`batches.status`)

Closed on create. Active on activate. The previous Active batch becomes Closed. Complete sets Closed. Records on the batch are not moved.

## Schedule (`course_schedules.status`)

Active or Inactive. A second Active row for the same course is rejected until the first is set Inactive. Delete removes the row.

## Course document preparation

Not Prepared → Ready for Release (upload) → Released (release action). No backward transition is coded. Upload does not set Released.

## Document request

Server rule `IsTransitionAllowed`:

- Pending → Processing or On Hold
- Processing → On Hold or Released
- On Hold → Processing or Rejected
- Legacy Ready for Release → On Hold or Released
- Released and Rejected are final

The admin request screen does not show Ready for Release as a button. Stored legacy Ready for Release is displayed as Processing.

Rejected is the document-archive state. The row stays.

The course-document release action can set a matching open request to Released even when the request state machine would not allow Pending → Released. That path updates the request directly and does not call `IsTransitionAllowed`.

## Archive reason

Graduated, Deactivated, Academic Dismissal, Withdrawal, Inactive Lead, Other. Other requires specific text. A later archive of the same student replaces the reason and date. Reasons are not a history table.

## Notification read state

Unread, Read. `PUT /api/notifications/{id}/read` and mark-all for a student. No expiry.

## What is not a status

Training complete, graduated-as-a-student-column, document eligible, and “enrolled” are computed or implied:

- Enrolled = a `students` row exists.
- Eligible to request = request gate date and the credential is not Released.
- Training complete = that same date comparison. It is not stored.
- Graduated = an archive row whose reason is Graduated, with the account Inactive.
