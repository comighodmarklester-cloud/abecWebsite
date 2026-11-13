// Public report-controller checks with batch-scoped fixtures; no database or emails.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
let checks = 0;
function check(condition, message) { assert.ok(condition, message); checks++; }
class Element {
  constructor(attrs = {}) {
    this.attrs = attrs; this.listeners = {}; this.value = ''; this.hidden = false; this.textContent = ''; this._html = ''; this.open = false;
    this.style = { setProperty(key, value) { this[key] = value; } };
    this.classActivations = {};
    const classes = new Set((attrs.class || '').split(' ').filter(Boolean));
    const activations = this.classActivations;
    this.classList = { contains: key => classes.has(key), remove: key => classes.delete(key), toggle(key, force) { if (force) { if (!classes.has(key)) activations[key] = (activations[key] || 0) + 1; classes.add(key); } else classes.delete(key); } };
  }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k]; }
  hasAttribute(k) { return k in this.attrs; }
  addEventListener(k, fn) { (this.listeners[k] ||= []).push(fn); }
  emit(k, event = {}) { for (const fn of this.listeners[k] || []) fn(event); }
  querySelectorAll() { return []; }
  querySelector() { return null; }
  getBoundingClientRect() { return this.rect || { left:0, top:0, width:200, height:200 }; }
  closest(selector) { return selector === '[data-overview-status]' && this.hasAttribute('data-overview-status') ? this : null; }
  dispatchEvent(event) { this.emit(event.type, { ...event, target: this }); if (event.bubbles && this.parent) this.parent.emit(event.type, { ...event, target: this }); }
  scrollIntoView(options) { this.scrolled = options; }
  focus() { this.focused = true; }
  set innerHTML(value) { this._html = value; }
  get innerHTML() { return this._html; }
}
function breakdownRows(html) {
  return [...html.matchAll(/<tr class="report-breakdown-row"([^>]*)>([\s\S]*?)<\/tr>/g)].map(match=>({
    attributes:match[1],
    label:match[2].match(/<span title="[^"]*">([\s\S]*?)<\/span>/)?.[1],
    count:Number(match[2].match(/<td class="report-breakdown-count">([0-9]+)<\/td>/)?.[1]),
    percentage:Number(match[2].match(/<td class="report-breakdown-percent">([0-9]+)%<\/td>/)?.[1])
  }));
}
function hasBreakdown(html,label,count,percentage) {
  return breakdownRows(html).some(row=>row.label===label&&row.count===count&&(percentage===undefined||row.percentage===percentage));
}
async function main() {
  const ids = {};
  ['report-root','report-overview','report-status-chart','report-status-legend','report-status-summary','report-status-heading','report-status-explanation','report-population-total',
    'report-batch','report-batch-picker','report-batch-note','report-download'].forEach(id => ids[id] = new Element());
  const root = ids['report-root'];
  const rotation = new Element();
  const chartSvg = new Element();
  ids['report-status-chart'].querySelector = selector => selector === 'svg' ? chartSvg : selector === '.report-pie-rotation' ? rotation : null;
  ids['report-status-explanation'].rect = {left:300,top:0,width:200,height:200};
  // Parse interactive targets only; the existing report checks still inspect the actual rendered HTML.
  for (const id of ['report-status-chart', 'report-status-legend']) {
    const surface = ids[id];
    surface.targets = [];
    Object.defineProperty(surface, 'innerHTML', {
      get() { return this._html; },
      set(html) {
        this._html = html;
        this.targets = [...html.matchAll(/<(?:path|circle|button)\b([^>]*data-overview-status="[^"]+"[^>]*)>/g)].map(match => {
          const target = new Element(Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(attr => [attr[1], attr[2]])));
          target.parent = this; return target;
        });
      }
    });
    surface.contains = target => surface.targets.includes(target);
  }
  ids['report-overview'].querySelectorAll = () => [...ids['report-status-chart'].targets, ...ids['report-status-legend'].targets];
  ids['report-overview'].querySelector = selector => selector === '.report-pie-rotation' ? rotation : null;
  let details = [], reportRenders = 0;
  Object.defineProperty(root, 'innerHTML', {
    get() { return this._html; },
    set(value) {
      reportRenders++;
      this._html = value;
      delete ids['report-view-title']; delete ids['report-course-view']; delete ids['report-demo-chart']; delete ids['report-profile-field'];
      details = [...value.matchAll(/<section class="report-view" data-report-section="([^"]+)"/g)].map(m => {
        const d = new Element({ 'data-report-section': m[1] });
        d.heading = new Element(); ids['report-view-title'] = d.heading;
        return d;
      });
      for (const match of value.matchAll(/<select id="([^"]+)">([\s\S]*?)<\/select>/g)) {
        const select = new Element(); select.id = match[1];
        const chosen = match[2].match(/<option value="([^"]*)" selected>/) || match[2].match(/<option value="([^"]*)">/);
        select.value = chosen ? chosen[1] : ''; ids[select.id] = select;
      }
    }
  });
  const lineStroke = new Element();
  let includeLineFixture = false;
  root.querySelectorAll = selector => selector.includes('[data-report-motion="line"]') ? (includeLineFixture ? [lineStroke] : []) : details;
  root.querySelector = () => new Element();
  const buttons = ['overview', 'courses', 'archives', 'demographics'].map(key => new Element({ 'data-report-open': key }));
  const document = new Element();
  document.getElementById = id => ids[id] || null;
  document.querySelectorAll = () => buttons;
  const batches = [{ batchId: 1, batchName: 'Batch2026-101', status: 'Completed' }, { batchId: 5, batchName: 'Batch2026-102', status: 'Active' }, { batchId: 8, batchName: 'Batch2025-100', status: 'Completed' }];
  const applicants = ['Pending','Approved','Waitlisted','Rejected','Confirmed','Declined','Expired','Unrecognized','Pending','Rejected'].map((status, i) =>
    ({ applicantId: i + 1, batchId: 1, applicationStatus: status, applicationDate: '2026-11-01', courseId: 1 }));
  applicants.forEach((a,i) => Object.assign(a,{gender:i%2?'Female':'Male',civilStatus:'Single',age:20+i,educationLevel:i<4?'College':null,tesdaPreviouslyEnrolled:i<3?true:i<9?false:null}));
  const students = [{ studentId: 90, applicantId: 9, isArchived: false }, { studentId: 91, applicantId: 10, isArchived: true }, { studentId: 92, applicantId: null, isArchived: false }]
    .map(row => ({ ...row, batchId: 1, createdAt: '2026-11-02', courseId: 1 }));
  const courses = [{ courseId: 1, courseName: 'CSS', capacity: 25 }, { courseId: 2, courseName: 'Bookkeeping', capacity: 25 }, { courseId: 3, courseName: 'Customer Services', capacity: 25 }, { courseId: 4, courseName: 'Electronics', capacity: 25 }];
  const archives = [{ studentId: 91, archiveDate: '2026-11-03', archiveReason: 'Graduated' }];
  const categoryNames=['Deactivated','Rejected Slots','Graduated'];
  const storedCategoryNames=['Graduated','Deactivated','Academic Dismissal','Withdrawal','Inactive Lead','Rejected Slots','Others'];
  const categoryRows=storedCategoryNames.map((reason,i)=>({reason,batchId:[1,5,1,8,5,1,8][i],courseId:[1,2,2,1,1,1,2][i]}));
  const categoryReport=(batch,course)=>{
    const rows=categoryRows.filter(r=>categoryNames.includes(r.reason)&&(!batch||String(r.batchId)===batch)&&(!course||String(r.courseId)===course));
    return {batchId:batch?Number(batch):null,batchName:batch?batches.find(b=>String(b.batchId)===batch).batchName:'All Batches',
      courseId:course?Number(course):null,courseName:course?courses.find(c=>String(c.courseId)===course).courseName:'All Courses',
      totalAccounts:rows.length,categories:categoryNames.map(reason=>({reason,count:rows.filter(r=>r.reason===reason).length}))};
  };
  const calls = [];
  let failure = false, deferred = null, archiveFailure = false, archiveDeferred = null, archiveMismatch = false;
  const api = {
    requireRole: () => true,
    formatDate: value => value,
    async get(path) {
      calls.push(path);
      if (path === '/api/batches') return { success: true, data: batches };
      if (path.startsWith('/api/archives/categories')) {
        if (archiveFailure) return {success:false,message:'Archive categories unavailable'};
        const params=new URL(path,'https://abec.test').searchParams;
        const batch=params.get('batchId')||'',course=params.get('courseId')||'';
        if (batch==='8' && archiveDeferred) return archiveDeferred;
        return {success:true,data:categoryReport(archiveMismatch?'1':batch,course)};
      }
      if (path === '/api/courses') return { success: true, data: courses };
      if (path === '/api/activations?batchId=1' && failure) return { success: false, message: 'Student data unavailable' };
      if (path === '/api/applicants?batchId=1' && deferred) return deferred;
      const historic = path.endsWith('batchId=1');
      return { success: true, data: !historic ? [] : path.startsWith('/api/applicants') ? applicants : path.startsWith('/api/activations') ? students : path.startsWith('/api/archives') ? archives : [] };
    }
  };
  const location = new URL('https://abec.test/Views/Admin/Reports.html');
  const downloads = [], pdfCalls = [], notices = [], revoked = [];
  let pdfFailure = false, pdfPending = null;
  const response = () => ({ ok: !pdfFailure, headers: { get: () => pdfFailure ? 'application/json' : 'application/pdf' }, json: async () => ({ message: 'PDF unavailable' }), blob: async () => ({ size: 2048 }) });
  const fetch = async (url, options) => { pdfCalls.push({ url, options }); return pdfPending || response(); };
  class ReportURL extends URL {}
  ReportURL.createObjectURL = () => 'blob:batch-report';
  ReportURL.revokeObjectURL = url => revoked.push(url);
  document.body = { appendChild: () => {} };
  document.createElement = () => ({ click() { downloads.push({ fileName: this.download, href: this.href }); }, remove() {} });
  const window = { AbecApi: api, innerWidth: 1366, innerHeight: 768, listeners: {}, addEventListener(name, fn) { this.listeners[name] = fn; }, setTimeout, clearTimeout, AbecFeedback: { notify: message => notices.push(message) } };
  const history = { replaceState(a, b, url) { location.href = String(url); } };
  vm.runInNewContext(fs.readFileSync('wwwroot/js/abec-reports.js','utf8'), { window, document, AbecApi: api, location, history, URL: ReportURL, URLSearchParams, fetch, MouseEvent: class { constructor(type, options) { this.type=type; Object.assign(this, options); } } });
  document.emit('DOMContentLoaded');
  const flush = () => new Promise(resolve => setImmediate(resolve));
  await flush();
  check(ids['report-batch'].value === '5', 'Active batch selected by default');
  check(ids['report-population-total'].textContent === '0 people', 'New active batch remains empty');
  check(breakdownRows(ids['report-status-legend'].innerHTML).length===10 && breakdownRows(ids['report-status-legend'].innerHTML).every(row=>row.count===0&&row.percentage===0), 'Overview retains every status as a separate zero-count, zero-percentage row');
  check(ids['report-status-legend'].innerHTML.includes('<th scope="col">Status</th><th scope="col">Count</th><th scope="col">Percentage</th>'), 'Breakdown has three explicit aligned column headings');
  check(root.hidden && !ids['report-overview'].hidden, 'Overview is the initial report');
  buttons[1].emit('click');
  check((root.innerHTML.match(/class="report-course-fill is-entering"/g)||[]).length===4, 'Each course bar animates from zero on entering Course Statistics');
  const firstCourseRender = reportRenders;buttons[1].emit('click');
  check(reportRenders===firstCourseRender+1 && (root.innerHTML.match(/class="report-course-fill is-entering"/g)||[]).length===4, 'Clicking the current Course Statistics button renders fresh bars and replays their animation');
  check((root.innerHTML.match(/class="report-course-graph"/g)||[]).length===4, 'All four course graphs render immediately, including an empty batch');
  check(ids['report-course-view'].value==='applicants', 'Course Statistics defaults to Applicants');
  check(breakdownRows(root.innerHTML).length===4 && breakdownRows(root.innerHTML).every(row=>row.count===0&&row.percentage===0), 'Course Statistics uses the same row layout and retains empty courses');
  check(!root.innerHTML.includes('data-course-page') && !root.innerHTML.includes('Next'), 'Course Statistics has no pagination or Next button');
  check(!root.innerHTML.split('</header>')[0].includes('Batch2026-102'), 'Course section does not repeat the batch indicator in its upper-right corner');
  check(root.innerHTML.includes('>Applicants</option>') && root.innerHTML.includes('>Enrolled</option>') && !root.innerHTML.includes('Capacity and slots'), 'View dropdown contains only Applicants and Enrolled');
  ids['report-batch'].value='1'; ids['report-batch'].emit('change',{target:ids['report-batch']}); await flush();
  check(ids['report-population-total'].textContent==='11 people', 'Main status chart still counts each person once');
  check(root.innerHTML.includes(': 10 Applicants'), 'Applicants graph uses registration counts for the selected batch');
  check((root.innerHTML.match(/class="report-course-fill is-entering"/g)||[]).length===4, 'Changing the top batch replays all course bars after the selected data arrives');
  check(hasBreakdown(root.innerHTML,'CSS',10,100) && hasBreakdown(root.innerHTML,'Bookkeeping',0,0), 'Course counts and shares occupy separate cells, including zero categories');
  root.emit('change',{target:{id:'report-course-view',value:'enrollment'}});
  check(root.innerHTML.includes(': 2 Enrolled') && (root.innerHTML.match(/class="report-course-graph"/g)||[]).length===4, 'Enrolled view shows all four courses and excludes archived students');
  check((root.innerHTML.match(/class="report-course-fill is-entering"/g)||[]).length===4, 'Selecting Enrolled replays every course bar from zero with the enrolled data');
  for (const view of ['applicants', 'enrollment', 'applicants', 'enrollment']) {
    root.emit('change',{target:{id:'report-course-view',value:view}});
    check((root.innerHTML.match(/class="report-course-fill is-entering"/g)||[]).length===4 && root.innerHTML.includes(view==='enrollment' ? ': 2 Enrolled' : ': 10 Applicants'), 'Returning to either course View option replays the bars using its own data');
    check(ids['report-course-view'].focused, 'The selected course View retains keyboard focus after replay');
  }
  window.innerWidth=375; window.listeners.resize(); await new Promise(resolve=>setTimeout(resolve,150));
  check((root.innerHTML.match(/class="report-course-graph"/g)||[]).length===4, 'Small screens retain all four course graphs');
  check(!root.innerHTML.includes('is-entering'), 'Resizing Course Statistics keeps the bars at their final heights without replaying');
  function archiveFilter(id,value) {root.emit('change',{target:{id:'report-archive-'+id,value}});}
  function countFor(reason) {return breakdownRows(root.innerHTML).find(row=>row.label===reason)?.count;}
  buttons[2].emit('click');
  check(root.innerHTML.includes('Loading archive categories') && !root.innerHTML.includes('data-report-entrance'), 'Archives waits for its scoped data before starting an entrance animation');
  await flush();
  check(root.innerHTML.includes('data-report-entrance="true"') && (root.innerHTML.match(/class="report-archive-fill is-entering"/g)||[]).length===3, 'All three Archives bars animate after the data arrives');
  check(ids['report-archive-course'].value==='' && ids['report-archive-batch'].value==='', 'Archives defaults independently to All Courses and All Batches');
  check(!root.innerHTML.includes('StudentArchive.html') && !root.innerHTML.includes('report-archive-btn'), 'Archives shows the graph directly without a Manage active-batch archives button');
  check(categoryNames.every(reason=>countFor(reason)===1), 'Every requested category has its count directly on the graph');
  check(breakdownRows(root.innerHTML).every(row=>Number.isFinite(row.percentage)) && breakdownRows(root.innerHTML).reduce((sum,row)=>sum+row.percentage,0)===100, 'Archive rows have separately aligned percentages that sum to 100');
  check(breakdownRows(root.innerHTML).length===3 && !root.innerHTML.includes('data-archive-page'), 'All three graph categories remain visible without pagination');
  check(root.innerHTML.includes('aria-label="Archive status counts and percentages"') && root.innerHTML.includes('3 accounts'), 'Graph counts are accessible and the summary matches their sum');
  check(ids['report-batch-picker'].hidden && !root.innerHTML.split('</header>')[0].includes('Batch2026-101'), 'Archives shows only its own Course and Batch controls without a conflicting batch indicator');
  archiveFilter('course','1'); await flush();
  check((root.innerHTML.match(/class="report-archive-fill is-entering"/g)||[]).length===3 && root.innerHTML.includes('data-report-entrance="true"'), 'Changing an Archives filter replays every bar after the filtered data arrives');
  check(ids['report-archive-batch'].value==='' && countFor('Graduated')===1 && countFor('Rejected Slots')===1 && countFor('Deactivated')===0 && root.innerHTML.includes('2 accounts'), 'Course-only selection spans all batches and updates each visible count');
  archiveFilter('batch','5'); await flush();
  check(ids['report-archive-course'].value==='1' && countFor('Inactive Lead')===undefined && countFor('Graduated')===0 && root.innerHTML.includes('0 accounts &middot;'), 'Combining Course and Batch applies their intersection');
  check((root.innerHTML.match(/report-archive-fill is-entering/g)||[]).length===3, 'The archive Batch filter also replays all bars with the combined scope');
  archiveFilter('course',''); await flush();
  check(ids['report-archive-batch'].value==='5' && countFor('Deactivated')===1 && countFor('Inactive Lead')===undefined && root.innerHTML.includes('1 account &middot;'), 'Clearing Course preserves Batch and restores all courses in that batch');
  archiveFilter('batch',''); await flush();
  check(categoryNames.every(reason=>countFor(reason)===1), 'Clearing Batch restores all-batches category counts');
  check((root.innerHTML.match(/report-archive-fill is-entering/g)||[]).length===3, 'Returning to All Courses and All Batches replays previously opened archive data');
  archiveFilter('course','3'); await flush();
  check(categoryNames.every(reason=>countFor(reason)===0) && root.innerHTML.includes('No accounts match the selected course and batch.'), 'Empty selections keep all three explicit zero counts');
  archiveFilter('course','1'); await flush();
  let releaseArchive;
  archiveDeferred=new Promise(resolve=>releaseArchive=resolve);
  archiveFilter('batch','8');
  check(root.innerHTML.includes('Loading archive categories') && !root.innerHTML.includes('report-breakdown-row'), 'Loading a new scope clears previous counts immediately');
  check(!root.innerHTML.includes('data-report-entrance') && !root.innerHTML.includes('is-entering'), 'Filter changes keep the archive replay pending while data loads');
  archiveFilter('batch','5'); await flush();
  const latestArchiveRender = reportRenders;
  releaseArchive({success:true,data:categoryReport('8','1')}); await flush(); archiveDeferred=null;
  check(countFor('Inactive Lead')===undefined && countFor('Withdrawal')===undefined && ids['report-archive-batch'].value==='5', 'A delayed response cannot replace the newest Course and Batch selection');
  check(reportRenders===latestArchiveRender && (root.innerHTML.match(/report-archive-fill is-entering/g)||[]).length===3, 'A superseded archive response cannot interrupt or restart the newest selection animation');
  archiveFailure=true; archiveFilter('batch',''); await flush();
  check(root.innerHTML.includes('Archive categories unavailable') && !root.innerHTML.includes('report-breakdown-row'), 'Archive failures remove stale graphs and explain the failure');
  archiveFailure=false;archiveMismatch=true;archiveFilter('batch','5');await flush();
  check(root.innerHTML.includes('does not match the selected course and batch') && !root.innerHTML.includes('report-breakdown-row'), 'Mismatched report scopes cannot display incorrect category counts');
  archiveMismatch=false;archiveFilter('batch','');archiveFilter('course','');await flush();
  categoryRows.push({reason:'Graduated',batchId:5,courseId:1});
  const beforeRefresh=calls.length;
  window.listeners.storage({key:'unrelated'});await flush();
  check(calls.length===beforeRefresh, 'Unrelated storage changes leave the graph untouched');
  window.listeners.storage({key:'abec-archives-changed'});await flush();
  check(countFor('Graduated')===2 && root.innerHTML.includes('4 accounts'), 'Successful archive in another page refreshes counts from persisted data');
  categoryRows.pop();window.listeners['abec:archives-changed']();await flush();
  check(countFor('Graduated')===1 && root.innerHTML.includes('3 accounts'), 'Same-page archive refresh also reloads real category counts');
  ids['report-batch'].value='5';ids['report-batch'].emit('change',{target:ids['report-batch']});await flush();
  check(ids['report-archive-course'].value==='' && ids['report-archive-batch'].value==='' && root.innerHTML.includes('3 accounts'), 'Unrelated report batch changes do not alter the Archives scope');
  check(calls.includes('/api/archives/categories?studentStatusOnly=true') && calls.includes('/api/archives/categories?studentStatusOnly=true&courseId=1') && calls.includes('/api/archives/categories?studentStatusOnly=true&batchId=5&courseId=1') && calls.includes('/api/archives/categories?studentStatusOnly=true&batchId=5'), 'API calls apply Course and Batch independently and together');
  check(!calls.some(p=>/^\/api\/archives(?:\?|$)/.test(p)), 'Combined archive reporting never broadens operational archive list calls');
  buttons[3].emit('click');
  check(root.innerHTML.includes('data-report-entrance="true"') && root.innerHTML.includes('data-report-motion="reveal"'), 'An empty profile chart receives a subtle entrance reveal');
  check(root.innerHTML.includes('Profile statistics') && root.innerHTML.includes('No registration records'), 'Renamed profile section follows the top Batch dropdown');
  ids['report-batch'].value='1'; ids['report-batch'].emit('change',{target:ids['report-batch']}); await flush();
  check(ids['report-profile-field'].value==='gender' && root.innerHTML.includes('10 registration form responses'), 'Profile statistics include all registrations, including enrolled and archived applicants');
  check(root.innerHTML.includes('report-donut-rotation is-spinning'), 'Changing the top batch replays the profile donut with the new registration data');
  check(hasBreakdown(root.innerHTML,'Male',5,50) && hasBreakdown(root.innerHTML,'Female',5,50), 'Gender response counts are accurate');
  check(!root.innerHTML.includes('data-demo='), 'Old applicant/enrolled demographic toggle is removed');
  check(hasBreakdown(root.innerHTML,'Prefer Not to Say',0,0) && hasBreakdown(root.innerHTML,'Not recorded',0,0), 'Profile breakdown preserves zero-count categories');
  root.emit('change',{target:{id:'report-profile-field',value:'civilStatus'}});
  check(hasBreakdown(root.innerHTML,'Single',10,100), 'Civil-status responses are counted per registration');
  check(root.innerHTML.includes('report-donut-rotation is-spinning'), 'Selecting a registration field spins the profile donut');
  check(hasBreakdown(root.innerHTML,'Married',0,0) && hasBreakdown(root.innerHTML,'Separated',0,0), 'Unused civil-status categories remain visible as individual rows');
  root.emit('change',{target:{id:'report-profile-field',value:'educationLevel'}});
  check(hasBreakdown(root.innerHTML,'College',4,40) && hasBreakdown(root.innerHTML,'Not recorded',6,60), 'Educational attainment includes unanswered fields explicitly');
  root.emit('change',{target:{id:'report-profile-field',value:'tesdaPreviouslyEnrolled'}});
  check(hasBreakdown(root.innerHTML,'Yes',3,30) && hasBreakdown(root.innerHTML,'No',6,60), 'Yes and No registration answers remain distinct from missing answers');
  ids['report-batch'].value='5'; ids['report-batch'].emit('change',{target:ids['report-batch']}); await flush();
  check(root.innerHTML.includes('0 registration form responses') && breakdownRows(root.innerHTML).every(row=>row.count===0&&row.percentage===0), 'Batch changes remove previous-batch profile counts');
  ids['report-batch'].value='1'; ids['report-batch'].emit('change',{target:ids['report-batch']}); await flush();
  check(ids['report-profile-field'].value==='tesdaPreviouslyEnrolled', 'Selected registration field is preserved across top-batch changes');
  for (const field of ['gender', 'civilStatus', 'gender', 'tesdaPreviouslyEnrolled']) {
    root.emit('change',{target:{id:'report-profile-field',value:field}});
    check(root.innerHTML.includes('report-donut-rotation is-spinning') && ids['report-profile-field'].value===field, 'Returning to a previously selected profile field replays its own donut');
    check(hasBreakdown(root.innerHTML,field==='gender' ? 'Male' : field==='civilStatus' ? 'Single' : 'Yes',field==='gender' ? 5 : field==='civilStatus' ? 10 : 3), 'A replayed profile donut uses the newly selected field counts');
  }
  buttons[0].emit('click');
  check(root.hidden && !ids['report-overview'].hidden, 'Overview still returns to the batch status chart');
  check(!rotation.classActivations['is-spinning'], 'Opening Overview keeps the pie stationary');
  buttons[0].emit('click');
  check(!rotation.classActivations['is-spinning'], 'Clicking the current Overview button keeps the pie stationary');
  ids['report-download'].emit('click'); await flush();
  check(downloads.length===1 && downloads[0].fileName==='ABEC_Report_Batch2026-101.pdf', 'Download remains scoped and named for the selected top batch');
  check(pdfCalls[0].url.endsWith('/api/batches/1/report') && pdfCalls[0].options.credentials==='include', 'PDF download carries the explicit BatchId and authenticated session');
  pdfFailure=true; ids['report-download'].emit('click'); await flush();
  check(downloads.length===1 && notices.at(-1).type==='error', 'Download failures never save a JSON error as a PDF'); pdfFailure=false;
  let finishPdf;pdfPending=new Promise(resolve=>finishPdf=resolve);const beforePdf=pdfCalls.length;
  ids['report-download'].emit('click');ids['report-download'].emit('click');
  check(pdfCalls.length===beforePdf+1 && ids['report-download'].disabled, 'Repeated clicks create only one pending download');
  ids['report-batch'].value='5';ids['report-batch'].emit('change',{target:ids['report-batch']});await flush();finishPdf(response());await flush();pdfPending=null;
  check(downloads.at(-1).fileName==='ABEC_Report_Batch2026-101.pdf', 'Changing batches cannot mix a pending report and its filename');
  ids['report-download'].emit('click');await flush();check(downloads.at(-1).fileName==='ABEC_Report_Batch2026-102.pdf','Empty active batch downloads its own report');
  const saved=downloads.length;failure=true;ids['report-batch'].value='1';ids['report-batch'].emit('change',{target:ids['report-batch']});await flush();ids['report-download'].emit('click');
  check(ids['report-download'].disabled && downloads.length===saved,'Incomplete reports cannot download stale figures');failure=false;
  let release;deferred=new Promise(resolve=>release=resolve);const pending=window.abecReportsRefresh();await flush();
  ids['report-batch'].value='5';ids['report-batch'].emit('change',{target:ids['report-batch']});await flush();release({success:true,data:applicants});await pending;deferred=null;
  check(ids['report-population-total'].textContent==='0 people' && ids['report-status-summary'].textContent.includes('Batch2026-102'),'Late top-batch results cannot replace the current report');
  ids['report-batch'].value='999';ids['report-batch'].emit('change',{target:ids['report-batch']});await flush();
  check(ids['report-status-summary'].textContent==='The selected batch was not found.' && ids['report-download'].disabled,'Invalid batch cannot display or download another batch?s report');
  const html=fs.readFileSync('Views/Admin/Reports.html','utf8');
  const css=fs.readFileSync('wwwroot/css/abec-reports.css','utf8');
  check(html.includes('Profile statistics') && !html.includes('>Demographics</button>'),'Top navigation uses the requested section name');
  check(html.includes('<h3 id="report-status-title" class="report-chart-title">Applicant and Student Status Distribution</h3>'), 'Overview graph has a visible descriptive title');
  check(html.includes('report-batch-actions') && !html.includes('report-print'),'Download icon remains beside the batch dropdown');
  check(css.includes('repeat(4, minmax(0, 1fr))') && css.includes('repeat(2, minmax(0, 1fr))'),'Course graph grid supports four-across and two-by-two layouts');
  check(!fs.readFileSync('wwwroot/js/abec-reports.js','utf8').includes('scrollIntoView'),'Report switching remains in place');
  check(css.includes('body.reports-page .report-breakdown tbody tr + tr { border-top: 1px solid var(--abec-border-soft); }') && css.includes('.report-breakdown-count-col { width: 5.5rem; }'), 'All breakdown tables share column widths and one divider across each row');
  applicants.splice(0,applicants.length,...Array.from({length:23},(_,i)=>({applicantId:i+100,batchId:1,courseId:1,applicationStatus:i<3?'Pending':i<9?'Approved':'Rejected',applicationDate:'2026-11-01'})));
  students.splice(0,students.length);
  ids['report-batch'].value='1';ids['report-batch'].emit('change',{target:ids['report-batch']});await flush();
  check(hasBreakdown(ids['report-status-legend'].innerHTML,'Pending',3,13), 'Pending, 3, and 13% appear in separate cells on the same row');
  {
  const chart = ids['report-status-chart'], legend = ids['report-status-legend'], card = ids['report-status-explanation'], summary = ids['report-status-summary'];
  const heading = ids['report-status-heading'];
  const pieValues = [...chart.innerHTML.matchAll(/class="report-pie-segment"[^>]*aria-label="([^\"]+) — (\d+) applicants? \((\d+)%\)"/g)]
    .map(match => ({ label: match[1], count: Number(match[2]), percentage: Number(match[3]) }));
  check(pieValues.length > 0 && pieValues.every(row => hasBreakdown(legend.innerHTML, row.label, row.count, row.percentage)), 'Every colored slice exposes its status, count and percentage consistently with the legend');
  check(pieValues.reduce((total, row) => total + row.percentage, 0) === 100, 'Displayed slice percentages add up to 100%');
  check((chart.innerHTML.match(/class="report-pie-callout"/g) || []).length === pieValues.length, 'Every nonempty slice has a visible status, count and percentage callout');
  check(breakdownRows(legend.innerHTML).length === 10 && hasBreakdown(legend.innerHTML, 'Other', 0, 0), 'The color key retains every status, including zero counts and zero percent');
  check(chart.innerHTML.includes('class="report-pie-flat" transform="translate(100 40)"') && !/report-pie-(depth|light|wall|ground|projection)/.test(chart.innerHTML), 'Overview renders a flat circular pie without perspective, depth, shading or shadows');
  function writeOverviewPreview(name) {
    if (!process.env.ABEC_REPORT_PREVIEW_DIR) return;
    fs.mkdirSync(process.env.ABEC_REPORT_PREVIEW_DIR, { recursive: true });
    const preview = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + css +
      'body.reports-page{margin:0;padding:24px;box-sizing:border-box;font-family:Segoe UI,Arial,sans-serif;background:#f5f9ff}.report-overview{min-height:calc(100vh - 48px);box-sizing:border-box}.report-overview-legend{align-self:center}button{font:inherit}</style></head><body class="reports-page"><section class="report-overview">' +
      '<div class="report-overview-legend"><h3>Status breakdown</h3>' + legend.innerHTML + '</div>' +
      '<div class="report-overview-chart"><h3 class="report-chart-title">Applicant and Student Status Distribution</h3><div class="report-status-chart">' + chart.innerHTML + '</div></div>' +
      '<article class="report-overview-summary"><h3>What the Graph Shows</h3><p>' + summary.textContent + '</p></article></section></body></html>';
    fs.writeFileSync(require('node:path').join(process.env.ABEC_REPORT_PREVIEW_DIR, name + '.html'), preview);
  }
  writeOverviewPreview('overview');
  const target = (surface, label) => surface.targets.find(element => element.getAttribute('data-overview-status') === label);
  const approved = target(chart, 'Approved'), pending = target(chart, 'Pending');
  const defaultExplanation = summary.textContent;
  check(heading.textContent === 'What the Graph Shows', 'The description begins with the default heading');
  check(card.style.backgroundColor === '#ffffff' && defaultExplanation.includes('distributed across their current statuses'), 'Default card stays white and explains the whole graph');
  chart.emit('pointerover', {target: approved, pointerType:'mouse'});
  check(heading.textContent === 'Approved', 'Hovering a colored segment replaces the heading with its status');
  check(summary.textContent.startsWith('6 applications have been approved.') && summary.textContent.includes('26%') && summary.textContent.includes('Batch2026-101'), 'Hover explains the category using its actual count, percentage, and batch');
  check(summary.textContent.split('. ').length === 4 && approved.classList.contains('is-preview') && card.classList.contains('is-explaining') && card.style['--report-wash-color'] === '#2563eb', 'Hover immediately explains the category and starts its color spread');
  const spinCount = () => rotation.classActivations['is-spinning'] || 0;
  const beforeHoverSpins = spinCount();
  check(rotation.style.transform===undefined && !rotation.classList.contains('is-aiming'), 'Hover does not aim or rotate a segment toward the card');
  check(approved.getAttribute('style').includes('--report-segment-color:#2563eb') && css.includes('drop-shadow(0 2px 2px color-mix(in srgb, var(--report-segment-color)') && css.includes('drop-shadow(0 0 4px color-mix(in srgb, var(--report-segment-color)'), 'Every segment supplies its own color for the soft shadow and glow');
  chart.emit('pointerover', {target:pending,clientX:undefined,clientY:undefined});
  chart.emit('pointermove', {target:pending,clientX:undefined,clientY:undefined});
  chart.emit('pointerout', {target:approved,relatedTarget:pending});
  check(heading.textContent === 'Pending' && summary.textContent.startsWith('3 applications'), 'Moving directly between segments updates the heading and description together');
  chart.emit('pointerout', {target:pending,relatedTarget:null});
  check(heading.textContent === 'What the Graph Shows', 'Leaving a segment for blank space inside the chart restores the default heading');
  chart.emit('pointermove', {target:pending,clientX:40,clientY:50});
  check(summary.textContent.startsWith('3 applications') && !approved.classList.contains('is-preview') && spinCount()===beforeHoverSpins, 'Moving between segments changes the highlight and explanation without starting a spin');
  chart.emit('pointerleave', {pointerType:'mouse'});
  check(heading.textContent === 'What the Graph Shows', 'Leaving the chart restores the default heading');
  check(summary.textContent === defaultExplanation && !pending.classList.contains('is-preview') && !card.classList.contains('is-explaining') && spinCount()===beforeHoverSpins, 'Leaving restores the whole-graph explanation while keeping the pie stationary');
  chart.emit('click', {target: approved});
  check(approved.getAttribute('aria-pressed') === 'true' && approved.classList.contains('is-selected') && card.classList.contains('is-explaining') && card.style['--report-wash-color'] === '#2563eb', 'Click selects the segment and preserves the soft gradient');
  chart.emit('pointerover', {target: pending});
  check(heading.textContent === 'Pending' && summary.textContent.startsWith('3 applications'), 'Hover previews the current segment even when another category is selected');
  chart.emit('pointerleave', {pointerType:'mouse'});
  check(heading.textContent === 'What the Graph Shows', 'Leaving restores the default heading even when a description remains selected');
  check(summary.textContent.startsWith('6 applications have been approved.') && card.classList.contains('is-explaining') && approved.classList.contains('is-selected') && spinCount()===beforeHoverSpins, 'Selection retains its highlight and explanation without rotating the chart on mouse leave');
  chart.emit('click', {target: approved});
  check(summary.textContent === defaultExplanation && card.style.backgroundColor === '#ffffff' && approved.getAttribute('aria-pressed') === 'false', 'Clicking the selected segment again restores the default card');
  chart.emit('click', {target: approved}); document.emit('click', {target: approved});
  check(approved.getAttribute('aria-pressed') === 'true', 'The same click bubbling to the document does not clear a selection');
  document.emit('click', {target: card});
  check(summary.textContent === defaultExplanation && card.style.backgroundColor === '#ffffff', 'Clicking outside the chart clears selection');
  chart.emit('click', {target: approved}); chart.emit('click', {target: pending});
  check(pending.getAttribute('aria-pressed') === 'true' && approved.getAttribute('aria-pressed') === 'false' && card.style['--report-wash-color'] === '#d97706', 'Choosing another category replaces the selection and gradient color');
  document.emit('keydown', {key:'Escape'});
  let prevented = false;
  chart.emit('focusin', {target: approved});
  check(summary.textContent.startsWith('6 applications') && card.classList.contains('is-explaining'), 'Keyboard focus previews the explanation and gradient');
  chart.emit('keydown', {target:approved, key:'Enter', preventDefault(){prevented=true;}});
  check(prevented && approved.getAttribute('aria-pressed') === 'true', 'Enter selects an SVG segment');
  chart.emit('keydown', {target:approved, key:' ', preventDefault(){}});
  check(approved.getAttribute('aria-pressed') === 'false' && summary.textContent === defaultExplanation, 'Space toggles the selected SVG segment off');
  const zero = target(legend, 'Other');
  legend.emit('focusin', {target: zero});
  check(summary.textContent.startsWith('0 people are in the Other category.') && summary.textContent.includes('0%'), 'Zero-count categories can be explored from the status list');
  legend.emit('click', {target: zero}); document.emit('click', {target:zero});
  check(card.style['--report-wash-color'] === '#94a3b8' && zero.getAttribute('aria-pressed') === 'true', 'Empty categories retain their explanations and gradients');
  document.emit('keydown', {key:'Escape'});
  check(summary.textContent === defaultExplanation && card.style.backgroundColor === '#ffffff', 'Escape clears list selection and restores the whole-graph explanation');
  chart.emit('pointerover', {target:approved, pointerType:'touch'});
  const beforeTouchLeave=spinCount();chart.emit('pointerleave', {pointerType:'touch'});
  check(summary.textContent === defaultExplanation && spinCount() === beforeTouchLeave, 'Touch does not leave a sticky hover or trigger mouse-leave rotation');
  chart.emit('click', {target:approved}); const reloading=window.abecReportsRefresh();
  check(card.style.backgroundColor === '#ffffff' && !card.classList.contains('is-selected') && summary.textContent.includes('Loading'), 'Reloading clears selection before any new counts arrive');
  check(heading.textContent === 'What the Graph Shows', 'Reloading restores the default heading');
  await reloading;
  check(summary.textContent === defaultExplanation && card.style.backgroundColor === '#ffffff', 'Refreshed data starts with the default explanation');
  check(css.includes('prefers-reduced-motion: reduce') && css.includes('transition: none !important') && css.includes('.report-overview-summary.is-explaining::before { animation: none !important; }') && css.includes('.report-donut-rotation.is-spinning, .report-course-fill.is-entering, .report-archive-fill.is-entering,') && css.includes('[data-report-entrance] [data-report-motion], [data-report-entrance] .report-line-stroke, [data-report-entrance] [data-report-area] { animation: none !important; }'), 'Reduced-motion users receive final states for every chart type without entrance animations');
  check(css.includes('report-explanation-spread 5s') && css.includes('transition: opacity 350ms ease'), 'Card color still spreads softly with a short fade back to white');
  check(chart.innerHTML.includes('class="report-pie-face"') && !chart.innerHTML.includes('report-pie-rotation') && !css.includes('.report-pie-rotation') && !css.includes('report-pie-label-reveal') && spinCount() === 0, 'Overview stays stationary from its initial render and all status labels are immediately visible');
  // Pixel geometry is checked in the browser suite; avoid freezing obsolete
  // column widths here, which previously forced status labels into tall stacks.
  check(!css.includes('is-aiming') && !fs.readFileSync('wwwroot/js/abec-reports.js','utf8').includes('overviewSegmentRotation'), 'The old segment-facing rotation is removed');
  check(card.style['--report-wash-angle'] === '90deg' && card.style['--report-wash-origin'] === 'left center', 'Desktop gradient begins on the left edge closest to the chart');
  card.rect = {left:0,top:300,width:200,height:200};
  const responsiveApproved=target(chart,'Approved');chart.emit('pointerover',{target:responsiveApproved,clientX:30,clientY:30});
  check(card.style['--report-wash-angle']==='180deg' && card.style['--report-wash-origin']==='center top' && card.style['--report-wash-start']==='scaleY(0)', 'On narrow layouts the gradient still spreads from the edge closest to the chart');
  chart.emit('focusin',{target:responsiveApproved});chart.emit('pointerleave',{pointerType:'mouse'});
  check(summary.textContent===defaultExplanation && !card.classList.contains('is-explaining'), 'Mouse leave restores the default card even if the unselected segment has focus');
  document.emit('keydown',{key:'Escape'});
  const beforeReturnSpins = spinCount();
  buttons[1].emit('click');
  check((root.innerHTML.match(/class="report-course-fill is-entering"/g)||[]).length===4 && root.innerHTML.includes('is-entering" style="height:0%"'), 'Returning to Course Statistics replays bars while preserving the selected Enrolled view and its zero counts');
  root.emit('change',{target:{id:'report-course-view',value:'applicants'}});
  check((root.innerHTML.match(/report-course-fill is-entering/g)||[]).length===4 && root.innerHTML.includes('style="height:100%"'), 'Changing View replays bars to their selected target heights');
  buttons[3].emit('click');buttons[1].emit('click');
  check((root.innerHTML.match(/class="report-course-fill is-entering"/g)||[]).length===4 && root.innerHTML.includes('is-entering" style="height:100%"') && root.innerHTML.includes('is-entering" style="height:0%"'), 'Each new visit replays the bar animation to the actual target heights, including zeros');
  buttons[0].emit('click');
  check(spinCount()===beforeReturnSpins, 'Returning to Overview keeps the chart stationary');
  window.listeners.resize();await new Promise(resolve=>setTimeout(resolve,150));
  check(spinCount()===beforeReturnSpins, 'Resizing Overview keeps the chart stationary');
  check(css.includes('report-course-grow 900ms') && css.includes('transform-origin: center bottom') && css.includes('from { transform: scaleY(0); } to { transform: scaleY(1); }'), 'Course bars grow from zero to their actual heights without changing counts or percentages');
  for (let visit=0;visit<2;visit++) {
    buttons[3].emit('click');
    check(root.innerHTML.includes('report-donut-rotation is-spinning') && root.innerHTML.includes('data-report-entrance="true"'), 'Profile donut spins on each section visit without a page reload');
    const profileRender = reportRenders;buttons[3].emit('click');
    check(reportRenders===profileRender+1 && root.innerHTML.includes('report-donut-rotation is-spinning'), 'Clicking the current profile button creates a fresh clockwise donut animation');
    buttons[2].emit('click');
    check(!root.innerHTML.includes('data-report-entrance') && !root.innerHTML.includes('report-archive-fill'), 'Returning to Archives keeps its entrance pending during loading');
    await flush();
    check(root.innerHTML.includes('data-report-entrance="true"') && (root.innerHTML.match(/report-archive-fill is-entering/g)||[]).length===3, 'Archives replays horizontal bars on every return after the data loads');
  }
  check(css.includes('.report-donut-rotation { transform-origin: 60px 60px; }') && css.includes('.report-donut-rotation.is-spinning { animation: report-overview-spin 1400ms'), 'The Overview speed change preserves the profile donut timing and center');
  check(css.includes('report-archive-grow 900ms') && css.includes('transform-origin: left center') && css.includes('from { transform: scaleX(0); } to { transform: scaleX(1); }'), 'Horizontal archive bars grow from zero to their saved widths');
  includeLineFixture = true;buttons[3].emit('click');
  check(lineStroke.getAttribute('pathLength')==='1' && lineStroke.classList.contains('report-line-stroke'), 'Shared chart preparation normalizes line strokes for progressive drawing');
  lineStroke.setAttribute('pathLength', '999');
  root.emit('change',{target:{id:'report-profile-field',value:'gender'}});
  check(lineStroke.getAttribute('pathLength')==='1' && root.innerHTML.includes('data-report-entrance="true"'), 'Filter changes also prepare line chart strokes to redraw from the beginning');
  includeLineFixture = false;
  check(css.includes('report-line-draw 1200ms ease-out both') && css.includes('from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; }'), 'Line charts draw progressively from the beginning of their normalized stroke');
  check(css.includes('[data-report-motion="area"]') && css.includes('report-chart-wipe 1200ms ease-out both') && css.includes('from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0); }'), 'Line and area reveals progress left to right on the same timing');
  check(css.includes('[data-report-motion="reveal"]') && css.includes('report-chart-reveal 450ms ease-out both'), 'Other chart types have a subtle entrance reveal');
  document.hidden=true;document.emit('visibilitychange');
  document.hidden=false;document.emit('visibilitychange');
  check(root.innerHTML.includes('report-donut-rotation is-spinning'), 'Returning to the browser tab replays the visible profile chart');
  window.listeners.resize();await new Promise(resolve=>setTimeout(resolve,150));
  check(!root.innerHTML.includes('is-spinning') && !root.innerHTML.includes('data-report-entrance'), 'A profile resize keeps the final chart state without replaying its entrance');
  buttons[2].emit('click');await flush();
  document.hidden=true;document.emit('visibilitychange');document.hidden=false;document.emit('visibilitychange');
  check(root.innerHTML.includes('Loading archive categories') && !root.innerHTML.includes('data-report-entrance'), 'Browser-tab return also waits for Archives data');
  await flush();
  check((root.innerHTML.match(/report-archive-fill is-entering/g)||[]).length===3, 'Archives animates the refreshed bars when the browser tab returns');
  buttons[0].emit('click');
  const beforeVisibilitySpin=spinCount();
  document.hidden=true;document.emit('visibilitychange');document.hidden=false;document.emit('visibilitychange');
  check(spinCount()===beforeVisibilitySpin, 'Overview remains stationary when its browser tab becomes visible again');
  document.hidden=true;document.emit('visibilitychange');
  const beforeHiddenLoad=spinCount();await window.abecReportsRefresh();
  check(spinCount()===beforeHiddenLoad, 'Data arriving in a hidden browser tab does not animate Overview');
  document.hidden=false;document.emit('visibilitychange');
  check(spinCount()===beforeHiddenLoad, 'Overview stays stationary after hidden data loading when the tab is shown');
  buttons[2].emit('click');await flush();
  document.hidden=true;document.emit('visibilitychange');
  window.listeners['abec:archives-changed']();
  archiveFilter('batch','8');await flush();
  check(!root.innerHTML.includes('data-report-entrance') && !root.innerHTML.includes('is-entering'), 'Archive data arriving while hidden preserves the entrance for the next visible visit');
  document.hidden=false;document.emit('visibilitychange');await flush();
  check(root.innerHTML.includes('data-report-entrance="true"') && (root.innerHTML.match(/report-archive-fill is-entering/g)||[]).length===3, 'The pending archive entrance plays when the tab becomes visible after a hidden response');
  archiveFilter('batch',''); archiveFilter('course',''); await flush();
  check(!ids['report-download'].disabled && ids['report-batch-picker'].hidden, 'Download stays available for Archives while the unrelated top batch selector is hidden');
  ids['report-download'].emit('click'); await flush();
  check(pdfCalls.at(-1).url.endsWith('/api/batches/report') && downloads.at(-1).fileName==='ABEC_Report_All_Batches.pdf', 'All Batches archives export requests an explicit overall report');
  archiveFilter('course','1'); archiveFilter('batch','5'); await flush();
  ids['report-download'].emit('click'); await flush();
  check(pdfCalls.at(-1).url.endsWith('/api/batches/5/report?courseId=1'), 'Archives exports the intersection of its own selected Course and Batch');
  let releaseArchiveExport;
  archiveDeferred=new Promise(resolve=>releaseArchiveExport=resolve);
  archiveFilter('batch','8');
  const beforeLoadingDownload=pdfCalls.length;
  ids['report-download'].emit('click');
  check(ids['report-download'].disabled && pdfCalls.length===beforeLoadingDownload, 'Downloads are disabled until the selected archive scope finishes loading');
  releaseArchiveExport({success:true,data:categoryReport('8','1')}); await flush();archiveDeferred=null;
  let finishArchivePdf;
  pdfPending=new Promise(resolve=>finishArchivePdf=resolve);
  ids['report-download'].emit('click');
  archiveFilter('course','2'); archiveFilter('batch','1'); await flush();
  finishArchivePdf(response());await flush();pdfPending=null;
  check(pdfCalls.at(-1).url.endsWith('/api/batches/8/report?courseId=1') && downloads.at(-1).fileName==='ABEC_Report_Batch2025-100.pdf', 'Changing filters during download preserves the originally requested scope and filename');
  archiveFailure=true;archiveFilter('batch','5');await flush();
  check(ids['report-download'].disabled, 'Archive errors cannot enable a download using stale filters');
  archiveFailure=false;
  buttons[1].emit('click');ids['report-download'].emit('click');await flush();
  check(pdfCalls.at(-1).url.endsWith('/api/batches/1/report'), 'Leaving Archives exports the main selected batch without carrying over archive Course filters');
  check(html.indexOf('id="report-download"')>html.indexOf('id="report-batch-note"'), 'The download button is outside the hidden batch picker');
  check(html.includes('abec-admin-sidebar') && html.includes('href="Reports.html" aria-current="page"'),'Shared sidebar and active-page marker preserved');
  applicants.splice(0, applicants.length, ...['Pending','Approved','Waitlisted','Rejected','Confirmed','Declined','Expired','Unrecognized'].map((status, i) =>
    ({ applicantId: i + 1, batchId: 1, applicationStatus: status, applicationDate: '2026-11-01', courseId: 1 })));
  students.splice(0, students.length, { studentId: 90, applicantId: null, batchId: 1, createdAt: '2026-11-02', isArchived: false },
    { studentId: 91, applicantId: null, batchId: 1, createdAt: '2026-11-02', isArchived: true });
  await window.abecReportsRefresh(); buttons[0].emit('click');
  check((chart.innerHTML.match(/class="report-pie-callout"/g) || []).length === 10, 'All ten simultaneous status colors have visible chart labels');
  check(breakdownRows(legend.innerHTML).every(row => row.count === 1 && row.percentage === 10), 'Equal categories retain matching item counts and ten-percent shares');
  writeOverviewPreview('overview-all-statuses');
  }
  await verifyArchiveManagement();
  console.log(`PASS: ${checks} Reports and original archive management checks.`);
}
async function verifyArchiveManagement() {
  const ids = Object.fromEntries(['archive-tbody','archive-count','archive-status-grid','archive-course-grid','archive-search',
    'archive-docs-open','archive-docs-modal','batch-history-modal','student-profile-modal','profile-avatar','profile-name','profile-gmail',
    'profile-status','profile-date','profile-course','profile-course-meta','profile-phone','profile-batch','profile-reason'].map(id=>[id,new Element()]));
  for (const el of Object.values(ids)) {
    const classes=new Set(['hidden']);
    el.classList={add:v=>classes.add(v),remove:v=>classes.delete(v),contains:v=>classes.has(v)};
    el.style={};
  }
  const document=new Element();
  document.getElementById=id=>ids[id]||null;
  document.body={style:{}};
  const rows=[
    {archiveId:1,studentId:1,studentName:'Older Record',courseName:'CSS',archiveReason:'Deactivated',archiveDate:'2026-10-01'},
    {archiveId:2,studentId:1,studentName:'Graduated Student',courseName:'CSS',archiveReason:'Graduated',archiveDate:'2026-11-01'},
    {archiveId:3,studentId:2,studentName:'Withdrawn Student',courseName:'Bookkeeping',archiveReason:'Withdrawal',archiveDate:'2026-11-02'},
    {archiveId:4,studentId:3,studentName:'Other Student',courseName:'CSS',archiveReason:'Custom reason',archiveDate:'2026-11-03'}
  ];
  const api={requireRole:()=>true,initials:name=>name[0],formatDate:value=>value,
    get:async path=>({success:true,data:path==='/api/archives'?rows:path==='/api/courses'?[{courseName:'CSS'},{courseName:'Bookkeeping'}]:[]})};
  const window={AbecApi:api};
  vm.runInNewContext(fs.readFileSync('wwwroot/js/abec-archive.js','utf8'),{window,document,AbecApi:api});
  document.emit('DOMContentLoaded');await new Promise(resolve=>setImmediate(resolve));
  check(ids['archive-count'].textContent==='3 students' && !ids['archive-tbody'].innerHTML.includes('Older Record'), 'Original management list shows the latest archive per student');
  check(['All Students','Graduated','Deactivated','Academic Dismissal','Withdrawal','Inactive Lead','Others'].every(label=>ids['archive-status-grid'].innerHTML.includes(label)), 'Original management status buttons and labels are preserved');
  check(ids['archive-course-grid'].innerHTML.includes('All Courses') && ids['archive-course-grid'].innerHTML.includes('Bookkeeping'), 'Original course card views remain available');
  window.filterArchive('withdrawal');
  check(ids['archive-tbody'].innerHTML.includes('Withdrawn Student') && !ids['archive-tbody'].innerHTML.includes('Graduated Student'), 'Original status workflow filters the student list');
  check(ids['archive-course-grid'].innerHTML.includes('<strong>1</strong><span>Bookkeeping</span>') && ids['archive-course-grid'].innerHTML.includes('<strong>0</strong><span>CSS</span>'), 'Status selection updates the corresponding course card counts');
  ids['archive-course-grid'].emit('click',{target:{closest:()=>new Element({'data-course':'CSS'})}});
  check(ids['archive-tbody'].innerHTML.includes('No archived students match this status and course.'), 'Original course card selection filters the selected status');
  window.filterArchive('all');
  ids['archive-search'].emit('input',{target:{value:'Graduated'}});
  check(ids['archive-tbody'].innerHTML.includes('Graduated Student') && !ids['archive-tbody'].innerHTML.includes('Other Student'), 'Search remains available within the original archive board');
  window.openStudentProfile('2');
  check(ids['profile-name'].textContent==='Graduated Student' && !ids['student-profile-modal'].classList.contains('hidden'), 'Manage workflow still opens the original student profile dialog');
  window.filterArchive('other');
  ids['archive-search'].emit('input',{target:{value:''}});
  check(ids['archive-tbody'].innerHTML.includes('Other Student'), 'Original Others view retains custom archive reasons');
  const html=fs.readFileSync('Views/Admin/StudentArchive.html','utf8');
  check(html.includes('Back to Report') && html.includes('archive-status-grid') && html.includes('archive-course-grid') && html.includes('archive-tbody'), 'Original management page preserves its return link and status/course/list layout');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
