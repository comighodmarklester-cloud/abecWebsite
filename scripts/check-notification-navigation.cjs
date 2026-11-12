/* One-time notification navigation with the real API helper and applicant controller.
   Uses synthetic records only; no network, database, or notification writes. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
let checks = 0;
function check(value, message) { assert.ok(value, message); checks++; }
function fixture(url) {
  const location = new URL(url), replacements = [], opened = [];
  const history = {
    state: { returnPage: 'students' },
    replaceState(state, title, target) {
      replacements.push(target);
      this.state = state;
      location.href = new URL(target, location).href;
    }
  };
  const list = { querySelectorAll: () => [], insertAdjacentHTML() {} };
  const card = {
    getAttribute: key => ({ 'data-id': '42', 'data-status': 'pending' }[key] || ''),
    classList: { add() {}, remove() {} }, scrollIntoView() {}
  };
  const document = {
    getElementById: id => id === 'applicant-list' ? list : null,
    querySelector: selector => selector === '.applicant-card[data-id="42"]' ? card : null,
    querySelectorAll: () => [], addEventListener() {}
  };
  const context = {
    document, location, history, URL, URLSearchParams, CSS: { escape: String },
    AbecFeedback: {}, setTimeout() {}, clearTimeout() {},
    openApplicantModal: () => opened.push(location.href)
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('wwwroot/js/abec-api.js', 'utf8'), context);
  context.AbecApi.get = async () => ({ success: true, data: [] });
  return { context, location, history, replacements, opened };
}
async function main() {
  const admin = fixture('http://localhost/Views/Admin/StudentsApplicants.html?status=pending&id=42&highlight=42&tab=applicants&batchId=7#records');
  vm.runInContext(fs.readFileSync('wwwroot/js/abec-applicants.js', 'utf8'), admin.context);
  await admin.context.abecReloadApplicants();
  check(admin.opened.length === 1, 'A registration notification opens the matching applicant');
  check(admin.location.search === '?tab=applicants&batchId=7', 'Opening consumes target IDs and notification status while preserving page context');
  check(!admin.opened[0].includes('id=42'), 'The URL is cleared before the destination is opened');
  check(admin.location.hash === '#records', 'Unrelated anchors remain intact');
  check(admin.history.state.returnPage === 'students', 'Existing browser history state is retained');
  await admin.context.abecReloadApplicants();
  check(admin.opened.length === 1, 'Refreshing applicant data does not reopen the notification');
  const refreshed = fixture(admin.location.href);
  vm.runInContext(fs.readFileSync('wwwroot/js/abec-applicants.js', 'utf8'), refreshed.context);
  await refreshed.context.abecReloadApplicants();
  check(refreshed.opened.length === 0, 'Reloading the cleaned page does not reopen the applicant');

  for (const [query, keys] of [
    ['id=42', ['id']],
    ['view=requests&applicantId=42&requestType=Payment+Receipt&requestName=Test', ['view', 'applicantId', 'requestType', 'requestName']],
    ['requestType=Payment+Receipt', ['requestType']],
    ['highlightDate=November+12%2C+2026', ['highlightDate']]
  ]) {
    const page = fixture('http://localhost/destination.html?' + query + '&batchId=7#details');
    const params = page.context.AbecApi.consumePageAction(keys);
    check(keys.every(key => params.has(key)), 'The destination retains its target values for the current opening');
    check(page.location.search === '?batchId=7' && page.location.hash === '#details', 'Only one-time action parameters are removed');
    page.context.AbecApi.consumePageAction(keys);
    check(page.replacements.length === 1, 'A consumed action does not change history again');
  }
  for (const [query, hash] of [['?highlight=status', '#header-status-chip'], ['', '#notifications']]) {
    const student = fixture('http://localhost/Views/Student/StudentDashboard.html' + query + hash);
    student.context.AbecApi.consumePageAction(['highlight'], hash);
    check(student.location.search === '' && student.location.hash === '', 'Student notification queries and their target anchors are consumed together');
  }
  console.log(`PASS: ${checks} one-time notification navigation checks.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
