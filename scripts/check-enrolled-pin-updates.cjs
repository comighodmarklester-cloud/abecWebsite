// Synthetic Admin sessions only. No application records or real credentials are used.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.ABEC_PLAYWRIGHT_MODULE || 'playwright');
const fixtureHttps = require('./lib/fixture-https.cjs');
const root = process.cwd();
const accounts = [
  { studentId: 1, fullName: 'Mark Comighod', accountStatus: 'Active' },
  { studentId: 2, fullName: 'Mina Cruz', accountStatus: 'Active' },
  { studentId: 3, fullName: 'Pending Student', accountStatus: 'Inactive' },
  { studentId: 4, fullName: 'Archived Student', accountStatus: 'Inactive', isArchived: true }
].map(s => ({ ...s, applicantId: s.studentId, courseId: 1, batchId: 1, hasSecurityPin: true,
  email: 'student' + s.studentId + '@example.invalid', courseName: 'Verification Course', batchName: 'Verification Batch',
  applicationStatus: 'Confirmed Slot', confirmationStatus: 'Confirmed Slot', createdAt: '2026-01-01' }));
const pins = new Map([[1, 'legacy-one'], [2, 'legacy-two']]);
const versions = new Map();
let writes = [], failSecond = false, loseResponse = false;
const fixture = fixtureHttps((req, res) => {
  const url = new URL(req.url, 'https://localhost'), p = url.pathname;
  if (p.startsWith('/api/')) {
    const reset = p.match(/^\/api\/activations\/(\d+)\/generate-pin$/);
    const notice = p.match(/^\/api\/activations\/(\d+)\/activation-notice$/);
    if (notice) { res.writeHead(200, { 'Content-Type': 'application/pdf', 'Cache-Control': 'no-store' }); res.end('%PDF-1.4\n' + pins.get(Number(notice[1]))); return; }
    let data = [], success = true, message = '';
    if (reset && req.method === 'POST') {
      const id = Number(reset[1]);
      const expected = url.searchParams.get('pinVersion');
      if (expected !== null && Number(expected) !== (versions.get(id) || 0)) { success = false; message = 'PIN changed. Check the Activation Notice before retrying.'; }
      else if (url.searchParams.get('onlyLegacy') === 'true' && /^ABECMC[0-9]{4}$/.test(pins.get(id) || '')) { data = { studentId: id, securityPin: pins.get(id), pinChanged: false }; }
      else if (loseResponse && id === 2) { writes.push(id); versions.set(id, (versions.get(id) || 0) + 1); pins.set(id, 'ABECMC' + String(writes.length).padStart(4, '0')); res.destroy(); return; }
      else if (failSecond && id === 2) { success = false; message = 'Synthetic rejection'; }
      else { writes.push(id); versions.set(id, (versions.get(id) || 0) + 1); pins.set(id, 'ABECMC' + String(writes.length).padStart(4, '0')); data = { studentId: id, securityPin: pins.get(id) }; }
    } else if (p === '/api/activations') data = accounts.map(s => ({ ...s, securityPinVersion: versions.get(s.studentId) || 0,
      hasCurrentSecurityPinFormat: /^ABECMC[0-9]{4}$/.test(pins.get(s.studentId) || '') }));
    else if (p === '/api/activations/summary') data = { totalApprovedStudents: 4, pendingActivation: 1, activatedAccounts: 2, deactivatedAccounts: 1 };
    else if (p === '/api/batches/active') data = { batchId: 1, batchName: 'Verification Batch', status: 'Active' };
    else if (p === '/api/courses') data = [{ courseId: 1, courseName: 'Verification Course' }];
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success, data, message })); return;
  }
  const file = path.resolve(root, '.' + decodeURIComponent(p));
  if ((!file.startsWith(path.join(root, 'Views') + path.sep) && !file.startsWith(path.join(root, 'wwwroot') + path.sep)) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' })[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
(async () => {
  await new Promise(resolve => fixture.server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: fixture.browserArgs });
  let checks = 0;
  function check(value, label) { assert.ok(value, label); checks++; console.log('PASS ' + label); }
  const errors = [], dialogs = [];
  let acceptUpdates = false;
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
    await page.addInitScript(() => sessionStorage.setItem('abec-session', JSON.stringify({ userId: 1, role: 'Admin', displayName: 'Synthetic Admin' })));
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', async dialog => { dialogs.push({ type: dialog.type(), message: dialog.message() }); if (dialog.type() === 'confirm' && acceptUpdates) await dialog.accept(); else await dialog.dismiss(); });
    await page.goto('https://127.0.0.1:' + fixture.server.address().port + '/Views/Admin/AccountActivation.html', { waitUntil: 'networkidle' });
    await page.locator('.activation-row').first().waitFor();
    const row = id => page.locator('.activation-row[data-id="' + id + '"]');
    const modal = page.locator('#details-modal');
    await row(1).click();
    check(await page.locator('#btn-regenerate-pin').isEnabled(), 'Existing active account exposes the authorized PIN update.');
    await page.locator('#btn-regenerate-pin').click();
    check(writes.length === 0 && dialogs.at(-1).type === 'confirm', 'Cancelling a PIN update makes no backend write.');
    check(dialogs.at(-1).message.includes('Mark Comighod') && dialogs.at(-1).message.includes('Current PINs will stop working'), 'Confirmation identifies the target and explains replacing existing credentials.');
    acceptUpdates = true;
    await page.locator('#btn-regenerate-pin').click();
    await modal.waitFor({ state: 'hidden' });
    check(writes.join(',') === '1' && pins.get(1).startsWith('ABECMC'), 'Single-account update reuses the existing backend endpoint.');
    await row(1).click();
    const downloadEvent = page.waitForEvent('download'); await page.locator('#btn-print-notice').click();
    const download = await downloadEvent;
    const notice = fs.readFileSync(await download.path(), 'utf8');
    check(download.suggestedFilename().includes('_1.pdf') && notice.includes(pins.get(1)) && !notice.includes('legacy-one'), 'Fresh Activation Notice downloads the saved replacement for the same student.');
    await modal.getByRole('button', { name: 'Close', exact: true }).click();
    for (const id of [3, 4]) {
      await row(id).click();
      check(await page.locator('#btn-regenerate-pin').isDisabled(), 'Pending/archived account retains its existing operation restrictions: ' + id);
      await modal.getByRole('button', { name: 'Close', exact: true }).click();
    }
    await page.getByRole('button', { name: /^Active Accounts/i }).click();
    async function selectBoth() { await page.locator('#btn-select-mode').click(); await row(1).click(); await row(2).click(); }
    await selectBoth();
    await page.setViewportSize({ width: 390, height: 900 });
    const bulk = page.getByRole('button', { name: 'Update Security PINs', exact: true });
    check(await bulk.isVisible() && await page.locator('#selected-count').textContent() === '2 selected', 'Selected active accounts expose the bulk update on mobile.');
    const before = writes.length;
    await page.evaluate(() => { bulkRegeneratePins(); bulkRegeneratePins(); });
    await page.waitForFunction(() => !selectionMode);
    check(writes.length === before + 1 && writes.at(-1) === 2, 'Bulk update preserves already-correct PINs, updates the selected legacy account once, and blocks duplicate clicks.');
    check(!await page.locator('#activation-table-body').textContent().then(text => text.includes(pins.get(1))), 'Bulk update keeps PIN values out of the routine account table.');
    failSecond = true;
    pins.set(1, 'synthetic-legacy-one'); pins.set(2, 'synthetic-legacy-two');
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /^Active Accounts/i }).click();
    await selectBoth(); await bulk.click();
    await page.waitForFunction(() => !selectionMode);
    const partial = page.locator('.abec-toast-text').filter({ hasText: 'Mina Cruz: Synthetic rejection' });
    await partial.waitFor();
    check((await partial.textContent()).includes('1 Security PIN(s) updated'), 'Partial failure reports completed updates and identifies only accounts requiring review.');
    await page.evaluate(() => document.querySelectorAll('.abec-toast-close').forEach(button => button.click()));
    failSecond = false; loseResponse = true;
    const uncertainBefore = writes.length;
    await selectBoth(); await bulk.click();
    await page.locator('.abec-toast-text').filter({ hasText: /Mina Cruz: (Result could not be confirmed|PIN changed)/ }).waitFor();
    check(writes.length === uncertainBefore + 1, 'A lost response cannot issue a second replacement for the same requested version.');
    await page.evaluate(() => document.querySelectorAll('.abec-toast-close').forEach(button => button.click()));
    const preservedBefore = writes.length;
    await selectBoth(); await bulk.click();
    await page.locator('.abec-toast-text').filter({ hasText: 'All selected accounts already use the required PIN format' }).waitFor();
    check(writes.length === preservedBefore, 'Repeating the format update leaves all already-converted accounts unchanged.');
    const rejectedBefore = writes.length;
    await page.evaluate(() => { getSelectedRows = () => [document.querySelector('.activation-row[data-id="4"]')]; bulkRegeneratePins(); });
    check(writes.length === rejectedBefore, 'Client also rejects an archived account injected into a selection.');
    await page.route('**/wwwroot/js/abec-activation.js?*', route => route.abort());
    await page.reload({ waitUntil: 'networkidle' });
    await page.evaluate(() => modalRegeneratePin());
    await page.locator('.abec-toast-text').filter({ hasText: 'PIN service is unavailable' }).waitFor();
    check(writes.length === rejectedBefore, 'Missing backend script cannot fabricate a local PIN or change any account.');
    check(errors.length === 0, 'Account operations produce no browser JavaScript errors.');
    console.log('PASS ' + checks + ' enrolled PIN update browser checks.');
  } finally { await browser.close(); await new Promise(resolve => fixture.server.close(resolve)); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
