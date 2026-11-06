# 10 — Implementation Roadmap

Do not start this work until the findings are accepted. Each item assumes the previous ones are in place. None of this was implemented during the audit.

## 1. Protect the API (F-01, F-02, F-03)

Server-side sessions first. Remove the PIN from profile JSON. Disable `POST /api/auth/register` or make it an admin-only action that does not bypass Activate.

This blocks every later feature from shipping on an open API. No table rewrite. Existing PINs stay valid.

## 2. Stop destroying history (F-09, F-11)

Archive reasons become append-only. Reactivate closes the archive instead of deleting it. Schedule “delete” becomes Inactive, or it is removed from the UI until that exists. Avoid `ReleaseStudentSlotAsync` once requests or files exist.

Do this before batch transfer so a move has a place to record the old batch.

## 3. One completion rule (F-04, F-08)

Write down the product rule, then implement only that:

- Semester dates stay on `batches`.
- Program length stays on `CourseProgram` / `courses`.
- Request eligibility and the release timeline must use the same completion decision.
- Weekends and holidays count only if a calendar is added. Do not pretend the current day-count is attendance.
- Startup overwrite of the four official courses stays until an admin editor exists. If an editor is added, stop the seeder from clobbering edited rows.

No automatic release when a date passes.

## 4. Batch membership the student can see (F-05, F-06, F-07)

- Map `training_days` to the student schedule DTO.
- Add an explicit transfer that updates `students.batch_id`, appends history, and leaves old schedules in place.
- Notify only students whose course and batch match the Active schedule.
- Replacing an Active schedule should deactivate the previous one in the same action, with history.

Course change after enrollment stays out of scope until transfer is stable. It would also have to retarget course documents and the request gate.

## 5. Seat count (F-10)

Count seats with the rule from step 3 and step 4: pending activation occupies a seat; archived students do not. Do not delete students to free capacity.

## 6. Document transitions (F-13, F-15)

Pick one release path. Either the course-file release is the only way to mark Released, and it writes the request through the same rules, or request Release stays and the file action only sets preparation status. Allow Reject from Pending only if staff confirm that is the operation they need. Bulk release should send the same notification as a single release.

## 7. Constraints (F-12, F-14)

After a reviewed duplicate check, unique index on applicant email. Foreign key from `student_activity_logs` to `students`. Both are schema changes and need a backup.

## Explicitly not in this order

- New public student or application numbers.
- Rewriting live batch dates, schedules, or document rows to match the program length.
- UI redesign of Training Schedule, Archive, or the landing page.
- Emailing security PINs.

## Suggested test gate

After each step, run the matching cases in `09-end-to-end-test-scenarios.md` on a database copy: scenarios 5 and 24 after step 1; 21 and 22 after step 2; 13 and 14 after step 3; 7, 8, 10, and 12 after step 4; 6 after step 5; 16 through 20 after step 6.
