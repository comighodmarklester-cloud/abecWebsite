/* Dedicated admin batch lifecycle page. Uses the existing batch APIs. */
(function () {
  'use strict';
  if (!window.AbecApi) return;
  var activeBatch = null;
  var historyBatches = [];
  var pendingSelectId = null;
  var createBatchContext = null;
  var switchPlan = null;
  var switchReviewVersion = 0;
  var createReviewPending = false;
  var switchSaving = false;
  var selectedDocumentBatchId = null;
  var documentLoadVersion = 0;
  var documentReturnFocus = null;

  function showDocumentPanel(focus) {
    var modal = document.getElementById('modal-batch-documents');
    if (modal && modal.classList.contains('hidden')) documentReturnFocus = document.activeElement;
    showModal('modal-batch-documents');
    var close = document.getElementById('batch-documents-close');
    if (focus !== false && close) close.focus();
  }

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatDate(value) {
    if (!value) return '—';
    var d = new Date(value);
    if (isNaN(d.getTime())) {
      d = new Date(String(value).slice(0, 10) + 'T00:00:00');
    }
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
  }

  function academicYear(batch) {
    if (!batch) return '—';
    if (batch.academicYear) return batch.academicYear;
    var s = batch.startDate ? new Date(batch.startDate).getFullYear() : '';
    var e = batch.endDate ? new Date(batch.endDate).getFullYear() : '';
    if (s && e) return s + '–' + e;
    return s || e || '—';
  }

  function showModal(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('hidden');
    el.hidden = false;
    el.setAttribute('aria-hidden', 'false');
    document.body.classList.add('overflow-hidden');
  }

  function hideModal(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.classList.add('hidden');
    el.hidden = true;
    el.setAttribute('aria-hidden', 'true');
    if (!document.querySelector('[id^="modal-"]:not(.hidden)')) {
      document.body.classList.remove('overflow-hidden');
    }
  }

  function renderActiveBatch() {
    var card = document.getElementById('active-batch-card');
    if (card) card.setAttribute('data-active', activeBatch ? 'true' : 'false');
    if (!activeBatch) {
      setText('active-batch-name', 'No Active Batch');
      setText('active-batch-year', '—');
      setText('active-batch-students', '0');
      setText('active-batch-start', '—');
      setText('active-batch-end', '—');
      var statusEl = document.getElementById('active-batch-status');
      if (statusEl) {
        statusEl.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span> None';
        statusEl.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600';
      }
      return;
    }

    setText('active-batch-name', activeBatch.batchName);
    setText('active-batch-year', academicYear(activeBatch));
    setText('active-batch-students', String(activeBatch.studentCount || 0));
    setText('active-batch-start', formatDate(activeBatch.startDate));
    setText('active-batch-end', formatDate(activeBatch.endDate));
    setText('complete-batch-label', activeBatch.batchName);
    var activeStatus = document.getElementById('active-batch-status');
    if (activeStatus) {
      activeStatus.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span> Active';
      activeStatus.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-green-100 text-green-700';
    }
  }

  function historyCard(batch, compact) {
    var students = batch.studentCount || 0;
    return '<article class="dash-history-card">' +
      '<div class="dash-history-card-top">' +
        '<p class="dash-history-name">' + esc(batch.batchName) + '</p>' +
        '<span class="dash-history-status">' + esc(batch.status || 'History') + '</span>' +
      '</div>' +
      '<p class="dash-history-meta">' + esc(academicYear(batch)) + ' · ' +
        formatDate(batch.startDate) + ' – ' + formatDate(batch.endDate) + ' · ' +
        students + (students === 1 ? ' student' : ' students') + '</p>' +
      (compact ? '' : '<button type="button" class="dash-history-restore" onclick="restoreBatch(' + batch.batchId + ')">View documents</button>') +
    '</article>';
  }

  function renderHistoryPreview() {
    var preview = document.getElementById('batch-history-preview');
    var empty = document.getElementById('batch-history-preview-empty');
    if (!preview) return;
    if (!historyBatches.length) {
      preview.innerHTML = '';
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    preview.innerHTML = historyBatches.slice(0, 2).map(function (b) { return historyCard(b, false); }).join('');
  }

  function renderHistory() {
    renderHistoryPreview();
    var body = document.getElementById('batch-history-body');
    var empty = document.getElementById('batch-history-empty');
    var count = document.getElementById('batch-history-count');
    if (!body) return;

    if (count) count.textContent = historyBatches.length + ' archived';

    if (!historyBatches.length) {
      body.innerHTML = '';
      if (empty) empty.classList.remove('hidden');
      return;
    }

    if (empty) empty.classList.add('hidden');
    body.innerHTML = historyBatches.map(function (b) {
      return (
        '<tr class="hover:bg-slate-50/50 transition-colors">' +
          '<td data-label="Batch Name" class="px-6 py-3"><p class="text-sm font-semibold text-slate-800">' + esc(b.batchName) + '</p></td>' +
          '<td data-label="Academic Year" class="px-6 py-3 text-sm text-slate-600">' + esc(academicYear(b)) + '</td>' +
          '<td data-label="Students" class="px-6 py-3 text-sm text-slate-600">' + (b.studentCount || 0) + '</td>' +
          '<td data-label="Period" class="px-6 py-3 text-sm text-slate-600">' + formatDate(b.startDate) + ' – ' + formatDate(b.endDate) + '</td>' +
          '<td data-label="Status" class="px-6 py-3"><span class="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">' + esc(b.status || 'History') + '</span></td>' +
          '<td data-label="Action" class="px-6 py-3">' +
            '<button type="button" class="text-xs font-semibold text-abec-blue hover:underline" onclick="restoreBatch(' + b.batchId + ')">View documents</button>' +
          '</td>' +
        '</tr>'
      );
    }).join('');
  }

  function setText(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  async function refreshBatches() {
    var activeRes = await AbecApi.get('/api/batches/active');
    activeBatch = activeRes.success ? (activeRes.data || null) : null;

    var histRes = await AbecApi.get('/api/batches/history');
    historyBatches = histRes.success && histRes.data ? histRes.data : [];

    var error = document.getElementById('batch-load-error');
    if (error) error.hidden = true;
    if (!activeRes.success || !histRes.success) {
      window.AbecFeedback.notify({ type: 'error', message: (!activeRes.success ? activeRes.message : histRes.message) || 'Batch information could not be loaded. Refresh this page to try again.' });
    }
    renderActiveBatch();
    renderHistory();
    renderDocumentBatchSelector();
  }

  function renderDocumentBatchSelector() {
    var select = document.getElementById('batch-documents-select');
    if (!select) return;
    var batches = (activeBatch ? [activeBatch] : []).concat(historyBatches);
    select.innerHTML = '<option value="">Select a batch</option>' + batches.map(function (batch) {
      return '<option value="' + Number(batch.batchId) + '">' + esc(batch.batchName) + ' (' + esc(batch.status) + ')</option>';
    }).join('');
    select.value = selectedDocumentBatchId ? String(selectedDocumentBatchId) : '';
  }

  async function viewBatchDocuments(value, focus) {
    if (window.AbecRequestedDocuments && window.AbecRequestedDocuments.busy()) {
      if (focus !== false) window.AbecFeedback.notify({ type: 'info', message: 'Wait for the current document operation to finish before changing batches.' });
      return;
    }
    var batchId = value ? Number(value) : null;
    if (batchId !== null && (!Number.isSafeInteger(batchId) || batchId <= 0)) return;
    selectedDocumentBatchId = batchId;
    var version = ++documentLoadVersion;
    var host = document.getElementById('batch-requested-documents-host');
    if (host) host.hidden = true;
    if (window.AbecRequestedDocuments) window.AbecRequestedDocuments.clear();
    var message = document.getElementById('batch-documents-message');
    if (message) message.hidden = false;
    hideModal('modal-change-batch');
    hideModal('modal-batch-history');
    if (focus !== false) showDocumentPanel();
    renderDocumentBatchSelector();
    var section = document.getElementById('batch-documents');
    if (section) {
      section.setAttribute('aria-busy', batchId ? 'true' : 'false');
    }
    if (window.history && typeof window.history.replaceState === 'function') {
      var query = new URLSearchParams(window.location.search);
      if (batchId) query.set('batchId', String(batchId)); else query.delete('batchId');
      query.delete('history');
      window.history.replaceState(null, '', window.location.pathname + (query.toString() ? '?' + query.toString() : ''));
    }
    if (!batchId) {
      setText('batch-documents-title', 'Batch Documents');
      setText('batch-documents-context', 'Select a batch to review its document records here.');
      setText('batch-documents-message', 'No batch selected.');
      return;
    }
    var selected = (activeBatch ? [activeBatch] : []).concat(historyBatches).find(function (b) { return b.batchId === batchId; });
    setText('batch-documents-title', (selected ? selected.batchName : 'Selected Batch') + ' Documents');
    setText('batch-documents-context', 'Loading selected batch records?');
    setText('batch-documents-message', 'Loading documents?');
    var result;
    try { result = await AbecApi.get('/api/batches/' + encodeURIComponent(batchId) + '/documents?batchId=' + encodeURIComponent(batchId)); }
    catch (_) { result = { success: false, message: 'Documents could not be loaded. Refresh to try again.' }; }
    if (version !== documentLoadVersion || selectedDocumentBatchId !== batchId) return;
    if (section) section.setAttribute('aria-busy', 'false');
    if (!result.success || !result.data || !result.data.batch || Number(result.data.batch.batchId) !== batchId) {
      setText('batch-documents-context', 'Selected batch records are unavailable.');
      setText('batch-documents-message', 'Documents unavailable.');
      window.AbecFeedback.notify({ type: 'error', message: result.message || 'Documents could not be loaded. Refresh to try again.' });
      return;
    }
    var data = result.data;
    setText('batch-documents-title', data.batch.batchName + ' Documents');
    setText('batch-documents-context', 'Viewing ' + data.batch.batchName + ' (' + data.batch.status + '). ' +
      (activeBatch ? 'The active enrollment batch remains ' + activeBatch.batchName + '.' : 'No enrollment batch is currently active.') +
      (data.batch.completedAt ? ' Completed ' + formatDate(data.batch.completedAt) + '.' : ''));
    try {
      await window.AbecRequestedDocuments.prepare(host);
      if (version !== documentLoadVersion || selectedDocumentBatchId !== batchId) return;
      var opened = await window.AbecRequestedDocuments.open(data);
      if (version !== documentLoadVersion || selectedDocumentBatchId !== batchId) return;
      if (!opened) throw new Error('The requested documents could not be displayed.');
      if (host) host.hidden = false;
      if (message) message.hidden = true;
    } catch (err) {
      if (version !== documentLoadVersion) return;
      setText('batch-documents-message', err.message || 'The Requested Documents view could not be loaded.');
      window.AbecFeedback.notify({ type: 'error', message: err.message || 'The Requested Documents view could not be loaded.' });
    }
  }

  function batchOptionHtml(batch, isSelected) {
    var classes = 'batch-option w-full text-left rounded-xl border border-slate-200 p-3 transition-all hover:border-abec-blue/40 hover:bg-slate-50 cursor-pointer ';
    if (isSelected) classes += 'border-abec-blue bg-blue-50/40 ';
    return (
      '<button type="button" class="' + classes + '" onclick="highlightBatch(' + batch.batchId + ')" data-batch-id="' + batch.batchId + '">' +
        '<div class="flex items-start justify-between gap-3">' +
          '<div>' +
            '<p class="text-sm font-bold text-slate-800">' + esc(batch.batchName) + '</p>' +
            '<p class="text-xs text-slate-500 mt-0.5">' + esc(academicYear(batch)) + ' · ' + (batch.studentCount || 0) + ' students</p>' +
            '<p class="text-[11px] text-slate-400 mt-1">' + formatDate(batch.startDate) + ' – ' + formatDate(batch.endDate) + '</p>' +
          '</div>' +
          '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">HISTORY</span>' +
        '</div>' +
      '</button>'
    );
  }

  function renderChangeBatchList() {
    var q = ((document.getElementById('batch-search') || {}).value || '').trim().toLowerCase();
    var archivedEl = document.getElementById('change-batch-archived');
    if (!archivedEl) return;

    var filtered = historyBatches.filter(function (b) {
      if (!q) return true;
      return String(b.batchName || '').toLowerCase().indexOf(q) !== -1 ||
        String(academicYear(b)).toLowerCase().indexOf(q) !== -1;
    });

    archivedEl.innerHTML = filtered.length
      ? filtered.map(function (b) { return batchOptionHtml(b, b.batchId === pendingSelectId); }).join('')
      : '<p class="text-xs text-slate-400 py-3 text-center">No history batches match. Create a new batch to start the next semester.</p>';

    var selectBtn = document.getElementById('btn-select-batch');
    if (selectBtn) {
      selectBtn.disabled = !pendingSelectId ||
        !filtered.some(function (b) { return b.batchId === pendingSelectId; });
    }
  }

  function impactRows(impact) {
    if (!impact) return '<li class="text-slate-500">Unable to load open-item checks.</li>';
    var items = [
      ['Active / enrolled students', impact.activeEnrolledStudents],
      ['Pending applicants', impact.pendingApplicants],
      ['Waitlisted applicants', impact.waitlistedApplicants],
      ['Applicants awaiting confirmation', impact.awaitingConfirmation],
      ['Pending account activations', impact.pendingActivations],
      ['Active course schedules', impact.activeCourseSchedules],
      ['Pending document requests', impact.pendingDocumentRequests]
    ];
    if (!impact.hasOpenItems && !(impact.totalOpenItems > 0)) {
      return '<li class="text-emerald-700">No unfinished records found on the current active batch.</li>';
    }
    return items.map(function (pair) {
      var n = pair[1] || 0;
      var cls = n > 0 ? 'font-semibold text-amber-800' : 'text-slate-500';
      return '<li class="' + cls + '">' + esc(pair[0]) + ': <strong>' + n + '</strong></li>';
    }).join('');
  }

  async function openSwitchConfirm(plan) {
    switchPlan = plan;
    var version = ++switchReviewVersion;
    var impactUrl = '/api/batches/switch-impact';
    if (plan.targetBatchId) impactUrl += '?targetBatchId=' + plan.targetBatchId;
    var impactRes;
    try { impactRes = await AbecApi.get(impactUrl); }
    catch (_) { impactRes = { success: false, message: 'Batch checks could not be loaded. Try again.' }; }
    if (version !== switchReviewVersion || switchPlan !== plan) return;
    if (!impactRes.success || !impactRes.data) {
      switchPlan = null;
      window.AbecFeedback.notify({ type: 'error', message: impactRes.message || 'Batch checks could not be loaded. Try again.' });
      return;
    }
    var impact = impactRes.data;
    plan.impact = impact;

    var instruction = (impact && impact.instruction) ||
      'Changing the active batch will start a new semester/training period. Records belonging to the previous batch will be preserved in Batch History and will not be deleted.';
    setText('switch-batch-instruction', instruction);

    var current = impact && impact.currentActiveBatch ? impact.currentActiveBatch : activeBatch;
    setText('switch-current-name', current ? current.batchName : 'None');
    setText('switch-current-meta', current
      ? academicYear(current) + ' · ' + formatDate(current.startDate) + ' – ' + formatDate(current.endDate)
      : 'No active batch currently');

    if (plan.mode === 'create' && plan.createDto) {
      setText('switch-target-name', plan.createDto.batchName);
      setText('switch-target-meta',
        formatDate(plan.createDto.startDate) + ' – ' + formatDate(plan.createDto.endDate) + ' (new)');
    } else if (impact && impact.targetBatch) {
      setText('switch-target-name', impact.targetBatch.batchName);
      setText('switch-target-meta',
        academicYear(impact.targetBatch) + ' · ' + formatDate(impact.targetBatch.startDate) + ' – ' + formatDate(impact.targetBatch.endDate));
    } else {
      var hist = historyBatches.find(function (b) { return b.batchId === plan.targetBatchId; });
      setText('switch-target-name', hist ? hist.batchName : 'Selected batch');
      setText('switch-target-meta', hist ? academicYear(hist) : '—');
    }

    var list = document.getElementById('switch-impact-list');
    if (list) list.innerHTML = impactRows(impact);

    var cb = document.getElementById('switch-ack-checkbox');
    if (cb) cb.checked = false;
    onSwitchAckChanged();

    hideModal('modal-change-batch');
    hideModal('modal-create-batch');
    showModal('modal-switch-batch');
  }

  function onSwitchAckChanged() {
    var cb = document.getElementById('switch-ack-checkbox');
    var btn = document.getElementById('btn-confirm-switch');
    if (btn) btn.disabled = switchSaving || !(cb && cb.checked);
  }

  async function confirmSwitchBatch() {
    var cb = document.getElementById('switch-ack-checkbox');
    if (!cb || !cb.checked || !switchPlan || switchSaving) return;
    var plan = switchPlan;
    var currentName = (plan.impact && plan.impact.currentActiveBatch && plan.impact.currentActiveBatch.batchName) ||
      (activeBatch && activeBatch.batchName) || 'the current batch';
    var target = document.getElementById('switch-target-name');
    switchSaving = true;
    onSwitchAckChanged();
    try {
      var ok = await window.AbecFeedback.confirm({
        title: 'Create and activate batch',
        message: 'Current Active Batch: ' + currentName + '\nNew Active Batch: ' + (target ? target.textContent : 'the new batch') + '\n\nThe previous batch will move to Batch History. No records will be deleted.\n\nProceed with creating the new active batch?',
        confirmLabel: 'Create batch'
      });
      if (!ok || switchPlan !== plan) return;
      var previousBatchId = activeBatch ? activeBatch.batchId : null;
      var result;
      if (plan.mode === 'create' && plan.createDto) {
        result = await AbecApi.post('/api/batches', {
          batchName: plan.createDto.batchName,
          startDate: plan.createDto.startDate,
          endDate: plan.createDto.endDate,
          activateNow: true,
          confirmSwitch: true,
          completeBatchId: plan.completeBatchId || null
        });
      } else {
        result = await AbecApi.put('/api/batches/' + plan.targetBatchId + '/activate', { confirmSwitch: true });
      }
      if (!result.success) {
        window.AbecFeedback.notify({ type: 'error', message: result.message || 'The batch could not be created. Try again.' });
        return;
      }
      switchPlan = null;
      ++switchReviewVersion;
      hideModal('modal-switch-batch');
      createBatchContext = null;
      if (previousBatchId) selectedDocumentBatchId = previousBatchId;
      if (window.AbecBatchChanges) window.AbecBatchChanges.publish();
      window.AbecFeedback.notify({ type: 'success', message: result.message || 'New batch created and activated. Previous records remain in Batch History.' });
      try {
        await window.AbecBatches.refresh();
        if (previousBatchId) showDocumentPanel();
      } catch (_) {
        window.AbecFeedback.notify({ type: 'warning', message: 'The new batch was created, but the page could not refresh. Refresh this page to see the updated batch.' });
      }
    } catch (_) {
      window.AbecFeedback.notify({ type: 'error', message: 'The batch request could not be completed. Refresh the batch list before trying again.' });
    } finally {
      switchSaving = false;
      onSwitchAckChanged();
    }
  }

  function closeSwitchBatchModal() {
    if (switchSaving) return;
    ++switchReviewVersion;
    var returnToForm = switchPlan && switchPlan.mode === 'create';
    hideModal('modal-switch-batch');
    switchPlan = null;
    if (returnToForm) {
      createReviewPending = false;
      var review = document.getElementById('btn-review-new-batch');
      if (review) review.disabled = false;
      showModal('modal-create-batch');
      var name = document.getElementById('new-batch-name');
      if (name) name.focus();
    }
  }

  window.openChangeBatchModal = function () {
    pendingSelectId = null;
    var search = document.getElementById('batch-search');
    if (search) search.value = '';
    renderChangeBatchList();
    showModal('modal-change-batch');
  };

  window.closeChangeBatchModal = function () {
    hideModal('modal-change-batch');
    pendingSelectId = null;
  };

  window.renderChangeBatchList = renderChangeBatchList;

  window.highlightBatch = function (id) {
    pendingSelectId = Number(id);
    renderChangeBatchList();
  };

  window.selectHighlightedBatch = async function () {
    if (!pendingSelectId) return;
    await viewBatchDocuments(pendingSelectId);
  };

  window.restoreBatch = viewBatchDocuments;
  window.viewBatchDocuments = viewBatchDocuments;
  window.closeBatchDocuments = function () {
    if (window.AbecRequestedDocuments) window.AbecRequestedDocuments.closeReview();
    hideModal('modal-batch-documents');
    if (documentReturnFocus && documentReturnFocus.isConnected !== false && documentReturnFocus.focus) documentReturnFocus.focus();
    documentReturnFocus = null;
  };

  window.openCompleteBatchModal = function () {
    if (!activeBatch) return;
    setText('complete-batch-label', activeBatch.batchName);
    showModal('modal-complete-batch');
  };

  window.closeCompleteBatchModal = function () {
    hideModal('modal-complete-batch');
  };

  window.confirmCompleteBatch = async function () {
    if (!activeBatch) return;
    var result = await AbecApi.post('/api/batches/' + activeBatch.batchId + '/complete', {});
    if (!result.success) { alert(result.message || 'Batch completion failed.'); return; }
    hideModal('modal-complete-batch');
    alert('Batch completed. General records are preserved and read-only; document processing remains available.');
    await window.AbecBatches.refresh();
    if (window.AbecBatchChanges) window.AbecBatchChanges.publish();
  };

  function batchToday() {
    var parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    function part(type) { return parts.find(function (p) { return p.type === type; }).value; }
    return part('year') + '-' + part('month') + '-' + part('day');
  }

  function batchEndDate(start) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return '';
    var parts = start.split('-').map(Number);
    var target = new Date(Date.UTC(parts[0], parts[1] - 1 + 2, 1));
    var lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(parts[2], lastDay));
    return target.toISOString().slice(0, 10);
  }

  window.updateNewBatchDates = function () {
    var start = document.getElementById('new-batch-start');
    var end = document.getElementById('new-batch-end');
    if (!start || !end) return;
    start.min = batchToday();
    start.setCustomValidity(start.value && start.value < start.min ? 'Start date cannot be in the past.' : '');
    end.value = start.validity.valid && start.value ? batchEndDate(start.value) : '';
  };

  window.openCreateBatchModal = function (context) {
    if (switchSaving) return;
    ++switchReviewVersion;
    switchPlan = null;
    createReviewPending = false;
    createBatchContext = context || 'manual';
    var form = document.getElementById('create-batch-form');
    if (form) form.reset();
    var nameInput = document.getElementById('new-batch-name');
    if (nameInput) { nameInput.setCustomValidity(''); nameInput.placeholder = 'e.g., Batch' + batchToday().slice(0, 4) + '-101'; }
    var start = document.getElementById('new-batch-start');
    if (start) start.value = batchToday();
    var review = document.getElementById('btn-review-new-batch');
    if (review) review.disabled = false;
    window.updateNewBatchDates();
    hideModal('modal-change-batch');
    hideModal('modal-batch-history');
    hideModal('modal-batch-documents');
    hideModal('modal-switch-batch');
    showModal('modal-create-batch');
    if (nameInput) nameInput.focus();
  };

  window.closeCreateBatchModal = function () {
    ++switchReviewVersion;
    switchPlan = null;
    createReviewPending = false;
    var wasFromChange = createBatchContext === 'from-change';
    hideModal('modal-create-batch');
    createBatchContext = null;
    if (wasFromChange) {
      showModal('modal-change-batch');
      renderChangeBatchList();
    }
  };

  window.submitCreateBatch = async function (event) {
    event.preventDefault();
    if (createReviewPending || switchSaving) return;
    var form = document.getElementById('create-batch-form');
    var nameInput = document.getElementById('new-batch-name');
    var name = (nameInput.value || '').trim();
    nameInput.setCustomValidity(!name ? 'Enter a batch name.' : name.length > 100 ? 'Batch name must be 100 characters or fewer.' : '');
    var start = document.getElementById('new-batch-start').value;
    window.updateNewBatchDates();
    if (!form.reportValidity()) return;
    var end = document.getElementById('new-batch-end').value;
    if (!name || !start || !end) return;
    if (new Date(end) < new Date(start)) {
      alert('End date must be on or after the start date.');
      return;
    }

    createReviewPending = true;
    var review = document.getElementById('btn-review-new-batch');
    if (review) review.disabled = true;
    var version = switchReviewVersion + 1;
    try { await openSwitchConfirm({
      mode: 'create',
      completeBatchId: createBatchContext === 'complete-current' && activeBatch ? activeBatch.batchId : null,
      createDto: {
        batchName: name,
        startDate: start,
        endDate: end
      }
    }); } finally {
      if (version === switchReviewVersion) {
        createReviewPending = false;
        if (review) review.disabled = false;
      }
    }
  };

  window.onSwitchAckChanged = onSwitchAckChanged;
  window.confirmSwitchBatch = confirmSwitchBatch;
  window.closeSwitchBatchModal = closeSwitchBatchModal;

  window.openBatchHistory = function () {
    showModal('modal-batch-history');
  };

  window.closeBatchHistory = function () {
    hideModal('modal-batch-history');
  };

  window.AbecBatches = {
    refresh: async function () {
      await refreshBatches();
      if (selectedDocumentBatchId) await viewBatchDocuments(selectedDocumentBatchId, false);
      if (window.abecReloadAdminNotifications) window.abecReloadAdminNotifications();
    }
  };

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || switchSaving) return;
    if (window.AbecRequestedDocuments && window.AbecRequestedDocuments.reviewOpen()) return;
    ['modal-switch-batch', 'modal-change-batch', 'modal-complete-batch', 'modal-create-batch', 'modal-batch-history', 'modal-batch-documents'].some(function (id) {
      var el = document.getElementById(id);
      if (!el || el.classList.contains('hidden')) return;
      if (id === 'modal-batch-documents') window.closeBatchDocuments();
      else if (id === 'modal-batch-history') closeBatchHistory();
      else if (id === 'modal-create-batch') window.closeCreateBatchModal();
      else if (id === 'modal-switch-batch') closeSwitchBatchModal();
      else hideModal(id);
      return true;
    });
  });

  document.addEventListener('DOMContentLoaded', async function () {
    if (!AbecApi.requireRole('Admin')) return;
    document.getElementById('create-batch-form').addEventListener('submit', window.submitCreateBatch);
    document.getElementById('new-batch-name').addEventListener('input', function () { this.setCustomValidity(''); });
    document.getElementById('new-batch-start').addEventListener('input', window.updateNewBatchDates);
    document.getElementById('new-batch-start').addEventListener('change', window.updateNewBatchDates);
    document.addEventListener('click', function (e) {
      var create = e.target.closest && e.target.closest('[data-create-batch]');
      if (create) {
        e.preventDefault();
        window.openCreateBatchModal(create.getAttribute('data-create-batch') || 'manual');
        return;
      }
      var historyModal = document.getElementById('modal-batch-history');
      if (!historyModal || historyModal.classList.contains('hidden')) return;
      var historyPanel = historyModal.querySelector('.modal-panel');
      if (historyPanel && historyPanel.contains(e.target)) return;
      if (e.target.closest && e.target.closest('#btn-batch-history')) return;
      closeBatchHistory();
    });
    try { localStorage.removeItem('abec-admin-batches-v2'); } catch (e) { /* ignore */ }
    try { localStorage.removeItem('abec-admin-batches'); } catch (e) { /* ignore */ }
    var initialQuery = new URLSearchParams(window.location.search);
    var initialBatchId = initialQuery.get('batchId');
    if (initialBatchId && /^\d+$/.test(initialBatchId)) selectedDocumentBatchId = Number(initialBatchId);
    await window.AbecBatches.refresh();
    if (selectedDocumentBatchId) showDocumentPanel();
    if (initialQuery.get('history') === '1' && !selectedDocumentBatchId) window.openBatchHistory();
  });
})();
