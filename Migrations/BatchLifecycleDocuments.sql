-- Review target and backup first. Stop on any error; do not use --force.
-- Preflight rejects active contact duplicates and unresolved ownership/email conflicts before permanent changes.
-- Idempotent legacy upgrade; does not baseline EF migration history.

DROP TEMPORARY TABLE IF EXISTS abec_batch_sdd_preflight;

CREATE TEMPORARY TABLE abec_batch_sdd_preflight (issue VARCHAR(100), violations BIGINT, CONSTRAINT abec_batch_sdd_resolve_data_before_upgrade CHECK (violations=0));

INSERT INTO abec_batch_sdd_preflight SELECT 'unassigned applicants', (SELECT COUNT(*) FROM applicants WHERE batch_id IS NULL);

INSERT INTO abec_batch_sdd_preflight SELECT 'student applicant batch mismatch', (SELECT COUNT(*) FROM students s JOIN applicants a ON a.applicant_id=s.applicant_id WHERE a.batch_id IS NULL OR a.batch_id<>s.batch_id);

INSERT INTO abec_batch_sdd_preflight SELECT 'document enrollment mismatch', (SELECT COUNT(*) FROM student_course_documents d JOIN students s ON s.student_id=d.student_id JOIN applicants a ON a.applicant_id=s.applicant_id WHERE (d.batch_id IS NOT NULL AND d.batch_id<>s.batch_id) OR d.course_id<>a.course_id);

INSERT INTO abec_batch_sdd_preflight SELECT 'multiple active batches', (SELECT GREATEST(COUNT(*)-1,0) FROM batches WHERE status='Active');

INSERT INTO abec_batch_sdd_preflight SELECT 'duplicate batch email', (SELECT COUNT(*) FROM (SELECT batch_id FROM applicants GROUP BY batch_id,LOWER(TRIM(email)) HAVING COUNT(*)>1) d);

INSERT INTO abec_batch_sdd_preflight SELECT 'duplicate current batch contact', (SELECT COUNT(*) FROM (SELECT batch_id FROM applicants WHERE batch_id IN (SELECT batch_id FROM batches WHERE status NOT IN ('Closed','Completed')) GROUP BY batch_id,CASE WHEN LENGTH(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(contact_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''))=12 AND LEFT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(contact_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''),2)='63' THEN CONCAT('0',SUBSTRING(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(contact_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''),3)) ELSE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(contact_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', '') END HAVING COUNT(*)>1) d);

DROP TEMPORARY TABLE abec_batch_sdd_preflight;

SET @abec_sdd_sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='batches' AND COLUMN_NAME='completed_at')=0, 'ALTER TABLE `batches` ADD COLUMN `completed_at` DATETIME(6) NULL', 'SELECT 1');

PREPARE abec_sdd_statement FROM @abec_sdd_sql;

EXECUTE abec_sdd_statement;

DEALLOCATE PREPARE abec_sdd_statement;

ALTER TABLE batches MODIFY COLUMN status VARCHAR(20) NOT NULL;

UPDATE batches b LEFT JOIN (SELECT batch_id,MAX(action_date) AS completed FROM batchhistory WHERE action IN ('Batch Completed','Moved to Batch History') GROUP BY batch_id) h ON h.batch_id=b.batch_id SET b.completed_at=COALESCE(b.completed_at,h.completed), b.status='Completed' WHERE b.status='Closed';

UPDATE student_course_documents d JOIN students s ON s.student_id=d.student_id SET d.batch_id=s.batch_id WHERE d.batch_id IS NULL;

SET @abec_sdd_sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='batches' AND COLUMN_NAME='active_slot_key')=0, 'ALTER TABLE `batches` ADD COLUMN `active_slot_key` INT GENERATED ALWAYS AS (CASE WHEN status=''Active'' THEN 1 ELSE NULL END) STORED', 'SELECT 1');

PREPARE abec_sdd_statement FROM @abec_sdd_sql;

EXECUTE abec_sdd_statement;

DEALLOCATE PREPARE abec_sdd_statement;

SET @abec_sdd_sql = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='batches' AND INDEX_NAME='ux_batch_active_slot')=0, 'CREATE UNIQUE INDEX `ux_batch_active_slot` ON `batches` (active_slot_key)', 'SELECT 1');

PREPARE abec_sdd_statement FROM @abec_sdd_sql;

EXECUTE abec_sdd_statement;

DEALLOCATE PREPARE abec_sdd_statement;

SET @abec_sdd_sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='applicants' AND COLUMN_NAME='legacy_contact_conflict')=0, 'ALTER TABLE `applicants` ADD COLUMN `legacy_contact_conflict` TINYINT(1) NOT NULL DEFAULT 0', 'SELECT 1');

