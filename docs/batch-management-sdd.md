# Software Design Document

## Batch Lifecycle and Student Document Management

### 1. Purpose and scope

This design covers how ABEC admins complete and review training batches, how Document Management organizes records and notifications by batch, and how students access or request documents after training and assessment end.

The system distinguishes between completing a batch and selecting a batch to view. Completing a batch changes its lifecycle status. Selecting a batch in Document Management changes the records displayed on that page.

### 2. Batch lifecycle

| Batch state | Admin access | Student experience |
| --- | --- | --- |
| Active | The admin can manage batch records through the existing workflows. | The student sees their batch name and uses the normal dashboard, including the Training Schedule and Documents pages. |
| Completed | The admin can reopen the batch to view records and use navigation controls. Adding, editing, and removing general batch records is disabled. Document requests and releases remain available through Document Management. | The dashboard shows a message confirming that training and assessment have ended. The Training Schedule is hidden, and the Documents page remains available. |

When an admin completes a batch, the system records the completion date and preserves the batch’s existing records. A new batch starts with an empty set of applicant, enrolled-student, and archived-student records. Those records remain associated with their original batch.

The server enforces completed-batch restrictions on write operations. The admin interface reflects those restrictions by disabling or hiding controls that modify completed records. Viewing a completed batch leaves its status as Completed.

### 3. Batch records and registration

Every application, enrollment, archived-student record, document, and document request must be associated with its original batch. Student access is determined by the student’s own enrollment, while the admin’s Document Management view is filtered by the selected batch.

Phone numbers and email addresses are unique within each batch. During registration, the system checks each supplied contact value independently. A phone number or email address used in a previous batch may be reused in a new batch. If either value is already registered in the same batch, the system rejects the duplicate and identifies the affected field.

The registration check uses normalized contact values and a batch-scoped uniqueness constraint so that simultaneous submissions cannot register the same contact value in one batch.

### 4. Admin Document Management

Add a Batches dropdown that lists the active batch and previous batches. Default to the active batch when one exists. When the admin selects a batch, load the documents and related applicant, enrolled-student, and archived-student information for that batch.

Document-related activity in completed batches continues to generate notifications. Each notification is associated with its batch and the affected document or request. Show a red badge above the corresponding batch name in the dropdown. The badge shows the number of unread document notifications for that batch and updates when the admin marks those notifications as read.

The completed-batch document workflow allows authorized admins to review requests and release documents. General applicant and student records remain read-only.

### 5. Student dashboard and document requests

Display the student’s enrolled batch name on the dashboard. After the batch is completed, hide the Training Schedule page from student navigation and show a message such as:

> Your batch has completed its training and assessment period. You can view and download your available documents on the Documents page.

The Documents page continues to show the soft copies ABEC released to the student during processing, training, or after batch completion. Released files are available for download by the student they belong to.

| Document | Request eligibility |
| --- | --- |
| TESDA National Certificate soft copy | The student can request the certificate while it is unreleased. Once ABEC releases it to the student, the page shows the download option. |
| Payment receipt | The student can request a receipt once all required fees have been paid. |
| Certificate of Completion | The student can request the certificate once their required training and assessment days are complete. |

Remove the general Request New Documents section. Give each requestable document its own button. When the student selects a request button, display the existing guidelines before submission. The server rechecks eligibility and records an accepted request against the student’s enrollment and batch.

### 6. Acceptance criteria

1. An admin can reopen a completed batch and navigate its records. Attempts to add, edit, or remove general batch records are rejected by the server.
2. A new batch opens with no applicant, enrolled-student, or archived-student records carried over from the previous batch.
3. Registration accepts a phone number or email address used in a different batch and rejects either value if it is already registered in the same batch.
4. Selecting a batch in Document Management displays records only from that batch. A new document request from a completed batch increases that batch’s red unread badge, and the admin can process the request and release the document.
5. After batch completion, the student sees the batch name and completion message, can download their released documents, and no longer has access to the Training Schedule.
6. Each document request follows its own eligibility rule. The guidelines appear before submission, and the general Request New Documents section is removed.

The design treats the red badge as an unread notification count. It also uses each student’s own completion record to determine eligibility for a Certificate of Completion, so the batch-wide status and individual eligibility can be tracked separately.
