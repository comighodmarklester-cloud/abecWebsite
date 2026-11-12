const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
let checks = 0;
function check(condition, message) { assert.ok(condition, message); checks++; }
class Element {
  constructor(attrs = {}) {
    this.attrs = attrs; this.textContent = ''; this.disabled = false; this.listeners = {};
    const classes = new Set();
    this.classList = { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c),
      toggle(c, on) { if (on) classes.add(c); else classes.delete(c); } };
  }
  getAttribute(name) { return this.attrs[name] || ''; }
  addEventListener(name, listener) { (this.listeners[name] ||= []).push(listener); }
}
async function main() {
  const buttons = ['approve', 'reject', 'waitlist', 'add-slot', 'restore'].map(action => new Element({'data-action': action}));
  const actions = new Element();
  let ready;
  const document = {
    querySelector(selector) { return buttons.find(b => selector.includes('data-action="' + b.getAttribute('data-action') + '"')) || null; },
    querySelectorAll(selector) { return selector === '.modal-action-btn' ? buttons : []; },
    getElementById(id) { return id === 'modal-actions' ? actions : null; },
    addEventListener(name, callback) { if (name === 'DOMContentLoaded') ready = callback; }
  };
  const calls = [], notices = [];
  let finish;
  const window = {
    AbecApi: { requireRole: () => true, put(path, body) { calls.push({path,body}); return new Promise(resolve => finish = resolve); } },
    AbecFeedback: { confirm: async () => true },
    updateModalActions(status) { for (const b of buttons) b.classList.toggle('hidden', status === 'approved' ? b.getAttribute('data-action') !== 'reject' : b.getAttribute('data-action') !== 'approve'); }
  };
  vm.runInNewContext(fs.readFileSync('wwwroot/js/abec-applicants.js', 'utf8'), {
    window, document, AbecApi: window.AbecApi, alert: message => notices.push(message), URLSearchParams
  });
  window.activeModalCard = new Element({'data-id': '47', 'data-raw-status': 'approved', 'data-approval-retry': '1'});
  window.updateModalActions('approved');
  check(buttons[0].textContent === 'Retry approval email' && !buttons[0].classList.contains('hidden'), 'Approved applicant with failed email offers a visible retry action');
  check(buttons[3].classList.contains('hidden'), 'An unconfirmed applicant cannot be added to activation manually');
  window.activeModalCard.attrs['data-approval-retry'] = '0';
  window.updateModalActions('approved');
  check(buttons[0].classList.contains('hidden'), 'Successful approval emails do not show an unnecessary retry');
  window.activeModalCard.attrs['data-raw-status'] = 'pending';
  window.updateModalActions('pending');
  check(buttons[0].textContent === 'Approve Applicant' && !buttons[0].classList.contains('hidden'), 'Pending applicants retain their Approve action');
  window.activeModalCard.attrs['data-raw-status'] = 'approved';
  window.activeModalCard.attrs['data-approval-retry'] = '1';
  window.updateModalActions('approved');
  ready();
  const click = buttons[0].listeners.click[0];
  const request = click();
  await new Promise(resolve => setImmediate(resolve));
  check(buttons[0].disabled && calls.length === 1 && calls[0].path === '/api/applicants/47/status', 'Retry uses the existing applicant approval and disables duplicate clicks');
  await click();
  check(calls.length === 1, 'Another click while SMTP is pending cannot start a second approval');
  finish({success:true,message:'EMAIL_NOT_SENT: Approval saved, but email failed. Retry approval email.'});
  await request;
  check(!buttons[0].disabled && notices.some(n => n.startsWith('EMAIL_NOT_SENT:')), 'Delivery failure is shown and retry is re-enabled');
  console.log(`PASS: ${checks} applicant email retry UI checks.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
