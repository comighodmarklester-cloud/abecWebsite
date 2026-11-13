/* Account activation page ↔ backend (matches existing modal/row contract) */
(function () {
  'use strict';
  if (!window.AbecApi) return;

  function mapUiStatus(accountStatus, isArchived) {
    if (accountStatus === 'Active') return 'activated';
    if (isArchived) return 'deactivated';
    return 'pending';
  }

  function rowHtml(s) {
    var status = mapUiStatus(s.accountStatus, !!s.isArchived);
    var created = AbecApi.formatDate(s.createdAt);
    var pin = s.hasSecurityPin ? 'Issued' : '';
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
      'data-batch-id="' + (s.batchId || '') + '" ' +
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
      'data-pin-version="' + (s.securityPinVersion || 0) + '" ' +
      'data-pin-current="' + (s.hasCurrentSecurityPinFormat ? '1' : '0') + '" ' +
      'data-pin-date="' + esc(AbecApi.formatDate(s.securityPinGeneratedAt || s.createdAt)) + '" ' +
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

  async function openDeactivateModal() {
    var row = window.activeModalRow;
    if (!row) return;
    var result = await window.AbecArchiveDialog.open({
      studentId: row.getAttribute('data-id'), studentName: row.getAttribute('data-display-name'), batchId: row.getAttribute('data-batch-id')
    });
    if (!result.success) return;
    if (typeof closeDetailsModal === 'function') closeDetailsModal();
    await loadAccounts();
  }

  async function archiveSelected(selected) {
    var result = await window.AbecArchiveDialog.open({ students: selected.map(function (row) {
      return { studentId: row.getAttribute('data-id'), studentName: row.getAttribute('data-display-name'), batchId: row.getAttribute('data-batch-id') };
    }) });
    if (!result.success) return;
    if (typeof exitSelectionMode === 'function') exitSelectionMode();
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
    applyNotificationTarget();
  }

  function applyNotificationTarget() {
    var params = new URLSearchParams(window.location.search);
    if (!params.has('id')) return;
    var applicantId = AbecApi.consumePageAction(['id']).get('id');
    var row = Array.from(document.querySelectorAll('#activation-table-body .activation-row')).find(function (item) {
      return item.getAttribute('data-applicant-id') === applicantId;
    });
    if (row && typeof openDetailsModal === 'function') openDetailsModal(row);
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
    if (result.message) alert(result.message);
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

  var pinUpdateInProgress = false;
  async function updateSecurityPins(rows, bulk) {
    if (pinUpdateInProgress) return;
    if (!rows.length) { alert('Please select at least one active account.'); return; }
    if (rows.some(function (row) {
      return row.getAttribute('data-status') !== 'activated' || row.getAttribute('data-archived') === '1';
    })) { alert('Select active, non-archived accounts to update their PINs.'); return; }
    if (bulk) rows = rows.filter(function (row) { return row.getAttribute('data-pin-current') !== '1'; });
    if (!rows.length) { alert('All selected accounts already use the required PIN format. Download their current Activation Notices.'); return; }
    var accounts = rows.map(function (row) {
      return { id: row.getAttribute('data-id'), name: row.getAttribute('data-display-name') || 'Student', version: row.getAttribute('data-pin-version') || '0' };
    });
    if (!confirm('Replace Security PINs for ' + accounts.length + ' selected account(s)?\n\n' + accounts.map(function (a) { return a.name; }).join('\n')
      + '\n\nEach account will receive ABEC + its registered uppercase initials + four random digits. Current PINs will stop working. Download fresh Activation Notices after the update.')) return;
    pinUpdateInProgress = true;
    var controls = Array.from(document.querySelectorAll('[data-bulk="pin"], #btn-regenerate-pin')).map(function (control) {
      var state = { control: control, disabled: control.disabled }; control.disabled = true; return state;
    });
    var updated = 0, unchanged = 0, failures = [], singlePin = '';
    try {
      // Reuse the existing authorized backend issuer, locks and unique index.
      // Sequential requests make partial completion explicit and avoid retries
      // silently replacing a successfully issued credential a second time.
      for (var account of accounts) {
        try {
          var result = await AbecApi.request('/api/activations/' + encodeURIComponent(account.id) + '/generate-pin?pinVersion=' + encodeURIComponent(account.version)
            + (bulk ? '&onlyLegacy=true' : ''), { method: 'POST', attempts: 1, body: {} });
          if (result.success) {
            if (result.data && result.data.pinChanged === false) unchanged++; else updated++;
            if (!bulk) singlePin = result.data && result.data.securityPin;
          }
          else failures.push(account.name + ': ' + (result.cause
            ? 'Result could not be confirmed. Check the Activation Notice before retrying.'
            : result.message || 'Update was rejected.'));
        } catch (_) {
          failures.push(account.name + ': Result could not be confirmed. Check the Activation Notice before retrying.');
        }
      }
      if (typeof closeDetailsModal === 'function') closeDetailsModal();
      if (typeof exitSelectionMode === 'function') exitSelectionMode();
      await loadAccounts();
      var message = updated + ' Security PIN(s) updated. Download fresh Activation Notices for these accounts; previously downloaded copies keep the old PIN.';
      if (unchanged) message += '\n' + unchanged + ' account(s) already used the required format and were left unchanged.';
      if (!bulk && singlePin) message = 'Security PIN: ' + singlePin + '\n\n' + message;
      if (failures.length) message += '\n\nAccounts needing review:\n' + failures.join('\n') + '\n\nReview only these accounts before retrying.';
      alert(message);
    } finally {
      pinUpdateInProgress = false;
      controls.forEach(function (state) { state.control.disabled = state.disabled; });
    }
  }

  window.modalRegeneratePin = async function () {
    var row = window.activeModalRow;
    if (row) await updateSecurityPins([row], false);
  };

  window.bulkRegeneratePins = async function () {
    await updateSecurityPins(typeof getSelectedRows === 'function' ? getSelectedRows() : [], true);
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
      // Download anchors can be activated without inserting response-derived nodes in the page.
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

    if (newStatus === 'deactivated') { await archiveSelected(selected); return; }

    var ids = selected.map(function (row) { return parseInt(row.getAttribute('data-id'), 10); }).filter(Boolean);
    var result = await AbecApi.post('/api/activations/bulk-status', {
      ids: ids,
      status: 'Active'
    });
    if (!result.success) {
      alert(result.message || 'Bulk update failed.');
      return;
    }
    if (result.message) alert(result.message);
    if (typeof exitSelectionMode === 'function') exitSelectionMode();
    await loadAccounts();
  };

  window.bulkArchiveSelected = async function () {
    var selected = typeof getSelectedRows === 'function' ? getSelectedRows() : [];
    if (!selected.length) {
      alert('Please select at least one account.');
      return;
    }
    await archiveSelected(selected);
  };

  document.addEventListener('DOMContentLoaded', function () {
    AbecApi.requireRole('Admin');
    var filter = document.getElementById('activation-course-filter');
    if (filter) AbecApi.get('/api/courses').then(function (result) {
      if (!result.success) return;
      var selected = filter.value;
      filter.innerHTML = '<option value="all">All Courses</option>';
      (result.data || []).forEach(function (course) {
        var option = document.createElement('option');
        option.value = course.courseName;
        option.textContent = courseLabel(course.courseName);
        filter.appendChild(option);
      });
      filter.value = selected || 'all';
    });
    loadAccounts();
  });
})();
