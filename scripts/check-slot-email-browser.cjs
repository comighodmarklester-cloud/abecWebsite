// Receives real SMTP notification HTML from the isolated HTTP/MySQL workflow.
// The public HTTPS origin is routed to the test server, simulating TLS termination.
const fs = require('node:fs');
const fixtureHttps = require('./lib/fixture-https.cjs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.ABEC_PLAYWRIGHT_MODULE || 'playwright');
let checks = 0;
function check(value, message) { assert.ok(value, message); checks++; }
(async () => {
  let input = ''; for await (const chunk of process.stdin) input += chunk;
  const { origin, publicOrigin, fixtures, credentials, appSpki } = JSON.parse(input);
  if (!credentials?.username || !credentials?.password) throw new Error('Disposable test credentials are required from the verification harness.');
  const output = path.resolve('artifacts/slot-email-browser'); fs.mkdirSync(output, { recursive: true });
  const tlsFixture = fixtureHttps((req, res) => { const index = Number(new URL(req.url, 'https://localhost').pathname.slice(1)); res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(fixtures[index]?.html || 'Missing email'); });
  const inbox = tlsFixture.server;
  await new Promise(resolve => inbox.listen(0, '127.0.0.1', resolve));
  const inboxOrigin = 'https://127.0.0.1:' + inbox.address().port;
  if (!/^[A-Za-z0-9+/]{43}=$/.test(appSpki)) throw new Error('The application fixture certificate pin is required.');
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--ignore-certificate-errors-spki-list=' + tlsFixture.spki + ',' + appSpki] });
  const admin = await browser.newContext({ baseURL: origin, extraHTTPHeaders: { Origin: origin } });
  const login = await admin.request.post('/api/auth/admin-login', { data: credentials });
  check(login.ok() && (await login.json()).success, 'Verification admin signs in');
  const expected = fixtures.slice(0, 4).map(() => 'Approved'), errors = [];
  let lastSubmission = null;
  async function unchanged() {
    for (let index = 0; index < 4; index++) {
      const response = await admin.request.get('/api/applicants/' + fixtures[index].applicantId);
      const saved = (await response.json()).data;
      check(saved.applicationStatus === expected[index], 'Only the intended applicant may change; existing responses must remain final');
    }
  }
  async function layout(page) {
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Email and response page fit the viewport');
  }
  try {
    for (let index = 0; index < 4; index++) {
      const fixture = fixtures[index], mobile = fixture.width < 700;
      const context = await browser.newContext({ viewport: { width: fixture.width, height: mobile ? 844 : 900 }, isMobile: mobile, hasTouch: mobile });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      // No request is sent to the live deployment. Browser URLs and email links stay HTTPS.
      await context.route(publicOrigin + '/**', async route => {
        const url = new URL(route.request().url());
        const headers = { ...await route.request().allHeaders(), host: new URL(origin).host };
        const response = await route.fetch({ url: origin + url.pathname + url.search, headers });
        if (route.request().method() === 'POST') lastSubmission = {
          path: url.pathname, origin: headers.origin || '(missing)',
          fetchSite: headers['sec-fetch-site'] || '(missing)', status: response.status()
        };
        await route.fulfill({ response });
      });
      await page.goto(inboxOrigin + '/' + index);
      await layout(page);
      const confirm = await page.getByRole('link', { name: 'Confirm Slot', exact: true }).getAttribute('href');
      const reject = await page.getByRole('link', { name: 'Reject Slot', exact: true }).getAttribute('href');
      check(confirm.startsWith(publicOrigin + '/confirm-slot?token=') && reject.startsWith(publicOrigin + '/reject-slot?token='), 'Both notification buttons contain the configured public HTTPS origin and correct routes');
      check(new URL(confirm).searchParams.get('token') === new URL(reject).searchParams.get('token'), 'Both email actions refer to the same applicant offer');
      await page.screenshot({ path: path.join(output, 'email-' + index + '.png'), fullPage: true });
      await page.getByRole('link', { name: fixture.action, exact: true }).click();
      check(page.url().startsWith(publicOrigin), 'Opening the real email button preserves the public HTTPS URL');
      check(await page.locator('.name').textContent() === fixture.name, 'The intent page identifies the correct applicant');
      check((await page.locator('.details').innerText()).includes('Email browser verification') && (await page.locator('.details').innerText()).includes('Respond by'), 'Intent page shows the slot details and exact deadline');
      check(await page.getByRole('button', { name: fixture.action, exact: true }).isVisible(), 'The page asks for an explicit confirmation before saving');
      check((await page.locator('input[name="__RequestVerificationToken"]').inputValue()).length > 20, 'The rendered slot form includes an anti-forgery token');
      check((await context.cookies(publicOrigin)).some(cookie => cookie.name === 'abec-slot-verification' && cookie.secure && cookie.httpOnly && cookie.sameSite === 'Strict'), 'The slot verification cookie is Secure, HttpOnly and SameSite Strict');
      await unchanged();
      // Security scanners can open either URL, but GET never submits a decision.
      await page.goto(fixture.action === 'Confirm Slot' ? reject : confirm); await unchanged();
      await page.goto(fixture.action === 'Confirm Slot' ? confirm : reject);
      await layout(page);
      await page.screenshot({ path: path.join(output, 'choice-' + index + '.png'), fullPage: true });
      await page.getByRole('button', { name: fixture.action, exact: true }).click();
      await page.waitForLoadState('networkidle');
      if (await page.locator('h1').count() === 0) throw new Error('Slot response page did not render: ' + JSON.stringify(lastSubmission));
      const result = fixture.action === 'Confirm Slot' ? 'Slot Confirmed Successfully' : 'Slot Rejected Successfully';
      check((await page.locator('h1').innerText()).includes(result), 'Explicit choice displays its saved result');
      expected[index] = fixture.action === 'Confirm Slot' ? 'Confirmed Slot' : 'Rejected';
      await unchanged();
      for (const url of [confirm, reject]) {
        await page.goto(url);
        check((await page.locator('h1').innerText()).includes(result) && (await page.locator('body').innerText()).includes('already responded'), 'Reopening either email link clearly shows the original recorded response');
        check(await page.locator('form').count() === 0, 'A recorded choice no longer exposes a response form');
      }
      const replay = await page.evaluate(async ({ url, token }) => (await fetch(url, { method: 'POST', body: new URLSearchParams({ token }) })).text(),
        { url: fixture.action === 'Confirm Slot' ? '/reject-slot' : '/confirm-slot', token: new URL(confirm).searchParams.get('token') });
      check(replay.includes(result) && replay.includes('already responded'), 'Even an opposing POST replay cannot replace the first choice');
      await unchanged();
      await page.screenshot({ path: path.join(output, 'saved-' + index + '.png'), fullPage: true });
      for (const url of ['/confirm-slot', '/reject-slot?token=' + '0'.repeat(64)]) {
        await page.goto(publicOrigin + url);
        check(await page.locator('form').count() === 0 && /incomplete|invalid/i.test(await page.locator('body').innerText()), 'Missing and invalid links show a clear message without offering an action');
      }
      // The fifth notification was offered normally, then its saved deadline was advanced for testing.
      await page.goto(inboxOrigin + '/4');
      for (const action of ['Confirm Slot', 'Reject Slot']) {
        const expired = await page.getByRole('link', { name: action, exact: true }).getAttribute('href');
        await page.goto(expired);
        check(await page.locator('form').count() === 0 && /expired/i.test(await page.locator('body').innerText()), 'An expired offer is clear on mobile and desktop for both email actions');
        await layout(page);
        await page.goto(inboxOrigin + '/4');
      }
      await context.close();
    }
    check(errors.length === 0, 'Email action pages have no JavaScript errors');
    fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify({ checks, cases: fixtures.slice(0, 4).map(f => ({ action: f.action, width: f.width })), errors }, null, 2));
    console.log('PASS ' + checks + ' captured-notification browser checks on mobile and desktop.');
  } finally { await browser.close(); inbox.close(); }
})().catch(error => { console.error(String(error.stack || error).replace(/token=[^\s"'<>]+/g, 'token=[redacted]')); process.exitCode = 1; });
