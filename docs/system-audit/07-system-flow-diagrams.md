# 07 — System Flow Diagrams

Diagrams match the code paths in documents 02 through 06. Nodes marked UNVERIFIED are not used below; paths that do not exist are drawn as explicit stops.

## 1. Architecture

```mermaid
flowchart LR
  visitor[Public HTML]
  admin[Admin HTML]
  student[Student HTML]
  api[ASP.NET controllers]
  svc[Services]
  db[(MySQL abec_system)]
  files[App_Data secure-uploads]
  mail[SMTP and email-outbox]
  visitor --> api
  admin --> api
  student --> api
  api --> svc
  svc --> db
  svc --> files
  svc --> mail
```

Page access is `sessionStorage` role check only. The API does not read that session.

## 2. Registration

```mermaid
flowchart TD
  open[Landing page] --> courses[GET /api/courses]
  courses --> note[Important Note inside enroll modal]
  note --> form[Registration form and files]
  form --> valid{EnrollAsync validation}
  valid -->|invalid or duplicate email| stop[No applicant row]
  valid -->|valid| save[Insert applicants Pending]
  save --> files[Save registration files]
  files --> adminq[Visible in Students and Applicants]
  save --> notify[Application Received notification]
```

## 3. Review and activation

```mermaid
flowchart TD
  pending[Pending applicant] --> decision{Staff status}
  decision -->|Waitlist or Reject| hold[No student row]
  decision -->|Approve| mail[Email token and 24h deadline if mail succeeds]
  mail --> choice{Applicant response}
  choice -->|decline| rejected[Rejected and Declined]
  choice -->|deadline passed| expired[Expired on next read]
  choice -->|confirm| slot[Confirmed Slot]
  slot --> batch{Active batch and capacity}
  batch -->|no| stuck[Confirmed but no student]
  batch -->|yes| inactive[Student Inactive in Active batch]
  inactive --> act{Staff Activate}
  act -->|yes| active[Account Active]
  act -->|no| nologin[Login refused]
  active --> login[Student login with PIN]
```

Approve and Activate are separate manual actions. Activate does not enroll.

## 4. Enrollment and batch

```mermaid
flowchart TD
  confirm[Slot confirmed] --> activeBatch[Read the one Active batch]
  activeBatch --> cap{Student count for course less than slot capacity}
  cap -->|no| fail[Enrollment error]
  cap -->|yes| insert[Insert students Inactive]
  insert --> pin[Generate PIN]
  pin --> activation[Account Activation list]
```

No later step changes `students.batch_id`.

## 5. Course, batch, and schedule

```mermaid
flowchart TD
  program[CourseProgram defaults] --> seeder[Startup copies onto courses]
  seeder --> catalog[Course cards and request gate]
  createBatch[Create batch Closed] --> activate{Activate with confirmSwitch}
  activate -->|yes| oneActive[This batch Active, others Closed]
  sched[Create schedule] --> one{Another Active schedule for this course}
  one -->|yes| refuse[Save refused]
  one -->|no| saved[Schedule row]
  saved --> see{Active and batch_id equals student batch}
  see -->|yes| portal[Student Training Schedule]
  see -->|no| hidden[Not shown to the student]
```

## 6. Training lifecycle

```mermaid
flowchart TD
  login[Active student login] --> dash[Dashboard profile course batch]
  dash --> sched{Active schedule for course and batch}
  sched -->|none| empty[No training schedule message]
  sched -->|found| page[Sessions and calendar]
  page --> gate{Today after batch start plus program days minus 1}
  gate -->|no| blocked[Document requests closed]
  gate -->|yes| open[Student may request unreleased credentials]
```

The gate does not read attendance or the schedule row.

## 7. Documents

```mermaid
flowchart TD
  prep[Not Prepared course document] --> upload[Staff upload]
  upload --> ready[Ready for Release]
  ready --> rel[Staff release]
  student[Student] --> eligible{Gate open and not already released and no open request}
  eligible -->|no| deny[CreateAsync rejects]
  eligible -->|yes| pend[Request Pending]
  pend --> proc[Processing]
  pend --> hold[On Hold]
  proc --> hold
  proc --> releasedReq[Released]
  hold --> proc
  hold --> rej[Rejected stays on the row]
  rel --> releasedReq
  releasedReq --> note[Dashboard notification]
  note --> email{SMTP only if release was the request status endpoint}
  email -->|fail| still[Request stays Released]
  email -->|ok| sent[Email sent]
```

## 8. Archive

```mermaid
flowchart TD
  staff[Staff chooses a reason] --> valid{Reason valid}
  valid -->|Other without text| stop[Refused]
  valid -->|yes| row[Insert or overwrite archives]
  row --> off[account_status Inactive]
  off --> tryLogin{Student login}
  tryLogin -->|PIN| denied[Not active]
  off --> reactivate{Staff Activate}
  reactivate -->|yes| wipe[Delete archive rows and set Active]
```

Graduated, Deactivated, Academic Dismissal, Withdrawal, Inactive Lead, and Other share this one path. The reason text differs. The data effect does not.

## 9. Batch switch and schedule replace

```mermaid
flowchart TD
  switch[Activate another batch] --> closeOld[Old batch Closed]
  closeOld --> keep[Existing students keep their batch_id]
  keep --> future[Only future confirms use the new batch]
  replace[Set a new schedule Active] --> exists{Course already has an Active schedule}
  exists -->|yes| block[Must deactivate the old one first]
  exists -->|no| live[New row Active]
  live --> notify[Notify all students on the course]
  live --> filter[Student sees it only if batch ids match]
```

Student transfer between batches is not on this diagram because it is not implemented.

## 10. Authentication and notifications

```mermaid
flowchart TD
  adminLogin[Admin username and password] --> adminOk{Hash matches}
  adminOk -->|yes| adminLog[admin_activity_logs Logged in]
  adminOk -->|no| adminFail[No session]
  pin[Student PIN] --> active{account_status Active}
  active -->|no| fail[Login refused and no activity row]
  active -->|yes| slog[student_activity_logs Logged in]
  slog --> browser[sessionStorage abec-session]
  browser --> pages[HTML pages]
  pages --> apis[APIs do not check the session]
  event[Status, schedule, archive, request] --> dash[notifications row]
  dash --> mail{Email only for some events}
  mail -->|slot decision and document Released| smtp[EmailService]
  mail -->|schedule and archive| none[Dashboard only]
```

Slot approval email is sent from `ApplicantService`. Document Released email is sent from `DocumentRequestService.UpdateStatusAsync`. Activation does not email the PIN.
