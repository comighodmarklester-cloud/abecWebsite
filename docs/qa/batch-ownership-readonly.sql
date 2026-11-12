-- Read-only ownership inspection. No record assignment or schema change is performed.
-- Run in the intended schema; keep the results with the rollout review.
SELECT DATABASE() AS inspected_database;

SELECT b.batch_id, b.batch_name, b.status,
 (SELECT COUNT(*) FROM applicants a WHERE a.batch_id=b.batch_id) AS applicants,
 (SELECT COUNT(*) FROM students s WHERE s.batch_id=b.batch_id) AS students,
 (SELECT COUNT(*) FROM archives ar JOIN students s ON s.student_id=ar.student_id WHERE s.batch_id=b.batch_id) AS archives,
 (SELECT COUNT(*) FROM documentrequests r JOIN students s ON s.student_id=r.student_id WHERE s.batch_id=b.batch_id) AS requests,
 (SELECT COUNT(*) FROM courseschedules sc WHERE sc.batch_id=b.batch_id) AS schedules,
 (SELECT COUNT(*) FROM applicant_registration_documents d JOIN applicants a ON a.applicant_id=d.applicant_id WHERE a.batch_id=b.batch_id) AS registration_documents,
 (SELECT COUNT(*) FROM student_course_documents d JOIN students s ON s.student_id=d.student_id WHERE s.batch_id=b.batch_id) AS course_documents
FROM batches b ORDER BY b.batch_id;

SELECT 'applicants_without_valid_batch' AS issue, COUNT(*) AS violations
FROM applicants a LEFT JOIN batches b ON b.batch_id=a.batch_id WHERE b.batch_id IS NULL
UNION ALL
SELECT 'student_applicant_ownership_conflict', COUNT(*)
FROM students s LEFT JOIN applicants a ON a.applicant_id=s.applicant_id
WHERE a.applicant_id IS NULL OR a.batch_id IS NULL OR a.batch_id<>s.batch_id
UNION ALL
SELECT 'registration_document_without_applicant', COUNT(*)
FROM applicant_registration_documents d LEFT JOIN applicants a ON a.applicant_id=d.applicant_id WHERE a.applicant_id IS NULL
UNION ALL
SELECT 'request_without_student', COUNT(*)
FROM documentrequests r LEFT JOIN students s ON s.student_id=r.student_id WHERE s.student_id IS NULL
UNION ALL
SELECT 'archive_without_student', COUNT(*)
FROM archives ar LEFT JOIN students s ON s.student_id=ar.student_id WHERE s.student_id IS NULL
UNION ALL
SELECT 'schedule_without_valid_batch', COUNT(*)
FROM courseschedules sc LEFT JOIN batches b ON b.batch_id=sc.batch_id WHERE b.batch_id IS NULL
UNION ALL
SELECT 'course_document_without_verified_enrollment', COUNT(*)
FROM student_course_documents d LEFT JOIN students s ON s.student_id=d.student_id LEFT JOIN applicants a ON a.applicant_id=s.applicant_id
WHERE s.student_id IS NULL OR a.applicant_id IS NULL OR (d.batch_id IS NOT NULL AND d.batch_id<>s.batch_id) OR d.course_id<>a.course_id
UNION ALL
SELECT 'course_document_batch_to_infer_from_enrollment', COUNT(*)
FROM student_course_documents d JOIN students s ON s.student_id=d.student_id JOIN applicants a ON a.applicant_id=s.applicant_id
WHERE d.batch_id IS NULL AND s.batch_id=a.batch_id AND d.course_id=a.course_id
UNION ALL
SELECT 'notification_student_applicant_conflict', COUNT(*)
FROM notifications n JOIN students s ON s.student_id=n.student_id JOIN applicants a ON a.applicant_id=n.applicant_id WHERE s.batch_id<>a.batch_id;

-- These columns may not exist until the lifecycle migration has been applied.
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()
AND ((TABLE_NAME='batches' AND COLUMN_NAME='completed_at')
 OR (TABLE_NAME='notifications' AND COLUMN_NAME IN ('batch_id','course_document_id')));

-- Match the lifecycle migration's phone normalization; report counts without contact details.
WITH phones AS (
 SELECT batch_id, REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(contact_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', '') AS digits
 FROM applicants
), normalized AS (
 SELECT batch_id, CASE WHEN LENGTH(digits)=12 AND LEFT(digits,2)='63' THEN CONCAT('0',SUBSTRING(digits,3)) ELSE digits END AS contact_key FROM phones
), duplicates AS (
 SELECT batch_id, contact_key, COUNT(*) AS records_in_group FROM normalized GROUP BY batch_id,contact_key HAVING COUNT(*)>1
)
SELECT COUNT(*) AS normalized_phone_duplicate_groups, COALESCE(SUM(records_in_group),0) AS affected_records FROM duplicates;