PREPARE abec_sdd_statement FROM @abec_sdd_sql;

EXECUTE abec_sdd_statement;

DEALLOCATE PREPARE abec_sdd_statement;

DROP TEMPORARY TABLE IF EXISTS abec_legacy_contact_exceptions;

CREATE TEMPORARY TABLE abec_legacy_contact_exceptions AS SELECT applicant_id FROM (SELECT applicant_id, ROW_NUMBER() OVER (PARTITION BY batch_id,CASE WHEN LENGTH(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(contact_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''))=12 AND LEFT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(contact_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''),2)='63' THEN CONCAT('0',SUBSTRING(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(contact_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''),3)) ELSE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(contact_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', '') END ORDER BY applicant_id) AS contact_rank FROM applicants WHERE batch_id IN (SELECT batch_id FROM batches WHERE status='Completed')) ranked WHERE contact_rank>1;

UPDATE applicants a JOIN abec_legacy_contact_exceptions x ON x.applicant_id=a.applicant_id SET a.legacy_contact_conflict=1 WHERE a.legacy_contact_conflict=0;

DROP TEMPORARY TABLE abec_legacy_contact_exceptions;

SET @abec_sdd_sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='applicants' AND COLUMN_NAME='batch_contact_key')=0, 'ALTER TABLE `applicants` ADD COLUMN `batch_contact_key` VARCHAR(20) GENERATED ALWAYS AS (CASE WHEN legacy_contact_conflict=1 THEN NULL ELSE CASE WHEN LENGTH(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(contact_number), ''+'', ''''), '' '', ''''), ''-'', ''''), ''('', ''''), '')'', ''''))=12 AND LEFT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(contact_number), ''+'', ''''), '' '', ''''), ''-'', ''''), ''('', ''''), '')'', ''''),2)=''63'' THEN CONCAT(''0'',SUBSTRING(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(contact_number), ''+'', ''''), '' '', ''''), ''-'', ''''), ''('', ''''), '')'', ''''),3)) ELSE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(contact_number), ''+'', ''''), '' '', ''''), ''-'', ''''), ''('', ''''), '')'', '''') END END) STORED', 'SELECT 1');

PREPARE abec_sdd_statement FROM @abec_sdd_sql;

EXECUTE abec_sdd_statement;

DEALLOCATE PREPARE abec_sdd_statement;

SET @abec_sdd_sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='applicants' AND COLUMN_NAME='batch_contact_key' AND GENERATION_EXPRESSION LIKE '%legacy_contact_conflict%')=0, 'ALTER TABLE applicants MODIFY COLUMN batch_contact_key VARCHAR(20) GENERATED ALWAYS AS (CASE WHEN legacy_contact_conflict=1 THEN NULL ELSE CASE WHEN LENGTH(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(contact_number), ''+'', ''''), '' '', ''''), ''-'', ''''), ''('', ''''), '')'', ''''))=12 AND LEFT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(contact_number), ''+'', ''''), '' '', ''''), ''-'', ''''), ''('', ''''), '')'', ''''),2)=''63'' THEN CONCAT(''0'',SUBSTRING(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(contact_number), ''+'', ''''), '' '', ''''), ''-'', ''''), ''('', ''''), '')'', ''''),3)) ELSE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(contact_number), ''+'', ''''), '' '', ''''), ''-'', ''''), ''('', ''''), '')'', '''') END END) STORED', 'SELECT 1');

PREPARE abec_sdd_statement FROM @abec_sdd_sql;

EXECUTE abec_sdd_statement;

DEALLOCATE PREPARE abec_sdd_statement;

SET @abec_sdd_sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='applicants' AND COLUMN_NAME='batch_email_key')=0, 'ALTER TABLE `applicants` ADD COLUMN `batch_email_key` VARCHAR(100) GENERATED ALWAYS AS (LOWER(TRIM(email))) STORED', 'SELECT 1');

PREPARE abec_sdd_statement FROM @abec_sdd_sql;

EXECUTE abec_sdd_statement;

DEALLOCATE PREPARE abec_sdd_statement;

SET @abec_sdd_sql = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='applicants' AND INDEX_NAME='ux_batch_contact_key')=0, 'CREATE UNIQUE INDEX `ux_batch_contact_key` ON `applicants` (batch_id,batch_contact_key)', 'SELECT 1');

PREPARE abec_sdd_statement FROM @abec_sdd_sql;

EXECUTE abec_sdd_statement;

DEALLOCATE PREPARE abec_sdd_statement;

SET @abec_sdd_sql = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='applicants' AND INDEX_NAME='ux_batch_email_key')=0, 'CREATE UNIQUE INDEX `ux_batch_email_key` ON `applicants` (batch_id,batch_email_key)', 'SELECT 1');

