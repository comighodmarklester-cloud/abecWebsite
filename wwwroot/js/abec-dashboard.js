/* Admin dashboard: stats, recent applicants, batch lifecycle (API-backed) */
(function () {
  'use strict';
  if (!window.AbecApi) return;

  var activeBatch = null;
  var historyBatches = [];
  var pendingSelectId = null;
  var createBatchContext = null;
  var switchPlan = null; // { mode: 'activate'|'create', targetBatchId?, createDto?, impact? }

  function courseLabel(name) {
    return (window.AbecApi && AbecApi.displayCourseName) ? AbecApi.displayCourseName(name) : String(name || '');
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
    el.setAttribute('aria-hidden', 'false');
    document.body.classList.add('overflow-hidden');
  }

  function hideModal(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.classList.add('hidden');
    el.setAttribute('aria-hidden', 'true');
    if (!document.querySelector('[id^="modal-"]:not(.hidden)')) {
      document.body.classList.remove('overflow-hidden');
    }
  }

  function statusBadge(status) {
    var s = (status || '').toLowerCase();
    if (s === 'pending') return 'bg-amber-50 text-amber-700';
    if (s === 'approved') return 'bg-blue-50 text-abec-blue';
    if (s === 'waitlisted') return 'bg-violet-50 text-violet-700';
    if (s.indexOf('confirm') >= 0) return 'bg-emerald-50 text-emerald-700';
    if (s === 'rejected' || s === 'declined' || s === 'expired') return 'bg-rose-50 text-rose-700';
    return 'bg-slate-100 text-slate-600';
  }

  async function loadStats() {
    var stats = await AbecApi.get('/api/applicants/stats');
    if (!stats.success || !stats.data) {
      document.querySelectorAll('[data-stat]').forEach(function (el) { el.textContent = '—'; });
      return;
    }
    Object.keys(stats.data).forEach(function (key) {
      var el = document.querySelector('[data-stat="' + key + '"]');
      if (el && typeof stats.data[key] === 'number') el.textContent = stats.data[key];
    });
    var total = Number(stats.data.totalApplicants) || 0;
    ['pending', 'approved', 'rejected', 'waitlisted', 'activeStudents', 'awaitingActivation'].forEach(function (key) {
      var note = document.querySelector('[data-stat-note="' + key + '"]');
      if (!note) return;
      var part = Number(stats.data[key]) || 0;
      note.textContent = (total ? Math.round((part * 100) / total) : 0) + '% of total';
    });
  }

  var courseCatalog = [];
  var searchSeq = 0;

  async function loadCourseFilter() {
    var select = document.getElementById('dashboard-course-filter');
    if (!select) return;
    var current = select.value || 'all';
    var result = await AbecApi.get('/api/courses');
    if (!result.success || !result.data) return;
    courseCatalog = result.data.filter(function (course) { return course && course.courseName; });
    select.innerHTML = '<option value="all">All Courses</option>';
    result.data.forEach(function (course) {
      if (!course || !course.courseName) return;
      var option = document.createElement('option');
      option.value = course.courseName;
      option.textContent = courseLabel(course.courseName);
      select.appendChild(option);
    });
    if (current) select.value = current;
  }

  async function loadRecentApplicants() {
    var res = await AbecApi.get('/api/applicants?take=5');
    var body = document.getElementById('dashboard-applicants-body');
    if (!body) return;

    if (!res.success) {
      body.innerHTML =
        '<div id="dashboard-no-results" class="px-5 py-8 text-center text-sm text-red-600">' + esc(res.message || 'Unable to load applicants.') + '</div>';
      return;
    }
    if (!res.data || !res.data.length) {
      body.innerHTML =
        '<div id="dashboard-no-results" class="px-5 py-8 text-center text-sm text-slate-400">No applicants yet.</div>';
      var countEl = document.getElementById('dashboard-showing-count');
      if (countEl) countEl.textContent = 'Showing 0 recent applicants';
      return;
    }

    body.innerHTML = res.data.map(function (a) {
      var id = a.applicantId;
      var name = a.fullName || ((a.firstName || '') + ' ' + (a.lastName || '')).trim() || '—';
      var course = a.courseName || '—';
      var status = a.applicationStatus || '—';
      var initials = AbecApi.initials(name);
      return (
        '<button type="button" class="dashboard-applicant-row w-full text-left px-5 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors group" ' +
          'data-course="' + esc(course) + '" data-applicant-id="' + id + '" onclick="openDashboardApplicant(' + id + ')">' +
          '<span class="w-9 h-9 rounded-full bg-slate-100 text-abec-navy text-xs font-bold flex items-center justify-center shrink-0">' + esc(initials) + '</span>' +
          '<span class="min-w-0 flex-1">' +
            '<span class="block text-sm font-semibold text-slate-800 truncate group-hover:text-abec-blue">' + esc(name) + '</span>' +
            '<span class="block text-[12px] text-slate-600 mt-0.5 leading-snug">' + esc(courseLabel(course)) + '</span>' +
            '<span class="block text-[11px] text-slate-400 mt-0.5">' + esc(AbecApi.formatDate(a.applicationDate)) + '</span>' +
          '</span>' +
          '<span class="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ' + statusBadge(status) + '">' + esc(status) + '</span>' +
          '<svg class="w-4 h-4 text-slate-300 group-hover:text-abec-blue shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>' +
        '</button>'
      );
    }).join('') +
      '<div id="dashboard-no-results" class="hidden px-5 py-8 text-center text-sm text-slate-400">No applicants match this filter.</div>';

    filterApplicants();
  }

  function filterApplicants() {
    var select = document.getElementById('dashboard-course-filter');
    var course = select ? select.value : 'all';
    var rows = document.querySelectorAll('.dashboard-applicant-row');
    var visible = 0;
    rows.forEach(function (row) {
      var match = course === 'all' || row.getAttribute('data-course') === course;
      row.classList.toggle('hidden', !match);
      if (match) visible++;
    });
    var empty = document.getElementById('dashboard-no-results');
    if (empty) empty.classList.toggle('hidden', visible > 0);
    var countEl = document.getElementById('dashboard-showing-count');
    if (countEl) countEl.textContent = 'Showing ' + visible + ' of ' + rows.length + ' recent applicants';
  }

  window.openDashboardApplicant = function (applicantId) {
    if (!applicantId) return;
    window.location.href = 'ApplicantPage.html?id=' + encodeURIComponent(applicantId);
  };

  function renderActiveBatch() {
    var completeBtn = document.getElementById('btn-complete-batch');
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
      if (completeBtn) completeBtn.disabled = true;
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
    if (completeBtn) completeBtn.disabled = false;
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
      (compact ? '' : '<button type="button" class="dash-history-restore" onclick="restoreBatch(' + batch.batchId + ')">Restore</button>') +
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
    preview.innerHTML = historyBatches.slice(0, 2).map(function (b) { return historyCard(b, true); }).join('');
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
          '<td class="px-6 py-3"><p class="text-sm font-semibold text-slate-800">' + esc(b.batchName) + '</p></td>' +
          '<td class="px-6 py-3 text-sm text-slate-600">' + esc(academicYear(b)) + '</td>' +
          '<td class="px-6 py-3 text-sm text-slate-600">' + (b.studentCount || 0) + '</td>' +
          '<td class="px-6 py-3 text-sm text-slate-600">' + formatDate(b.startDate) + ' – ' + formatDate(b.endDate) + '</td>' +
          '<td class="px-6 py-3"><span class="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">' + esc(b.status || 'History') + '</span></td>' +
          '<td class="px-6 py-3">' +
            '<button type="button" class="text-xs font-semibold text-abec-blue hover:underline" onclick="restoreBatch(' + b.batchId + ')">Restore</button>' +
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

    renderActiveBatch();
    renderHistory();
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
    var impactUrl = '/api/batches/switch-impact';
    if (plan.targetBatchId) impactUrl += '?targetBatchId=' + plan.targetBatchId;
    var impactRes = await AbecApi.get(impactUrl);
    var impact = impactRes.success ? impactRes.data : null;
    switchPlan.impact = impact;

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
    if (btn) btn.disabled = !(cb && cb.checked);
  }

  async function confirmSwitchBatch() {
    var cb = document.getElementById('switch-ack-checkbox');
    if (!cb || !cb.checked || !switchPlan) return;

    var currentName = (switchPlan.impact && switchPlan.impact.currentActiveBatch && switchPlan.impact.currentActiveBatch.batchName) ||
      (activeBatch && activeBatch.batchName) || 'the current batch';
    var targetName = document.getElementById('switch-target-name');
    targetName = targetName ? targetName.textContent : 'the new batch';

    var ok = await window.AbecFeedback.confirm({
      title: 'Change active batch',
      message: 'Current Active Batch: ' + currentName + '\nNew Active Batch: ' + targetName + '\n\nThe previous batch will move to Batch History. No records will be deleted.\n\nProceed with changing the active batch?',
      confirmLabel: 'Change batch'
    });
    if (!ok) return;

    var btn = document.getElementById('btn-confirm-switch');
    if (btn) btn.disabled = true;

    var result;
    if (switchPlan.mode === 'create' && switchPlan.createDto) {
      result = await AbecApi.post('/api/batches', {
        batchName: switchPlan.createDto.batchName,
        startDate: switchPlan.createDto.startDate,
        endDate: switchPlan.createDto.endDate,
        activateNow: true,
        confirmSwitch: true,
        completeBatchId: switchPlan.completeBatchId || null
      });
    } else {
      result = await AbecApi.put('/api/batches/' + switchPlan.targetBatchId + '/activate', {
        confirmSwitch: true
      });
    }

    if (!result.success) {
      alert(result.message || 'Batch switch failed.');
      onSwitchAckChanged();
      return;
    }

    switchPlan = null;
    hideModal('modal-switch-batch');
    createBatchContext = null;
    await refreshBatches();
    alert(result.message || 'Active batch updated. Previous semester records remain in Batch History.');
  }

  function closeSwitchBatchModal() {
    hideModal('modal-switch-batch');
    switchPlan = null;
  }

  window.openChangeBatchModal = function () {
    closeBatchMenu();
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
    await openSwitchConfirm({ mode: 'activate', targetBatchId: pendingSelectId });
  };

  window.restoreBatch = async function (batchId) {
    await openSwitchConfirm({ mode: 'activate', targetBatchId: Number(batchId) });
  };

  window.openCompleteBatchModal = function () {
    closeBatchMenu();
    if (!activeBatch) return;
    setText('complete-batch-label', activeBatch.batchName);
    showModal('modal-complete-batch');
  };

  window.closeCompleteBatchModal = function () {
    hideModal('modal-complete-batch');
  };

  window.confirmCompleteBatch = function () {
    if (!activeBatch) return;
    hideModal('modal-complete-batch');
    openCreateBatchModal('complete-current');
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
    createBatchContext = context || 'manual';
    var form = document.getElementById('create-batch-form');
    if (form) form.reset();
    var nameInput = document.getElementById('new-batch-name');
    if (nameInput) nameInput.placeholder = 'e.g., Batch' + batchToday().slice(0, 4) + '-101';
    window.updateNewBatchDates();
    if (createBatchContext === 'from-change') hideModal('modal-change-batch');
    showModal('modal-create-batch');
  };

  window.closeCreateBatchModal = function () {
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
    var name = (document.getElementById('new-batch-name').value || '').trim();
    var start = document.getElementById('new-batch-start').value;
    window.updateNewBatchDates();
    var startInput = document.getElementById('new-batch-start');
    if (!startInput.reportValidity()) return;
    var end = document.getElementById('new-batch-end').value;
    if (!name || !start || !end) return;
    if (new Date(end) < new Date(start)) {
      alert('End date must be on or after the start date.');
      return;
    }

    await openSwitchConfirm({
      mode: 'create',
      completeBatchId: createBatchContext === 'complete-current' && activeBatch ? activeBatch.batchId : null,
      createDto: {
        batchName: name,
        startDate: start,
        endDate: end
      }
    });
  };

  window.onSwitchAckChanged = onSwitchAckChanged;
  window.confirmSwitchBatch = confirmSwitchBatch;
  window.closeSwitchBatchModal = closeSwitchBatchModal;

  function batchMenuItems() {
    var panel = document.getElementById('batch-menu-panel');
    if (!panel) return [];
    return Array.prototype.filter.call(panel.querySelectorAll('[role="menuitem"]'), function (el) {
      return !el.disabled;
    });
  }

  function moveBatchMenu(key) {
    var items = batchMenuItems();
    if (!items.length) return;
    var index = items.indexOf(document.activeElement);
    if (key === 'Home' || (key === 'ArrowDown' && index < 0)) index = 0;
    else if (key === 'End') index = items.length - 1;
    else if (key === 'ArrowDown') index = (index + 1) % items.length;
    else if (key === 'ArrowUp') index = index <= 0 ? items.length - 1 : index - 1;
    items[index].focus();
  }

  function closeBatchMenu(restoreFocus) {
    var panel = document.getElementById('batch-menu-panel');
    var btn = document.getElementById('batch-menu-btn');
    if (panel) panel.hidden = true;
    if (btn) btn.setAttribute('aria-expanded', 'false');
    if (restoreFocus && btn) btn.focus();
  }

  function toggleBatchMenu() {
    var panel = document.getElementById('batch-menu-panel');
    var btn = document.getElementById('batch-menu-btn');
    if (!panel || !btn) return;
    var willOpen = panel.hidden;
    panel.hidden = !willOpen;
    btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    if (willOpen) {
      var items = batchMenuItems();
      if (items[0]) window.setTimeout(function () { items[0].focus(); }, 0);
    }
  }

  function placeBatchHistoryPopup() {
    var board = document.querySelector('[data-purpose="current-active-batch"]');
    var modal = document.getElementById('modal-batch-history');
    if (!board || !modal) return;
    var rect = board.getBoundingClientRect();
    var gap = 8;
    var roomBelow = window.innerHeight - rect.bottom - gap;
    if (roomBelow < 180) {
      window.scrollBy(0, 180 - roomBelow);
      rect = board.getBoundingClientRect();
    }
    var top = Math.max(8, Math.round(rect.bottom + gap));
    if (top > window.innerHeight - 140) top = Math.max(8, window.innerHeight - 140);
    modal.classList.add('is-anchored');
    modal.style.top = top + 'px';
    var wrap = modal.querySelector('.relative');
    var panel = modal.querySelector('.modal-panel');
    var width = Math.min(896, window.innerWidth - 24);
    var left = Math.round(rect.left);
    if (left + width > window.innerWidth - 12) left = Math.max(12, window.innerWidth - 12 - width);
    if (wrap) {
      wrap.style.padding = '0 12px 12px ' + left + 'px';
      wrap.style.width = '100%';
    }
    if (panel) {
      panel.style.width = width + 'px';
      panel.style.maxWidth = width + 'px';
      panel.style.maxHeight = Math.max(160, window.innerHeight - top - 16) + 'px';
    }
  }

  function resetBatchHistoryPopup() {
    var modal = document.getElementById('modal-batch-history');
    if (!modal) return;
    modal.classList.remove('is-anchored');
    modal.style.top = '';
    var wrap = modal.querySelector('.relative');
    var panel = modal.querySelector('.modal-panel');
    if (wrap) wrap.style.padding = '';
    if (wrap) wrap.style.width = '';
    if (panel) {
      panel.style.width = '';
      panel.style.maxWidth = '';
      panel.style.maxHeight = '';
    }
  }

  window.openBatchHistory = function () {
    closeBatchMenu();
    showModal('modal-batch-history');
    placeBatchHistoryPopup();
  };

  window.closeBatchHistory = function () {
    hideModal('modal-batch-history');
    resetBatchHistoryPopup();
  };

  function batchMatches(batch, query) {
    if (!batch) return false;
    return String(batch.batchName || '').toLowerCase().indexOf(query) !== -1 ||
      String(academicYear(batch)).toLowerCase().indexOf(query) !== -1 ||
      String(batch.status || '').toLowerCase().indexOf(query) !== -1;
  }

  function hideSearchResults() {
    var panel = document.getElementById('dashboard-search-results');
    var input = document.getElementById('dashboard-search');
    if (panel) panel.hidden = true;
    if (input) input.setAttribute('aria-expanded', 'false');
  }

  async function runDashboardSearch(raw) {
    var panel = document.getElementById('dashboard-search-results');
    var input = document.getElementById('dashboard-search');
    if (!panel) return;
    var term = String(raw || '').trim();
    if (!term) {
      panel.innerHTML = '';
      hideSearchResults();
      return;
    }
    var seq = ++searchSeq;
    panel.hidden = false;
    if (input) input.setAttribute('aria-expanded', 'true');
    panel.innerHTML = '<p class="dash-search-empty">Searching…</p>';
    var query = term.toLowerCase();
    var res = await AbecApi.get('/api/applicants?take=8&search=' + encodeURIComponent(term));
    if (seq !== searchSeq) return;
    var applicants = res.success && res.data ? res.data : [];
    var courses = courseCatalog.filter(function (course) {
      return String(course.courseName || '').toLowerCase().indexOf(query) !== -1;
    }).slice(0, 4);
    var batches = [];
    if (batchMatches(activeBatch, query)) batches.push(activeBatch);
    historyBatches.forEach(function (batch) {
      if (batchMatches(batch, query)) batches.push(batch);
    });
    batches = batches.slice(0, 4);
    if (!applicants.length && !courses.length && !batches.length) {
      panel.innerHTML = '<p class="dash-search-empty">No matching records.</p>';
      return;
    }
    var html = '';
    if (applicants.length) {
      html += '<p class="dash-search-label">Applicants</p>';
      html += applicants.map(function (applicant) {
        var name = applicant.fullName || ((applicant.firstName || '') + ' ' + (applicant.lastName || '')).trim() || 'Applicant';
        return '<button type="button" class="dash-search-item" role="option" data-kind="applicant" data-id="' + applicant.applicantId + '">' +
          '<span class="dash-search-title">' + esc(name) + '</span>' +
          '<span class="dash-search-meta">' + esc(courseLabel(applicant.courseName || 'Course')) + ' · ' + esc(applicant.applicationStatus || '') + '</span></button>';
      }).join('');
    }
    if (courses.length) {
      html += '<p class="dash-search-label">Courses</p>';
      html += courses.map(function (course) {
        var capacity = Number(course.capacity) || 0;
        var filled = Number(course.filledSlots) || 0;
        var remaining = typeof course.remainingSlots === 'number' ? course.remainingSlots : Math.max(0, capacity - filled);
        return '<button type="button" class="dash-search-item" role="option" data-kind="course" data-id="' + course.courseId + '">' +
          '<span class="dash-search-title">' + esc(courseLabel(course.courseName)) + '</span>' +
          '<span class="dash-search-meta">' + remaining + ' available slots</span></button>';
      }).join('');
    }
    if (batches.length) {
      html += '<p class="dash-search-label">Batches</p>';
      html += batches.map(function (batch) {
        return '<button type="button" class="dash-search-item" role="option" data-kind="batch" data-id="' + batch.batchId + '">' +
          '<span class="dash-search-title">' + esc(batch.batchName) + '</span>' +
          '<span class="dash-search-meta">' + esc(academicYear(batch)) + ' · ' + esc(batch.status || 'History') + '</span></button>';
      }).join('');
    }
    panel.innerHTML = html;
  }

  function bindDashboardSearch() {
    var form = document.getElementById('dashboard-search-form');
    var input = document.getElementById('dashboard-search');
    var panel = document.getElementById('dashboard-search-results');
    if (!form || !input || !panel) return;
    var timer;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      window.clearTimeout(timer);
      runDashboardSearch(input.value);
    });
    input.addEventListener('input', function () {
      window.clearTimeout(timer);
      var value = input.value;
      timer = window.setTimeout(function () { runDashboardSearch(value); }, 220);
    });
    panel.addEventListener('click', function (e) {
      var item = e.target.closest('.dash-search-item');
      if (!item) return;
      var kind = item.getAttribute('data-kind');
      var id = item.getAttribute('data-id');
      if (kind === 'applicant' && id) {
        window.location.href = 'ApplicantPage.html?id=' + encodeURIComponent(id);
        return;
      }
      if (kind === 'course') {
        window.location.href = 'CourseManagement.html';
        return;
      }
      if (kind === 'batch') {
        hideSearchResults();
        window.openBatchHistory();
      }
    });
    document.addEventListener('click', function (e) {
      if (!form.contains(e.target)) hideSearchResults();
    });
  }

  window.AbecDashboard = {
    filterApplicants: filterApplicants,
    refresh: async function () {
      await loadStats();
      await loadCourseFilter();
      await loadRecentApplicants();
      await refreshBatches();
    }
  };

  document.addEventListener('keydown', function (e) {
    var panel = document.getElementById('batch-menu-panel');
    var menuOpen = panel && !panel.hidden;
    if (menuOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End')) {
      e.preventDefault();
      moveBatchMenu(e.key);
      return;
    }
    if (e.key !== 'Escape') return;
    closeBatchMenu(menuOpen);
    hideSearchResults();
    ['modal-switch-batch', 'modal-change-batch', 'modal-complete-batch', 'modal-create-batch', 'modal-batch-history'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el || el.classList.contains('hidden')) return;
      if (id === 'modal-batch-history') closeBatchHistory();
      else hideModal(id);
    });
  });

  document.addEventListener('DOMContentLoaded', async function () {
    AbecApi.requireRole('Admin');
    bindDashboardSearch();
    var batchMenuBtn = document.getElementById('batch-menu-btn');
    if (batchMenuBtn) {
      batchMenuBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        toggleBatchMenu();
      });
      batchMenuBtn.addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowDown') return;
        e.preventDefault();
        var panel = document.getElementById('batch-menu-panel');
        if (panel && panel.hidden) toggleBatchMenu();
        else moveBatchMenu('ArrowDown');
      });
    }
    document.addEventListener('click', function (e) {
      var menu = document.querySelector('.batch-menu');
      if (menu && !menu.contains(e.target)) closeBatchMenu();
      var historyModal = document.getElementById('modal-batch-history');
      if (!historyModal || historyModal.classList.contains('hidden')) return;
      var historyPanel = historyModal.querySelector('.modal-panel');
      if (historyPanel && historyPanel.contains(e.target)) return;
      if (e.target.closest && e.target.closest('#btn-batch-history')) return;
      closeBatchHistory();
    });
    window.addEventListener('resize', function () {
      var historyModal = document.getElementById('modal-batch-history');
      if (historyModal && !historyModal.classList.contains('hidden')) placeBatchHistoryPopup();
    });
    try { localStorage.removeItem('abec-admin-batches-v2'); } catch (e) { /* ignore */ }
    try { localStorage.removeItem('abec-admin-batches'); } catch (e) { /* ignore */ }
    await window.AbecDashboard.refresh();
  });
})();
