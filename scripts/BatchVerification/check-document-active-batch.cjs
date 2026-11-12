/* Mocked API/DOM regression checks. No server, database, uploads, or emails. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('wwwroot/js/abec-documents.js', 'utf8');
const html = fs.readFileSync('Views/Admin/DocumentManagement.html', 'utf8');
let checks = 0;
function check(value, label) { assert.ok(value, label); checks++; console.log('PASS ' + label); }

function fixture() {
  const elements = new Map();
  const calls = [];
  let active = { batchId: 102, status: 'Active' }, fail = false, deferred;
  const document = {
    body: { style: {} }, addEventListener() {},
    getElementById: id => elements.get(id) || null
  };
  const snapshot = id => ({ batch: { batchId: id, status: 'Active' }, readOnly: false,
    applicants: [{ applicantId: id, batchId: id, fullName: 'Applicant ' + id }],
    students: [{ studentId: id, applicantId: id, batchId: id }],
    registrationDocuments: [{ applicantId: id, documentId: id }],
    requests: [{ requestId: id, studentId: id }], archives: []
  });
  const context = {
    URL, URLSearchParams, document,
    location: { origin: 'http://test.invalid', search: '?batchId=101', href: 'http://test.invalid/Views/Admin/DocumentManagement.html?batchId=101' },
    AbecApi: { get: async path => {
      calls.push(path);
      if (path === '/api/batches/active') return fail ? { success: false, message: 'Unavailable' } : { success: true, data: active };
      if (path === '/api/courses') return { success: true, data: [{ courseId: 1 }] };
      const match = path.match(/^\/api\/batches\/(\d+)\/documents$/);
      if (match) {
        const id = Number(match[1]);
        if (deferred && id === deferred.id) return new Promise(resolve => { deferred.resolve = () => resolve({ success: true, data: snapshot(id) }); });
        return { success: true, data: snapshot(id) };
      }
      throw Error('Unexpected API call: ' + path);
    } }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source.replace(/\}\)\(\);\s*$/, `
    render = function () {};
    globalThis.test = { state: state, load: load, refresh: refreshActiveBatch, path: activeBatchPath };
  })();`), context);
  return { test: context.test, calls, elements,
    activate: id => { active = id ? { batchId: id, status: 'Active' } : null; },
    fail: () => { fail = true; },
    defer: id => { deferred = { id }; return () => deferred.resolve(); }
  };
}

(async () => {
  check(!/doc-batch-menu|doc-batch-options|data-select-batch|switchBatch|filters\.batch|doc-release-batch/.test(source + html), 'batch selector and secondary batch-filter paths removed');
  const f = fixture();
  check(f.test.state.batchId === '', 'legacy URL does not initialize batch selection');
  await f.test.load();
  check(f.test.state.batchId === '102' && f.test.state.applicants[0].batchId === 102, 'loads active batch despite historical URL');
  check(!f.calls.includes('/api/batches') && !f.calls.some(p => p.includes('/101/')), 'does not load batch list or historical snapshot');
  check(!/doc-batch-shell|doc-batch-notification|data-batch-view-request|loadBatchNotifications|renderDocumentNotifications/.test(source + html), 'page-specific notification dropdown and handlers removed');
  check(html.includes('abec-admin.js?') && source.includes('applyNotificationTarget();'), 'shared notification bell and notification navigation retained');
  check(f.test.path('/api/document-requests?batchId=101&status=Pending') === '/api/document-requests?batchId=102&status=Pending', 'operations enforce current context while preserving other parameters');
  f.test.state.filters.course = '1';
  f.test.state.openRequestId = 102;
  f.activate(103);
  await f.test.refresh();
  check(f.test.state.batchId === '103' && f.test.state.applicants[0].batchId === 103, 'follows a new active batch automatically');
  check(!f.test.state.docsByApplicant['102'] && !f.test.state.requestsByStudent['102'] && !f.test.state.openRequestId, 'clears old records and document dialogs');
  check(f.test.state.filters.course === '1', 'course filter preserved');
  f.activate(null);
  const reads = f.calls.filter(p => /\/documents$/.test(p)).length;
  await f.test.refresh();
  check(f.test.state.batchId === '' && !f.test.state.applicants.length && !f.test.state.requestList.length && f.test.state.readOnly, 'no active batch clears records and disables editing');
  check(f.calls.filter(p => /\/documents$/.test(p)).length === reads, 'no fallback to a completed batch');
  const g = fixture();
  await g.test.load();
  g.fail();
  await g.test.load();
  check(!g.test.state.applicants.length && g.test.state.readOnly && g.test.state.error === 'Unavailable', 'failed active-batch lookup clears stale records');
  const h = fixture();
  const release = h.defer(102);
  const oldLoad = h.test.load();
  await new Promise(resolve => setImmediate(resolve));
  h.activate(103);
  await h.test.load();
  release();
  await oldLoad;
  check(h.test.state.batchId === '103' && h.test.state.applicants[0].batchId === 103, 'late previous-batch responses cannot replace current records');
  console.log(checks + ' document active-batch checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