PREPARE abec_sdd_statement FROM @abec_sdd_sql;

EXECUTE abec_sdd_statement;

DEALLOCATE PREPARE abec_sdd_statement;

SET SESSION group_concat_max_len = 65536;

SET @abec_sdd_sql = (SELECT IF(COUNT(*)=0,'SELECT 1',CONCAT('ALTER TABLE applicants ',GROUP_CONCAT(CONCAT('DROP INDEX `',REPLACE(INDEX_NAME,'`','``'),'`') SEPARATOR ','))) FROM (SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='applicants' AND NON_UNIQUE=0 AND INDEX_NAME<>'PRIMARY' GROUP BY INDEX_NAME HAVING COUNT(*)=1 AND MAX(COLUMN_NAME) IN ('email','contact_number')) legacy);

PREPARE abec_sdd_statement FROM @abec_sdd_sql;

EXECUTE abec_sdd_statement;

DEALLOCATE PREPARE abec_sdd_statement;

CREATE TABLE IF NOT EXISTS student_document_eligibility (
student_id INT NOT NULL PRIMARY KEY, fees_paid_at DATETIME(6) NULL,
training_completed_at DATETIME(6) NULL, assessment_completed_at DATETIME(6) NULL,
verified_by_admin_id INT NULL, updated_at DATETIME(6) NOT NULL,
CONSTRAINT fk_sdd_eligibility_student FOREIGN KEY(student_id) REFERENCES students(student_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @abec_sdd_sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='notifications' AND COLUMN_NAME='batch_id')=0, 'ALTER TABLE `notifications` ADD COLUMN `batch_id` INT NULL', 'SELECT 1');

PREPARE abec_sdd_statement FROM @abec_sdd_sql;

EXECUTE abec_sdd_statement;

DEALLOCATE PREPARE abec_sdd_statement;

SET @abec_sdd_sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='notifications' AND COLUMN_NAME='course_document_id')=0, 'ALTER TABLE `notifications` ADD COLUMN `course_document_id` INT NULL', 'SELECT 1');

PREPARE abec_sdd_statement FROM @abec_sdd_sql;

EXECUTE abec_sdd_statement;

DEALLOCATE PREPARE abec_sdd_statement;

UPDATE notifications n
LEFT JOIN applicants a ON a.applicant_id=n.applicant_id
LEFT JOIN students s ON s.student_id=n.student_id
LEFT JOIN documentrequests r ON r.request_id=n.request_id
LEFT JOIN students rs ON rs.student_id=r.student_id
SET n.batch_id=COALESCE(rs.batch_id,s.batch_id,a.batch_id) WHERE n.batch_id IS NULL;

SET @abec_sdd_sql = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='notifications' AND INDEX_NAME='IX_notifications_batch_id')=0, 'CREATE INDEX `IX_notifications_batch_id` ON `notifications` (batch_id)', 'SELECT 1');

PREPARE abec_sdd_statement FROM @abec_sdd_sql;

EXECUTE abec_sdd_statement;

DEALLOCATE PREPARE abec_sdd_statement;

SET @abec_sdd_sql = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='notifications' AND INDEX_NAME='IX_notifications_course_document_id')=0, 'CREATE INDEX `IX_notifications_course_document_id` ON `notifications` (course_document_id)', 'SELECT 1');

PREPARE abec_sdd_statement FROM @abec_sdd_sql;

EXECUTE abec_sdd_statement;

DEALLOCATE PREPARE abec_sdd_statement;

SET @abec_sdd_sql = IF((SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='notifications' AND COLUMN_NAME='batch_id' AND REFERENCED_TABLE_NAME='batches')=0, 'ALTER TABLE notifications ADD CONSTRAINT FK_notifications_batches_batch_id FOREIGN KEY(batch_id) REFERENCES batches(batch_id) ON DELETE RESTRICT', 'SELECT 1');

PREPARE abec_sdd_statement FROM @abec_sdd_sql;

EXECUTE abec_sdd_statement;

DEALLOCATE PREPARE abec_sdd_statement;

SET @abec_sdd_sql = IF((SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='notifications' AND COLUMN_NAME='course_document_id' AND REFERENCED_TABLE_NAME='student_course_documents')=0, 'ALTER TABLE notifications ADD CONSTRAINT FK_notifications_student_course_documents_course_document_id FOREIGN KEY(course_document_id) REFERENCES student_course_documents(course_document_id) ON DELETE SET NULL', 'SELECT 1');

PREPARE abec_sdd_statement FROM @abec_sdd_sql;

EXECUTE abec_sdd_statement;

DEALLOCATE PREPARE abec_sdd_statement;
