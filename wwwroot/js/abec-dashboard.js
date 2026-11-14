/* Admin dashboard: current statistics, recent applicants and search. */
(function () {
  'use strict';
  if (!window.AbecApi) return;

  var activeBatch = null;
  var historyBatches = [];

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
      var status = /^(confirmed|confirmed slot)$/i.test(a.applicationStatus || '') ? 'Confirmed' : (a.applicationStatus || '—');
      var initials = AbecApi.initials(name);
      return (
        '<button type="button" class="dashboard-applicant-row w-full text-left px-5 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors group" ' +
          'data-course="' + esc(course) + '" data-applicant-id="' + id + '" onclick="openDashboardApplicant(' + id + ')">' +
          '<span class="w-9 h-9 rounded-full bg-slate-100 text-abec-navy text-xs font-bold flex items-center justify-center shrink-0">' + esc(initials) + '</span>' +
          '<span class="min-w-0 flex-1">' +
            '<span class="block text-sm font-semibold text-slate-800 truncate group-hover:text-abec-blue">' + esc(name) + '</span>' +
            '<span class="block text-[12px] text-slate-600 mt-0.5 leading-snug">' + esc(courseLabel(course)) + '</span>' +
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

  async function refreshBatches() {
    var activeRes = await AbecApi.get('/api/batches/active');
    activeBatch = activeRes.success ? (activeRes.data || null) : null;
    var badge = document.getElementById('dashboard-active-batch');
    if (badge) {
      badge.textContent = !activeRes.success ? 'Active batch unavailable' :
        activeBatch ? 'Active Batch \u00b7 ' + activeBatch.batchName : 'No active batch';
      badge.hidden = false;
    }
    var historyRes = await AbecApi.get('/api/batches/history');
    historyBatches = historyRes.success && historyRes.data ? historyRes.data : [];
  }

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
        window.location.href = 'BatchManagement.html?history=1';
      }
    });
    document.addEventListener('click', function (e) {
      if (!form.contains(e.target)) hideSearchResults();
    });
  }

  window.AbecDashboard = {
    filterApplicants: filterApplicants,
    refresh: async function () {
      searchSeq++;
      hideSearchResults();
      await loadStats();
      await loadCourseFilter();
      await loadRecentApplicants();
      await refreshBatches();
    }
  };

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') hideSearchResults();
  });
  document.addEventListener('DOMContentLoaded', async function () {
    AbecApi.requireRole('Admin');
    bindDashboardSearch();
    await window.AbecDashboard.refresh();
  });
})();
