# 03 — Batch and Schedule Workflows

Three different stores must not be collapsed into one:

| Store | Table / type | What it holds | Who changes it |
| --- | --- | --- | --- |
| Course default | `courses` plus `CourseProgram` | Display name, slot capacity, hours, training days, OJT days, duration label | Seeder overwrites the four official programs on every startup. Admins can change slot capacity only (`PUT` is not exposed; `POST /api/courses/{id}/slots`). |
| Batch configuration | `batches` | Name, start, end, optional assessment date, Active or Closed | Create, activate, complete. Assessment date from Document Management. No general edit endpoint. |
| Schedule | `course_schedules` | One dated session, time, room, trainer, weekday string, batch id, Active or Inactive | Create, update, delete under `/api/schedules`. |

Deployed schedule means `course_schedules.status = Active`. There is no draft table. Inactive rows are the non-current schedules. History of a deleted schedule is a line in `course_management_history`, not the schedule row itself.

## Scenario A — Create a batch

`POST /api/batches` → `BatchService.CreateAsync`.

- Required: batch name, start date, end date on or after start.
- The row is inserted as **Closed**. History action “Batch Created”.
- Course hours, rooms, and trainers are not copied.
- `activateNow` requires `confirmSwitch`. That closes every other Active batch (history “Moved to Batch History”) and sets the new row Active (history “Batch Activated” or “Restored as Active Batch”).
- Students can be assigned only by a later slot confirmation, which uses the Active batch. A Closed batch receives no new students. Schedules can still be saved against any batch id the client sends; the student will not see them until that schedule is Active and the student’s `batch_id` matches.

## Scenario B — Edit a batch

There is no `PUT /api/batches/{id}` for name or dates. The only mutations are:

- `PUT /api/batches/{id}/activate` with `confirmSwitch` (status flip, history row).
- `POST /api/batches/{id}/complete` (status Closed, history “Batch Completed”).
- `PUT /api/course-documents/batches/{batchId}/assessment` (`SetAssessmentDateAsync`). Writes `batches.assessment_date` and, only when the date changed, a short `batchhistory` action. It does not change course defaults or schedule rows.

Existing students, requests, and schedules keep the ids they already have. Course defaults are not written by these methods.

## Scenario C — Transfer a student to another batch

**Not implemented.** `students.batch_id` is set only in `EnrollConfirmedApplicantAsync`. No controller assigns a new batch to an existing student. Effects of a transfer cannot be traced because the operation does not exist.

What staff can do instead is switch which batch is Active. That does not move current students. The next person who confirms a slot is inserted into the new Active batch. Their Training Schedule then looks for Active schedules on that new batch only.

## Scenario D — Change the course on a student

**Not supported after a student row exists.** Course is `applicants.course_id`. `UpdateRegistrationAsync` can change registration fields; it is the applicant form, and the enroll path does not offer a course-change workflow for someone who already has a student row. Schedules, the request gate, and course documents all follow `applicants.course_id`. A course change would be a new feature, not a hidden button.

## Scenario E — Change a course default

`CourseService` exposes list, get, slot capacity, enrolled students, and course-management history. It does not expose create, rename, or duration edit.

`ApplyOfficialCourseProgramsAsync` runs on startup and sets `duration`, `hours_per_day`, `total_hours`, `training_days`, and `ojt_days` on every course whose name matches `CourseProgram.Match`. An administrator change to those columns would be overwritten on the next process start. Slot capacity is not overwritten.

Existing batches and `course_schedules` are not updated. The request gate reads the course program at request time, so a future change to `CourseProgram.cs` would change the gate for existing students without rewriting their rows. The release timeline would not change, because it uses the batch start and end.

## Scenario F — Redeploy or activate a schedule

`POST /api/schedules` and `PUT /api/schedules/{id}`.

