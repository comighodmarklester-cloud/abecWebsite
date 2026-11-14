/* Logic checks in a mocked DOM; never opens a browser or contacts a server. */
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const batchHtml = fs.readFileSync('Views/Admin/BatchManagement.html', 'utf8');
const dashboardHtml = fs.readFileSync('Views/Admin/AdminDashboard.html', 'utf8');
const batchCss = fs.readFileSync('wwwroot/css/abec-batches.css', 'utf8');
let checks = 0;
function check(value, label) { assert.ok(value, label); checks++; console.log('PASS ' + label); }
for (const file of fs.readdirSync('Views/Admin').filter(f => f.endsWith('.html'))) {
  const html = fs.readFileSync('Views/Admin/' + file, 'utf8');
  if (!html.includes('data-purpose="main-sidebar"')) continue;
  check((html.match(/href="BatchManagement.html"/g) || []).length === 1, file + ' has one Batch Management sidebar entry');
  const sidebar = html.slice(html.indexOf('<aside'), html.indexOf('</aside>'));
  const links = [...sidebar.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map(match => match[1]);
  check(links.indexOf('BatchManagement.html') === links.indexOf('DocumentManagement.html') + 1, file + ' places Batch Management immediately after Document Management');
}
const activeBatchLink = batchHtml.match(/<a\b[^>]*href="BatchManagement.html"[^>]*>/)?.[0] || '';
check(/\babec-nav-link-active\b/.test(activeBatchLink) && /aria-current="page"/.test(activeBatchLink), 'new page marks its own sidebar entry active');
check(!dashboardHtml.includes('data-purpose="current-active-batch"') && !dashboardHtml.includes('id="modal-'), 'dashboard no longer owns batch controls or dialogs');
check(batchHtml.includes('abec-batches.js?') && !batchHtml.includes('abec-dashboard.js'), 'batch page loads its dedicated controller');
check(!batchHtml.includes('id="btn-complete-batch"') && !batchHtml.includes('>Mark as Complete</button>'), 'Mark as Complete button is removed');
check(/id="btn-create-batch"[^>]*data-create-batch/.test(batchHtml) && !batchHtml.includes('onsubmit="submitCreateBatch'), 'Create New Batch and form submission use bound event handlers');
check(!batchHtml.includes('id="btn-change-batch"'), 'Change Batch button is removed');
check(batchHtml.indexOf('id="batch-documents"') > batchHtml.indexOf('id="modal-batch-documents"') && batchHtml.indexOf('id="modal-batch-documents"') > batchHtml.indexOf('</main>'), 'document content is inside View Documents dialog, outside the main batch board');
check(!/max-h-56|max-h-\[60vh\]|overflow-x-auto/.test(batchHtml) && batchCss.includes('.doc-table-scroll { max-height: none; overflow: visible; }'), 'historical request table has no nested scroll container');

async function fixture(failedLoad = false) {
  const elements = new Map();
  const events = new Map();
  const document = {
    body: { classList: { add() {}, remove() {} } },
    activeElement: null,
    getElementById: id => elements.get(id) || null,
    querySelector: query => query.includes('[id^="modal-"]') ? [...elements.values()].find(e => e.id.startsWith('modal-') && !e.classList.contains('hidden')) || null : null,
    querySelectorAll: () => [],
    addEventListener: (name, fn) => events.set(name, fn)
  };
  for (const match of batchHtml.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) {
    const tag = match[0], id = match[1];
    const classes = new Set((tag.match(/class="([^"]*)"/)?.[1] || '').split(/\s+/));
    const attributes = {};
    elements.set(id, {
      id, events: {}, textContent: '', innerHTML: '', hidden: /\shidden[\s>]/.test(tag), value: '', disabled: false, checked: false,
      validity: { valid: true },
      classList: { contains: c => classes.has(c), add: c => classes.add(c), remove: c => classes.delete(c) },
      setAttribute: (key, value) => attributes[key] = value,
      getAttribute: key => attributes[key],
      addEventListener(name, fn) { this.events[name] = fn; }, querySelectorAll: () => [],
      focus() { document.activeElement = this; }, reset() {},
      setCustomValidity(value) { this.validity.valid = !value; },
      reportValidity() { return this.validity.valid; }
    });
  }
  let active = { batchId: 102, batchName: 'Batch2026-102', startDate: '2026-11-09', endDate: '2027-01-09', studentCount: 0, status: 'Active' };
  const historical = { batchId: 101, batchName: 'Batch2026-101', startDate: '2026-01-01', endDate: '2026-03-01', studentCount: 6, status: 'Completed' };
  const historyBatches = [historical];
  const documentSnapshot = id => ({ batch: historyBatches.find(b => b.batchId === id) || active || { batchId: id, batchName: 'Batch' + id, status: 'Completed' },
    applicants: [{ applicantId: 1, batchId: 101, fullName: 'Historical Person', courseName: 'CSS', courseId: 1 }, { applicantId: 2, batchId: 102, fullName: 'Cross batch person', courseId: 1 }],
    students: [{ studentId: 11, applicantId: 1, batchId: 101, fullName: 'Historical Person', courseName: 'CSS', courseId: 1 }, { studentId: 22, applicantId: 2, batchId: 102, fullName: 'Cross batch person', courseId: 1 }],
    registrationDocuments: id === 101 ? [{ documentId: 51, applicantId: 1, documentLabel: 'Form138' }, { documentId: 52, applicantId: 2, documentLabel: 'Excluded registration' }] : [],
    requests: id === 101 ? [{ requestId: 61, studentId: 11, documentType: 'Payment Receipt', requestStatus: 'Released', hasFile: true }, { requestId: 62, studentId: 22, documentType: 'Excluded request' }] : [],
    courseDocuments: id === 101 ? [{ courseDocumentId: 71, studentId: 11, batchId: 101, courseId: 1, documentType: 'Certificate of Completion', preparationStatus: 'Released', hasFile: true },
      { courseDocumentId: 72, studentId: 11, batchId: 102, courseId: 1, documentType: 'Excluded wrong batch' },
      { courseDocumentId: 73, studentId: 22, batchId: 101, courseId: 1, documentType: 'Excluded wrong owner' },
      { courseDocumentId: 74, studentId: 11, batchId: 101, courseId: 2, documentType: 'Excluded wrong course' }] : [] });
  const deferred = new Map();
  let deferId, failDocuments = false;
  const calls = [];
  const notices = [];
  let published = 0, accepted = false, viewedSnapshot = null;
  let impactFailure = false, impactThrows = false, impactDeferred = false, resolveImpact;
  let createFailure = false, createThrows = false, confirmDeferred = false, resolveConfirm, confirmations = 0;
  elements.get('create-batch-form').reportValidity = () => ['new-batch-name', 'new-batch-start'].every(id => elements.get(id).value && elements.get(id).validity.valid);
  elements.get('create-batch-form').reset = () => ['new-batch-name', 'new-batch-start', 'new-batch-end'].forEach(id => elements.get(id).value = '');
  const context = {
    document, URLSearchParams, location: { pathname: '/Views/Admin/BatchManagement.html', search: '', href: 'http://test.invalid/Views/Admin/BatchManagement.html' }, localStorage: { removeItem() {} },
    setTimeout: fn => fn(), alert() {},
    AbecRequestedDocuments: { prepare: async () => {}, open: async snapshot => { viewedSnapshot = snapshot; return true; }, clear: () => { viewedSnapshot = null; }, closeReview() {}, reviewOpen: () => false, busy: () => false },
    AbecFeedback: { confirm: async () => { confirmations++; return confirmDeferred ? new Promise(resolve => { resolveConfirm = resolve; }) : accepted; }, notify: options => notices.push(options) },
    AbecBatchChanges: { publish() { published++; } },
    AbecApi: {
      requireRole: role => { assert.equal(role, 'Admin'); return { role: 'Admin' }; },
      get: async path => {
        calls.push(['GET', path]);
        if (failedLoad) return { success: false };
        if (path === '/api/batches/active') return { success: true, data: active };
        if (path === '/api/batches/history') return { success: true, data: historyBatches };
        const requested = path.match(/^\/api\/batches\/(\d+)\/documents\?batchId=(\d+)$/);
        if (requested) {
          assert.equal(requested[1], requested[2]);
          const id = Number(requested[1]);
          if (id === deferId) return new Promise(resolve => deferred.set(id, () => resolve({ success: true, data: documentSnapshot(id) })));
          return failDocuments ? { success: false, message: 'Unavailable' } : { success: true, data: documentSnapshot(id) };
        }
        if (path === '/api/batches/switch-impact') {
          if (impactThrows) throw new Error('Offline');
          if (impactFailure) return { success: false, message: 'Batch checks unavailable.' };
          if (impactDeferred) return new Promise(resolve => { resolveImpact = () => resolve({ success: true, data: { currentActiveBatch: active } }); });
          return { success: true, data: { currentActiveBatch: active } };
        }
        throw Error('Unexpected API read: ' + path);
      },
      post: async (path, data) => {
        calls.push(['POST', path, data]);
        if (createThrows) throw new Error('Offline');
        if (createFailure) return { success: false, message: 'Creation unavailable.' };
        if (path.endsWith('/complete')) { historyBatches.push({ ...active, status: 'Completed' }); active = null; }
        else if (path === '/api/batches') { historyBatches.push({ ...active, status: 'Completed' }); active = { ...data, batchId: 103, studentCount: 0, status: 'Active' }; }
        else throw Error('Unexpected API write: ' + path);
        return { success: true };
      }
    }
  };
  context.history = { replaceState(_state, _title, path) {
    const url = new URL(path, 'http://test.invalid'); context.location.search = url.search; context.location.href = url.href;
  } };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('wwwroot/js/abec-batches.js', 'utf8'), context);
  await events.get('DOMContentLoaded')();
  return { context, elements, calls, notices, events,
    deactivate: () => active = null,
    failImpact: value => impactFailure = value, throwImpact: value => impactThrows = value,
    deferImpact: () => impactDeferred = true, resolveImpact: () => resolveImpact(),
    failCreate: value => createFailure = value, throwCreate: value => createThrows = value,
    deferConfirm: () => confirmDeferred = true, resolveConfirm: value => resolveConfirm(value), confirmations: () => confirmations,
    viewedSnapshot: () => viewedSnapshot, accept: value => accepted = value, published: () => published,
    failDocuments: () => failDocuments = true,
    deferDocuments: id => deferId = id,
    resolveDocuments: id => deferred.get(id)()
  };
}
(async () => {
  const f = await fixture(); const { context: c, elements: e } = f;
  check(e.get('active-batch-name').textContent === 'Batch2026-102', 'new page renders current batch from the API');
  check(e.get('active-batch-card').getAttribute('data-active') === 'true', 'green card styling is enabled for the current active batch');
  check(e.get('batch-history-preview').innerHTML.includes('Batch2026-101'), 'new page renders preserved history');
  check(!f.calls.some(call => /applicants|courses/.test(call[1])), 'batch page does not load dashboard applicant or course APIs');
  check(e.get('modal-batch-documents').classList.contains('hidden'), 'document panel is closed on initial batch overview');
  c.openBatchHistory(); check(!e.get('modal-batch-history').classList.contains('hidden'), 'history dialog opens on the new page'); c.closeBatchHistory();
  c.document.activeElement = e.get('btn-batch-history');
  await c.restoreBatch(101);
  check(!e.get('modal-batch-documents').classList.contains('hidden') && c.document.activeElement === e.get('batch-documents-close'), 'View documents opens its dialog and focuses Close');
  check(c.location.pathname === '/Views/Admin/BatchManagement.html' && c.location.search === '?batchId=101', 'historical selection stays on Batch Management and retains its batch in the URL');
  check(e.get('batch-documents-title').textContent === 'Batch2026-101 Documents', 'historical document table is shown on the page');
  check(f.viewedSnapshot().batch.batchId === 101 && f.viewedSnapshot().requests.some(r => r.requestId === 61), 'selected batch snapshot is passed to the shared Requested Documents workflow');
  check(!e.get('batch-requested-documents-host').hidden && e.get('batch-documents-message').hidden, 'shared Requested Documents view replaces the old combined documents table');
  check(e.get('active-batch-name').textContent === 'Batch2026-102' && !f.calls.some(call => call[0] === 'POST'), 'viewing history does not activate or modify a batch');
  c.openChangeBatchModal(); c.highlightBatch(101); await c.selectHighlightedBatch();
  check(e.get('modal-change-batch').classList.contains('hidden') && c.location.pathname.includes('BatchManagement'), 'Change Batch selection closes its dialog and displays documents without redirecting');
  await c.AbecBatches.refresh();
  check(e.get('batch-documents-title').textContent === 'Batch2026-101 Documents', 'page refresh retains the selected historical document table');
  c.closeBatchDocuments();
  check(e.get('modal-batch-documents').classList.contains('hidden') && c.document.activeElement === e.get('btn-batch-history'), 'Close dismisses document panel and restores focus');
  await c.AbecBatches.refresh();
  check(e.get('modal-batch-documents').classList.contains('hidden'), 'background refresh does not reopen a dismissed panel');
  await c.restoreBatch(101);
  check(!e.get('modal-batch-documents').classList.contains('hidden') && e.get('batch-documents-title').textContent === 'Batch2026-101 Documents', 'Batch History can reopen document records');
  c.closeBatchDocuments();
  c.openChangeBatchModal(); check(!e.get('modal-change-batch').classList.contains('hidden'), 'change batch dialog opens'); c.closeChangeBatchModal();
  f.events.get('click')({ target: { closest: selector => selector === '[data-create-batch]' ? e.get('btn-create-batch') : null }, preventDefault() {} });
  check(!e.get('modal-create-batch').classList.contains('hidden') && !e.get('modal-create-batch').hidden && c.document.activeElement === e.get('new-batch-name'), 'Create New Batch click opens the form and focuses the batch name');
  check(e.get('new-batch-start').value === e.get('new-batch-start').min && e.get('new-batch-end').value > e.get('new-batch-start').value, 'creation defaults to today with an automatically calculated end date');
  e.get('new-batch-name').value = 'Batch2026-103'; e.get('new-batch-start').value = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  await e.get('create-batch-form').events.submit({ preventDefault() {} });
  check(!e.get('modal-switch-batch').classList.contains('hidden') && e.get('btn-confirm-switch').disabled, 'creation retains the existing acknowledgment step');
  e.get('switch-ack-checkbox').checked = true; c.onSwitchAckChanged();
  await c.confirmSwitchBatch(); check(!f.calls.some(call => call[0] === 'POST'), 'declining final confirmation performs no write');
  f.accept(true); await c.confirmSwitchBatch();
  const create = f.calls.find(call => call[0] === 'POST');
  check(create[1] === '/api/batches' && create[2].activateNow && create[2].confirmSwitch && create[2].batchName === 'Batch2026-103', 'creation uses the original protected lifecycle API contract');
  check(e.get('active-batch-name').textContent === 'Batch2026-103' && f.published() === 1, 'successful change refreshes this page and publishes cross-tab notification');
  check(e.get('batch-documents-title').textContent === 'Batch2026-102 Documents' && c.location.pathname.includes('BatchManagement'), 'successful lifecycle switch automatically displays the previous batch documents on the same page');
  check(!e.get('modal-batch-documents').classList.contains('hidden'), 'successful active batch change opens previous records in View Documents');
  c.closeBatchDocuments();
  f.deactivate(); await c.AbecBatches.refresh();
  check(e.get('active-batch-name').textContent === 'No Active Batch' && e.get('active-batch-card').getAttribute('data-active') === 'false', 'overview handles no active batch without displaying completion controls');
  const failed = await fixture(true);
  check(failed.elements.get('batch-load-error').hidden && failed.notices.some(n => n.type === 'error') && failed.elements.get('active-batch-name').textContent === 'No Active Batch', 'failed API loading uses shared feedback and clears active batch information');
  const failedDocuments = await fixture(); await failedDocuments.context.restoreBatch(101); failedDocuments.failDocuments(); await failedDocuments.context.viewBatchDocuments(102);
  check(failedDocuments.elements.get('batch-requested-documents-host').hidden && !failedDocuments.viewedSnapshot() && failedDocuments.elements.get('batch-documents-message').textContent === 'Documents unavailable.' && failedDocuments.notices.some(n => n.type === 'error' && n.message === 'Unavailable'), 'failed selection clears previous rows and displays shared error feedback');
  const racing = await fixture(); racing.deferDocuments(101);
  const late = racing.context.viewBatchDocuments(101); await racing.context.viewBatchDocuments(102); racing.resolveDocuments(101); await late;
  check(racing.elements.get('batch-documents-title').textContent === 'Batch2026-102 Documents' && racing.viewedSnapshot().batch.batchId === 102, 'a late response cannot replace a more recently selected batch');

  async function reviewNewBatch(test) {
    test.context.openCreateBatchModal();
    test.elements.get('new-batch-name').value = 'Batch2026-103';
    await test.elements.get('create-batch-form').events.submit({ preventDefault() {} });
  }
  const invalid = await fixture(); invalid.context.openCreateBatchModal();
  invalid.elements.get('new-batch-name').value = '   ';
  await invalid.context.submitCreateBatch({ preventDefault() {} });
  check(!invalid.calls.some(c => c[1] === '/api/batches/switch-impact') && !invalid.elements.get('new-batch-name').validity.valid, 'whitespace-only names are rejected by form validation before any request');
  invalid.elements.get('new-batch-name').value = 'Batch2026-103'; invalid.elements.get('new-batch-start').value = '2000-01-01';
  await invalid.context.submitCreateBatch({ preventDefault() {} });
  check(!invalid.calls.some(c => c[1] === '/api/batches/switch-impact') && !invalid.elements.get('new-batch-start').validity.valid, 'past start dates cannot proceed to confirmation');
  const badImpact = await fixture(); badImpact.failImpact(true); await reviewNewBatch(badImpact);
  check(!badImpact.elements.get('modal-create-batch').hidden && badImpact.elements.get('modal-switch-batch').classList.contains('hidden') && badImpact.notices.some(n => n.message === 'Batch checks unavailable.'), 'failed pre-check keeps the creation form open and reports the error');
  check(!badImpact.elements.get('btn-review-new-batch').disabled && badImpact.elements.get('new-batch-name').value === 'Batch2026-103', 'pre-check failure preserves input and re-enables Continue');
  badImpact.failImpact(false); await badImpact.context.submitCreateBatch({ preventDefault() {} });
  check(!badImpact.elements.get('modal-switch-batch').hidden, 'pre-check can be retried after recovery');
  badImpact.context.closeSwitchBatchModal();
  check(!badImpact.elements.get('modal-create-batch').hidden && badImpact.elements.get('new-batch-name').value === 'Batch2026-103', 'cancelling review returns to the form without losing entered values');
  await badImpact.context.submitCreateBatch({ preventDefault() {} }); badImpact.events.get('keydown')({ key: 'Escape' });
  check(!badImpact.elements.get('modal-create-batch').hidden && badImpact.elements.get('modal-switch-batch').hidden, 'Escape dismisses only the confirmation and returns to the creation form');
  const offline = await fixture(); offline.throwImpact(true); await reviewNewBatch(offline);
  check(!offline.elements.get('modal-create-batch').hidden && !offline.elements.get('btn-review-new-batch').disabled && offline.notices.some(n => n.type === 'error'), 'network exceptions during review restore the form controls');
  const cancelled = await fixture(); cancelled.deferImpact(); cancelled.context.openCreateBatchModal();
  cancelled.elements.get('new-batch-name').value = 'Batch2026-103';
  const reviewing = cancelled.context.submitCreateBatch({ preventDefault() {} });
  await cancelled.context.submitCreateBatch({ preventDefault() {} });
  check(cancelled.calls.filter(c => c[1] === '/api/batches/switch-impact').length === 1, 'double-clicking Continue starts one pre-check');
  cancelled.context.closeCreateBatchModal(); cancelled.resolveImpact(); await reviewing;
  check(cancelled.elements.get('modal-create-batch').hidden && cancelled.elements.get('modal-switch-batch').classList.contains('hidden'), 'late pre-check response cannot reopen a cancelled creation dialog');
  const saveFailure = await fixture(); await reviewNewBatch(saveFailure); saveFailure.accept(true); saveFailure.failCreate(true);
  saveFailure.elements.get('switch-ack-checkbox').checked = true;
  await saveFailure.context.confirmSwitchBatch();
  check(!saveFailure.elements.get('modal-switch-batch').hidden && !saveFailure.elements.get('btn-confirm-switch').disabled && saveFailure.published() === 0 && saveFailure.elements.get('active-batch-name').textContent === 'Batch2026-102', 'rejected creation leaves the active batch unchanged and allows retry');
  saveFailure.failCreate(false); saveFailure.throwCreate(true); await saveFailure.context.confirmSwitchBatch();
  check(!saveFailure.elements.get('btn-confirm-switch').disabled && saveFailure.notices.some(n => n.message.includes('Refresh the batch list')), 'creation network exception restores Confirm and explains the next step');
  const double = await fixture(); await reviewNewBatch(double); double.deferConfirm();
  double.elements.get('switch-ack-checkbox').checked = true;
  const saving = double.context.confirmSwitchBatch();
  await double.context.confirmSwitchBatch();
  check(double.confirmations() === 1 && double.elements.get('btn-confirm-switch').disabled, 'repeated Confirm clicks cannot open duplicate final confirmations');
  double.resolveConfirm(true); await saving;
  check(double.calls.filter(c => c[0] === 'POST' && c[1] === '/api/batches').length === 1 && double.published() === 1, 'accepted confirmation creates and activates exactly one batch');
  console.log('ALL ' + checks + ' BATCH PAGE CHECKS PASSED');
})().catch(error => { console.error(error); process.exitCode = 1; });
