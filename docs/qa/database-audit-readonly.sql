-- ABEC aggregate database audit. Select the intended schema in your SQL client.
-- Read-only inspection: no repairs, migrations, credential values, or personal rows.
-- Expected MySQL 8.x. Run in one session and finish promptly.
START TRANSACTION READ ONLY, WITH CONSISTENT SNAPSHOT;

SELECT DATABASE() AS inspected_database, VERSION() AS mysql_version,
       @@session.transaction_read_only AS read_only_transaction,
       @@session.time_zone AS session_time_zone,
       @@foreign_key_checks AS foreign_keys_enabled;

SELECT TABLE_NAME, ENGINE, TABLE_COLLATION, DATA_LENGTH, INDEX_LENGTH
FROM information_schema.TABLES
WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE'
ORDER BY TABLE_NAME;

SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE,
       GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS indexed_columns
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA=DATABASE()
GROUP BY TABLE_NAME, INDEX_NAME, NON_UNIQUE
ORDER BY TABLE_NAME, INDEX_NAME;

SELECT k.TABLE_NAME, k.COLUMN_NAME, k.REFERENCED_TABLE_NAME,
       k.REFERENCED_COLUMN_NAME, r.DELETE_RULE
FROM information_schema.KEY_COLUMN_USAGE k
JOIN information_schema.REFERENTIAL_CONSTRAINTS r
  ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA
 AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND r.TABLE_NAME=k.TABLE_NAME
WHERE k.TABLE_SCHEMA=DATABASE() AND k.REFERENCED_TABLE_NAME IS NOT NULL
ORDER BY k.TABLE_NAME,k.CONSTRAINT_NAME,k.ORDINAL_POSITION;

SELECT COUNT(*) AS active_batches FROM batches WHERE status='Active';
SELECT COUNT(*) AS unassigned_applicants FROM applicants WHERE batch_id IS NULL;
SELECT COUNT(*) AS inconsistent_student_batch
FROM students s JOIN applicants a ON a.applicant_id=s.applicant_id
WHERE a.batch_id IS NULL OR a.batch_id<>s.batch_id;

-- Normalize supported punctuation, +63 and 09 forms, without showing phone values.
WITH stripped AS (
  SELECT batch_id,
    REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(contact_number),
      '+',''),' ',''),'-',''),'(',''),')','') AS phone
  FROM applicants
), normalized AS (
  SELECT batch_id,
    CASE WHEN LENGTH(phone)=12 AND LEFT(phone,2)='63'
      THEN CONCAT('0',SUBSTRING(phone,3)) ELSE phone END AS phone_key
  FROM stripped
), duplicates AS (
  SELECT batch_id,COUNT(*) AS n FROM normalized
  GROUP BY batch_id,phone_key HAVING COUNT(*)>1
)
SELECT batch_id,COUNT(*) AS duplicate_groups,SUM(n) AS affected_rows,
       SUM(n-1) AS extra_rows FROM duplicates GROUP BY batch_id;

SELECT batch_id,COUNT(*) AS duplicate_email_groups,SUM(n) AS affected_rows
FROM (
  SELECT batch_id,LOWER(TRIM(email)) AS email_key,COUNT(*) AS n
  FROM applicants GROUP BY batch_id,email_key HAVING COUNT(*)>1
) d GROUP BY batch_id;

SELECT application_status,COUNT(*) AS rows_per_status
FROM applicants GROUP BY application_status;
SELECT account_status,COUNT(*) AS rows_per_status
FROM students GROUP BY account_status;
SELECT request_status,COUNT(*) AS rows_per_status
FROM documentrequests GROUP BY request_status;

SELECT COUNT(*) AS active_schedules_in_closed_batches
FROM courseschedules s JOIN batches b ON b.batch_id=s.batch_id
WHERE s.status='Active' AND b.status<>'Active';
SELECT COUNT(*) AS confirmed_without_student
FROM applicants a LEFT JOIN students s ON s.applicant_id=a.applicant_id
WHERE a.application_status='Confirmed Slot' AND s.student_id IS NULL;
SELECT COUNT(*) AS released_requests_without_request_file
FROM documentrequests WHERE request_status='Released'
AND (release_stored_path IS NULL OR release_stored_path='');
SELECT COUNT(*) AS missing_application_reference
FROM applicants WHERE application_reference IS NULL OR application_reference='';

-- These links may be missing FK protection in legacy local databases.
SELECT COUNT(*) AS orphan_course_documents
FROM student_course_documents d LEFT JOIN students s ON s.student_id=d.student_id
WHERE s.student_id IS NULL;
SELECT COUNT(*) AS orphan_student_activity
FROM student_activity_logs l LEFT JOIN students s ON s.student_id=l.student_id
WHERE s.student_id IS NULL;
SELECT COUNT(*) AS orphan_training_room_course
FROM trainingrooms r LEFT JOIN courses c ON c.course_id=r.course_id
WHERE r.course_id IS NOT NULL AND c.course_id IS NULL;

SHOW SESSION STATUS WHERE Variable_name IN ('Ssl_version','Ssl_cipher');
ROLLBACK;
-- File existence, runtime permissions, backup recoverability and API authorization
-- require separate checks. A nonempty path is not proof that a file exists.
