const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
let checks = 0;
function check(value, label) { assert.ok(value, label); checks++; }
const ids = {};
let active = null;
class Element {
  constructor(id = '') { this.id = id; this.listeners = {}; this.value = ''; this.hidden = false; this.disabled = false; this.style = {}; this.attrs = {}; this.isConnected = true; }
  addEventListener(name, handler) { this.listeners[name] = handler; }
  setAttribute(name, value) { this.attrs[name] = value; }
  focus() { active = this; }
  querySelector() { return backdrop; }
  querySelectorAll() { return []; }
  set innerHTML(value) {
    this.html = value;
    for (const match of value.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) ids[match[1]] = new Element(match[1]);
  }
}
const backdrop = new Element();
const document = {
  getElementById: id => ids[id],
  createElement: () => new Element(),
  body: {style:{overflow:''},appendChild: el => {ids[el.id] = el;}},
  get activeElement() { return active; }
};
const posts = [], events = [], storage = [];
let response = {success:true}, pending = null;
const api = {async post(path, body) {posts.push({path,body});return pending || response;}};
const window = {dispatchEvent:event => events.push(event.type)};
vm.runInNewContext(fs.readFileSync('wwwroot/js/abec-archive-dialog.js','utf8'), {
  window,document,AbecApi:api,Event:class {constructor(type) {this.type=type;}},
  localStorage:{setItem:(key,value)=>storage.push({key,value})}
});
const dialog = window.AbecArchiveDialog;
const emit = (id,name,event={}) => ids[id].listeners[name]({preventDefault(){},stopPropagation(){},...event});
const submit = () => emit('archive-dialog-form','submit');
const select = reason => {ids['archive-dialog-reason'].value=reason;emit('archive-dialog-reason','change');};
async function main() {
  const categories = ['Graduated','Deactivated','Academic Dismissal','Withdrawal','Inactive Lead','Rejected Slots','Others'];
  const first=dialog.open({studentId:10,studentName:'Test Student',batchId:5});
  check(JSON.stringify(dialog.reasons)===JSON.stringify(categories), 'Dialog uses exactly the seven graph categories');
  check(posts.length===0 && ids['archive-dialog-reason'].value==='' && !ids['student-archive-dialog'].hidden, 'Archive click opens a reason dialog without saving or preselecting a reason');
  await submit();
  check(posts.length===0 && ids['archive-dialog-error'].textContent.includes('Select'), 'A reason must be selected before confirmation');
  select('Others');
  check(!ids['archive-dialog-specific-wrap'].hidden && ids['archive-dialog-specific'].required, 'Others reveals a required specific reason field');
  ids['archive-dialog-specific'].value='   ';await submit();
  check(posts.length===0 && events.length===0, 'Blank Others detail cannot save or refresh counts');
  ids['archive-dialog-specific'].value='Stale detail';select('Graduated');
  check(ids['archive-dialog-specific-wrap'].hidden && !ids['archive-dialog-specific'].required && ids['archive-dialog-specific'].value==='', 'Changing away from Others clears and hides its detail');
  emit('archive-dialog-cancel','click');await first;
  check(posts.length===0 && events.length===0 && storage.length===0, 'Cancel leaves records and graph counts unchanged');
  response={success:false,message:'Archive rejected by server'};
  const failed=dialog.open({studentId:10,batchId:5});select('Rejected Slots');await submit();
  check(posts[0].path==='/api/archives/students/10?batchId=5' && posts[0].body.archiveReason==='Rejected Slots', 'Confirmation submits the selected category and student batch context');
  check(!ids['student-archive-dialog'].hidden && !ids['archive-dialog-confirm'].disabled && events.length===0 && storage.length===0, 'Failed archive stays open for retry and does not change or publish graph counts');
  check(ids['archive-dialog-error'].textContent==='Archive rejected by server', 'Save failure is explained inside the dialog');
  response={success:true};select('Others');ids['archive-dialog-specific'].value='  Specific reason  ';await submit();await failed;
  check(posts[1].body.specificReason==='Specific reason' && posts[1].body.studentId===10, 'Others detail is trimmed and saved with the student archive');
  check(events.length===1 && events[0]==='abec:archives-changed' && storage[0].key==='abec-archives-changed', 'Only successful saves refresh this page and other open Archives pages');
  const duplicate=dialog.open({studentId:20});select('Graduated');
  let release;pending=new Promise(resolve=>release=resolve);const before=posts.length;
  const saving=submit();await submit();emit('archive-dialog-cancel','click');
  check(posts.length===before+1 && !ids['student-archive-dialog'].hidden && ids['archive-dialog-confirm'].disabled, 'Repeated confirmation cannot submit twice and an in-flight archive cannot be cancelled ambiguously');
  release({success:true});await saving;await duplicate;pending=null;
  check(events.length===2 && ids['student-archive-dialog'].hidden, 'Completed save closes the dialog and publishes one refresh');
  for (const [page,script] of [['StudentsApplicants','abec-students-applicants'],['AccountActivation','abec-activation'],['CourseManagement','abec-courses']]) {
    const html=fs.readFileSync('Views/Admin/'+page+'.html','utf8');
    check(html.includes('abec-archive-dialog.css?') && html.indexOf('<script src="../../wwwroot/js/abec-archive-dialog.js?')<html.indexOf('<script src="../../wwwroot/js/'+script+'.js?'), page+' loads the shared archive dialog before its page script');
    check(fs.readFileSync('wwwroot/js/'+script+'.js','utf8').includes('AbecArchiveDialog.open'), page+' Archive action opens the reason dialog');
  }
  const report=fs.readFileSync('wwwroot/js/abec-reports.js','utf8');
  check(report.includes("window.addEventListener('storage'") && report.includes("window.addEventListener('abec:archives-changed'"), 'Archives graph receives persisted archive changes without optimistic count changes');
  console.log(`PASS: ${checks} archive dialog and workflow wiring checks.`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
