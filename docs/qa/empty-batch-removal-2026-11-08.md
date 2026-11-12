# Empty batch removal ? 8 November 2026

At the user's request, removed local batch ID 4, stored as `Batch 2026-A` (requested as `Batch2026-A`). Before removal, inspected all schema columns named `batch_id` and every declared foreign key referencing batches. The batch was Completed and had zero applicants, students, schedules, course documents and notifications. Its only linked row was a `Batch Completed` lifecycle history event.

Created a full MySQL dump and exported the exact removed batch/history records to the ignored local directory `App_Data/database-backups/remove-empty-batch-20261108-152358/`. Locked and revalidated the batch and its linked counts in a Serializable transaction, then deleted only that batch and its one lifecycle history row. No operational records or files were removed, transferred or changed. General application protections against deleting historical enrollment batches remain unchanged.

Read-only verification afterward returned only:

| Batch | Status | Applicants | Students | Archives | Requests | Schedules |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Batch2026-101 | Completed | 24 | 6 | 1 | 8 | 7 |
| Batch2026-102 | Active | 0 | 0 | 0 | 0 | 0 |

Protected connection/deployment configuration hashes remain unchanged. This operation affected the configured local database only; no hosted/Azure connection or deployment was used. No background app was launched. Refresh batch selectors to reload the updated list.