- Room must already exist in `trainingrooms`. Trainer is required text. At least one weekday is required (`NormalizeTrainingDays`). End time must be after start time.
- `EnsureSingleActiveAsync` **refuses** a second Active schedule for the same course. It does not deactivate the previous one. Staff must set the old row Inactive first, then set the new row Active. The guard is per course, not per batch.
- Conflict check (`HasConflictAsync`) blocks overlapping trainer, room, or time. It does not compare training-day sets against other weeks; it uses the submitted date and clock times.
- Create writes `course_management_history` “Schedule created” and notifies every student on that course. Active text is “Active Class Schedule Updated”. Inactive text is “Class Schedule Created”.
- Update notifies when the row is Active, including an edit that was already Active.
- The student API returns the row only when status is Active and `course_schedules.batch_id` equals `students.batch_id`.
- `DELETE /api/schedules/{id}` removes the row. History keeps a “Schedule removed” line. There is no restore.

Changing a batch’s dates does not create, activate, or rewrite schedules.

## Scenario G — Archive or deactivate a batch

**Missing as an archive feature.** Close and activate are status flips. Associated students, documents, and schedules stay attached. Capacity math still counts those students. Other students in the batch are unaffected by one student’s archive.

## Cross-module impact

Legend: **immediate** = next read sees it; **manual** = a person must do a second action; **historical** = an append-only note only; **n/a** = no code path.

| Module | A Create batch | B Edit (status / assessment only) | C Transfer | D Course change | E Course default | F Schedule activate | G Close batch |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Course Management | n/a | n/a | n/a | n/a | Slot capacity immediate. Program fields reset at next startup | History row immediate | n/a |
| Batch Management | New Closed or Active row immediate | Status or assessment immediate. Dates not editable | n/a | n/a | n/a | Schedule count on the batch DTO changes | Status Closed immediate |
| Students & Applicants | New registrations copy Active batch id | No student move | n/a | Only if registration update is used before a student exists | Slot count uses capacity | No applicant status change | No status change |
| Account Activation | New confirms land in the Active batch | No | n/a | n/a | n/a | No account change | No |
| Course Schedule Management | Batch appears in the batch list | Assessment does not change sessions | n/a | n/a | n/a | Row status immediate. Previous Active must be turned off manually | Schedules remain |
| Student Dashboard | No, until the student row exists | No | n/a | n/a | Program summary on next profile read | Notification immediate. Schedule card only if batch matches | No |
| Student Training Schedule | No | No | n/a | n/a | No | Visible only if Active and same batch. `training_days` not in the student DTO | Hidden if the student’s batch no longer matches an Active schedule |
| Document Management | Board can filter by batch | Assessment date immediate. Release deadline follows start/end, so dates cannot be edited here except assessment | n/a | n/a | Program summary text changes. Deadline does not | No | Board still lists students on that batch |
| Requested Documents | No | Gate uses batch **start** plus program days, so a start-date edit would matter, but start cannot be edited | n/a | n/a | Gate uses `CourseProgram` at request time | No | No |
| Archive | No | No | n/a | n/a | No | No | No |
| Document Archive | No | No | n/a | n/a | No | No | No |
| Admin audit | Batch history only | Batch history | n/a | Course history only if a schedule or slot action is logged | Course history for slot changes | `course_management_history` | Batch history |
| Student login activity | No | No | n/a | n/a | No | No | No |

## Evidence

- Batch create/activate/complete: `Services/BatchService.cs`.
- Student batch assignment: `ApplicantService.EnrollConfirmedApplicantAsync` (`students.batch_id = activeBatch.BatchId`).
- Single active schedule: `ScheduleService.EnsureSingleActiveAsync`.
- Student visibility: `StudentPortalService.GetScheduleAsync` lines that filter `CourseId`, `BatchId`, and Active, and the DTO that omits `TrainingDays`.
- Startup overwrite: `Data/DbSeeder.cs` `ApplyOfficialCourseProgramsAsync`.
