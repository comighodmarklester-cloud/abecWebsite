/* One archive reason dialog for student records, courses, and account activation. */
(function () {
  'use strict';
  var reasons = ['Graduated', 'Deactivated', 'Academic Dismissal', 'Withdrawal', 'Inactive Lead', 'Rejected Slots', 'Others'];
  var current = null;
  var modal;
  var previousFocus;

  function element(id) { return document.getElementById(id); }
  function message(text) { element('archive-dialog-error').textContent = text || ''; }
  function busy(value) {
    current.busy = value;
    ['archive-dialog-confirm', 'archive-dialog-cancel', 'archive-dialog-reason', 'archive-dialog-specific'].forEach(function (id) {
      element(id).disabled = value;
    });
    element('archive-dialog-confirm').textContent = value ? 'Archiving...' : 'Confirm Archive';
    element('archive-dialog-form').setAttribute('aria-busy', String(value));
  }
  function syncReason() {
    var other = element('archive-dialog-reason').value === 'Others';
    element('archive-dialog-specific-wrap').hidden = !other;
    element('archive-dialog-specific').required = other;
    if (!other) element('archive-dialog-specific').value = '';
    message('');
  }
  function close() {
    if (!current || current.busy) return;
    var done = current;
    current = null;
    modal.hidden = true;
    document.body.style.overflow = done.overflow;
    if (previousFocus && previousFocus.isConnected) previousFocus.focus();
    done.resolve({ success: done.saved > 0, archived: done.saved, total: done.students.length });
  }
  function published() {
    window.dispatchEvent(new Event('abec:archives-changed'));
    try { localStorage.setItem('abec-archives-changed', Date.now() + '-' + Math.random()); } catch (_) {}
  }
  async function submit(event) {
    event.preventDefault();
    if (!current || current.busy) return;
    var reason = element('archive-dialog-reason').value;
    var specific = element('archive-dialog-specific').value.trim();
    if (reasons.indexOf(reason) < 0) { message('Select an archive reason.'); element('archive-dialog-reason').focus(); return; }
    if (reason === 'Others' && !specific) { message('Enter the specific reason for Others.'); element('archive-dialog-specific').focus(); return; }
    if (specific.length > 500) { message('Specific reason must be 500 characters or fewer.'); return; }
    message('');
    busy(true);
    try {
      while (current.saved < current.students.length) {
        var student = current.students[current.saved];
        var path = '/api/archives/students/' + encodeURIComponent(student.studentId);
        if (student.batchId) path += '?batchId=' + encodeURIComponent(student.batchId);
        var result = await AbecApi.post(path, {
          studentId: Number(student.studentId), archiveReason: reason, specificReason: reason === 'Others' ? specific : null
        });
        if (!result.success) {
          message((current.saved ? current.saved + ' account(s) archived. ' : '') + (result.message || 'Archive failed. Please try again.'));
          return;
        }
        current.saved += 1;
        published();
      }
      busy(false);
      close();
    } catch (_) {
      message('The archive could not be saved. Check your connection and try again.');
    } finally { if (current) busy(false); }
  }
  function ensure() {
    if (modal) return;
    modal = document.createElement('div');
    modal.id = 'student-archive-dialog';
    modal.hidden = true;
    modal.innerHTML = '<div class="archive-dialog-backdrop" data-archive-dialog-close></div>' +
      '<form id="archive-dialog-form" class="archive-dialog-panel" role="dialog" aria-modal="true" aria-labelledby="archive-dialog-title" novalidate>' +
      '<h3 id="archive-dialog-title">Archive student</h3><p id="archive-dialog-student"></p>' +
      '<label for="archive-dialog-reason">Reason</label><select id="archive-dialog-reason" required><option value="">Select a reason</option>' +
      reasons.map(function (reason) { return '<option value="' + reason + '">' + reason + '</option>'; }).join('') + '</select>' +
      '<div id="archive-dialog-specific-wrap" hidden><label for="archive-dialog-specific">Specific reason</label>' +
      '<textarea id="archive-dialog-specific" rows="3" maxlength="500" placeholder="Enter the specific reason"></textarea></div>' +
      '<p id="archive-dialog-error" role="alert"></p><div class="archive-dialog-actions">' +
      '<button type="button" id="archive-dialog-cancel">Cancel</button><button type="submit" id="archive-dialog-confirm">Confirm Archive</button></div></form>';
    document.body.appendChild(modal);
    element('archive-dialog-reason').addEventListener('change', syncReason);
    element('archive-dialog-form').addEventListener('submit', submit);
    element('archive-dialog-cancel').addEventListener('click', close);
    modal.querySelector('[data-archive-dialog-close]').addEventListener('click', close);
    modal.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
      if (event.key === 'Tab') {
        var controls = Array.prototype.filter.call(modal.querySelectorAll('select, textarea, button'), function (item) { return !item.disabled && !item.closest('[hidden]'); });
        var first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    });
  }
  window.AbecArchiveDialog = {
    reasons: reasons.slice(),
    open: function (options) {
      if (current) return Promise.resolve({ success: false, archived: 0 });
      options = options || {};
      var students = (options.students || [options]).filter(function (student) { return Number(student.studentId) > 0; });
      if (!students.length) return Promise.resolve({ success: false, archived: 0 });
      ensure();
      previousFocus = document.activeElement;
      return new Promise(function (resolve) {
        current = { students: students, saved: 0, busy: false, resolve: resolve, overflow: document.body.style.overflow };
        element('archive-dialog-title').textContent = students.length > 1 ? 'Archive students' : 'Archive student';
        element('archive-dialog-student').textContent = students.length > 1 ? 'Select a reason for ' + students.length + ' students.' : students[0].studentName || 'Select a reason before confirming.';
        element('archive-dialog-reason').value = '';
        element('archive-dialog-specific').value = '';
        syncReason();
        busy(false);
        modal.hidden = false;
        document.body.style.overflow = 'hidden';
        element('archive-dialog-reason').focus();
      });
    }
  };
})();
