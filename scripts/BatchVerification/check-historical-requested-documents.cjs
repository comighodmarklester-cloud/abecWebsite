/* Real shared controller with mocked DOM/API. Never changes the application DB. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('Views/Admin/DocumentManagement.html', 'utf8');
const controller = fs.readFileSync('wwwroot/js/abec-documents.js', 'utf8');
let checks = 0;
function check(value, label) { assert.ok(value, label); checks++; console.log('PASS ' + label); }
function snapshot(status = 'Completed', id = 101) {
  return {
    batch: { batchId: id, batchName: 'Batch2026-' + id, status }, readOnly: status !== 'Active',
    applicants: [{ applicantId: 1, batchId: id, fullName: 'Alice', courseId: 1 }, { applicantId: 2, batchId: id, fullName: 'Bob', courseId: 1 }],
    students: [{ studentId: 11, applicantId: 1, batchId: id, fullName: 'Alice', courseId: 1 }, { studentId: 12, applicantId: 2, batchId: id, fullName: 'Bob', courseId: 1 }, { studentId: 99, batchId: 999, fullName: 'Other batch' }],
    requests: [
      { requestId: 502, studentId: 11, studentName: 'Alice', courseName: 'CSS', email: 'alice@example.invalid', contactNumber: '09000000001', documentType: 'Certificate of Completion', requestDate: '2026-01-03', requestStatus: 'Pending', reason: 'Employment' },
      { requestId: 501, studentId: 12, studentName: 'Bob', courseName: 'CSS', email: 'bob@example.invalid', contactNumber: '09000000002', documentType: 'Payment Receipt', requestDate: '2026-01-01', requestStatus: 'Released', releaseDate: '2026-02-01', hasFile: true, releaseFileName: 'receipt-original.pdf', releaseFileSize: 2048, reason: 'Personal copy' },
      { requestId: 503, studentId: 11, studentName: 'Alice', courseName: 'CSS', email: 'alice@example.invalid', documentType: 'National Certificate (TESDA)', requestDate: '2026-01-02', requestStatus: 'On Hold', reason: 'Other', specificReason: 'Embassy submission', holdReason: 'Awaiting verification' },
      { requestId: 999, studentId: 99, studentName: 'Excluded other batch', documentType: 'Payment Receipt', requestStatus: 'Pending' }
    ],
    registrationDocuments: [{ applicantId: 1, documentLabel: 'Form138' }],
    courseDocuments: [{ studentId: 11, batchId: id, documentType: 'Prepared only document' }], archives: []
  };
}
function fixture(historical = true) {
  const elements = new Map(), events = new Map(), intervals = [], calls = [];
  function element(id, classes = '') {
    const values = new Set(classes.split(/\s+/));
    return { id, className: classes, innerHTML: '', textContent: '', value: '', disabled: false, hidden: false, attrs: {}, events: {}, style: {},
      classList: { contains: c => values.has(c), add: (...cs) => cs.forEach(c => values.add(c)), remove: (...cs) => cs.forEach(c => values.delete(c)), toggle: (c, on) => on ? values.add(c) : values.delete(c) },
      setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; },
      addEventListener(k, fn) { this.events[k] = fn; }, querySelectorAll: () => [], querySelector: () => null,
      focus() {}, appendChild() {}, insertBefore() {}, closest: () => null, hasAttribute: () => false
    };
  }
  for (const m of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) elements.set(m[1], element(m[1], m[0].match(/class="([^"]*)"/)?.[1] || ''));
  const card = element('request-card');
  const document = { body: element('body', historical ? 'batch-management-page' : 'documents-page'),
    getElementById: id => elements.get(id) || null,
    querySelector: q => q === '#doc-request-modal .doc-request-card' ? card : null,
    querySelectorAll: () => [], addEventListener: (key, fn) => events.set(key, fn)
  };
  let data = snapshot(historical ? 'Completed' : 'Active');
  const context = { document, URL, URLSearchParams, location: { pathname: historical ? '/Views/Admin/BatchManagement.html' : '/Views/Admin/DocumentManagement.html', search: '?view=requests', origin: 'http://test.invalid', href: 'http://test.invalid/' },
    history: { replaceState() {} }, setInterval: fn => intervals.push(fn), setTimeout() {},
    AbecFeedback: { notify() {}, inline() {} }, closeBatchDocuments() { context.closed = true; },
    AbecApi: {
      consumePageAction(keys) {
        const params = new URLSearchParams(context.location.search);
        const query = new URLSearchParams(context.location.search);
        keys.forEach(key => query.delete(key));
        context.location.search = query.size ? '?' + query.toString() : '';
        return params;
      },
      requireRole: role => role === 'Admin' ? { role: 'Admin' } : null,
      formatDate: value => value || '', displayCourseName: value => value || '',
      get: async path => {
        calls.push(['GET', path]);
        if (path === '/api/batches/active') return { success: true, data: { batchId: 101, status: 'Active' } };
        if (path === '/api/courses') return { success: true, data: [{ courseId: 1, courseName: 'CSS' }] };
        if (/^\/api\/batches\/101\/documents(?:\?batchId=101)?$/.test(path)) return { success: true, data };
        throw Error('Unexpected read: ' + path);
      },
      put: async (path, body) => {
        calls.push(['PUT', path, body]);
        assert.equal(path, '/api/document-requests/502/status?batchId=101');
        data.requests.find(r => r.requestId === 502).requestStatus = body.status;
        return { success: true, message: 'Document request status updated.' };
      }
    }
  };
  context.window = context;
  vm.createContext(context); vm.runInContext(controller, context);
  return { context, elements, calls, intervals, events, data: () => data, setData: d => { data = d; },
    click(id, attribute, value) { return elements.get(id).events.click({ target: { id: '', closest: selector => selector === '[' + attribute + ']' ? { disabled: false, getAttribute: name => name === attribute ? String(value) : name === 'data-request-id' ? '502' : null } : null } }); }
  };
}
(async () => {
  const historical = fixture(), standalone = fixture(false);
  await historical.context.AbecRequestedDocuments.open(historical.data());
  await standalone.events.get('DOMContentLoaded')();
  const h = historical.elements, s = standalone.elements;
  check(h.get('doc-queue-body').innerHTML === s.get('doc-queue-body').innerHTML, 'completed-batch request rows match the same records rendered by active Document Management');
  check(h.get('doc-page-title').textContent === 'Requested Documents' && !h.get('doc-queue-view').hidden, 'history opens the real Requested Documents view');
  check(h.get('doc-queue-total').textContent === '3 request records' && h.get('doc-queue-screen-count').textContent === '2 outstanding', 'history preserves exact total and outstanding counts');
  check(h.get('doc-queue-body').innerHTML.indexOf('data-review-request="501"') < h.get('doc-queue-body').innerHTML.indexOf('data-review-request="502"'), 'original request dates determine queue order');
  check(!h.get('doc-queue-body').innerHTML.includes('Excluded') && !h.get('doc-queue-body').innerHTML.includes('Prepared only') && !h.get('doc-queue-body').innerHTML.includes('Form138'), 'history shows persisted requests only, excluding other batches and non-request uploads');
  check(!historical.calls.some(c => c[1] === '/api/batches/active'), 'historical context does not resolve or switch to the active batch');
  await historical.intervals[0]();
  check(!historical.calls.some(c => c[1] === '/api/batches/active'), 'background active-batch polling cannot replace the historical selection');
  historical.click('doc-queue-wrap', 'data-review-request', 501);
  standalone.click('doc-queue-wrap', 'data-review-request', 501);
  check(h.get('doc-request-body').innerHTML === s.get('doc-request-body').innerHTML, 'historical review details and available actions use the exact active-view renderer');
  check(h.get('doc-request-body').innerHTML.includes('receipt-original.pdf') && h.get('doc-request-body').innerHTML.includes('2026-02-01') && h.get('doc-request-body').innerHTML.includes('Personal copy'), 'review preserves saved file name, release date and request reason');
  check(h.get('doc-request-body').innerHTML.includes('/api/document-requests/501/file?inline=true&batchId=101') && h.get('doc-request-body').innerHTML.includes('/api/document-requests/501/file?batchId=101'), 'View and Download links carry the historical BatchId for server validation');
  historical.context.AbecRequestedDocuments.closeReview();
  historical.click('doc-queue-wrap', 'data-review-request', 503);
  check(h.get('doc-request-body').innerHTML.includes('Embassy submission') && h.get('doc-request-body').innerHTML.includes('Awaiting verification'), 'review preserves specific reasons and hold explanations');
  historical.context.AbecRequestedDocuments.closeReview();
  historical.click('doc-queue-wrap', 'data-review-request', 999);
  check(h.get('doc-request-modal').classList.contains('hidden'), 'review cannot open a request excluded by batch ownership');
  h.get('doc-queue-search').value = 'Alice'; h.get('doc-queue-search').events.input();
  check(h.get('doc-queue-result').textContent === 'Showing 2 of 3', 'history retains search filtering');
  h.get('doc-queue-type').value = 'National Certificate (TESDA)'; h.get('doc-queue-type').events.change();
  h.get('doc-queue-status').value = 'On Hold'; h.get('doc-queue-status').events.change();
  check(h.get('doc-queue-result').textContent === 'Showing 1 of 3' && h.get('doc-queue-body').innerHTML.includes('data-review-request="503"'), 'document type and status filters operate within the selected history batch');
  h.get('doc-queue-clear').events.click();
  check(h.get('doc-queue-result').textContent === 'Showing 3 of 3', 'Clear filters restores all selected-batch requests');
  historical.click('doc-queue-wrap', 'data-review-request', 502);
  historical.click('doc-request-modal', 'data-next-status', 'Processing');
  check(!h.get('doc-confirm').classList.contains('hidden') && !historical.calls.some(c => c[0] === 'PUT'), 'historical processing still requires the original explicit confirmation');
  h.get('doc-confirm').events.click({ target: h.get('doc-confirm-ok') });
  await new Promise(resolve => setImmediate(resolve));
  check(historical.calls.some(c => c[0] === 'PUT' && c[1].endsWith('batchId=101')) && historical.calls.some(c => c[1] === '/api/batches/101/documents?batchId=101'), 'confirmed document processing stays in historical context through refresh');
  check(h.get('doc-request-body').innerHTML.includes('Processing') && !historical.calls.some(c => /activate|\/complete/.test(c[1])), 'document processing refreshes details without activating or completing any batch');
  historical.context.AbecRequestedDocuments.clear();
  const empty = snapshot('Active', 102); empty.applicants = []; empty.students = []; empty.requests = [];
  await historical.context.AbecRequestedDocuments.open(empty);
  check(h.get('doc-queue-total').textContent === '0 request records' && !h.get('doc-queue-body').innerHTML.includes('Bob') && h.get('doc-queue-body').innerHTML.includes('No document requests'), 'empty batch replaces historical rows without copying records');
  h.get('doc-queue-back').events.click();
  check(historical.context.closed, 'Back returns to Batch Management rather than exposing the active document tabs');
  check(controller.includes("fetch('/Views/Admin/DocumentManagement.html'") && controller.includes('document.importNode(board, true)'), 'history imports canonical Document Management markup instead of maintaining a second request interface');
  console.log(checks + ' historical Requested Documents checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
