/* UI regression checks use synthetic APIs and never modify application records. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.ABEC_PLAYWRIGHT_MODULE || 'playwright');
const fixtureHttps = require('./lib/fixture-https.cjs');
const root = process.cwd(), output = path.join(root, 'artifacts', 'requested-updates-ui');
fs.mkdirSync(output, { recursive: true });
const date = new Date().toISOString().slice(0, 10);
const courses = ['Bookkeeping NC II', 'Computer Systems Servicing NC II', 'Customer Services NC II', 'Electronic Products Assembly and Servicing NC II']
  .map((courseName, index) => ({ courseId: index + 1, courseName, status: 'Available', capacity: 25, slotCapacity: 25, filledSlots: 1, remainingSlots: 24, duration: '35 days', trainingDays: 35, totalHours: 280, hoursPerDay: 8 }));
const batch = { batchId: 5, batchName: 'Batch2026-102', status: 'Active', startDate: date, endDate: '2027-01-01' };
const profile = { studentId: 1, applicantId: 1, fullName: 'Synthetic Student', email: 'student@example.invalid',
  courseId: 1, courseName: courses[0].courseName, batchId: 5, batchName: batch.batchName, batchStatus: 'Active', accountStatus: 'Active' };
const schedules = [{ scheduleId: 14, courseId: 1, courseName: courses[0].courseName, batchId: 5, batchName: batch.batchName,
  scheduleDate: date, trainingDays: 'Mon,Wed,Fri', startTime: '08:00:00', endTime: '17:00:00', trainer: 'Synthetic Trainer', room: 'Room 305', status: 'Active' }];
const description = 'This document can be released after you complete your training and the assessment period has ended.';
let eligible = false;
const fixture = fixtureHttps((req, res) => {
  const url = new URL(req.url, 'https://localhost'), p = url.pathname;
  if (p.startsWith('/api/')) {
    let data = [];
    if (p === '/api/courses') data = courses;
    else if (/\/api\/courses\/\d+$/.test(p)) data = courses[Number(p.split('/').pop()) - 1];
    else if (p === '/api/batches/active') data = batch;
    else if (p === '/api/batches' || p === '/api/batches/history') data = [batch];
    else if (p === '/api/schedules' || p.endsWith('/schedule')) data = schedules;
    else if (p.endsWith('/profile')) data = profile;
    else if (p.endsWith('/dashboard')) data = { profile, classSchedules: schedules, upcomingClasses: schedules, recentDocumentRequests: [], recentNotifications: [] };
    else if (p === '/api/training-rooms') data = [{ roomId: 1, roomName: 'Room 305', courseId: 1 }];
    else if (p === '/api/courses/history') data = { items: [], totalCount: 0, page: 1, pageSize: 12 };
    else if (p === '/api/activations') data = [profile];
    else if (p === '/api/applicants') data = [{ ...profile, applicationStatus: 'Confirmed Slot', applicationDate: date }];
    else if (p === '/api/archives/categories') data = { batchId: null, courseId: null, batchName: 'All Batches', courseName: 'All Courses', totalAccounts: 3,
      categories: ['Deactivated', 'Rejected Slots', 'Graduated'].map(reason => ({ reason, count: 1 })) };
    else if (p === '/api/course-documents/student/1') data = { timeline: { courseName: courses[0].courseName, batchName: batch.batchName }, documents: [], catalog: [
      { documentType: 'National Certificate (TESDA)', description, status: 'Not Requested', canRequest: eligible,
        requestBlockedMessage: eligible ? null : 'The registrar must verify your training and assessment completion.' },
      { documentType: 'Payment Receipt', status: 'Not Requested', canRequest: false, requestBlockedMessage: 'Fees must be verified.' },
      { documentType: 'Certificate of Completion', status: 'Not Requested', canRequest: false, requestBlockedMessage: 'Completion must be verified.' }
    ] };
    else if (p === '/api/document-requests/student/1') data = [{ requestId: 1, documentType: 'Payment Receipt', requestStatus: 'Rejected', reason: 'Personal Records', requestDate: date }];
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: true, data })); return;
  }
  const file = path.resolve(root, '.' + decodeURIComponent(p));
  if ((!file.startsWith(path.join(root, 'Views') + path.sep) && !file.startsWith(path.join(root, 'wwwroot') + path.sep))
    || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' }[path.extname(file)] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type }); fs.createReadStream(file).pipe(res);
});

(async () => {
  await new Promise(resolve => fixture.server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: fixture.browserArgs });
  let checks = 0;
  const errors = [];
  function check(condition, label) { assert.ok(condition, label); checks++; console.log('PASS ' + label); }
  try {
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    const base = 'https://127.0.0.1:' + fixture.server.address().port;
    async function open(file, role = 'Admin') {
      await page.addInitScript(role => sessionStorage.setItem('abec-session', JSON.stringify({ userId: 1, role, displayName: 'Synthetic User' })), role);
      await page.goto(base + '/Views/' + file, { waitUntil: 'networkidle' });
    }
    for (const width of [1366, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await open('Admin/CourseManagement.html');
      const overview = page.locator('#view-overview');
      check(await overview.locator('.abec-btn-primary').count() === 1 && await overview.getByRole('button', { name: 'Manage Course Schedules', exact: true }).isVisible(), 'Only Manage Course Schedules remains primary at ' + width + 'px.');
      await overview.getByRole('button', { name: 'Refresh page', exact: true }).waitFor({ state: 'visible' });
      check(await overview.getByRole('button', { name: 'Refresh page', exact: true }).isVisible(), 'Existing overview refresh remains beside the action.');
      await overview.getByRole('button', { name: 'Manage Course Schedules', exact: true }).click();
      const view = page.locator('#view-schedule');
      const refresh = await view.getByRole('button', { name: 'Refresh schedules', exact: true }).boundingBox();
      const calendar = await view.getByRole('button', { name: 'View Calendar', exact: true }).boundingBox();
      const create = await view.getByRole('button', { name: 'Create New Course Schedule', exact: true }).boundingBox();
      const add = await view.getByRole('button', { name: 'Add New Course', exact: true }).boundingBox();
      const history = await view.getByRole('button', { name: 'Review History', exact: true }).boundingBox();
      check(refresh.x < calendar.x && calendar.x + calendar.width > width - 40 && Math.abs(refresh.y - calendar.y) < 3 && create.y > calendar.y && history.y > Math.max(create.y, add.y), 'Schedule action/icon rows preserve the requested order and right alignment at ' + width + 'px.');
      await view.getByRole('button', { name: 'View Calendar', exact: true }).click();
      check(await page.locator('#schedule-calendar-dialog').isVisible(), 'Calendar action still opens.');
      await page.getByRole('button', { name: 'Close calendar', exact: true }).click();
      await page.screenshot({ path: path.join(output, 'schedule-actions-' + width + '.png'), fullPage: true });
      await open('Admin/Reports.html');
      await page.locator('#report-status-legend table').waitFor();
      await page.screenshot({ path: path.join(output, 'status-breakdown-' + width + '.png'), fullPage: true });
      const clippedCells = await page.evaluate(() => [...document.querySelectorAll('#report-status-legend th, #report-status-legend td')]
        .filter(cell => cell.scrollWidth > cell.clientWidth + 1).map(cell => ({ text: cell.textContent, width: cell.clientWidth, scroll: cell.scrollWidth, whiteSpace: getComputedStyle(cell).whiteSpace })));
      check(clippedCells.length === 0, 'Status Breakdown cells do not clip at ' + width + 'px: ' + JSON.stringify(clippedCells));
      const alignment = await page.evaluate(() => [...document.querySelectorAll('#report-status-legend tbody tr')].every(row => {
        const label = row.querySelector('.report-status-button span'), count = row.querySelector('td');
        const range = document.createRange(); range.selectNodeContents(count);
        const a = label.getBoundingClientRect(), b = range.getBoundingClientRect();
        return Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2) < 3;
      }));
      check(alignment, 'Status labels and counts align vertically at ' + width + 'px.');
      check(await page.getByRole('button', { name: 'Profile statistics', exact: true }).isVisible(), 'Profile statistics uses the requested label.');
      await page.getByRole('button', { name: 'Archives', exact: true }).click();
      await page.locator('[data-archive-category="Graduated"]').waitFor();
      check(await page.locator('[data-archive-category]').count() === 3, 'Archives renders only three requested categories.');
      await page.screenshot({ path: path.join(output, 'archives-' + width + '.png'), fullPage: true });
      await open('Student/DocumentRequest.html', 'Student');
      await page.getByText(description, { exact: true }).waitFor();
      check(await page.locator('#credentials-grid').getByText(courses[0].courseName, { exact: true }).isVisible(), 'National Certificate identifies the enrolled course.');
      check(await page.getByRole('button', { name: 'Request Document', exact: true }).first().isDisabled(), 'Request Document remains disabled before eligibility.');
      await page.getByRole('button', { name: 'View request history', exact: true }).click();
      check(await page.getByRole('heading', { name: 'Request history', exact: true }).isVisible(), 'Existing request history remains available while requests are disabled.');
      await page.keyboard.press('Escape');
      eligible = true; await page.reload({ waitUntil: 'networkidle' });
      check(await page.locator('#btn-request-document').isEnabled(), 'Verified eligibility enables Request Document.');
      await page.locator('#btn-request-document').click();
      check(await page.locator('#new-request-modal').isVisible(), 'Request Document opens the National Certificate request form.');
      await page.keyboard.press('Escape'); eligible = false;
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), 'Student Documents has no page-wide overflow at ' + width + 'px.');
      await page.screenshot({ path: path.join(output, 'student-documents-' + width + '.png'), fullPage: true });
    }
    await open('Home/LoginPage.html', 'Student');
    check(await page.getByText('Forgot PIN?', { exact: true }).count() === 0 && await page.locator('#student-pin-help').count() === 0, 'Forgot PIN and the obsolete format text are removed.');
    const pin = await page.locator('#student-pin').boundingBox();
    const alternate = await page.locator('#student-login-method').boundingBox();
    check(alternate.y > pin.y + pin.height && alternate.x > pin.x, 'Alternate login is right-aligned below the Security PIN input.');
    await page.locator('#student-login-method').click();
    check(await page.locator('#student-username').isVisible() && await page.locator('#student-password').isVisible(), 'Username/password login remains available.');
    await page.locator('#student-login-method').click();
    check(await page.locator('#student-pin').isVisible(), 'The login toggle returns to Security PIN.');
    await open('Home/LandingPage.html', 'Student');
    check(await page.locator('[name="tesda-prev-enrolled"]').count() === 0, 'Previously enrolled in TESDA is removed from registration.');
    check(await page.locator('#enroll-zip').inputValue() === '' && await page.locator('#enroll-zip').getAttribute('placeholder') !== '4500', 'Registration never supplies 4500 as the location default.');
    await page.evaluate(() => {
      const zip = document.getElementById('enroll-zip'), city = document.getElementById('enroll-city');
      zip.value = '4400'; city.value = 'Naga City'; city.dispatchEvent(new Event('change'));
    });
    check(await page.locator('#enroll-zip').inputValue() === '', 'Changing location clears the unverified previous ZIP.');
    await page.evaluate(() => { const zip = document.getElementById('enroll-zip'); zip.value = '4400'; zip.dispatchEvent(new Event('input')); });
    check(await page.locator('#enroll-zip').inputValue() === '4400' && !await page.locator('#enroll-zip').isDisabled(), 'Applicants can enter and retain their own ZIP code.');
    for (const role of ['Admin', 'Student']) {
      await open('Home/SignOutPage.html', role);
      check((await page.locator('#return-login').getAttribute('href')) === (role === 'Admin' ? 'AdminLoginPage.html' : 'LoginPage.html'), role + ' sign-out returns to the matching login page.');
      check(await page.evaluate(() => sessionStorage.getItem('abec-session') === null), 'Sign-out clears the local session.');
    }
    check(errors.length === 0, 'Updated pages have no JavaScript errors: ' + errors.join('; '));
    console.log('Passed ' + checks + ' requested UI update checks.');
    await context.close();
  } finally { await browser.close(); fixture.server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; fixture.server.close(); });
