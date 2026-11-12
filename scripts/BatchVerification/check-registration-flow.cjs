/* Exercise the real browser scripts without sending mail or changing a database. */
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

function fixture() {
  const elements = new Map(), timers = new Map();
  let now = 0, nextTimer = 0;
  class Element {
    constructor() {
      this.value = ''; this.dataset = {}; this.attrs = {}; this.events = {}; this.parts = {};
      this.children = []; this.className = ''; this.textContent = ''; this.hidden = false;
    }
    get classList() {
      return {
        contains: name => this.className.split(/\s+/).includes(name),
        add: (...names) => { this.className = [...new Set([...this.className.split(/\s+/), ...names])].join(' '); },
        remove: (...names) => { this.className = this.className.split(/\s+/).filter(name => !names.includes(name)).join(' '); },
        toggle: (name, on) => { if (on) this.classList.add(name); else this.classList.remove(name); }
      };
    }
    set innerHTML(value) {
      this.html = value; this.parts = {};
      for (const match of value.matchAll(/<\w+\b[^>]*class="([^"]+)"/g)) {
        const child = new Element(); child.className = match[1];
        for (const name of match[1].split(/\s+/)) this.parts['.' + name] = child;
      }
    }
    get innerHTML() { return this.html || ''; }
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
    replaceChildren(...children) { this.children = []; children.forEach(child => this.appendChild(child)); }
    removeChild(child) { this.children = this.children.filter(item => item !== child); child.parentNode = null; }
    querySelector(selector) { return this.parts[selector] || null; }
    setAttribute(name, value) { this.attrs[name] = value; }
    removeAttribute(name) { delete this.attrs[name]; }
    addEventListener(name, fn) { (this.events[name] ||= []).push(fn); }
    async emit(name, event = {}) {
      event.preventDefault ||= () => {};
      for (const listener of this.events[name] || []) await listener(event);
    }
    focus() { document.activeElement = this; }
  }
  function el(id, value = '') {
    const item = new Element(); item.value = value; elements.set(id, item); return item;
  }
  const form = el('enroll-wizard-form');
  form.reset = () => form.emit('reset');
  const contact = el('enroll-contact', '+63');
  contact.setSelectionRange = () => { throw new Error('Unsupported selection'); };
  el('enroll-contact-error');
  const radios = {
    'enroll-qualification': 'Full Qualification', 'enroll-education': 'College Graduate', 'enroll-employment': 'Employed',
    'tesda-prev-enrolled': 'no', 'tesda-current-enrolled': 'no', 'tesda-completed': 'no'
  };
  const document = {
    head: new Element(), body: new Element(), readyState: 'complete', activeElement: null,
    createElement: () => new Element(), getElementById: id => elements.get(id) || null,
    querySelectorAll: () => [], addEventListener() {}, removeEventListener() {},
    querySelector(selector) {
      if (selector === '#enroll-step-form form') return form;
      const match = selector.match(/^input\[name="([^"]+)"\]:checked$/);
      return match && radios[match[1]] ? { value: radios[match[1]] } : null;
    }
  };
  const context = {
    document, Map, URL, URLSearchParams,
    setTimeout: (fn, delay) => { const id = ++nextTimer; timers.set(id, { fn, at: now + delay }); return id; },
    clearTimeout: id => timers.delete(id),
    sessionStorage: { getItem: () => null },
    location: { protocol: 'http:', hostname: 'localhost', port: '5188', origin: 'http://localhost:5188' },
    fetch: async () => ({ ok: true, json: async () => ({ success: true, data: [] }) }),
    FormData: class { append() {} }
  };
  context.window = context;
  vm.createContext(context);
  function run(name) { vm.runInContext(fs.readFileSync('wwwroot/js/' + name + '.js', 'utf8'), context); }
  for (const name of ['abec-feedback', 'abec-api', 'abec-landing']) run(name);
  function advance(ms) {
    const until = now + ms;
    while (true) {
      const next = [...timers].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      timers.delete(next[0]); now = next[1].at; next[1].fn();
    }
    now = until;
  }
  return { context, document, elements, el, form, contact, run, advance,
    stack: document.body.children.find(item => item.className === 'abec-toast-stack'),
    pill: document.body.children.find(item => item.className === 'abec-load-pill') };
}
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

