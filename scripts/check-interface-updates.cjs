/* Real frontend scripts with synthetic APIs; no database, email or live sessions. */
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(process.env.ABEC_PLAYWRIGHT_MODULE || 'playwright');
const fixtureHttps = require('./lib/fixture-https.cjs');
const output = path.resolve('artifacts/interface-ui'); fs.mkdirSync(output, { recursive: true });
const current = { batchId: 2, batchName: 'Batch2026-102', status: 'Active', studentCount: 4, activeScheduleCount: 2, startDate: '2026-01-01', endDate: '2027-12-31' };
const previous = { ...current, batchId: 1, batchName: 'Batch2026-101', status: 'Completed', studentCount: 6, completedAt: '2026-10-01' };
const courses = ['Computer Systems Servicing NC II', 'Bookkeeping NC II'].map((courseName, i) => ({ courseId: i + 1, courseName, status: 'Available', trainingDays: 35, totalHours: 280, hoursPerDay: 8, slotCapacity: 25, filledSlots: 1, remainingSlots: 24 }));
const profile = { studentId: 7, applicantId: 12, firstName: 'Maria', lastName: 'Dela Cruz', fullName: 'Maria Dela Cruz', email: 'maria@example.invalid', contactNumber: '+639171234567', courseId: 1, courseName: courses[0].courseName, batchId: 2, batchName: current.batchName, batchStatus: 'Active', accountStatus: 'Active' };
const applicants = [
 { applicantId: 12, firstName: 'Maria', lastName: 'Dela Cruz', fullName: 'Maria Dela Cruz', courseId: 1, courseName: courses[0].courseName, email: 'maria@example.invalid', applicationStatus: 'Pending' },
 { applicantId: 13, firstName: 'Maria', lastName: 'Santos', fullName: 'Maria Santos', courseId: 2, courseName: courses[1].courseName, email: 'santos@example.invalid', applicationStatus: 'Confirmed Slot', isSlotConfirmed: true, confirmedAt: '2026-11-01' },
 { applicantId: 14, firstName: 'Juan', lastName: 'Garcia', fullName: 'Juan Garcia', courseId: 1, courseName: courses[0].courseName, email: 'juan@example.invalid', applicationStatus: 'Approved' }
].map(a => ({ ...a, batchId: 2, applicationDate: '2026-11-13', gender: 'Female', birthdate: '2000-01-01', contactNumber: '+639171234567', province: 'Albay', cityMunicipality: 'Legazpi', barangay: 'Test', streetDetails: 'Test Street' }));
const schedules = [1, 2].map(i => ({ scheduleId: i, courseId: 1, courseName: courses[0].courseName, batchId: 2, batchName: current.batchName, scheduleDate: '2026-12-0' + i, trainingDays: 'Mon,Wed,Fri', startTime: '08:00:00', endTime: '17:00:00', trainer: 'Teacher ' + i, room: 'Room ' + i, status: 'Active' }));
const notifications = [
 { notificationId: 1, title: 'Class schedule changed', message: 'Training moves to Room 2.', createdAt: '2026-11-13', status: 'Unread' },
 { notificationId: 2, title: 'Important announcement', message: 'Please bring your assessment requirements.', createdAt: '2026-11-14', status: 'Unread' },
 { notificationId: 3, title: 'Document request update', message: 'Your document is processing.', requestId: 1, createdAt: '2026-11-14', status: 'Unread' }
];
const requests = Array.from({ length: 5 }, (_, i) => ({ requestId: i + 1, studentId: 7, documentType: ['National Certificate (TESDA)', 'Payment Receipt', 'Certificate of Completion'][i % 3], requestStatus: ['Pending', 'Processing', 'On Hold', 'Released', 'Rejected'][i], reason: 'Personal Records', requestDate: '2026-11-' + String(i + 1).padStart(2, '0') }));
const coursePack = { timeline: { courseName: courses[0].courseName, batchName: current.batchName, studentReleaseMessage: 'Release information from existing records.' }, documents: [], catalog: [
 { documentType: 'National Certificate (TESDA)', status: 'Not Prepared', canRequest: true, description: 'Available after assessment.' },
 { documentType: 'Payment Receipt', status: 'Not Prepared', canRequest: false, requestBlockedMessage: 'You already have an open request for this document.' },
 { documentType: 'Certificate of Completion', status: 'Released', canRequest: false, downloadUrl: '/api/course-documents/3/file', releasedAt: '2026-11-01' }
] };
let logoutCalls = 0, failLogout = false, writes = [];
const fixture = fixtureHttps(async (req, res) => {
 const url = new URL(req.url, 'https://localhost'), p = url.pathname;
 if (p.startsWith('/api/')) {
  if (req.method !== 'GET') { for await (const chunk of req) { /* synthetic input */ } writes.push(p); }
  if (p === '/api/auth/student-logout') {
   logoutCalls++;
   if (failLogout) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: false, message: 'Unable to sign out. Please try again.' })); return; }
   res.setHeader('Set-Cookie', 'abec-student-session=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Strict');
  }
  let data = [];
  if (p === '/api/batches/active') data = current;
  else if (p === '/api/batches/history') data = [previous];
  else if (p === '/api/batches') data = [current, previous];
  else if (/\/api\/batches\/\d+\/documents/.test(p)) data = { batch: p.includes('/1/') ? previous : current, readOnly: p.includes('/1/'), applicants, students: [], registrationDocuments: [], requests: [], archives: [] };
  else if (p === '/api/batches/switch-impact') data = { currentActiveBatch: current, students: 4, applicants: 3, schedules: 2 };
  else if (p === '/api/courses') data = courses;
  else if (p === '/api/applicants/stats') data = { totalApplicants: 3, pending: 1, approved: 1, confirmed: 1 };
  else if (p === '/api/applicants') data = applicants;
  else if (/\/api\/applicants\/\d+$/.test(p)) data = applicants.find(a => String(a.applicantId) === p.split('/').pop());
  else if (p === '/api/student/7/profile') data = profile;
  else if (p === '/api/student/7/dashboard') data = { profile, upcomingClasses: schedules, classSchedules: schedules, recentDocumentRequests: requests, recentNotifications: notifications };
  else if (p === '/api/student/7/schedule') data = schedules;
  else if (p === '/api/notifications/student/7') data = notifications;
  else if (p === '/api/course-documents/student/7') data = coursePack;
  else if (p === '/api/document-requests/student/7') data = requests;
  else if (p.startsWith('/api/admin/profile/')) data = { username: 'admin', email: 'admin@example.invalid', recentActivity: [], recentNotifications: [], notificationPreferences: {} };
  else if (p === '/api/settings/public-url') data = { publicBaseUrl: 'https://example.invalid' };
  res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: true, data })); return;
 }
 const file = path.resolve('.' + decodeURIComponent(p));
 if ((!file.startsWith(path.resolve('Views') + path.sep) && !file.startsWith(path.resolve('wwwroot') + path.sep)) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
 res.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' }[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
});
const pdf = name => ({ name: name + '.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nSynthetic only\n%%EOF') });
(async () => {
 await new Promise(resolve => fixture.server.listen(0, '127.0.0.1', resolve));
 const base = 'https://127.0.0.1:' + fixture.server.address().port;
 const browser = await chromium.launch({ channel: 'msedge', headless: true, args: fixture.browserArgs });
 let count = 0; const errors = [];
 const check = (ok, label) => { assert.ok(ok, label); count++; console.log('PASS ' + label); };
 try {
  for (const width of [1366, 390]) {
   const context = await browser.newContext({ viewport: { width, height: 900 } });
   const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
   async function open(file, role = 'Student') {
    await page.addInitScript(role => sessionStorage.setItem('abec-session', JSON.stringify({ role, userId: role === 'Admin' ? 1 : 7, displayName: 'Maria Dela Cruz' })), role);
    await page.goto(base + '/Views/' + file, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('domcontentloaded');
   }
   // Registration: exact names, abbreviations, invalid names and drop handling.
   await open('Home/LandingPage.html');
   await page.waitForFunction(() => window.AbecEnrollWizard && document.querySelector('#enroll-course option[value="1"]'));
   async function documents() {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => window.AbecEnrollWizard && document.querySelector('#enroll-course option[value="1"]'));
    await page.evaluate(() => { openEnrollModal(); showEnrollStep('form'); AbecEnrollWizard.goToStep(5); });
   }
   await documents();
   check(await page.locator('#enroll-age').getAttribute('placeholder') === null && await page.locator('#enroll-age').getAttribute('readonly') !== null, width + ': only Age placeholder removed');
   check(!await page.locator('#enroll-credential-error').isVisible(), width + ': no filename recommendation initially');
   const cases = [['Transcript of Records (TOR)', 'TOR'], ['TOR', 'TOR'], ['TRANSCRIPT OF RECORDS', 'TOR'], ['transcript of records', 'TOR'], ['Form 138', 'Form138'], ['FORM138', 'Form138'], ['Honorable Dismissal', 'HonorableDismissal'], ['HD', 'HonorableDismissal'], ['Certificate of Good Moral Character', 'GoodMoral'], ['GMC', 'GoodMoral'], ['COGMC', 'GoodMoral'], ['Birth Certificate (PSA)', 'BirthCertificate'], ['psa', 'BirthCertificate']];
   for (const [name, type] of cases) {
    await documents(); await page.locator('#enroll-credential-input').setInputFiles(pdf(name));
    check(await page.locator('#enroll-credential-list').getByText(type + '.pdf · Uploaded', { exact: true }).count() === 1 && !await page.locator('#enroll-credential-error').isVisible(), width + ': accepts ' + name);
   }
   await documents();
   await page.locator('[data-step="5"] .enroll-wizard-next-step').click();
   await page.getByRole('checkbox', { name: 'Follow up Transcript of Records (TOR)', exact: true }).check();
   await page.locator('#enroll-credential-input').setInputFiles(pdf('TOR copy'));
   check(await page.locator('#enroll-credential-error').isVisible() && (await page.locator('#enroll-credential-error').textContent()).includes('‘Transcript of Records (TOR)’'), width + ': invalid name shows inline recommendation');
   check(await page.getByRole('checkbox', { name: 'Follow up Transcript of Records (TOR)', exact: true }).isChecked(), width + ': invalid upload preserves Follow up');
   await page.screenshot({ path: path.join(output, 'filename-error-' + width + '.png') });
   await page.locator('#enroll-credential-input').setInputFiles(pdf('TOR'));
   check(!await page.locator('#enroll-credential-error').isVisible(), width + ': valid replacement clears recommendation');
   await documents();
   await page.evaluate(() => { const transfer = new DataTransfer(); transfer.items.add(new File(['%PDF-1.4'], 'PSA.PDF', { type: 'application/pdf' })); document.getElementById('enroll-credential-dropzone').dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true })); });
   check(await page.locator('#enroll-credential-list').getByText('BirthCertificate.pdf · Uploaded', { exact: true }).count() === 1, width + ': accepts case-insensitive dropped PSA filename');
   await documents();
   await page.evaluate(() => { const transfer = new DataTransfer(); transfer.items.add(new File(['%PDF-1.4'], 'scan.pdf', { type: 'application/pdf' })); document.getElementById('enroll-credential-dropzone').dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true })); });
   check(await page.locator('#enroll-credential-error').isVisible() && await page.locator('.enroll-doc-remove').count() === 0, width + ': rejects unnamed scan without assigning it to a different type');
   // Admin dashboard and course filtering.
   await open('Admin/AdminDashboard.html', 'Admin'); await page.locator('.dashboard-applicant-row').first().waitFor();
   const recent = page.locator('#dashboard-applicants-body');
   check(!await recent.textContent().then(t => /Nov 13|2026/.test(t)) && (await recent.textContent()).includes('Confirmed') && !(await recent.textContent()).includes('Confirmed Slot'), width + ': recent applicants omit dates and use Confirmed');
   check(!(await page.locator('body').textContent()).includes("Here's what's happening with ABEC today."), width + ': dashboard subtitle removed');
   await page.screenshot({ path: path.join(output, 'admin-dashboard-' + width + '.png') });
   await page.locator('.dashboard-applicant-row[data-applicant-id="13"]').click();
   await page.waitForURL('**/StudentsApplicants.html?*');
   await page.locator('.modal-action-btn[data-action="add-slot"]:visible').waitFor();
   check((await page.locator('.modal-action-btn[data-action="add-slot"]').textContent()).trim() === 'Confirm', width + ': dashboard applicant navigation keeps the Confirm action');
   page.once('dialog', dialog => dialog.accept());
   const confirmation = page.waitForRequest(request => request.url().includes('/api/applicants/13/add-to-slot') && request.method() === 'POST');
   await page.locator('.modal-action-btn[data-action="add-slot"]').click(); await confirmation;
   check(writes.includes('/api/applicants/13/add-to-slot'), width + ': Confirm retains the existing confirmation endpoint');
   await open('Admin/DocumentManagement.html', 'Admin'); await page.locator('#doc-body tr').first().waitFor();
   check(await page.locator('#doc-course').isVisible(), width + ': course filter is visible beside search');
   await page.locator('#doc-course').selectOption('2'); await page.locator('#doc-search').fill('Maria');
   check(await page.locator('#doc-body').getByText('Maria Santos', { exact: true }).count() === 1 && !(await page.locator('#doc-body').textContent()).includes('Maria Dela Cruz'), width + ': search and course filter combine');
   await page.locator('#doc-search').fill('Juan');
   check((await page.locator('#doc-body').textContent()).includes('No applicants match'), width + ': course excludes otherwise matching search');
   await page.locator('#doc-course').selectOption('1');
   check(await page.locator('#doc-body').getByText('Juan Garcia', { exact: true }).count() === 1, width + ': course changes retain the search');
   check(!(await page.locator('#doc-course').textContent()).match(/\(\d+\)/) && !(await page.locator('#doc-course-filters').textContent()).match(/\(\d+\)/), width + ': course filters contain names without counts');
   await page.screenshot({ path: path.join(output, 'document-filter-' + width + '.png') });
   // Batch history selector and continuation retain their existing handlers.
   await open('Admin/BatchManagement.html', 'Admin');
   await page.waitForFunction(() => window.AbecBatches && typeof viewBatchDocuments === 'function');
   await page.evaluate(() => viewBatchDocuments(1));
   await page.locator('#batch-documents-title').filter({ hasText: previous.batchName }).waitFor();
   check(!await page.locator('label[for="batch-documents-select"]').isVisible(), width + ': Viewing batch filter hidden for Batch2026-101');
   await page.evaluate(() => viewBatchDocuments(2));
   check(await page.locator('label[for="batch-documents-select"]').isVisible(), width + ': active batch selector remains available');
   await page.evaluate(() => closeBatchDocuments()); await page.locator('#btn-create-batch').click();
   await page.locator('#new-batch-name').fill('Batch2026-103'); await page.locator('#new-batch-start').fill('2026-12-01');
   await page.locator('#btn-review-new-batch').click();
   check(await page.locator('#btn-review-new-batch').textContent() === 'Continue' && await page.locator('#modal-switch-batch').isVisible(), width + ': Continue opens the same confirmation step');
   // Student pages use the registered surname and existing data.
   await open('Home/LoginPage.html');
   check(await page.getByRole('heading', { name: 'Student Login', exact: true }).count() === 1 && await page.getByRole('heading', { name: 'Login', exact: true }).count() === 0, width + ': one Student Login heading');
   await open('Student/StudentDashboard.html'); await page.waitForFunction(() => document.getElementById('welcome-name').textContent === 'Dela Cruz');
   check((await page.locator('#welcome-name').locator('..').textContent()).trim() === 'Welcome! Dela Cruz' && await page.locator('#student-batch-status, #header-batch').count() === 0, width + ': surname-only greeting without top batch label');
   await page.screenshot({ path: path.join(output, 'student-dashboard-' + width + '.png') });
   await open('Student/ClassSchedule.html?highlightDate=2026-12-01'); await page.locator('.train-card').first().waitFor();
   check(await page.locator('.train-card').count() === 2 && await page.locator('.train-cal, #class-cal-grid, #student-batch-status').count() === 0, width + ': sessions remain visible without calendar or batch banner');
   check(await page.locator('.class-layout > section').count() === 2 && (await page.locator('#schedule-notifications').textContent()).includes('Important announcement') && !(await page.locator('#schedule-notifications').textContent()).includes('Document request update'), width + ': two schedule sections show relevant existing announcements');
   await page.screenshot({ path: path.join(output, 'schedule-' + width + '.png') });
   await open('Student/DocumentRequest.html?requestType=Payment%20Receipt'); await page.locator('#recent-requests-body tr').first().waitFor();
   check(await page.locator('#recent-requests-body tr').count() === 5 && await page.getByRole('heading', { name: 'Request History', exact: true }).count() === 1, width + ': complete existing request history stays visible');
   check(await page.getByRole('button', { name: /Request Document|View request history/i }).count() === 0 && !(await page.locator('body').textContent()).includes('You already have an open request for this document.'), width + ': request controls and duplicate-request message removed');
   check(!(await page.locator('#doc-release-info').textContent()).includes('Computer Systems Servicing') && !(await page.locator('body').textContent()).includes('Each document has its own eligibility rule'), width + ': document introduction text removed');
   check(await page.locator('#credentials-grid').getByRole('link', { name: 'Download', exact: true }).count() === 1, width + ': released document download retained');
   await page.screenshot({ path: path.join(output, 'student-documents-' + width + '.png') });
   for (const role of ['Admin', 'Student']) {
    await open(role + '/UserSettings.html', role);
    check(await page.locator('a.abec-back-btn').getByText('Back', { exact: true }).count() === 1 && await page.locator('a.abec-back-btn svg').count() === 0, width + ': ' + role + ' settings has a boxed Back button');
    if (role === 'Student') check(await page.locator('#student-batch-status').count() === 0, width + ': Student Settings top banner removed');
    await page.locator('a.abec-back-btn').click();
    check(new URL(page.url()).pathname.endsWith(role === 'Admin' ? '/Admin/AdminDashboard.html' : '/Student/StudentDashboard.html'), width + ': ' + role + ' Back navigation works');
   }
   check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), width + ': dashboard fits viewport');
   await context.close();
   // Sign-out confirmation: verify both role destinations, session/cookie retention and failure recovery.
   for (const role of ['Admin', 'Student']) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    await ctx.addCookies([{ name: 'abec-student-session', value: 'synthetic-active', url: base, httpOnly: true, secure: true, sameSite: 'Strict' }]);
    await ctx.addInitScript(role => { if (!sessionStorage.getItem('fixture-session-initialized')) { sessionStorage.setItem('abec-session', JSON.stringify({ role, userId: role === 'Admin' ? 1 : 7 })); sessionStorage.setItem('fixture-session-initialized', '1'); } }, role);
    const signout = await ctx.newPage(); signout.on('pageerror', e => errors.push(e.message));
    const before = logoutCalls;
    await signout.goto(base + '/Views/Home/SignOutPage.html', { waitUntil: 'domcontentloaded' });
    check(logoutCalls === before && await signout.evaluate(() => !!sessionStorage.getItem('abec-session')), width + ': ' + role + ' sign-out screen leaves session intact');
    await signout.getByRole('button', { name: 'Cancel', exact: true }).click(); await signout.waitForURL('**/' + role + 'Dashboard.html');
    check(logoutCalls === before && await signout.evaluate(() => !!sessionStorage.getItem('abec-session')) && (await ctx.cookies()).some(c => c.name === 'abec-student-session'), width + ': ' + role + ' Cancel returns to own dashboard without logout');
    await signout.goto(base + '/Views/Home/SignOutPage.html', { waitUntil: 'domcontentloaded' });
    failLogout = true; await signout.getByRole('button', { name: 'Return to Log In', exact: true }).click();
    await signout.locator('#signout-message:not([hidden])').waitFor();
    check(await signout.evaluate(() => !!sessionStorage.getItem('abec-session')), width + ': ' + role + ' failed logout preserves session and shows retry error');
    failLogout = false;
    await signout.getByRole('button', { name: 'Return to Log In', exact: true }).click();
    await signout.waitForURL('**/' + (role === 'Admin' ? 'AdminLoginPage.html' : 'LoginPage.html'));
    check(!await signout.evaluate(() => sessionStorage.getItem('abec-session')) && !(await ctx.cookies()).some(c => c.name === 'abec-student-session') && logoutCalls === before + 2, width + ': ' + role + ' Return to Log In completes logout once and opens role login');
    await ctx.close();
   }
  }
  check(errors.length === 0, 'No JavaScript runtime errors: ' + errors.join('; '));
  check(!writes.some(p => p.startsWith('/api/document-requests/student/')), 'Student Documents UI does not submit new requests');
  console.log('PASS ' + count + ' desktop/mobile interface checks. Screenshots: ' + output);
 } finally { await browser.close(); await new Promise(resolve => fixture.server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
