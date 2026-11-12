/* Shared message behavior with a fake DOM and clock. No network or database. */
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
let count = 0;
function check(value, label) { assert.ok(value, label); count++; console.log('PASS ' + label); }

function fixture() {
  let now = 0, nextId = 0;
  const timers = new Map(), listeners = new Map();
  class Element {
    constructor(tag = 'div') { this.tagName = tag; this.className = ''; this.children = []; this.attrs = {}; this.events = {}; this.parts = {}; this.textContent = ''; this.hidden = false; }
    get classList() {
      const el = this;
      return { contains: c => el.className.split(/\s+/).includes(c),
        add(...names) { el.className = [...new Set([...el.className.split(/\s+/).filter(Boolean), ...names])].join(' '); },
        remove(...names) { el.className = el.className.split(/\s+/).filter(c => !names.includes(c)).join(' '); },
        toggle(c, on) { if (on) this.add(c); else this.remove(c); }
      };
    }
    set innerHTML(value) {
      this.parts = {};
      for (const m of value.matchAll(/<(\w+)\b[^>]*class="([^"]+)"/g)) {
        const child = new Element(m[1]); child.className = m[2];
        for (const c of m[2].split(/\s+/)) this.parts['.' + c] = child;
      }
      for (const tag of ['h3', 'p']) if (value.includes('<' + tag + '>')) this.parts[tag] = new Element(tag);
    }
    appendChild(el) { if (el.parentNode) el.parentNode.removeChild(el); el.parentNode = this; this.children.push(el); return el; }
    removeChild(el) { this.children.splice(this.children.indexOf(el), 1); el.parentNode = null; }
    setAttribute(k, v) { this.attrs[k] = v; }
    removeAttribute(k) { delete this.attrs[k]; }
    querySelector(s) { return this.parts[s] || null; }
    addEventListener(name, fn) { this.events[name] = fn; }
    focus() { document.activeElement = this; }
  }
  const document = {
    head: new Element('head'), body: new Element('body'), activeElement: null,
    createElement: tag => new Element(tag),
    getElementById: () => null,
    addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(fn); },
    removeEventListener(name, fn) { listeners.set(name, (listeners.get(name) || []).filter(f => f !== fn)); }
  };
  const context = { document, Map, URL, URLSearchParams, setTimeout: (fn, delay) => { const id = ++nextId; timers.set(id, { fn, at: now + delay }); return id; }, clearTimeout: id => timers.delete(id) };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('wwwroot/js/abec-feedback.js', 'utf8'), context);
  const stack = document.body.children.find(e => e.className === 'abec-toast-stack');
  function advance(ms) {
    const until = now + ms;
    while (true) {
      const next = [...timers].filter(([, t]) => t.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      timers.delete(next[0]); now = next[1].at; next[1].fn();
    }
    now = until;
  }
  return { context, document, stack, advance, listeners, Element };
}

