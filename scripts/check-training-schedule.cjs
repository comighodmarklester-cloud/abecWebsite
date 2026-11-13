/* Student rendering/synchronization checks. Synthetic APIs; no system data writes. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.ABEC_PLAYWRIGHT_MODULE || 'playwright');
const fixtureHttps = require('./lib/fixture-https.cjs');
const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);
const emptyMessage = 'No training schedule is currently available for your enrolled course.';
const profile = { studentId: 1, fullName: 'Schedule Verification Student', courseId: 1,
  courseName: 'Verification Course A', batchId: 1, batchName: 'Verification Batch A',
  batchStatus: 'Active', accountStatus: 'Active', canViewTrainingSchedule: true };
const schedule = { scheduleId: 1, courseId: 1, courseName: profile.courseName, batchId: 1,
  batchName: profile.batchName, scheduleDate: today, dayOfWeek: 'Friday', trainingDays: 'Mon,Wed,Fri',
  startTime: '08:00:00', endTime: '16:00:00', trainer: 'Original Trainer', room: 'Verification Room', status: 'Active' };
let schedules = [schedule], failSchedule = false;
const fixture = fixtureHttps((req, res) => {
  const pathname = new URL(req.url, 'https://localhost').pathname;
  if (pathname.startsWith('/api/')) {
    let data = [];
    if (pathname.endsWith('/profile')) data = profile;
    if (pathname.endsWith('/schedule')) data = schedules;
    if (pathname.endsWith('/dashboard')) data = { profile, upcomingClasses: schedules, classSchedules: schedules,
      recentDocumentRequests: [], recentNotifications: [] };
    const failed = failSchedule && (pathname.endsWith('/schedule') || pathname.endsWith('/dashboard'));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: !failed, data: failed ? null : data,
      message: failed ? 'Schedule service is temporarily unavailable.' : '' }));
    return;
  }
  const file = path.resolve(root, '.' + decodeURIComponent(pathname));
  const allowed = file.startsWith(path.join(root, 'Views') + path.sep)
    || file.startsWith(path.join(root, 'wwwroot') + path.sep);
  if (!allowed || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[path.extname(file)] || 'application/octet-stream';
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
    await context.addInitScript(() => sessionStorage.setItem('abec-session', JSON.stringify({ userId: 1, role: 'Student', displayName: 'Verification' })));
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    const base = 'https://127.0.0.1:' + fixture.server.address().port;
    for (const file of ['StudentDashboard.html', 'ClassSchedule.html']) {
      schedules = [{ ...schedule }]; failSchedule = false;
      profile.batchStatus = 'Active'; profile.canViewTrainingSchedule = true;
      await page.goto(base + '/Views/Student/' + file, { waitUntil: 'networkidle' });
      const host = page.locator(file === 'StudentDashboard.html' ? '#upcoming-classes-body' : '#class-schedule-body');
      await host.getByText('Original Trainer', { exact: true }).waitFor();
      check((await host.innerText()).includes('Mon, Wed, Fri') && (await host.innerText()).includes(profile.courseName), file + ' displays actual course and saved training days.');
      schedules = [{ ...schedule, trainer: 'Updated Trainer', trainingDays: 'Tue,Thu', startTime: '09:00:00' }];
      // Exercise the real polling timer once per page, without reloading the page.
      await host.getByText('Updated Trainer', { exact: true }).waitFor({ timeout: 22000 });
      check((await host.innerText()).includes('Tue, Thu') && !(await host.innerText()).includes('Original Trainer'), file + ' polls and replaces outdated schedule details.');
      const count = await host.locator(file === 'StudentDashboard.html' ? 'tr' : 'article').count();
      check(count === 1, file + ' refresh does not duplicate schedules.');
      schedules = [];
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await host.getByText(emptyMessage, { exact: true }).waitFor();
      check(!(await host.innerText()).includes('Updated Trainer'), file + ' removes unavailable schedules.');
      failSchedule = true;
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await host.getByText('Schedule service is temporarily unavailable.', { exact: true }).waitFor();
      check(!(await host.innerText()).includes(emptyMessage), file + ' distinguishes failed retrieval from a genuinely empty schedule.');
      failSchedule = false; schedules = [{ ...schedule }];
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await host.getByText('Original Trainer', { exact: true }).waitFor();
      check((await host.innerText()).includes(profile.courseName), file + ' recovers and displays a newly available schedule.');
    }
    profile.batchStatus = 'Completed'; profile.canViewTrainingSchedule = false; schedules = [];
    await page.goto(base + '/Views/Student/ClassSchedule.html', { waitUntil: 'networkidle' });
    await page.waitForURL('**/StudentDashboard.html');
    await page.locator('#student-batch-status').getByText(/completed its training/).waitFor();
    check(await page.locator('[data-student-training]').isHidden(), 'Completed students retain the schedule restriction.');
    check(errors.length === 0, 'Student pages have no JavaScript errors: ' + errors.join('; '));
    console.log('Passed ' + checks + ' training schedule browser checks.');
    await context.close();
  } finally { await browser.close(); fixture.server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; fixture.server.close(); });
