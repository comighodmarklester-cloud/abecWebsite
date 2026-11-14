/* Synthetic browser APIs only: never submits a live application or sends mail. */
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(process.env.ABEC_PLAYWRIGHT_MODULE || 'playwright');
const fixtureHttps = require('./lib/fixture-https.cjs');
const root = process.cwd(), output = path.join(root, 'artifacts', 'registration-ui');
fs.mkdirSync(output, { recursive: true });
const batch = { batchId: 2, batchName: 'Synthetic active batch', status: 'Active' };
const course = { courseId: 1, courseName: 'Computer Systems Servicing NC II', status: 'Available', remainingSlots: 10, slotCapacity: 25 };
const applicant = { applicantId: 12, firstName: 'Test', lastName: 'Applicant', fullName: 'Test Applicant', email: 'test@example.invalid',
  courseId: 1, courseName: course.courseName, batchId: 2, applicationStatus: 'Pending', applicationDate: '2026-11-14' };
let sent = [], lateUploads = 0;
let docs = [];
function resetDocs() { docs = ['TOR', 'Form138', 'HonorableDismissal', 'GoodMoral', 'BirthCertificate'].map((documentLabel, i) => ({
  documentId: i + 1, applicantId: 12, category: 'Credential', documentLabel, originalFileName: documentLabel + '.pdf',
  contentType: 'application/pdf', sizeBytes: documentLabel === 'Form138' ? 0 : 100, isFollowUp: documentLabel === 'Form138', uploadedAt: '2026-11-14'
})); }
const fixture = fixtureHttps(async (req, res) => {
  const p = new URL(req.url, 'https://localhost').pathname;
  if (p.startsWith('/api/')) {
    let data = [];
    if (p === '/api/courses') data = [course];
    else if (p === '/api/batches/active') data = batch;
    else if (p === '/api/batches/2/documents') data = { batch, readOnly: false, applicants: [applicant], students: [], registrationDocuments: docs, requests: [], archives: [] };
    else if (p === '/api/applicants/12') data = applicant;
    else if (p.endsWith('/registration-documents')) data = docs;
    else if (p === '/api/applicants/enroll/files') {
      let body = []; for await (const piece of req) body.push(piece);
      sent.push(Buffer.concat(body).toString('utf8')); data = { applicantId: 12 };
    } else if (p === '/api/applicants/12/registration-documents/2/file') {
      for await (const piece of req) { /* consume synthetic bytes */ }
      docs[1].isFollowUp = false; docs[1].sizeBytes = 100; lateUploads++; data = { documentId: 2 };
    }
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: true, data })); return;
  }
  const file = path.resolve(root, '.' + decodeURIComponent(p));
  if ((!file.startsWith(path.join(root, 'Views') + path.sep) && !file.startsWith(path.join(root, 'wwwroot') + path.sep)) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' }[path.extname(file)] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type }); fs.createReadStream(file).pipe(res);
});
const pdf = name => ({ name: name + '.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nSynthetic test\n%%EOF') });
(async () => {
  await new Promise(resolve => fixture.server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: fixture.browserArgs });
  const base = 'https://127.0.0.1:' + fixture.server.address().port;
  let count = 0; const errors = [];
  const check = (ok, label) => { assert.ok(ok, label); count++; console.log('PASS ' + label); };
  try {
    for (const width of [1366, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
      await page.goto(base + '/Views/Home/LandingPage.html', { waitUntil: 'networkidle' });
      await page.waitForLoadState('domcontentloaded');
      await page.waitForFunction(() => typeof openEnrollModal === 'function' && window.AbecEnrollWizard && document.querySelector('#enroll-course option[value="1"]'));
      await page.evaluate(() => { openEnrollModal(); showEnrollStep('form'); AbecEnrollWizard.goToStep(2); });
      const dob = page.locator('#enroll-birthdate'), age = page.locator('#enroll-age'), dobError = page.locator('#enroll-birthdate-error');
      check(await age.inputValue() === '', width + ': age initially blank');
      await dob.focus(); await dob.press('1'); await dob.press('ArrowRight'); await dob.press('1');
      check(await dobError.textContent() === '' && await age.inputValue() === '', width + ': partial native date has no typing error or age');
      await page.locator('#enroll-birthplace').click();
      await dob.fill('0002-01-01');
      check(await dobError.textContent() === '' && await age.inputValue() === '', width + ': invalid year clears age without typing errors');
      await page.locator('#enroll-birthplace').click();
      check(await dobError.textContent() === 'Please enter a valid date of birth.' && await dobError.isVisible(), width + ': invalid completed DOB displays the exact inline error on blur');
      await dob.fill('2000-01-01');
      const expected = new Date().getFullYear() - 2000;
      check(await age.inputValue() === String(expected) && await dobError.textContent() === '', width + ': valid date calculates age and clears error');
      await dob.fill('');
      check(await age.inputValue() === '', width + ': cleared DOB immediately clears calculated age');
      await page.locator('[data-step="2"] .enroll-wizard-next-step').click();
      check(await dobError.textContent() === 'Please enter a valid date of birth.', width + ': continuing flags incomplete DOB');
      check(await page.evaluate(() => ['2024-02-30', '2024-13-01', '200', '2000-1-1'].every(v => AbecEnrollShared.validateBirthdate(v) === 'Please enter a valid date of birth.')), width + ': malformed and impossible calendar dates rejected');
      await page.evaluate(() => AbecEnrollWizard.goToStep(3));
      const email = page.locator('#enroll-email'), emailError = page.locator('#enroll-email-error');
      await email.pressSequentially('applicant@');
      check(await emailError.textContent() === '', width + ': email has no errors while typing');
      await page.locator('#enroll-fax').click();
      check(await emailError.isVisible() && (await emailError.textContent()).length > 0, width + ': email validates on blur');
      await email.fill('applicant@example.invalid');
      check(await emailError.textContent() === '', width + ': corrected email clears the error');
      await page.evaluate(() => AbecEnrollWizard.goToStep(4));
      check(await page.locator('#enroll-zip').inputValue() === '' && await page.locator('#enroll-zip').getAttribute('placeholder') === null && await page.locator('#enroll-zip-help').count() === 0, width + ': ZIP is blank with no placeholder or helper');
      check(await page.locator('label').filter({ hasText: 'Mark as Not Applicable' }).count() === 0, width + ': all Not Applicable labels updated');
      const prefix = await page.locator('.barangay-input > span').evaluate(el => ({ font: parseFloat(getComputedStyle(el).fontSize), y: el.getBoundingClientRect().y + el.getBoundingClientRect().height / 2 }));
      const field = await page.locator('#enroll-barangay').evaluate(el => ({ font: parseFloat(getComputedStyle(el).fontSize), y: el.getBoundingClientRect().y + el.getBoundingClientRect().height / 2 }));
      check(prefix.font < field.font && Math.abs(prefix.y - field.y) < 2, width + ': Brgy. prefix is smaller and vertically aligned');
      await page.evaluate(() => AbecEnrollWizard.goToStep(5));
      const list = page.locator('#enroll-credential-list');
      check(await list.getByText('Missing', { exact: true }).count() === 0, width + ': no Missing indicators on first document view');
      check(await list.getByText('Birth Certificate (PSA)', { exact: true }).isVisible(), width + ': PSA document appears');
      await page.locator('#enroll-credential-input').setInputFiles(['TOR', 'HonorableDismissal', 'GoodMoral', 'BirthCertificate'].map(pdf));
      check(await list.getByText('Missing', { exact: true }).count() === 1 && await list.getByRole('checkbox').count() === 1, width + ': only outstanding Form 138 is flagged after upload');
      await page.locator('#enroll-id-type').selectOption('Passport'); await page.locator('#enroll-identity-file').setInputFiles(pdf('identity'));
      await page.locator('[data-step="5"] .enroll-wizard-next-step').click();
      check(await page.evaluate(() => AbecEnrollWizard.getCurrentStep()) === 5, width + ': unmarked missing item blocks continue');
      await list.getByRole('checkbox', { name: 'Follow up Form 138', exact: true }).check();
      await page.screenshot({ path: path.join(output, 'documents-' + width + '.png') });
      await page.locator('[data-step="5"] .enroll-wizard-next-step').click();
      check(await page.evaluate(() => AbecEnrollWizard.getCurrentStep()) === 6, width + ': follow-up item permits continue');
      await page.evaluate(() => {
        const values = { 'enroll-school-name': 'N/A', 'enroll-school-address': 'N/A', 'enroll-course': '1',
          'enroll-firstname': 'Test', 'enroll-lastname': 'Applicant', 'enroll-gender': 'Male', 'enroll-civil-status': 'Single', 'enroll-birthdate': '2000-01-01',
          'enroll-birthplace': 'Legazpi', 'enroll-tel': 'N/A', 'enroll-fax': 'N/A', 'enroll-contact': '09171234567', 'enroll-email': 'test@example.invalid',
          'enroll-street': 'Test Street', 'enroll-barangay': 'Test', 'enroll-district': 'N/A', 'enroll-city': 'Legazpi', 'enroll-province': 'Albay',
          'enroll-region': 'Bicol Region (Region V)', 'enroll-zip': '4500' };
        for (const [id, value] of Object.entries(values)) { const el = document.getElementById(id); el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); }
        document.getElementById('enroll-classification').selectedIndex = 1;
        for (const [name, value] of [['enroll-qualification', 'Full Qualification'], ['enroll-education', 'College Graduate'], ['enroll-employment', 'Casual']]) {
          document.querySelector('input[name="' + name + '"][value="' + value + '"]').checked = true;
        }
        document.getElementById('enroll-privacy-ack').checked = true;
        AbecEnrollWizard.goToStep(7);
      });
      check(await page.locator('#review-sections').getByText('Pending (Follow up)', { exact: true }).count() === 1, width + ': review includes pending follow-up');
      const previous = sent.length;
      await page.locator('#enroll-wizard-submit').click();
      await page.waitForFunction(() => document.getElementById('enroll-modal').classList.contains('hidden'));
      check(sent.length === previous + 1 && sent.at(-1).includes('"followUpDocumentTypes":["Form138"]') && sent.at(-1).includes('filename="BirthCertificate.pdf"'), width + ': submitted multipart data includes PSA and the saved follow-up selection');
      await page.evaluate(() => { openEnrollModal(); showEnrollStep('form'); AbecEnrollWizard.goToStep(5); });
      check(await list.getByText('Missing', { exact: true }).count() === 0 && await list.getByRole('checkbox').count() === 0, width + ': a fresh registration resets document indicators and follow-up selections');
      await page.locator('[data-step="5"] .enroll-wizard-next-step').click();
      await list.getByRole('checkbox', { name: 'Follow up Birth Certificate (PSA)', exact: true }).check();
      await page.locator('#enroll-credential-input').setInputFiles(pdf('BirthCertificate'));
      check(await list.getByRole('checkbox', { name: 'Follow up Birth Certificate (PSA)', exact: true }).count() === 0, width + ': upload replaces the follow-up selection immediately');
      await context.close();

      resetDocs();
      const adminContext = await browser.newContext({ viewport: { width, height: 900 } });
      await adminContext.addInitScript(() => sessionStorage.setItem('abec-session', JSON.stringify({ userId: 1, role: 'Admin', displayName: 'Synthetic Admin' })));
      const admin = await adminContext.newPage(); admin.on('pageerror', e => errors.push(e.message));
      await admin.goto(base + '/Views/Admin/DocumentManagement.html', { waitUntil: 'networkidle' });
      await admin.locator('[data-doc-open="a12"]').click();
      const modal = admin.locator('#doc-modal-body');
      check(await modal.getByText('Birth Certificate (PSA)', { exact: true }).isVisible() && await modal.getByText('Pending (Follow up)', { exact: true }).isVisible(), width + ': admin sees PSA and pending Form 138');
      check(await modal.locator('.doc-card').filter({ hasText: 'Form 138' }).getByRole('link', { name: 'Download' }).count() === 0, width + ': pending item has no fake download');
      await admin.screenshot({ path: path.join(output, 'admin-pending-' + width + '.png') });
      const prior = lateUploads;
      await modal.locator('.registration-follow-up-file').setInputFiles(pdf('late-form138'));
      await admin.waitForFunction(() => !document.querySelector('.registration-follow-up-file') &&
        document.querySelectorAll('#doc-modal-body .doc-file-actions a[href*="/download"]').length === 10);
      check(lateUploads === prior + 1 && await modal.getByText('Pending (Follow up)', { exact: true }).count() === 0 && await modal.locator('.doc-card').getByRole('link', { name: 'Download', exact: true }).count() === 5,
        width + ': later admin upload refreshes pending status and enables download');
      check(await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), width + ': admin page fits viewport');
      await adminContext.close();
    }
    check(errors.length === 0, 'No JavaScript runtime errors: ' + errors.join('; '));
    console.log('PASS ' + count + ' registration browser checks; desktop/mobile screenshots: ' + output);
  } finally { await browser.close(); await new Promise(resolve => fixture.server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
