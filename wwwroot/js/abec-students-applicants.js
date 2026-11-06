/* Students & Applicants management. Uses existing applicant, activation, and document APIs. */
(function () {
  'use strict';

  var PAGE_SIZE = 8;
  var ARCHIVE_REASONS = [
    'Graduated',
    'Deactivated',
    'Academic Dismissal',
    'Withdrawal',
    'Inactive Lead',
    'Other'
  ];

  var state = {
    records: [],
    courses: [],
    tab: 'applicants',
    page: 1,
    loading: false
  };

  function courseLabel(name) {
    return (window.AbecApi && AbecApi.displayCourseName) ? AbecApi.displayCourseName(name) : String(name || '');
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function nameOf(applicant) {
    return applicant.fullName || ((applicant.firstName || '') + ' ' + (applicant.lastName || '')).trim() || '—';
  }

  function categoryOf(record) {
    if (record.archived) return 'archived';
    if (record.studentId) return 'enrolled';
    return 'applicant';
  }

  function badge(record) {
    if (record.archived) return { label: 'Archived', cls: 'bg-slate-100 text-slate-600' };
    var status = String(record.applicationStatus || '');
    var key = status.toLowerCase();
    if (key === 'pending') return { label: status, cls: 'bg-orange-50 text-orange-700' };
    if (key === 'approved') return { label: status, cls: 'bg-emerald-50 text-emerald-700' };
    if (key === 'rejected' || key === 'declined') return { label: status, cls: 'bg-rose-50 text-rose-700' };
    if (key === 'waitlisted') return { label: status, cls: 'bg-violet-50 text-violet-700' };
    if (record.studentId || key.indexOf('confirm') >= 0) return { label: record.studentId ? 'Enrolled' : status, cls: 'bg-emerald-50 text-emerald-700' };
    return { label: status || '—', cls: 'bg-slate-100 text-slate-600' };
  }

  function contactLine(kind, value) {
    var text = String(value || '').trim() || 'N/A';
    var label = kind === 'email' ? 'Email address' : 'Contact number';
    var icon = kind === 'email'
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>';
    return '<span aria-label="' + label + '">' + icon + '<em>' + esc(text) + '</em></span>';
  }

  function contactCell(record) {
    return '<div class="records-contact">' + contactLine('email', record.email) + contactLine('phone', record.phone) + '</div>';
  }

  function setMessage(text, kind) {
    var el = document.getElementById('records-message');
    if (!el) return;
    if (!text) {
      el.classList.add('hidden');
      el.textContent = '';
      return;
    }
    el.className = 'records-message ' + (kind || 'info');
    el.textContent = text;
    if (window.AbecFeedback) {
      window.AbecFeedback.notify({
        type: kind === 'ok' || kind === 'success' ? 'success' : (kind === 'error' ? 'error' : 'info'),
        message: text
      });
    }
  }

  function readFilters() {
    return {
      q: ((document.getElementById('records-search') || {}).value || '').trim().toLowerCase(),
      status: (document.getElementById('records-status') || {}).value || 'all',
      course: (document.getElementById('records-course') || {}).value || 'all',
      sort: (document.getElementById('records-sort') || {}).value || 'date-desc'
    };
  }

  var sharedCourseName = 'all';

  function courseByName(name) {
    return state.courses.filter(function (course) { return course.courseName === name; })[0] || null;
  }

  function courseById(id) {
    return state.courses.filter(function (course) { return String(course.courseId) === String(id); })[0] || null;
  }

  function paintSharedCourse() {
    var name = sharedCourseName && sharedCourseName !== 'all' ? sharedCourseName : 'all';
    var course = name === 'all' ? null : courseByName(name);
    var applicantSelect = document.getElementById('course-filter');
    var recordsSelect = document.getElementById('records-course');
    if (applicantSelect && applicantSelect.value !== name) {
      var hasName = Array.prototype.some.call(applicantSelect.options, function (option) { return option.value === name; });
      if (hasName || name === 'all') applicantSelect.value = name;
    }
    if (recordsSelect) {
      var nextId = course ? String(course.courseId) : 'all';
      var hasId = Array.prototype.some.call(recordsSelect.options, function (option) { return option.value === nextId; });
      if (hasId || nextId === 'all') recordsSelect.value = nextId;
    }
    document.querySelectorAll('#slot-overview-grid .slot-card[data-course]').forEach(function (el) {
      var on = name !== 'all' && el.getAttribute('data-course') === name;
      el.classList.toggle('is-active', on);
      el.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function setSharedCourse(courseName) {
    sharedCourseName = courseName && courseName !== 'all' ? courseName : 'all';
    state.page = 1;
    window.applicantPage = 1;
    paintSharedCourse();
    if (typeof window.filterApplicants === 'function') window.filterApplicants();
    renderTable();
  }

  function matches(record, filters) {
    if (state.tab !== 'all' && state.tab !== 'applicants' && categoryOf(record) !== state.tab) return false;
    if (sharedCourseName && sharedCourseName !== 'all') {
      var selected = courseByName(sharedCourseName);
      var idMatch = selected && String(record.courseId) === String(selected.courseId);
      var nameMatch = record.course === sharedCourseName;
      if (!idMatch && !nameMatch) return false;
    } else if (filters.course !== 'all' && String(record.courseId) !== String(filters.course)) return false;
    if (filters.status !== 'all' && String(record.applicationStatus || '').toLowerCase() !== filters.status) return false;
    if (!filters.q) return true;
    var haystack = [
      record.name,
      record.applicantId,
      record.studentId,
      record.reference,
      record.course,
      record.email,
      record.phone
    ].join(' ').toLowerCase();
    return haystack.indexOf(filters.q) !== -1;
  }

  function sortRecords(list, sort) {
    var copy = list.slice();
    copy.sort(function (a, b) {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'course') return String(a.course || '').localeCompare(String(b.course || ''));
      if (sort === 'status') return String(a.applicationStatus).localeCompare(String(b.applicationStatus));
      var aTime = new Date(a.date || 0).getTime();
      var bTime = new Date(b.date || 0).getTime();
      return sort === 'date-asc' ? aTime - bTime : bTime - aTime;
    });
    return copy;
  }

  function visibleRecords() {
    var filters = readFilters();
    return sortRecords(state.records.filter(function (record) { return matches(record, filters); }), filters.sort);
  }

  function renderSummary() {
    var counts = { total: state.records.length, applicants: 0, pending: 0, approved: 0, enrolled: 0, rejected: 0 };
    state.records.forEach(function (record) {
      var category = categoryOf(record);
      if (category === 'applicant') counts.applicants += 1;
      if (category === 'enrolled') counts.enrolled += 1;
      var status = String(record.applicationStatus || '').toLowerCase();
      if (status === 'pending') counts.pending += 1;
      if (status === 'approved') counts.approved += 1;
      if (status === 'rejected' || status === 'declined') counts.rejected += 1;
    });
    Object.keys(counts).forEach(function (key) {
      var el = document.querySelector('[data-summary="' + key + '"]');
      if (el) el.textContent = String(counts[key]);
    });
  }

  function renderTable() {
    var body = document.getElementById('records-body');
    var empty = document.getElementById('records-empty');
    var pager = document.getElementById('records-pager');
    if (!body) return;
    if (state.loading) {
      body.innerHTML = '<tr><td colspan="5" class="px-5 py-10 text-center text-sm text-slate-500">Loading records…</td></tr>';
      if (empty) empty.classList.add('hidden');
      if (pager) pager.innerHTML = '';
      return;
    }
    var rows = visibleRecords();
    var pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    if (state.page > pages) state.page = pages;
    var start = (state.page - 1) * PAGE_SIZE;
    var pageRows = rows.slice(start, start + PAGE_SIZE);
    if (!pageRows.length) {
      body.innerHTML = '';
      if (empty) empty.classList.remove('hidden');
    } else if (empty) {
      empty.classList.add('hidden');
      body.innerHTML = pageRows.map(function (record) {
        var mark = badge(record);
        return '<tr class="records-row" data-applicant-id="' + record.applicantId + '">' +
          '<td class="px-4 py-3 text-sm font-semibold text-slate-800"><span class="records-name">' + esc(record.name) + '</span></td>' +
          '<td class="px-4 py-3 text-sm text-slate-600">' + esc(courseLabel(record.course) || '—') + '</td>' +
          '<td class="px-4 py-3 text-xs text-slate-600">' + contactCell(record) + '</td>' +
          '<td class="px-4 py-3 text-sm text-slate-600">' + esc(AbecApi.formatDate(record.date)) + '</td>' +
          '<td class="px-4 py-3"><span class="inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold ' + mark.cls + '">' + esc(mark.label) + '</span></td>' +
          '</tr>';
      }).join('');
    }
    if (pager) {
      pager.innerHTML = rows.length
        ? '<span>Showing ' + (start + 1) + '–' + Math.min(start + PAGE_SIZE, rows.length) + ' of ' + rows.length + '</span>' +
          '<span class="records-pager-actions">' +
          '<button type="button" data-page="prev"' + (state.page <= 1 ? ' disabled' : '') + '>Previous</button>' +
          '<button type="button" data-page="next"' + (state.page >= pages ? ' disabled' : '') + '>Next</button>' +
          '</span>'
        : '';
    }
  }

  function sameCourse(record, course, courseName) {
    if (course) {
      if (String(record.courseId) === String(course.courseId)) return true;
      if (record.course && record.course === course.courseName) return true;
    }
    return !!courseName && record.course === courseName;
  }

  function paintCourseStats() {
    document.querySelectorAll('#slot-overview-grid .slot-card[data-course]').forEach(function (card) {
      var courseName = card.getAttribute('data-course') || '';
      var course = courseByName(courseName) || courseById(card.getAttribute('data-course-id'));
      var capacity = course ? Number(course.capacity) : Number(card.getAttribute('data-capacity'));
      if (!isFinite(capacity) || capacity < 0) capacity = 0;
      var applied = 0;
      var enrolled = 0;
      var archived = 0;
      state.records.forEach(function (record) {
        if (!sameCourse(record, course, courseName)) return;
        applied += 1;
        var category = categoryOf(record);
        if (category === 'enrolled') enrolled += 1;
        else if (category === 'archived') archived += 1;
      });
      var count = applied;
      var text = applied + '/' + capacity + ' Available Slot' + (capacity === 1 ? '' : 's');
      if (state.tab === 'enrolled') {
        count = enrolled;
        text = enrolled + ' Enrolled Student' + (enrolled === 1 ? '' : 's');
      } else if (state.tab === 'archived') {
        count = archived;
        text = archived + ' Archived Record' + (archived === 1 ? '' : 's');
      }
      var line = card.querySelector('.slot-available');
      if (line) line.textContent = text;
      var bar = card.querySelector('.slot-progress > span');
      if (bar) {
        var pct = capacity > 0 ? Math.min(100, Math.round((count / capacity) * 100)) : 0;
        bar.style.width = pct + '%';
      }
    });
  }

  function render() {
    renderSummary();
    paintCourseStats();
    renderTable();
  }

  function fillCourses() {
    var select = document.getElementById('records-course');
    if (!select) return;
    var current = select.value || 'all';
    select.innerHTML = '<option value="all">All courses</option>' + state.courses.map(function (course) {
      return '<option value="' + course.courseId + '">' + esc(courseLabel(course.courseName)) + '</option>';
    }).join('');
    select.value = current;
    paintSharedCourse();
  }

  async function loadRecords() {
    state.loading = true;
    renderTable();
    setMessage('');
    var applicantsRes = await AbecApi.get('/api/applicants');
    var studentsRes = await AbecApi.get('/api/activations');
    var coursesRes = await AbecApi.get('/api/courses');
    state.loading = false;
    if (!applicantsRes.success) {
      state.records = [];
      render();
      setMessage(applicantsRes.message || 'Unable to load applicants.', 'error');
      return;
    }
    var students = studentsRes.success && studentsRes.data ? studentsRes.data : [];
    var byApplicant = {};
    students.forEach(function (student) {
      if (student && student.applicantId) byApplicant[student.applicantId] = student;
    });
    state.courses = coursesRes.success && coursesRes.data ? coursesRes.data.filter(function (course) { return course && course.courseName; }) : [];
    var seen = {};
    state.records = (applicantsRes.data || []).map(function (applicant) {
      var student = byApplicant[applicant.applicantId] || null;
      seen[applicant.applicantId] = true;
      return {
        applicantId: applicant.applicantId,
        studentId: student ? student.studentId : null,
        name: nameOf(applicant),
        course: applicant.courseName || (student && student.courseName) || '',
        courseId: applicant.courseId || (student && student.courseId) || '',
        email: applicant.email || (student && student.email) || '',
        phone: applicant.contactNumber || (student && student.contactNumber) || '',
        date: applicant.applicationDate || (student && student.applicationDate) || '',
        applicationStatus: applicant.applicationStatus || (student && student.applicationStatus) || '',
        accountStatus: student ? student.accountStatus : '',
        archived: !!(student && student.isArchived),
        enrolledAt: student ? student.createdAt : '',
        batchStart: student ? student.batchStartDate : '',
        batchEnd: student ? student.batchEndDate : '',
        reference: applicant.applicationReference || '',
        batchName: student ? student.batchName : '',
        address: applicant.address || (student && student.address) || ''
      };
    });
    students.forEach(function (student) {
      if (!student || seen[student.applicantId]) return;
      state.records.push({
        applicantId: student.applicantId,
        studentId: student.studentId,
        name: student.fullName || '—',
        course: student.courseName || '',
        courseId: student.courseId || '',
        email: student.email || '',
        phone: student.contactNumber || '',
        date: student.applicationDate || student.createdAt || '',
        applicationStatus: student.applicationStatus || '',
        accountStatus: student.accountStatus || '',
        archived: !!student.isArchived,
        enrolledAt: student.createdAt || '',
        batchStart: student.batchStartDate || '',
        batchEnd: student.batchEndDate || '',
        reference: '',
        batchName: student.batchName || '',
        address: student.address || ''
      });
    });
    if (!studentsRes.success) setMessage(studentsRes.message || 'Student accounts could not be loaded. Applicant records are still shown.', 'error');
    fillCourses();
    render();
  }

  function findRecord(applicantId) {
    return state.records.filter(function (record) { return String(record.applicantId) === String(applicantId); })[0] || null;
  }

  async function openDetails(applicantId) {
    var record = findRecord(applicantId);
    var modal = document.getElementById('record-modal');
    var body = document.getElementById('record-modal-body');
    if (!modal || !body || !record || !window.AbecProfile) return;
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    await AbecProfile.loadInto(body, applicantId, record, { actions: true });
  }

  function closeDetails() {
    var modal = document.getElementById('record-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
  }

  function openEdit(record, applicant) {
    var modal = document.getElementById('edit-modal');
    if (!modal || !record.studentId) return;
    document.getElementById('edit-student-id').value = record.studentId;
    document.getElementById('edit-applicant-id').value = record.applicantId;
    document.getElementById('edit-first').value = (applicant && applicant.firstName) || '';
    document.getElementById('edit-middle').value = (applicant && applicant.middleName) || '';
    document.getElementById('edit-last').value = (applicant && applicant.lastName) || '';
    document.getElementById('edit-suffix').value = (applicant && applicant.suffix) || '';
    document.getElementById('edit-email').value = record.email || '';
    document.getElementById('edit-phone').value = record.phone || '';
    document.getElementById('edit-address').value = record.address || '';
    modal.classList.remove('hidden');
  }

  function closeEdit() {
    var modal = document.getElementById('edit-modal');
    if (modal) modal.classList.add('hidden');
  }

  async function saveEdit(event) {
    event.preventDefault();
    var studentId = document.getElementById('edit-student-id').value;
    var applicantId = document.getElementById('edit-applicant-id').value;
    var result = await AbecApi.put('/api/student/' + encodeURIComponent(studentId) + '/profile', {
      firstName: document.getElementById('edit-first').value.trim(),
      middleName: document.getElementById('edit-middle').value.trim() || null,
      lastName: document.getElementById('edit-last').value.trim(),
      suffix: document.getElementById('edit-suffix').value.trim() || null,
      email: document.getElementById('edit-email').value.trim() || null,
      contactNumber: document.getElementById('edit-phone').value.trim() || null,
      address: document.getElementById('edit-address').value.trim() || null
    });
    setMessage(result.message || (result.success ? 'Information saved.' : 'Unable to save information.'), result.success ? 'ok' : 'error');
    if (!result.success) return;
    closeEdit();
    closeDetails();
    await loadRecords();
    openDetails(applicantId);
  }

  function openArchive(record) {
    var modal = document.getElementById('archive-modal');
    if (!modal) return;
    document.getElementById('archive-student-id').value = record.studentId;
    document.getElementById('archive-applicant-id').value = record.applicantId;
    document.getElementById('archive-reason').value = '';
    document.getElementById('archive-specific').value = '';
    modal.classList.remove('hidden');
  }

  function closeArchive() {
    var modal = document.getElementById('archive-modal');
    if (modal) modal.classList.add('hidden');
  }

  async function saveArchive(event) {
    event.preventDefault();
    var reason = document.getElementById('archive-reason').value;
    var specific = document.getElementById('archive-specific').value.trim();
    if (!reason) {
      setMessage('Select an archive reason.', 'error');
      return;
    }
    if (reason === 'Other' && !specific) {
      setMessage('Enter a specific reason when the archive reason is Other.', 'error');
      return;
    }
    var studentId = document.getElementById('archive-student-id').value;
    var result = await AbecApi.post('/api/activations/' + encodeURIComponent(studentId) + '/deactivate', {
      archiveReason: reason,
      specificReason: specific || null
    });
    setMessage(result.message || (result.success ? 'Record archived.' : 'Unable to archive this record.'), result.success ? 'ok' : 'error');
    if (!result.success) return;
    closeArchive();
    closeDetails();
    await loadRecords();
  }

  async function restoreRecord(record) {
    if (!record.studentId) return;
    if (!(await window.AbecFeedback.confirm({
      title: 'Restore record',
      message: 'Restore this archived student account to active records?',
      confirmLabel: 'Restore'
    }))) return;
    var result = await AbecApi.post('/api/activations/' + encodeURIComponent(record.studentId) + '/reactivate', {});
    setMessage(result.message || (result.success ? 'Record restored.' : 'Unable to restore this record.'), result.success ? 'ok' : 'error');
    if (!result.success) return;
    closeDetails();
    await loadRecords();
  }

  function syncBoard() {
    var review = state.tab === 'applicants';
    var reviewPanel = document.getElementById('review-panel');
    var recordsPanel = document.getElementById('records-panel');
    var applicantTools = document.getElementById('applicant-tools');
    var recordsTools = document.getElementById('records-tools');
    if (reviewPanel) reviewPanel.classList.toggle('hidden', !review);
    if (recordsPanel) recordsPanel.classList.toggle('hidden', review);
    if (applicantTools) applicantTools.classList.toggle('hidden', !review);
    if (recordsTools) recordsTools.classList.toggle('hidden', review);
    var addApplicant = document.getElementById('add-applicant-btn');
    if (addApplicant) addApplicant.classList.toggle('is-hidden', !review);
  }

  function applyQuery() {
    var params = new URLSearchParams(window.location.search);
    var tab = params.get('tab');
    var q = params.get('q');
    var id = params.get('id');
    if (tab === 'applicant' || tab === 'all') tab = 'applicants';
    if ((params.get('status') || id) && tab !== 'enrolled' && tab !== 'archived') tab = 'applicants';
    if (tab && document.querySelector('[data-tab="' + tab + '"]')) state.tab = tab;
    if (q && state.tab !== 'applicants') {
      var search = document.getElementById('records-search');
      if (search) search.value = q;
    }
    document.querySelectorAll('[data-tab]').forEach(function (button) {
      button.classList.toggle('is-active', button.getAttribute('data-tab') === state.tab);
      button.setAttribute('aria-selected', button.getAttribute('data-tab') === state.tab ? 'true' : 'false');
    });
    syncBoard();
    return state.tab === 'applicants' ? null : id;
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!window.AbecApi || !AbecApi.requireRole('Admin')) return;
    var openId = applyQuery();
    loadRecords().then(function () {
      if (openId) openDetails(openId);
    });

    document.getElementById('records-search').addEventListener('input', function () { state.page = 1; renderTable(); });
    document.getElementById('records-course').addEventListener('change', function () {
      var selected = courseById(this.value);
      setSharedCourse(selected ? selected.courseName : 'all');
    });
    document.getElementById('records-sort').addEventListener('change', function () { state.page = 1; renderTable(); });
    document.getElementById('records-tabs').addEventListener('click', function (event) {
      var button = event.target.closest('[data-tab]');
      if (!button) return;
      state.tab = button.getAttribute('data-tab');
      state.page = 1;
      document.querySelectorAll('[data-tab]').forEach(function (item) {
        var active = item === button;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      syncBoard();
      paintCourseStats();
      renderTable();
    });
    document.getElementById('records-body').addEventListener('click', function (event) {
      if (event.target.closest('a, button, input, select, textarea, label')) return;
      var row = event.target.closest('.records-row');
      if (!row) return;
      openDetails(row.getAttribute('data-applicant-id'));
    });
    document.getElementById('records-pager').addEventListener('click', function (event) {
      var button = event.target.closest('[data-page]');
      if (!button || button.disabled) return;
      state.page += button.getAttribute('data-page') === 'next' ? 1 : -1;
      renderTable();
    });
    document.getElementById('record-modal-close').addEventListener('click', closeDetails);
    document.getElementById('record-modal').addEventListener('click', function (event) {
      if (event.target.id === 'record-modal') closeDetails();
    });
    document.getElementById('edit-form').addEventListener('submit', saveEdit);
    document.getElementById('edit-cancel').addEventListener('click', closeEdit);
    document.getElementById('archive-form').addEventListener('submit', saveArchive);
    document.getElementById('archive-cancel').addEventListener('click', closeArchive);
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        closeArchive();
        closeEdit();
        closeDetails();
      }
    });
  });

  window.AbecRecords = {
    reload: function () { return loadRecords(); },
    getCourse: function () { return sharedCourseName; },
    setCourse: setSharedCourse,
    paintCourseStats: paintCourseStats,
    getRecord: findRecord,
    openArchive: openArchive,
    restoreRecord: restoreRecord
  };
})();
