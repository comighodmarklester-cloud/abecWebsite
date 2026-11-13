/* Browser checks use synthetic API fixtures and never modify the running system. */
const fs = require('node:fs');
const path = require('node:path');
const fixtureHttps = require('./lib/fixture-https.cjs');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.ABEC_PLAYWRIGHT_MODULE || 'playwright');
const root = process.cwd(), output = path.join(root, 'artifacts', 'system-mobile');
fs.mkdirSync(output, { recursive: true });
let checks = 0;
const securityChecks = process.argv.includes('--security-only');
const injection = '<img src=x onerror="window.__securityInjected=1">';
function check(value, message) { assert.ok(value, message); checks++; }
const today = new Date(), date = today.toISOString().slice(0, 10);
const batch = { batchId: 1, batchName: 'Batch2026-101', status: 'Active', startDate: date, endDate: '2027-12-31' };
const courses = ['Bookkeeping NC II', 'Computer Systems Servicing NC II', 'Customer Services NC II', 'Electronic Products Assembly and Servicing NC II'].map((courseName, index) =>
  ({ courseId: index + 1, courseName, courseDescription: 'Synthetic course description.', trainingDays: 35, ojtDays: 0, totalHours: 280, hoursPerDay: 8, capacity: 25, filledSlots: 0, remainingSlots: 25, duration: '35 days', status: 'Available' }));
const applicants = Array.from({ length: 25 }, (_, i) => ({ applicantId: i + 1, batchId: 1, courseId: 1, courseName: courses[0].courseName, fullName: 'Synthetic Applicant ' + (i + 1),
  firstName: 'Synthetic', lastName: 'Applicant', email: 'synthetic@example.invalid', gender: 'Female', age: 25, birthdate: '2001-01-01', contactNumber: '+639123456789',
  applicationStatus: i < 3 ? 'Expired' : 'Pending', applicationDate: date, barangay: 'Brgy. San Jose', address: 'Zone 1, Brgy. San Jose, Naga', province: 'Camarines Sur', cityMunicipality: 'Naga' }));
const schedules = [{ scheduleId: 1, courseId: 1, courseName: courses[0].courseName, batchId: 1, batchName: batch.batchName, batchStartDate: date, batchEndDate: '2027-12-31',
  scheduleDate: date, trainingDays: 'Sun,Mon,Tue,Wed,Thu,Fri,Sat', startTime: '08:00:00', endTime: '16:00:00', trainer: 'Synthetic Trainer', room: 'Room 305', status: 'Active' }];
const account = { studentId: 1, applicantId: 1, fullName: 'Synthetic Student', email: 'student@example.invalid', contactNumber: '+639123456789', courseId: 1, courseName: courses[0].courseName,
  batchId: 1, batchName: batch.batchName, batchStatus: 'Active', accountStatus: 'Active', username: 'synthetic', address: 'Zone 1, Brgy. San Jose, Naga', registrationDetails: {} };
