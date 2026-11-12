# Local-to-Azure import - November 7, 2026

**Database status: COMPLETE. Document-file transfer remains pending.**

Copied the data from local `localhost:3306/abec_system` into Azure `abecserver01.mysql.database.azure.com/abecdb01` after explicit user authorization. The local database was not modified.

Committed: 2026-11-07T15:39:44.9109535+08:00 (Philippines time).

## Result

- All 442 source rows across 18 application tables are represented in Azure.
- Inserted 430 rows and updated 12 shared defaults (four courses, seven rooms, and the active batch).
- Preserved the existing Azure QA accounts and their nondefault data.
- Added nullable `batches.completed_at` in Azure to preserve the local completion timestamps.
- Kept EF migration history, normalized contact/email unique indexes, and all existing foreign-key constraints.
- Verified every mapped imported field, baseline nondefault row, row count, all 19 database foreign-key relationships, student/applicant batch consistency, and a single active batch before committing the transaction.
- No email or SMS was sent. No application deployment or restart was needed.

## Contacts and identity mapping

The user explicitly authorized replacing conflicting contact values with random Philippine-format mobile numbers. Seven imported applicant contact values now use synthetic numbers matching `0917` plus seven digits (11 digits total). They are test values, not verified contact details. No messages were sent to them.

The initial raw-contact count understated normalized conflicts: `+63` and `09` forms of the same number count as one contact. The final normalized inventory contained four groups affecting 11 records, requiring seven replacements. One original number per group was retained.

Only the Azure import copy contains these replacements. The local source and original backups retain their original values. The private `duplicate-contact-review.csv` and `synthetic-contact-corrections.json` document all changes.

Primary and foreign keys were remapped to preserve existing Azure QA rows. Source historical batches 1 and 4 became Azure batches 2 and 3; source active batch 5 maps to existing Azure active batch 1. Shared courses and rooms were reconciled by name. Document paths were remapped with their owning record IDs.

Original password/PIN values were preserved for imported accounts. The existing QA admin/student usernames and passwords remain unchanged.

## Table counts at commit

| Table | Source rows represented | Azure rows at commit |
|---|---:|---:|
| `admin_activity_logs` | 75 | 77 |
| `admins` | 2 | 3 |
| `applicant_registration_documents` | 31 | 31 |
| `applicants` | 24 | 25 |
| `archives` | 1 | 1 |
| `batches` | 3 | 3 |
| `batchhistory` | 34 | 34 |
| `course_management_history` | 15 | 15 |
| `courses` | 4 | 4 |
| `courseschedules` | 7 | 7 |
| `documentrequests` | 8 | 8 |
| `notifications` | 199 | 199 |
| `student_activity_logs` | 7 | 8 |
| `student_course_documents` | 15 | 15 |
| `student_login_credentials` | 0 | 1 |
| `students` | 6 | 7 |
| `trainingrooms` | 10 | 10 |
| `usersettings` | 1 | 2 |

Azure also retains its EF migration-history row. Successful post-import login checks add activity-log rows after the counts above.

## Validation and backups

- Restored and verified both pre-import SQL backups in isolated temporary local databases.
- Tested the exact merge plan against a temporary clone of the Azure backup with its constraints enabled.
- Checked source and destination snapshots for drift before applying the live plan.
- Imported Azure data in a serializable transaction; all data checks passed before commit.
- Post-import: all seven QA login/session checks passed, including denial after student logout.
- Post-import: health and all tested lookup/invalid-input APIs passed; 22 page requests and five additional navigation requests returned HTTP 200.
- The three pre-existing Leaflet image 404s remain; browser/mobile interaction and authorization gaps remain outside this import validation.

Private pre-import backups: `App_Data/data-migration/backups/20261107-073522/`.

Import evidence is saved in ignored `App_Data/data-migration/import-result.json`, `dry-run-result.json`, and `merge-plan.json`. The plan contains private records; do not commit or publish it. The backup/review directory is restricted to the current Windows user and SYSTEM. Do not rerun this import blindly.

## Document files outside MySQL

The imported records reference 32 uploads. Of these, 27 are present locally and have been packaged with corrected destination paths in:

`App_Data/data-migration/backups/20261107-073522/azure-mapped-private-uploads.zip`

The bundle has not been uploaded to Azure App Service. Database copying does not transfer filesystem contents. File delivery requires authenticated access to the App Service storage/deployment tools; no Azure CLI, connected Azure tool, or publish profile was available in this session.

Five registration documents (document IDs 27 through 31) are already missing from the local project. No alternative copies were found in the workspace. Their database records were preserved; the missing files were not replaced or fabricated. Private `azure-mapped-files.json` lists the existing and missing files.

The API authorization gaps in [the deployment review](../deployment-secret-review.md) remain unresolved; this data import does not establish release readiness.
