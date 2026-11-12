# Registration batch assignment verification ? 8 November 2026

Confirmed through read-only inspection that the configured local active batch is ID 5, `Batch2026-102`. Its existing applicant/student counts remain zero. Historical `Batch2026-101` retains 24 applicants and 6 students.

## Server rule

`Services/ApplicantService.cs`, `EnrollAsync`, reads the batch whose status is Active during the Serializable registration transaction and writes its ID to the new applicant. If there is no active batch, registration returns a failure instead of creating an unassigned/historical applicant. `EnrollApplicantDto` does not expose an editable BatchId. Both controller submission paths use this service:

- JSON: `POST /api/applicants/enroll`.
- Registration wizard with uploads: `POST /api/applicants/enroll/files`, calling `EnrollWithDocumentsAsync` and then `EnrollAsync`.

The registration wizard posts profile data and files without choosing a batch. Uploaded registration documents are associated with the saved applicant, retaining that applicant's batch ownership. Existing database/app write protections reject creating applicants under a completed batch or moving an existing applicant between batches.

Consequently, successful new submissions belong to Batch2026-102 while it remains Active. Activating a future batch automatically redirects future submissions to that new active batch; normal queries do not hardcode 102.

## Additional regression checks

Expanded `scripts/BatchVerification/Program.cs` to exercise the public HTTP routes through an isolated application and disposable databases:

1. JSON submission is saved as Pending in the active batch.
2. Multipart wizard submission with all four credentials and an identity PDF is saved in the active batch, with all five uploaded records linked to that applicant.
3. A forged historical BatchId in the JSON body cannot select the enrollment batch; the server assigns Active.
4. A historical batch supplied as explicit query context is rejected before insertion.
5. Saved applicant reads, current dashboard totals and pending counts reflect the registrations only in the active batch.
6. All returned historical applicant fields remain unchanged.
7. Future batch activation preserves the additional registrations under their original batch.

**246 integration checks passed**, including all prior lifecycle, document, history and protection checks. The test host used a disposable port and database, isolated file storage and disabled email delivery. It was terminated and its test data/files were cleaned up. No background app was started on port 5188. No test applicants were added to the real database and no live emails were sent.

No production code change, schema migration, connection configuration change or deployment change was required for this request; the existing rule was verified and regression coverage was added. The checks concern the configured local application, not an unverified hosted deployment.

Local evidence: `App_Data/registration-active-batch-2026-11-08.log`.