(async () => {
  const f = fixture(), api = f.context.AbecFeedback;
  check(f.document.head.children[0].textContent.includes('right:max(') && !f.document.head.children[0].textContent.includes('left:10px'), 'notifications stay upper-right on desktop and mobile');
  api.notify({ type: 'success', message: 'Saved.', duration: 100 });
  f.advance(4999);
  check(f.stack.children.length === 1 && !f.stack.children[0]._closing, 'notification remains visible for five seconds regardless of old duration overrides');
  f.advance(1);
  check(f.stack.children[0]._closing, 'notification dismisses at five seconds');
  f.advance(220);
  check(f.stack.children.length === 0, 'dismissed notification is removed after its exit animation');
  api.notify({ type: 'error', message: 'Invalid input.' });
  f.advance(1000); api.notify({ type: 'info', message: 'Second message.' });
  f.advance(4220);
  check(f.stack.children.length === 1 && f.stack.children[0].querySelector('.abec-toast-text').textContent === 'Second message.', 'each message has its own independent timer');
  f.advance(1000);
  check(f.stack.children.length === 0, 'later message receives its complete five-second lifetime');
  for (let i = 1; i <= 4; i++) api.notify({ message: 'Message ' + i });
  check(f.stack.children.length === 3, 'four simultaneous messages do not hang the page; excess messages wait');
  f.advance(5220);
  check(f.stack.children.length === 1 && f.stack.children[0].querySelector('.abec-toast-text').textContent === 'Message 4', 'queued message becomes visible after a space opens');
  f.advance(4999);
  check(!f.stack.children[0]._closing, 'queued message gets five seconds from its display time');
  f.advance(221);
  check(f.stack.children.length === 0, 'all queued messages eventually dismiss');
  api.notify({ message: 'Same message.' }); api.notify({ message: 'Same message.' });
  check(f.stack.children.length === 1, 'duplicate inline/API feedback produces one notification');
  f.stack.children[0].querySelector('.abec-toast-close').events.click(); f.advance(220);
  check(f.stack.children.length === 0, 'manual dismissal remains available');
  api.notify({ type: 'ok', message: 'File saved.' });
  api.notify({ type: 'warn', message: 'Review this action.' });
  api.notify({ type: 'error', message: 'Invalid course.' });
  check(f.stack.children.map(e => e.className).join('|') === 'abec-toast is-success|abec-toast is-warning|abec-toast is-error', 'legacy message tones use the same shared variants');
  check(f.stack.children[2].attrs.role === 'alert' && f.stack.children[0].attrs.role === 'status', 'error and success messages retain accessible roles');
  f.advance(5220);
  f.context.alert('Applicant approved successfully, but the email notification failed. The approval was saved.');
  check(f.stack.children[0].classList.contains('is-warning') && f.stack.children[0].querySelector('.abec-toast-text').textContent.includes('email notification failed'), 'partial success is a warning and preserves the original outcome text');
  f.advance(5220);
  const oldBanner = new f.Element(); oldBanner.textContent = 'Old result';
  api.inline(oldBanner, 'Profile saved.', 'success');
  check(oldBanner.hidden && oldBanner.textContent === '' && f.stack.children.length === 1, 'action feedback replaces an inline banner with one shared toast');
  const size = f.stack.children.length; api.inline(oldBanner, '', 'error');
  check(f.stack.children.length === size, 'clearing form feedback does not create a blank notification');
  f.advance(5220);
  api.notify({ type: 'error', message: '<img src=x onerror=alert(1)>' });
  check(f.stack.children[0].querySelector('.abec-toast-text').textContent === '<img src=x onerror=alert(1)>', 'server message content is rendered as text');
  f.advance(5220);
  let prevented = false;
  f.listeners.get('invalid')[0]({ target: { validationMessage: 'Complete this field.', labels: [{ textContent: 'Email' }] }, preventDefault() { prevented = true; } });
  check(prevented && f.stack.children[0].querySelector('.abec-toast-text').textContent === 'Email: Complete this field.', 'native validation feedback uses the same notification with field context');
  const pending = api.confirm({ title: 'Complete batch?', message: 'Confirm completion.' });
  f.advance(10000);
  const dialog = f.document.body.children.find(e => e.className === 'abec-confirm-back');
  check(!!dialog, 'confirmation dialogs do not auto-confirm or expire');
  dialog.querySelector('.abec-confirm-cancel').events.click();
  check(await pending === false && !dialog.parentNode, 'cancelling a confirmation still prevents the action');

  const reads = fixture(); reads.context.location = { protocol: 'http:', hostname: 'test.invalid', port: '', origin: 'http://test.invalid' };
  reads.context.sessionStorage = { getItem: () => null };
  reads.context.fetch = async () => ({ ok: true, json: async () => ({ success: false, message: 'Records unavailable.' }) });
  vm.runInContext(fs.readFileSync('wwwroot/js/abec-api.js', 'utf8'), reads.context);
  const result = await reads.context.AbecApi.get('/api/test');
  check(!result.success && reads.stack.children.length === 1, 'failed API reads produce a shared notification without changing the response contract');
  reads.advance(5220);
  await reads.context.AbecApi.post('/api/test', {});
  check(reads.stack.children.length === 0, 'write workflows retain ownership of success/error feedback and confirmations');

  const adapters = [
    ['abec-admin-settings.js', 'setMsg', [oldBanner, 'Admin profile saved.', true]],
    ['abec-student-settings.js', 'setMsg', ['Student profile saved.', true]],
    ['abec-documents.js', 'showToast', ['Document released.', 'ok']],
    ['abec-courses.js', 'setFormMessage', ['schedule-msg', 'Schedule saved.', false]],
    ['abec-student-notifications.js', 'showToast', ['Notifications updated.']],
    ['abec-students-applicants.js', 'setMessage', ['Applicant saved.', 'ok']],
    ['abec-profile-details.js', 'editMessage', ['Profile updated.', 'ok']],
    ['abec-add-applicant.js', 'pageMessage', ['Applicant added.', 'ok']],
    ['abec-enroll-wizard.js', 'showFormMessage', ['Registration submitted.', 'success']],
    ['abec-login.js', 'setFormError', ['Invalid credentials.']]
  ];
  for (const [file, name, args] of adapters) {
    const g = fixture(); g.context.$ = () => null;
    const source = fs.readFileSync('wwwroot/js/' + file, 'utf8');
    const start = source.indexOf('  function ' + name + '('), end = source.indexOf('\n  }', start) + 4;
    vm.runInContext(source.slice(start, end), g.context);
    g.context[name](...args);
    check(g.stack.children.length === 1, file + ' action feedback uses the shared component');
    g.advance(5220); check(g.stack.children.length === 0, file + ' feedback auto-dismisses');
  }
  console.log(count + ' feedback checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
