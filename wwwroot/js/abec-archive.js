/* Archive page ↔ archives API (same records created by Account Activation deactivate) */
(function () {
  'use strict';
  if (!window.AbecApi) return;

  var ARCHIVE_REASONS = [
    'Graduated',
    'Deactivated',
    'Academic Dismissal',
    'Withdrawal',
    'Inactive Lead',
    'Rejected Slots',
    'Other'
  ];

  var KNOWN_REASONS = [
    'Graduated',
    'Deactivated',
    'Academic Dismissal',
    'Withdrawal',
    'Inactive Lead',
    'Rejected Slots'
  ];
  var STATUS_CARDS = [
    { key: 'all', label: 'All Students' },
    { key: 'Graduated', label: 'Graduated' },
    { key: 'Deactivated', label: 'Deactivated' },
    { key: 'Academic Dismissal', label: 'Academic Dismissal' },
    { key: 'Withdrawal', label: 'Withdrawal' },
    { key: 'Inactive Lead', label: 'Inactive Lead' },
    { key: 'Rejected Slots', label: 'Rejected Slots' },
    { key: 'Other', label: 'Others' }
  ];

  var reasonStyles = {
    Graduated: 'bg-sky-50 text-sky-700',
    Deactivated: 'bg-slate-100 text-slate-600',
    'Academic Dismissal': 'bg-rose-50 text-rose-700',
    Withdrawal: 'bg-amber-50 text-amber-700',
    'Inactive Lead': 'bg-violet-50 text-violet-700',
    'Rejected Slots': 'bg-cyan-50 text-cyan-700',
    Other: 'bg-orange-50 text-orange-700'
  };

  var activeStatus = 'all';
  var activeCourse = 'all';
  var searchQuery = '';
  var archives = [];
  var courses = [];

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function initials(name) {
    return AbecApi.initials(name || '?');
  }

  function reasonBadge(reason, label) {
    var cls = reasonStyles[reason] || 'bg-slate-100 text-slate-600';
    return '<span class="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase px-2.5 py-1 rounded-full ' + cls + '">' +
      '<span class="w-1.5 h-1.5 rounded-full bg-current opacity-80"></span>' + esc(label || reason) +
      '</span>';
  }

  function accountStatusBadge(status) {
    var label = status || 'Inactive';
    var cls = label === 'Active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600';
    return '<span class="inline-flex items-center text-[10px] font-bold uppercase px-2.5 py-1 rounded-full ' + cls + '">' + esc(label) + '</span>';
  }

  function mapRecord(a) {
    var name = a.studentName || 'Student';
    var reason = a.archiveReason || 'Other';
    var specific = a.specificReason || '';
    var displayReason = (window.AbecOtherReason
      ? AbecOtherReason.formatDisplay(reason, specific)
      : (specific ? reason + ' — ' + specific : reason));
    return {
      id: String(a.archiveId),
      archiveId: a.archiveId,
      studentId: a.studentId,
      name: name,
      gmail: a.email || '—',
      email: a.email || '—',
      phone: a.contactNumber || '—',
      address: a.address || '—',
      course: a.courseName || '—',
      courseKey: String(a.courseName || '').trim().toLowerCase(),
      archiveDateRaw: a.archiveDate || '',
      courseMeta: a.confirmationStatus || a.applicationStatus || '',
      batch: a.batchName || '—',
      status: a.accountStatus || 'Inactive',
      reason: reason,
      specificReason: specific,
      displayReason: displayReason,
      date: AbecApi.formatDate(a.archiveDate),
      createdAt: a.createdAt ? AbecApi.formatDate(a.createdAt) : '—',
      initials: initials(name),
      avatar: 'bg-abec-navy text-white',
      photo: null
    };
  }

  function courseLabel(name) {
    if (!name || name === '—') return '—';
    return AbecApi.displayCourseName ? AbecApi.displayCourseName(name) : name;
  }

  function uniqueStudents(list) {
    var byStudent = {};
    list.forEach(function (row) {
      var key = String(row.studentId);
      var current = byStudent[key];
      if (!current || String(row.archiveDateRaw) > String(current.archiveDateRaw)) byStudent[key] = row;
    });
    return Object.keys(byStudent).map(function (key) { return byStudent[key]; });
  }

  function isOther(reason) {
    return KNOWN_REASONS.indexOf(reason) < 0;
  }

  function matchesStatus(row, status) {
    if (!status || status === 'all') return true;
    if (status === 'Other') return isOther(row.reason);
    return row.reason === status;
  }

  function matchesCourse(row, course) {
    if (!course || course === 'all') return true;
    return row.courseKey === String(course).trim().toLowerCase();
  }

  function matchesSearch(row) {
    var q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    var haystack = [row.name, row.gmail, row.studentId, row.course, courseLabel(row.course), row.reason].join(' ').toLowerCase();
    return haystack.indexOf(q) >= 0;
  }

  function statusRows() {
    return uniqueStudents(archives).filter(function (row) { return matchesStatus(row, activeStatus); });
  }

  function visibleRows() {
    return statusRows().filter(function (row) {
      return matchesCourse(row, activeCourse) && matchesSearch(row);
    }).sort(function (a, b) {
      return String(b.archiveDateRaw).localeCompare(String(a.archiveDateRaw));
    });
  }

  function renderStatusCards() {
    var host = document.getElementById('archive-status-grid');
    if (!host) return;
    var people = uniqueStudents(archives);
    host.innerHTML = STATUS_CARDS.map(function (card) {
      var count = people.filter(function (row) { return matchesStatus(row, card.key); }).length;
      var active = activeStatus === card.key;
      return '<button type="button" class="archive-status' + (active ? ' is-active' : '') + '" role="tab" aria-selected="' + (active ? 'true' : 'false') + '" data-status="' + esc(card.key) + '">' +
        '<p>' + esc(card.label) + '</p><strong>' + count + '</strong></button>';
    }).join('');
  }

  function renderCourseCards() {
    var host = document.getElementById('archive-course-grid');
    if (!host) return;
    var pool = statusRows();
    var items = [{ name: 'all', label: 'All Courses' }].concat(courses.map(function (course) {
      return { name: course.courseName, label: courseLabel(course.courseName) };
    }));
    host.innerHTML = items.map(function (item) {
      var count = pool.filter(function (row) { return matchesCourse(row, item.name); }).length;
      var active = activeCourse === 'all' ? item.name === 'all' : item.name !== 'all' && matchesCourse({ courseKey: String(item.name).trim().toLowerCase() }, activeCourse);
      return '<button type="button" class="archive-course' + (active ? ' is-active' : '') + '" data-course="' + esc(item.name) + '" aria-pressed="' + (active ? 'true' : 'false') + '">' +
        '<strong>' + count + '</strong><span>' + esc(item.label) + '</span></button>';
    }).join('');
  }

  function renderTable() {
    var tbody = document.getElementById('archive-tbody');
    var count = document.getElementById('archive-count');
    if (!tbody) return;
    var rows = visibleRows();
    if (count) count.textContent = rows.length + (rows.length === 1 ? ' student' : ' students');
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="px-5 py-12 text-center text-sm text-slate-400">' +
        (searchQuery.trim() ? 'No archived students match this search.' : 'No archived students match this status and course.') +
        '</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(function (r) {
      return (
        '<tr class="archive-row" data-id="' + esc(r.id) + '">' +
          '<td><div class="flex items-center gap-3 min-w-0"><span class="w-10 h-10 rounded-full ' + r.avatar + ' text-xs font-bold flex items-center justify-center shrink-0">' + esc(r.initials) + '</span>' +
            '<div class="min-w-0"><p class="font-bold text-abec-blue truncate">' + esc(r.name) + '</p><p class="text-xs text-slate-400 truncate">' + esc(r.gmail) + '</p></div></div></td>' +
          '<td><p class="font-medium" style="overflow-wrap:anywhere">' + esc(courseLabel(r.course)) + '</p></td>' +
          '<td>' + reasonBadge(r.reason, r.displayReason || r.reason) + '</td>' +
          '<td class="text-slate-500">' + esc(r.date) + '</td>' +
        '</tr>'
      );
    }).join('');
    tbody.querySelectorAll('.archive-row').forEach(function (row) {
      row.addEventListener('click', function () { openStudentProfile(row.getAttribute('data-id')); });
    });
  }

  function renderBoard() {
    renderStatusCards();
    renderCourseCards();
    renderTable();
  }

  function selectStatus(status) {
    activeStatus = status || 'all';
    renderBoard();
  }

  function selectCourse(course) {
    activeCourse = course || 'all';
    renderBoard();
  }

  async function openArchiveDocuments() {
    var modal = document.getElementById('archive-docs-modal');
    var body = document.getElementById('archive-docs-body');
    if (!modal || !body) return;
    body.innerHTML = '<tr><td colspan="5" class="px-5 py-10 text-center text-sm text-slate-400">Loading rejected documents…</td></tr>';
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    var result = await AbecApi.get('/api/document-requests');
    var rows = (result.success ? (result.data || []) : []).filter(function (row) {
      return String(row.requestStatus || '') === 'Rejected';
    });
    if (!result.success) {
      body.innerHTML = '<tr><td colspan="5" class="px-5 py-10 text-center text-sm text-rose-600">' + esc(result.message || 'Rejected documents could not be loaded.') + '</td></tr>';
      return;
    }
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="5" class="px-5 py-10 text-center text-sm text-slate-400">No rejected document requests are in the archive.</td></tr>';
      return;
    }
    body.innerHTML = rows.map(function (row) {
      var reason = row.specificReason ? (row.reason || '') + ' · ' + row.specificReason : (row.reason || '—');
      return '<tr>' +
        '<td class="px-5 py-4"><p class="font-bold text-abec-blue">' + esc(row.studentName || 'Student') + '</p><p class="text-xs text-slate-400">' + esc(row.email || '') + '</p></td>' +
        '<td class="px-5 py-4">' + esc(row.documentType || '—') + '</td>' +
        '<td class="px-5 py-4"><span class="inline-flex text-[10px] font-bold uppercase px-2.5 py-1 rounded-full" style="background:#f3e8ff;color:#6b21a8">' + esc(row.requestStatus) + '</span></td>' +
        '<td class="px-5 py-4 text-slate-500">' + esc(AbecApi.formatDate(row.requestDate)) + '</td>' +
        '<td class="px-5 py-4 text-slate-500">' + esc(reason) + '</td>' +
      '</tr>';
    }).join('');
  }

  function closeArchiveDocuments() {
    var modal = document.getElementById('archive-docs-modal');
    if (modal) modal.classList.add('hidden');
    if (document.getElementById('batch-history-modal').classList.contains('hidden') && document.getElementById('student-profile-modal').classList.contains('hidden')) {
      document.body.style.overflow = '';
    }
  }

  function openStudentProfile(id) {
    var student = archives.find(function (s) { return String(s.id) === String(id); });
    if (!student) return;

    var avatarEl = document.getElementById('profile-avatar');
    if (avatarEl) {
      avatarEl.style.backgroundImage = '';
      avatarEl.className = 'w-12 h-12 rounded-full ' + student.avatar + ' flex items-center justify-center text-sm font-bold shrink-0';
      avatarEl.textContent = student.initials;
    }

    var setText = function (id, value) {
      var el = document.getElementById(id);
      if (el) el.textContent = value;
    };

    setText('profile-name', student.name);
    setText('profile-gmail', student.gmail);

    var statusEl = document.getElementById('profile-status');
    if (statusEl) {
      var accountCls = student.status === 'Active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600';
      statusEl.className = 'inline-flex items-center gap-1.5 text-[10px] font-bold uppercase px-2.5 py-1 rounded-full ' + accountCls;
      statusEl.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-current opacity-80"></span>' + esc(student.status || 'Inactive');
    }

    setText('profile-date', student.date);
    setText('profile-course', courseLabel(student.course));
    setText('profile-course-meta', student.courseMeta || ('Account: ' + student.status));
    setText('profile-phone', student.phone || '—');
    setText('profile-batch', student.batch || '—');
    setText('profile-reason', student.displayReason || student.reason || '—');

    var modal = document.getElementById('student-profile-modal');
    if (modal) {
      modal.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
    }
  }

  function filterArchive(filter) {
    var legacy = {
      all: 'all',
      graduated: 'Graduated',
      deactivated: 'Deactivated',
      dismissal: 'Academic Dismissal',
      withdrawal: 'Withdrawal',
      inactive: 'Inactive Lead',
      other: 'Other'
    };
    selectStatus(legacy[filter] || filter || 'all');
  }

  async function loadArchives() {
    var results = await Promise.all([
      AbecApi.get('/api/archives'),
      AbecApi.get('/api/courses')
    ]);
    archives = results[0].success ? (results[0].data || []).map(mapRecord) : [];
    courses = results[1].success ? (results[1].data || []) : [];
    window.archives = archives;
    renderBoard();
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!document.getElementById('archive-tbody')) return;
    AbecApi.requireRole('Admin');

    window.filterArchive = filterArchive;
    window.openStudentProfile = function (id) { openStudentProfile(id); };
    document.getElementById('archive-status-grid').addEventListener('click', function (event) {
      var button = event.target.closest('[data-status]');
      if (button) selectStatus(button.getAttribute('data-status'));
    });
    document.getElementById('archive-course-grid').addEventListener('click', function (event) {
      var button = event.target.closest('[data-course]');
      if (button) selectCourse(button.getAttribute('data-course'));
    });
    document.getElementById('archive-search').addEventListener('input', function (event) {
      searchQuery = event.target.value || '';
      renderTable();
    });
    document.getElementById('archive-docs-open').addEventListener('click', openArchiveDocuments);
    document.getElementById('archive-docs-modal').addEventListener('click', function (event) {
      if (event.target.id === 'archive-docs-modal' || event.target.closest('[data-docs-close]')) closeArchiveDocuments();
    });

    loadArchives();
  });
})();