const tlsFixture = fixtureHttps(async (req, res) => {
  const url = new URL(req.url, 'https://localhost'), p = url.pathname;
  if (p.startsWith('/api/')) {
    if (securityChecks && (/^\/api\/batches\/1\/report$/.test(p) || /^\/api\/activations\/1\/activation-notice$/.test(p))) {
      res.writeHead(200, { 'Content-Type': 'application/pdf' }); res.end('%PDF-1.4\n% Synthetic security download\n%%EOF'); return;
    }
    let data = [], message = 'Success';
    if (p === '/api/courses' && req.method === 'POST') {
      let body = ''; for await (const chunk of req) body += chunk;
      const input = JSON.parse(body);
      data = { ...input, courseId: courses.length + 1, totalHours: (input.trainingDays + input.ojtDays) * input.hoursPerDay, capacity: input.slotCapacity, filledSlots: 0, status: 'Available', duration: input.trainingDays + ' days' };
      courses.push(data); message = 'Course saved successfully.';
    } else if (securityChecks && p.startsWith('/api/locations/')) data = [{ code: '050050000', name: injection }];
    else if (p === '/api/courses') data = courses;
    else if (/\/courses\/\d+$/.test(p)) data = courses.find(c => c.courseId === Number(p.split('/').pop()));
    else if (p === '/api/courses/history') data = { items: [], totalCount: 0, page: 1, pageSize: 12 };
    else if (p === '/api/batches/active') data = batch;
    else if (p === '/api/batches' || p === '/api/batches/history') data = [batch];
    else if (p === '/api/schedules' || /\/student\/\d+\/schedule$/.test(p)) data = schedules;
    else if (p === '/api/training-rooms') data = [{ roomId: 1, roomName: 'Room 305', courseId: 1 }, { roomId: 2, roomName: 'Room 301 Computer Lab', courseId: 2 }, { roomId: 3, roomName: 'Room 302', courseId: 3 }];
    else if (p === '/api/applicants') data = applicants;
    else if (p === '/api/activations/summary' || p === '/api/applicants/dashboard-stats') data = {};
    else if (/\/student\/\d+\/profile$/.test(p)) data = account;
    else if (p === '/api/student/account') data = { profile: account, registration: { Barangay: 'Brgy. San Jose' }, login: { hasPassword: false, username: 'synthetic', passwordLoginEnabled: false } };
    else if (p === '/api/admin/profile/1') data = { adminId: 1, username: 'synthetic', fullName: 'Synthetic Admin', email: 'admin@example.invalid' };
    else if (/email-settings|settings\//.test(p)) data = {};
    else if (p === '/api/archives/categories') data = { batchId: 1, batchName: batch.batchName, courseId: null, totalAccounts: 0, categories: [] };
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: true, data, message })); return;
  }
  const file = path.resolve(root, '.' + decodeURIComponent(p));
  const publicView = file.startsWith(path.join(root, 'Views') + path.sep) && path.extname(file) === '.html';
  const publicAsset = file.startsWith(path.join(root, 'wwwroot') + path.sep);
  if ((!publicView && !publicAsset) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json' }[path.extname(file)] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type }); fs.createReadStream(file).pipe(res);
});
const server = tlsFixture.server;

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'https://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: tlsFixture.browserArgs });
  console.log('Started isolated Edge browser with synthetic API fixtures.');
  const evidence = [], errors = [];
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push({ url: page.url(), message: error.message }));
    async function open(file, role = 'Admin') {
      await page.addInitScript(role => sessionStorage.setItem('abec-session', JSON.stringify({ userId: 1, role, displayName: 'Synthetic User' })), role);
      await page.goto(base + '/Views/' + file, { waitUntil: 'networkidle' });
      await page.waitForLoadState('load');
      await page.waitForTimeout(150);
    }
    await open('Admin/CourseManagement.html');
    check(await page.evaluate(async () => {
      const statuses = await Promise.all(['/appsettings.json', '/Program.cs', '/.git/config'].map(async path => (await fetch(path)).status));
      return statuses.every(status => status === 404);
    }), 'Browser fixture never serves private configuration, source files or Git metadata');
    await page.getByRole('button', { name: 'Add New Course', exact: true }).click();
    check(await page.evaluate(() => getComputedStyle(document.body).overflowY === 'hidden'), 'Opening a mobile modal locks background scrolling');
    await page.screenshot({ path: path.join(output, 'add-course-mobile.png') });
    await page.locator('[name="courseName"]').fill('Office Administration');
    await page.locator('[name="trainingDays"]').fill('30');
    await page.getByRole('button', { name: 'Save Course', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('#course-grid .course-card').length === 5);
    check(await page.locator('#course-grid').getByText('Office Administration', { exact: true }).isVisible(), 'Saved course appears in Course Management');
    await page.getByRole('button', { name: 'Create New Course Schedule', exact: true }).first().click();
    await page.waitForFunction(() => document.querySelector('#select-course').options.length >= 5);
    check((await page.locator('#select-course option').allTextContents()).includes('Office Administration'), 'Saved course appears in schedule picker');
    await page.selectOption('#select-course', '1');
    if (await page.locator('#replace-schedule-modal').isVisible()) await page.getByRole('button', { name: 'Replace Schedule', exact: true }).click();
    await page.selectOption('#select-room', '__existing__');
    check(!(await page.locator('#select-room option').allTextContents()).some(t => /301/.test(t)), 'Bookkeeping excludes Room 301 even in all-room mode');
    await page.selectOption('#select-course', '2');
    await page.selectOption('#select-room', '__existing__');
    check((await page.locator('#select-room option').allTextContents()).some(t => /301/.test(t)), 'Computer course retains Room 301');
    await page.evaluate(() => closeCreateScheduleModal());
    await page.getByRole('button', { name: 'Manage Course Schedules', exact: true }).click();
    const beforeCalendar = page.url();
    await page.getByRole('button', { name: 'View Calendar', exact: true }).click();
    await page.waitForSelector('#schedule-calendar-grid button');
    check(page.url() === beforeCalendar && await page.locator('#schedule-calendar-dialog').isVisible(), 'Calendar opens in a modal on the same page');
    check((await page.locator('#schedule-calendar-details').innerText()).includes('Synthetic Trainer'), 'Calendar shows the selected day’s schedule details');
    await page.screenshot({ path: path.join(output, 'calendar-mobile.png') });
    await page.getByRole('button', { name: 'Next month', exact: true }).click();
    await page.getByRole('button', { name: 'Close calendar', exact: true }).click();
    await open('Admin/Reports.html');
    check((await page.locator('#report-status-chart').innerHTML()).includes('3 applicants (12%)'), 'Status callout clearly separates applicant count and percentage');
    check(await page.getByRole('columnheader', { name: 'Number of Applicants' }).isVisible(), 'Count heading renamed');
    check(await page.locator('#report-status-legend').isVisible(), 'Status breakdown is visible by default');
    await page.getByRole('heading', { name: 'Status Breakdown', exact: true }).click();
    check(await page.locator('#report-status-legend').isVisible(), 'Status breakdown stays visible after clicking its heading');
    await page.screenshot({ path: path.join(output, 'reports-mobile.png'), fullPage: true });
    await open('Home/LandingPage.html');
    await page.locator('[data-public-course-id="5"]').waitFor({ state: 'visible' });
    check(await page.locator('[data-public-course-id="5"]').isVisible(), 'New course appears on the public course list');
    await page.evaluate(() => { openEnrollModal(); showEnrollStep('form'); AbecEnrollWizard.goToStep(4); });
    await page.locator('#enroll-barangay').fill('Brgy. Brgy. San Jose');
    check(await page.locator('#enroll-barangay').inputValue() === 'San Jose', 'Pasted barangay prefix is removed from the name input');
    check(await page.locator('.barangay-input > span').textContent() === 'Brgy.', 'Barangay input always displays the fixed prefix');
    check(await page.evaluate(() => AbecApi.formatBarangay(document.querySelector('#enroll-barangay').value)) === 'Brgy. San Jose', 'Submitted barangay has exactly one prefix');
    await page.screenshot({ path: path.join(output, 'registration-mobile.png') });
    await page.setViewportSize({ width: 1366, height: 900 });
    await open('Admin/CourseManagement.html?view=schedule');
    await page.locator('.schedule-course-card .schedule-detail-item strong').first().waitFor({ state: 'visible' });
    check(await page.evaluate(() => {
      const details = [...document.querySelectorAll('.schedule-course-card .schedule-detail-item strong')];
      return details.length > 0 && details.every(element => {
      const text = element.getBoundingClientRect(), card = element.closest('.schedule-course-card').getBoundingClientRect();
      return text.bottom <= card.bottom + 1 && text.top >= card.top;
      });
    }), 'Desktop schedule cards retain every detail when the catalog grows beyond four courses');
    await page.screenshot({ path: path.join(output, 'schedule-desktop.png') });
    await open('Admin/Reports.html');
    await page.locator('#report-status-legend tbody tr').first().waitFor();
    check(await page.evaluate(() => {
      var legend = document.querySelector('.report-overview-legend').getBoundingClientRect();
      var rows = [...document.querySelectorAll('#report-status-legend tbody tr')];
      var chart = document.querySelector('.report-overview-chart').getBoundingClientRect();
      return legend.width >= 280 && legend.height < 900 && rows.every(row => row.getBoundingClientRect().height < 110) && chart.top < 650;
    }), 'Desktop report status labels remain readable without a tall compressed legend');
    await page.screenshot({ path: path.join(output, 'reports-desktop.png'), fullPage: true });
    const files = ['Admin/AdminDashboard.html', 'Admin/StudentsApplicants.html', 'Admin/AccountActivation.html', 'Admin/CourseManagement.html', 'Admin/CourseManagement.html?view=schedule', 'Admin/CourseManagement.html?view=detail&course=5', 'Admin/DocumentManagement.html', 'Admin/BatchManagement.html', 'Admin/StudentArchive.html', 'Admin/Reports.html', 'Admin/UserSettings.html', 'Admin/CourseSchedule.html',
      'Student/StudentDashboard.html', 'Student/ClassSchedule.html', 'Student/DocumentRequest.html', 'Student/Notifications.html', 'Student/UserSettings.html', 'Home/LandingPage.html', 'Home/AdminLoginPage.html', 'Home/LoginPage.html', 'Home/ConfirmSlot.html'];
    if (securityChecks) {
      console.log('Passed course, schedule, report and registration browser scenarios.');
      for (const width of [320, 1366]) {
        const securityContext = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 768, hasTouch: width < 768, acceptDownloads: true });
        const securityPage = await securityContext.newPage();
        securityPage.on('pageerror', error => errors.push({ url: securityPage.url(), message: error.message }));
        const requestedScripts = [];
        securityPage.on('request', request => { if (request.resourceType() === 'script') requestedScripts.push(request.url()); });
        await securityPage.addInitScript(payload => {
          sessionStorage.setItem('abec-session', JSON.stringify({ userId: 1, role: 'Admin' }));
          sessionStorage.setItem('abec-schedule-extras', JSON.stringify({ trainers: [{ course: 'Computer Systems Servicing NC II', name: payload }] }));
        }, injection);
        await securityPage.goto(base + '/Views/Admin/StudentsApplicants.html', { waitUntil: 'networkidle' });
        await securityPage.locator('#add-applicant-btn').click();
        await securityPage.waitForFunction(() => !!window.AbecEnrollWizard);
        check(await securityPage.locator('#enroll-modal').isVisible(), 'Admin registration opens with shared static controls at ' + width + 'px');
        check(requestedScripts.some(url => url.includes('/abec-enroll-modal.js')), 'Admin loads the static modal initializer at ' + width + 'px');
        await securityPage.evaluate(() => {
          const field = document.getElementById('enroll-firstname');
          const step = field.closest('.enroll-wizard-panel');
          if (step) AbecEnrollWizard.goToStep(Number(step.getAttribute('data-step')));
        });
        await securityPage.locator('#enroll-firstname').fill('Synthetic');
        await securityPage.evaluate(() => requestCloseEnrollModal());
        check(await securityPage.locator('#enroll-close-confirm').isVisible(), 'Dirty registration still asks before closing at ' + width + 'px');
        await securityPage.evaluate(() => { cancelCloseEnrollModal(); showEnrollStep('wizard'); AbecEnrollWizard.goToStep(4); });
        await securityPage.locator('#enroll-province').fill(injection);
        check(await securityPage.locator('#enroll-province').inputValue() === injection, 'Address text remains literal input at ' + width + 'px');
        check(await securityPage.evaluate(() => !window.__securityInjected && !document.querySelector('#enroll-modal img[src="x"]')), 'Address text cannot create executable markup at ' + width + 'px');
        await securityPage.goto(base + '/Views/Admin/CourseManagement.html', { waitUntil: 'networkidle' });
        await securityPage.waitForFunction(() => typeof window.openCreateScheduleModal === 'function');
        await securityPage.getByRole('button', { name: 'Create New Course Schedule', exact: true }).first().click();
        await securityPage.selectOption('#select-course', '2');
        await securityPage.waitForFunction(payload => [...document.querySelector('#select-trainer').options].some(option => option.textContent === payload), injection);
        check((await securityPage.locator('#select-trainer option').allTextContents()).includes(injection), 'Stored trainer markup remains literal option text at ' + width + 'px');
        check(await securityPage.evaluate(() => !window.__securityInjected && !document.querySelector('#select-trainer img')), 'Trainer names cannot create executable markup at ' + width + 'px');
        await securityPage.goto(base + '/Views/Admin/Reports.html', { waitUntil: 'networkidle' });
        const reportDownload = securityPage.waitForEvent('download');
        await securityPage.locator('#report-download').click();
        const reportFile = await reportDownload;
        check(reportFile.suggestedFilename() === 'ABEC_Report_Batch2026-101.pdf' && await reportFile.failure() === null, 'Detached report anchor downloads the correct PDF at ' + width + 'px');
        check(fs.readFileSync(await reportFile.path()).subarray(0, 5).toString() === '%PDF-', 'Report download contains PDF bytes at ' + width + 'px');
        await securityPage.goto(base + '/Views/Admin/AccountActivation.html', { waitUntil: 'networkidle' });
        const activationDownload = securityPage.waitForEvent('download');
        await securityPage.evaluate(() => {
          const button = document.getElementById('btn-print-notice'); button.disabled = false; button.classList.remove('hidden');
          window.activeModalRow = document.createElement('tr');
          activeModalRow.setAttribute('data-id', '1'); activeModalRow.setAttribute('data-display-name', 'Synthetic');
          modalPrintNotice();
        });
        const activationFile = await activationDownload;
        check(activationFile.suggestedFilename() === 'ABEC_Activation_Notice_Synthetic_1.pdf' && await activationFile.failure() === null, 'Detached activation anchor downloads the PDF at ' + width + 'px');
        await securityPage.goto(base + '/Views/Admin/DocumentManagement.html', { waitUntil: 'networkidle' });
        // Exercise the real View-button handler. A harmless HTML fixture lets us
        // inspect the new tab; server-side PDF/MIME/ownership checks run in VerifyHttp.
        await securityContext.route('**/api/course-documents/1/file?inline=true', route => route.fulfill({ contentType: 'text/html', body: '<p>Synthetic preview navigation fixture</p>' }));
        const previewOpened = securityPage.waitForEvent('popup');
        await securityPage.evaluate(() => {
          const button = document.createElement('button'); button.setAttribute('data-course-view', '1');
          document.getElementById('doc-modal').appendChild(button); button.click(); button.remove();
        });
        const preview = await previewOpened; await preview.waitForLoadState();
        check(preview.url() === base + '/api/course-documents/1/file?inline=true', 'Document preview opens only the fixed same-origin endpoint at ' + width + 'px');
        check(await preview.evaluate(() => window.opener === null), 'Document preview cannot control its opener at ' + width + 'px');
        await preview.close();
        let unsafePopup = false;
        const unexpectedPopup = popup => { unsafePopup = true; popup.close(); };
        securityPage.on('popup', unexpectedPopup);
        await securityPage.evaluate(() => {
          for (const id of ['javascript:alert(1)', '0', '-1', '1/../../outside', '1.5']) {
            const button = document.createElement('button'); button.setAttribute('data-course-view', id);
            document.getElementById('doc-modal').appendChild(button); button.click(); button.remove();
          }
        });
        await securityPage.waitForTimeout(100);
        check(!unsafePopup, 'Invalid document IDs cannot navigate or execute script at ' + width + 'px');
        securityPage.off('popup', unexpectedPopup);
        await securityContext.close();
        console.log('Passed browser security scenarios at ' + width + 'px.');
      }
    }
    const widths = process.argv.includes('--tools-only') || securityChecks ? [] : process.env.ABEC_MOBILE_WIDTHS ? process.env.ABEC_MOBILE_WIDTHS.split(',').map(Number) : [320, 390, 768, 1366];
    for (const width of widths) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
      for (const file of files) {
        await open(file, file.startsWith('Student/') ? 'Student' : 'Admin');
        const layout = await page.evaluate(() => {
          const clipped = [...document.querySelectorAll('main button, main input, main select, main textarea')].filter(e => {
            const rect = e.getBoundingClientRect();
            if (rect.height < 4 || rect.width < 4 || e.closest('[inert], .hidden, [hidden]')) return false;
            for (let parent = e.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
              const overflow = getComputedStyle(parent).overflowY, bounds = parent.getBoundingClientRect();
              if (overflow === 'auto' || overflow === 'scroll') return false;
              if ((overflow === 'hidden' || overflow === 'clip') && (rect.bottom > bounds.bottom + 2 || rect.top < bounds.top - 2)) return true;
            }
            return false;
          }).map(e => e.tagName + '#' + e.id);
          const tables = [...document.querySelectorAll('.overflow-x-auto, .doc-table-scroll, .archive-table-wrap')].filter(e => e.querySelector('table') && e.getClientRects().length).map(e => {
            e.scrollLeft = e.scrollWidth; const canScroll = e.scrollWidth <= e.clientWidth + 2 || e.scrollLeft > 0; e.scrollLeft = 0; return canScroll;
          });
          return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth, clipped, tables,
            overflow: [...document.querySelectorAll('main *')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > innerWidth + 2 && !e.closest('.overflow-x-auto, .overflow-auto, .doc-table-scroll, .archive-table-wrap, .course-history-scroll, [hidden], .hidden, [role="dialog"]'); }).slice(0, 12).map(e => e.tagName + '#' + e.id + '.' + e.className) };
        });
        evidence.push({ file, width, ...layout });
        if ((width === 390 || width === 1366) && /CourseManagement|UserSettings/.test(file)) await page.screenshot({ path: path.join(output, file.replace(/[^a-zA-Z0-9.-]/g, '-').replace('.html', '') + '-' + width + '.png'), fullPage: true });
        check(layout.scrollWidth <= width + 2, file + ' has no page-wide horizontal overflow at ' + width + 'px: ' + JSON.stringify(layout));
        if (width <= 900) {
          check(!layout.clipped.length, file + ' has no vertically clipped controls: ' + layout.clipped.join(', '));
          check(layout.tables.every(Boolean), file + ' tables can scroll horizontally when needed');
        }
        if (width === 390 && file.startsWith('Admin/')) {
          const hint = page.getByRole('button', { name: 'Show navigation menu', exact: true });
          if (await hint.isVisible()) { await hint.click(); check(await page.getByRole('button', { name: 'Close menu', exact: true }).isVisible(), 'Mobile navigation opens on ' + file); await page.getByRole('button', { name: 'Close menu', exact: true }).click(); }
        }
      }
      console.log('Reviewed ' + files.length + ' pages at ' + width + 'px.');
    }
    check(!errors.length, 'Pages have no uncaught JavaScript errors: ' + JSON.stringify(errors));
    console.log('PASS ' + checks + ' browser checks with synthetic API fixtures.');
  } catch (error) {
    console.error('Browser scenario failed after ' + checks + ' checks:', error);
    throw error;
  } finally {
    const evidenceName = securityChecks ? 'security-evidence.json' : process.argv.includes('--tools-only') ? 'tools-evidence.json' : process.env.ABEC_MOBILE_WIDTHS ? 'evidence-' + process.env.ABEC_MOBILE_WIDTHS.replaceAll(',', '-') + '.json' : 'evidence.json';
    fs.writeFileSync(path.join(output, evidenceName), JSON.stringify({ checks, evidence, errors }, null, 2));
    await browser.close(); server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
