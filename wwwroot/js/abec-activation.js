/* Account activation page ↔ backend (matches existing modal/row contract) */
(function () {
  'use strict';
  if (!window.AbecApi) return;

  var ARCHIVE_REASONS = [
    'Graduated',
    'Deactivated',
    'Academic Dismissal',
    'Withdrawal',
    'Inactive Lead',
    'Other'
  ];

  function mapUiStatus(accountStatus, isArchived) {
    if (accountStatus === 'Active') return 'activated';
    if (isArchived) return 'deactivated';
    return 'pending';
  }

  function rowHtml(s) {
    var status = mapUiStatus(s.accountStatus, !!s.isArchived);
    var created = AbecApi.formatDate(s.createdAt);
    var pin = s.securityPin || '';
    var metaBadge = status === 'activated'
      ? 'bg-green-100 text-green-700'
      : status === 'deactivated'
        ? 'bg-slate-200 text-slate-600'
        : 'bg-amber-100 text-amber-700';
    var label = status === 'activated' ? 'Activated' : status === 'deactivated' ? 'Deactivated' : 'Pending';
    var confirmation = s.confirmationStatus || s.applicationStatus || '—';
    var registered = AbecApi.formatDate(s.applicationDate || s.createdAt);
    var confirmedAt = s.confirmedAt ? AbecApi.formatDate(s.confirmedAt) : '';

    return (
      '<tr class="activation-row cursor-pointer hover:bg-slate-50/80" ' +
      'data-id="' + s.studentId + '" ' +
      'data-applicant-id="' + (s.applicantId || '') + '" ' +
      'data-status="' + status + '" ' +
      'data-archived="' + (s.isArchived ? '1' : '0') + '" ' +
      'data-display-name="' + esc(s.fullName) + '" ' +
      'data-name="' + esc((s.fullName || '').toLowerCase()) + '" ' +
      'data-email="' + esc(s.email) + '" ' +
      'data-phone="' + esc(s.contactNumber) + '" ' +
      'data-address="' + esc(s.address || '') + '" ' +
      'data-course="' + esc(s.courseName) + '" ' +
      'data-intake="' + esc(s.batchName) + '" ' +
      'data-confirmation="' + esc(confirmation) + '" ' +
      'data-registered="' + esc(registered) + '" ' +
      'data-confirmed-at="' + esc(confirmedAt) + '" ' +
      'data-pin="' + esc(pin) + '" ' +
      'data-pin-date="' + esc(created) + '" ' +
      'data-activation-date="' + (status === 'activated' ? esc(created) : '') + '" ' +
      'data-created="' + esc(created) + '" ' +
      'onclick="handleRowClick(this)">' +
      '<td class="px-6 py-4 text-sm font-semibold text-slate-800">' +
      '<label class="select-checkbox hidden mr-2" onclick="event.stopPropagation()">' +
      '<input type="checkbox" class="row-check rounded border-slate-300" onchange="toggleRowSelection(this)">' +
      '</label>' + esc(s.fullName) + '</td>' +
      '<td class="px-6 py-4 text-sm text-slate-600">' + esc(courseLabel(s.courseName)) + '</td>' +
      '<td class="px-6 py-4 text-sm text-slate-600">' + esc(confirmation) + '</td>' +
      '<td class="px-6 py-4 text-sm font-mono text-slate-700">' + (pin || 'Not Generated') + '</td>' +
      '<td class="px-6 py-4"><span class="status-badge inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ' + metaBadge + '">' + label + '</span></td>' +
      '<td class="px-6 py-4 text-sm text-slate-500"><span class="date-note">' + esc(created) + '</span></td>' +
      '</tr>'
    );
  }

  function courseLabel(name) {
    return (window.AbecApi && AbecApi.displayCourseName) ? AbecApi.displayCourseName(name) : String(name || '');
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function ensureDeactivateModal() {
    if (document.getElementById('deactivate-reason-modal')) return;

    var modal = document.createElement('div');
    modal.id = 'deactivate-reason-modal';
    modal.className = 'hidden fixed inset-0 z-[120] flex items-center justify-center p-4';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML =
      '<div class="absolute inset-0 abec-modal-backdrop" data-close-deactivate></div>' +
      '<div class="relative bg-white rounded-2xl border border-slate-200 shadow-lg w-full max-w-md overflow-hidden">' +
        '<div class="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">' +
          '<div>' +
            '<h3 class="text-lg font-bold text-abec-blue">Deactivate Account</h3>' +
            '<p class="text-xs text-slate-500 mt-0.5">Select an archive reason, then confirm deactivation.</p>' +
          '</div>' +
          '<button type="button" class="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100" data-close-deactivate aria-label="Close">' +
            '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg>' +
          '</button>' +
        '</div>' +
        '<div class="px-5 py-5 space-y-4">' +
          '<div>' +
            '<label for="deactivate-archive-reason" class="block text-sm font-medium text-slate-700 mb-1.5">Archive Reason</label>' +
            '<select id="deactivate-archive-reason" class="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 focus:border-abec-blue focus:ring-abec-blue">' +
              ARCHIVE_REASONS.map(function (r) {
                return '<option value="' + esc(r) + '"' + (r === 'Deactivated' ? ' selected' : '') + '>' + esc(r) + '</option>';
              }).join('') +
            '</select>' +
          '</div>' +
          '<div id="deactivate-specific-wrap" class="hidden">' +
            '<label for="deactivate-specific-reason" class="block text-sm font-medium text-slate-700 mb-1.5">Specify Reason</label>' +
            '<textarea id="deactivate-specific-reason" rows="3" maxlength="500" class="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 focus:border-abec-blue focus:ring-abec-blue" placeholder="Enter the specific reason"></textarea>' +
          '</div>' +
          '<p class="text-xs text-slate-500 leading-relaxed">The student will be moved to Archive under the selected reason and will not return to Pending Activation.</p>' +
        '</div>' +
        '<div class="px-5 py-4 border-t border-slate-100 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">' +
          '<button type="button" class="text-sm font-semibold px-4 py-2.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50" data-close-deactivate>Cancel</button>' +
          '<button type="button" id="confirm-deactivate-btn" class="text-sm font-bold px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white">Confirm Deactivation</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);

    modal.querySelectorAll('[data-close-deactivate]').forEach(function (el) {
      el.addEventListener('click', closeDeactivateModal);
    });
    document.getElementById('confirm-deactivate-btn').addEventListener('click', confirmDeactivate);
    if (window.AbecOtherReason) {
      AbecOtherReason.bindOtherReason('#deactivate-archive-reason', '#deactivate-specific-wrap', '#deactivate-specific-reason');
    }
  }

  function openDeactivateModal() {
    ensureDeactivateModal();
    var modal = document.getElementById('deactivate-reason-modal');
    var select = document.getElementById('deactivate-archive-reason');
    var specific = document.getElementById('deactivate-specific-reason');
    if (select) {
      select.value = 'Deactivated';
      select.dispatchEvent(new Event('change'));
    }
    if (specific) specific.value = '';
    modal.classList.remove('hidden');
  }

  function closeDeactivateModal() {
    var modal = document.getElementById('deactivate-reason-modal');
    if (modal) modal.classList.add('hidden');
  }

  function promptArchiveReason(defaultReason) {
    var reason = window.prompt(
      'Enter archive reason:\n' + ARCHIVE_REASONS.join(', '),
      defaultReason || 'Deactivated'
    );
    if (reason === null) return null;
    reason = String(reason).trim();
    if (ARCHIVE_REASONS.indexOf(reason) === -1) {
      alert('Invalid archive reason. Use one of: ' + ARCHIVE_REASONS.join(', '));
      return null;
    }

    var specificReason = null;
    if (window.AbecOtherReason && AbecOtherReason.isOtherValue(reason)) {
      var detail = window.prompt('Specify Reason (required for Other):', '');
      if (detail === null) return null;
      var check = AbecOtherReason.requireIfOther(reason, detail, 'specific reason');
      if (!check.ok) {
        alert(check.message);
        return null;
      }
      specificReason = check.specificReason;
    }

    return { archiveReason: reason, specificReason: specificReason };
  }

  async function confirmDeactivate() {
    var row = window.activeModalRow;
    if (!row) return;
    var id = row.getAttribute('data-id');
    var select = document.getElementById('deactivate-archive-reason');
    var specificEl = document.getElementById('deactivate-specific-reason');
    var reason = (select && select.value) || '';
    if (!reason) {
      alert('Please select an archive reason.');
      return;
    }

    var specificReason = null;
    if (window.AbecOtherReason) {
      var check = AbecOtherReason.requireIfOther(reason, specificEl && specificEl.value, 'specific reason');
      if (!check.ok) {
        alert(check.message);
        if (specificEl) specificEl.focus();
        return;
      }
      specificReason = check.specificReason;
    }

    var body = { archiveReason: reason };
    if (specificReason) body.specificReason = specificReason;

    var result = await AbecApi.post('/api/activations/' + id + '/deactivate', body);
    alert(result.message || (result.success ? 'Account deactivated and archived.' : 'Unable to deactivate account.'));
    if (!result.success) return;

    closeDeactivateModal();
    if (typeof closeDetailsModal === 'function') closeDetailsModal();
    await loadAccounts();
  }

  async function loadAccounts() {
    var result = await AbecApi.get('/api/activations');
    if (!result.success) {
      alert(result.message || 'Unable to load accounts.');
      return;
    }

    var tbody = document.getElementById('activation-table-body');
    if (!tbody) return;

    var empty = document.getElementById('activation-empty-row');
    tbody.querySelectorAll('.activation-row').forEach(function (r) { r.remove(); });

    (result.data || []).forEach(function (s) {
      tbody.insertAdjacentHTML('beforeend', rowHtml(s));
    });

    if (empty) empty.classList.toggle('hidden', (result.data || []).length > 0);

    updateActivationCounts(result.data || []);

    var summary = await AbecApi.get('/api/activations/summary');
    if (summary.success && summary.data) {
      // Prefer API totals so counts stay accurate even if a client-side filter is active later.
      setCount('activation-count-total', summary.data.totalApprovedStudents);
      setCount('activation-count-pending', summary.data.pendingActivation);
      setCount('activation-count-activated', summary.data.activatedAccounts);
      setCount('activation-count-deactivated', summary.data.deactivatedAccounts);
    }

    if (typeof filterActivationTable === 'function') filterActivationTable();
  }

  function setCount(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = String(value == null ? 0 : value);
  }

  function updateActivationCounts(list) {
    var pending = 0;
    var activated = 0;
    var deactivated = 0;
    (list || []).forEach(function (s) {
      var status = mapUiStatus(s.accountStatus, !!s.isArchived);
      if (status === 'pending') pending++;
      else if (status === 'activated') activated++;
      else if (status === 'deactivated') deactivated++;
    });
    setCount('activation-count-total', (list || []).length);
    setCount('activation-count-pending', pending);
    setCount('activation-count-activated', activated);
    setCount('activation-count-deactivated', deactivated);
  }

  async function apiUpdate(studentId, action) {
    var result = await AbecApi.post('/api/activations/' + studentId + '/' + action);
    if (!result.success) {
      alert(result.message || 'Unable to update account.');
      return false;
    }
    return true;
  }

  window.modalUpdateStatus = async function (status) {
    var row = window.activeModalRow;
    if (!row) return;

    if (status === 'deactivated') {
      openDeactivateModal();
      return;
    }

    var id = row.getAttribute('data-id');
    var action = status === 'activated' ? 'activate' : null;
    if (!action) return;
    if (!(await apiUpdate(id, 'activate'))) return;
    if (typeof closeDetailsModal === 'function') closeDetailsModal();
    await loadAccounts();
  };

  window.modalRegeneratePin = async function () {
    var row = window.activeModalRow;
    if (!row) return;
    var id = row.getAttribute('data-id');
    var result = await AbecApi.post('/api/activations/' + id + '/generate-pin');
    if (!result.success) {
      alert(result.message || 'Unable to generate PIN.');
      return;
    }
    alert('Security PIN: ' + (result.data && result.data.securityPin));
    await loadAccounts();
  };

  window.modalPrintNotice = async function () {
    var row = window.activeModalRow;
    if (!row) {
      alert('Open a student account first.');
      return;
    }

    var btn = document.getElementById('btn-print-notice');
    if (btn && (btn.disabled || btn.classList.contains('hidden'))) {
      alert('Generate a Security PIN before printing the Activation Notice.');
      return;
    }

    var id = row.getAttribute('data-id');
    if (!id) return;

    var name = (row.getAttribute('data-display-name') || 'Student').replace(/[^\w\-]+/g, '_');
    var url = AbecApi.baseUrl + '/api/activations/' + encodeURIComponent(id) + '/activation-notice';

    try {
      if (btn) {
        btn.disabled = true;
        btn.dataset.originalLabel = btn.innerHTML;
        btn.innerHTML = 'Generating PDF...';
      }

      var response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/pdf' }
      });

      var contentType = (response.headers.get('content-type') || '').toLowerCase();
      if (!response.ok || contentType.indexOf('application/pdf') === -1) {
        var payload = await response.json().catch(function () { return null; });
        var message = (payload && (payload.message || payload.Message)) ||
          'Unable to generate Activation Notice PDF.';
        alert(message);
        return;
      }

      var blob = await response.blob();
      var objectUrl = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = objectUrl;
      a.download = 'ABEC_Activation_Notice_' + name + '_' + id + '.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(objectUrl); }, 1500);
    } catch (err) {
      alert('Cannot reach the ABEC server to generate the PDF. Make sure the app is running.');
    } finally {
      if (btn) {
        btn.disabled = false;
        if (btn.dataset.originalLabel) btn.innerHTML = btn.dataset.originalLabel;
      }
      // Re-apply enabled/disabled state from modal helper if present.
      if (typeof updateModalActions === 'function' && window.activeModalRow) {
        updateModalActions(window.activeModalRow.getAttribute('data-status'));
      }
    }
  };

  window.bulkUpdateStatus = async function (newStatus) {
    var selected = typeof getSelectedRows === 'function' ? getSelectedRows() : [];
    if (!selected.length) {
      alert('Please select at least one account.');
      return;
    }

    if (newStatus === 'deactivated') {
      var picked = promptArchiveReason('Deactivated');
      if (!picked) return;

      for (var i = 0; i < selected.length; i++) {
        var id = parseInt(selected[i].getAttribute('data-id'), 10);
        if (!id) continue;
        var body = { archiveReason: picked.archiveReason };
        if (picked.specificReason) body.specificReason = picked.specificReason;
        var res = await AbecApi.post('/api/activations/' + id + '/deactivate', body);
        if (!res.success) {
          alert(res.message || 'Failed to deactivate student #' + id);
          break;
        }
      }
      if (typeof exitSelectionMode === 'function') exitSelectionMode();
      await loadAccounts();
      return;
    }

    var ids = selected.map(function (row) { return parseInt(row.getAttribute('data-id'), 10); }).filter(Boolean);
    var result = await AbecApi.post('/api/activations/bulk-status', {
      ids: ids,
      status: 'Active'
    });
    if (!result.success) {
      alert(result.message || 'Bulk update failed.');
      return;
    }
    if (typeof exitSelectionMode === 'function') exitSelectionMode();
    await loadAccounts();
  };

  window.bulkArchiveSelected = async function () {
    var selected = typeof getSelectedRows === 'function' ? getSelectedRows() : [];
    if (!selected.length) {
      alert('Please select at least one account.');
      return;
    }
    var picked = promptArchiveReason('Other');
    if (!picked) return;

    for (var i = 0; i < selected.length; i++) {
      var id = parseInt(selected[i].getAttribute('data-id'), 10);
      if (!id) continue;
      var body = { archiveReason: picked.archiveReason };
      if (picked.specificReason) body.specificReason = picked.specificReason;
      var res = await AbecApi.post('/api/activations/' + id + '/deactivate', body);
      if (!res.success) {
        alert(res.message || 'Failed to archive student #' + id);
        break;
      }
    }
    if (typeof exitSelectionMode === 'function') exitSelectionMode();
    await loadAccounts();
  };

  document.addEventListener('DOMContentLoaded', function () {
    AbecApi.requireRole('Admin');
    ensureDeactivateModal();
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeDeactivateModal();
    });
    loadAccounts();
  });
})();