async function readyWizard() {
  const f = fixture();
  const values = {
    'enroll-school-name': 'N/A', 'enroll-school-address': 'N/A', 'enroll-classification': 'New',
    'enroll-firstname': 'Test', 'enroll-lastname': 'Applicant', 'enroll-gender': 'Male', 'enroll-civil-status': 'Single',
    'enroll-birthdate': '2000-01-01', 'enroll-age': String(new Date().getFullYear() - 2000), 'enroll-birthplace': 'Legazpi',
    'enroll-tel': 'N/A', 'enroll-fax': 'N/A', 'enroll-contact': '09171234567', 'enroll-email': 'test@example.invalid',
    'enroll-street': 'Test Street', 'enroll-barangay': 'Test', 'enroll-district': 'N/A', 'enroll-city': 'Legazpi',
    'enroll-province': 'Albay', 'enroll-region': 'V', 'enroll-zip': '4500', 'enroll-id-type': 'Passport'
  };
  for (const [id, value] of Object.entries(values)) (f.elements.get(id) || f.el(id)).value = value;
  const course = f.el('enroll-course', '1'); course.options = [{ text: 'Test Course' }]; course.selectedIndex = 0;
  f.elements.get('enroll-region').selectedOptions = [{ text: 'Region V', getAttribute: () => '05' }];
  f.el('enroll-privacy-ack').checked = true;
  const btn = f.el('enroll-wizard-submit'); btn.innerHTML = 'Submit Application';
  f.el('enroll-credential-dropzone'); const credentials = f.el('enroll-credential-input');
  f.el('enroll-identity-dropzone'); const identity = f.el('enroll-identity-file');
  f.run('abec-enroll-wizard'); await flush();
  credentials.files = ['TOR', 'Form138', 'HonorableDismissal', 'GoodMoral'].map(name => ({ name: name + '.pdf', type: 'application/pdf', size: 10 }));
  await credentials.emit('change');
  identity.files = [{ name: 'passport.pdf', type: 'application/pdf', size: 10 }]; await identity.emit('change');
  return { ...f, btn };
}

(async () => {
  const f = fixture();
  await f.contact.emit('focus');
  for (const value of ['9', '917', '0917']) {
    f.contact.value = value; await f.contact.emit('input'); assert.equal(f.stack.children.length, 0);
  }
  await f.contact.emit('blur'); assert.equal(f.contact.attrs['aria-invalid'], 'true');
  f.contact.value = '09171234567'; await f.contact.emit('input'); f.advance(220);
  assert.equal(f.stack.children.length, 0); await f.contact.emit('blur'); assert.equal(f.contact.attrs['aria-invalid'], 'false');
  f.contact.value = 'abc'; await f.contact.emit('input'); await f.contact.emit('blur');
  assert.equal(f.elements.get('enroll-contact-error')._abecFeedbackToast.querySelector('.abec-toast-text').textContent, 'Numbers only. Letters are not allowed.');
  f.contact.value = ''; await f.contact.emit('input'); await f.contact.emit('blur');
  assert.equal(f.elements.get('enroll-contact-error')._abecFeedbackToast.querySelector('.abec-toast-text').textContent, 'Please enter your mobile number.');
  console.log('PASS mobile feedback stays hidden while typing and validates on blur; selection exceptions remain handled');

  const invalid = await readyWizard();
  invalid.contact.value = '0917';
  await invalid.form.emit('submit');
  assert.equal(invalid.contact.attrs['aria-invalid'], 'true'); assert.equal(invalid.btn.attrs['aria-busy'], undefined);
  console.log('PASS form submission checks an invalid mobile number before starting a request');

  for (const outcome of ['success', 'failure', 'exception', 'retry']) {
    const w = await readyWizard();
    let resolveFetch, rejectFetch, calls = 0;
    w.context.fetch = async url => {
      if (!url.includes('/enroll/files')) return { ok: true, json: async () => ({ success: true, data: [] }) };
      calls++; return new Promise((resolve, reject) => { resolveFetch = resolve; rejectFetch = reject; });
    };
    if (outcome === 'exception') w.context.AbecApi.postForm = async () => { throw new Error('network'); };
    const submission = w.form.emit('submit'); await flush();
    if (outcome !== 'exception') {
      assert.equal(calls, 1); assert.equal(w.btn.attrs['aria-busy'], 'true'); assert.equal(w.btn.disabled, true);
      w.advance(1000); assert.equal(w.pill.classList.contains('is-on'), false);
      await w.form.emit('submit'); assert.equal(calls, 1);
      if (outcome === 'retry') {
        rejectFetch(new Error('temporary network failure')); await flush(); w.advance(400); await flush();
        assert.equal(calls, 2); assert.equal(w.btn.attrs['aria-busy'], 'true'); assert.equal(w.pill.classList.contains('is-on'), false);
      }
      resolveFetch({ ok: true, json: async () => ({ success: outcome !== 'failure', message: outcome === 'failure' ? 'Unable to save.' : 'Saved.' }) });
    }
    await submission;
    assert.equal(w.btn.attrs['aria-busy'], undefined); assert.equal(w.btn.dataset.abecLabel, undefined);
    const saved = outcome === 'success' || outcome === 'retry';
    assert.equal(w.btn.disabled, saved);
    if (saved) { await w.form.emit('submit'); assert.equal(calls, outcome === 'retry' ? 2 : 1); }
    console.log('PASS registration ' + outcome + ': one continuous loader, duplicate prevention, and final cleanup');
  }

  for (const [query, expected] of [['?token=test%2Btoken', '/confirm-slot?token=test%2Btoken'], ['?token=test&action=decline', '/reject-slot?token=test'], ['?ok=1&name=Forged', null]]) {
    let destination;
    f.context.location.search = query; f.context.location.replace = value => { destination = value; };
    for (const id of ['confirm-title', 'confirm-message', 'confirm-icon']) f.el(id);
    f.run('abec-slot-response');
    assert.equal(destination, expected ? 'http://localhost:5188' + expected : undefined);
    if (!expected) assert.equal(f.elements.get('confirm-title').textContent, 'Unable to Process');
  }
  console.log('PASS legacy slot links preserve the token and use server verification; query parameters cannot claim success');
})().catch(error => { console.error(error); process.exitCode = 1; });
