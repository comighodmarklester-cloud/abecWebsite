/* Document Management: applicants, enrolled students, and archived students. */
(function () {
  'use strict';
  if (!window.AbecApi) return;
  var historyBatchId = null;
  var initialHistorySnapshot = null;
  var initialized = false;
  var templateLoad = null;

  function activeBatchPath(path) {
    if (!state.batchId || !/^\/api\/(applicants|activations|archives|document-requests|course-documents)(\/|\?|$)/.test(path)) return path;
    var url = new URL(path, location.origin);
    url.searchParams.set('batchId', state.batchId);
    return url.pathname + url.search;
  }
  var scopedApi = {};
  ['get', 'post', 'put', 'postForm', 'request'].forEach(function (method) {
    scopedApi[method] = function (path) {
      var args = Array.prototype.slice.call(arguments);
      args[0] = activeBatchPath(path);
      return AbecApi[method].apply(AbecApi, args);
    };
  });

  var CREDENTIALS = [
    { key: 'Form138', name: 'Form 138' },
    { key: 'TOR', name: 'Transcript of Records' },
    { key: 'HonorableDismissal', name: 'Honorable Dismissal' },
    { key: 'GoodMoral', name: 'Certificate of Good Moral Character' },
    { key: 'BirthCertificate', name: 'Birth Certificate (PSA)' }
  ];
  var REQUESTABLE = [
    'National Certificate (TESDA)',
    'Payment Receipt',
    'Certificate of Completion'
  ];
  var REQUEST_STATUSES = ['Pending', 'Processing', 'On Hold', 'Released', 'Rejected'];
  var STATUS_ACTIONS = [
    { label: 'Processing', next: 'Processing' },
    { label: 'On Hold', next: 'On Hold' },
    { label: 'Release', next: 'Released' },
    { label: 'Reject', next: 'Rejected' }
  ];
  var ALLOWED_NEXT = {
    'Pending': ['Processing', 'On Hold'],
    'Processing': ['On Hold', 'Released'],
    'On Hold': ['Processing', 'Rejected'],
    'Ready for Release': ['On Hold', 'Released'],
    'Released': [],
    'Rejected': []
  };
  var STATUS_MEANING = {
    'Pending': 'Submitted and awaiting processing.',
    'Processing': 'Currently being prepared or verified.',
    'On Hold': 'Processing is temporarily paused.',
    'Released': 'Officially released to the student.',
    'Rejected': 'This request was rejected and cannot be changed.'
  };
  var REVIEW_STATUSES = ['Pending', 'Approved', 'Waitlisted', 'Rejected'];

  var state = {
    tab: 'applicants',
    batchId: '',
    readOnly: true, loadVersion: 0,
    loading: true,
    error: '',
    notice: '',
    applicants: [],
    students: [],
    courses: [],
    archives: [],
    docsReady: false,
    docsByApplicant: {},
    requestsReady: false,
    requestList: [],
    requestsByStudent: {},
    archiveByStudent: {},
    openKey: '',
    queueOpen: false,
    openRequestId: 0,
    confirm: null,
    savingStatus: false,
    uploading: false,
    queueFilters: { q: '', type: '', status: '' },
    releaseBoard: null,
    boardLoading: false,
    filters: { q: '', course: '', status: '', docs: '', type: '', requests: '', archive: '' }
  };

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function courseLabel(name) {
    return AbecApi.displayCourseName ? AbecApi.displayCourseName(name) : String(name || '');
  }

  function formatDate(value) {
    return AbecApi.formatDate ? AbecApi.formatDate(value) : (value || '—');
  }

  function na(value) {
    var text = String(value == null ? '' : value).trim();
    return text ? text : 'N/A';
  }

  function credentialKey(doc) {
    var raw = String((doc && (doc.documentLabel || doc.originalFileName)) || '');
    var compact = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (compact.indexOf('form138') >= 0) return 'Form138';
    if (compact === 'tor' || compact.indexOf('transcript') >= 0) return 'TOR';
    if (compact.indexOf('honorable') >= 0 || compact.indexOf('dismissal') >= 0) return 'HonorableDismissal';
    if (compact.indexOf('goodmoral') >= 0) return 'GoodMoral';
    if (compact.indexOf('birthcertificate') >= 0 || compact === 'psa') return 'BirthCertificate';
    return '';
  }

  function credentialSet(applicantId) {
    var rows = state.docsByApplicant[String(applicantId)] || [];
    var found = {};
    rows.forEach(function (doc) {
      var key = credentialKey(doc);
      if (!key) return;
      var current = found[key];
      if (!current || (current.isFollowUp && !doc.isFollowUp) ||
          (!!current.isFollowUp === !!doc.isFollowUp && String(doc.uploadedAt || '') > String(current.uploadedAt || ''))) found[key] = doc;
    });
    return CREDENTIALS.map(function (item) {
      var doc = found[item.key] || null;
      var status = !state.docsReady ? 'Unavailable' : (doc ? (doc.isFollowUp ? 'Pending (Follow up)' : 'Submitted') : 'Missing');
      return { key: item.key, name: item.name, status: status, doc: doc };
    });
  }

  function sameDocument(left, right) {
    function canon(value) {
      var text = String(value || '').trim().toLowerCase();
      if (text.indexOf('training') >= 0 && text.indexOf('certificate') >= 0 && text.indexOf('completion') < 0) {
        return 'certificate of completion';
      }
      return text;
    }
    return canon(left) === canon(right);
  }

  function requestSet(studentId) {
    var rows = state.requestsByStudent[String(studentId)] || [];
    return REQUESTABLE.map(function (name) {
      var matches = rows.filter(function (row) {
        return sameDocument(row.documentType, name);
      });
      matches.sort(function (a, b) { return String(b.requestDate || '').localeCompare(String(a.requestDate || '')); });
      var active = matches.filter(function (row) { return row.requestStatus !== 'Released'; })[0] || matches[0] || null;
      if (!state.requestsReady) return { name: name, status: 'Unavailable', request: null };
      if (!active) return { name: name, status: 'Not Requested', request: null };
      return { name: name, status: visibleStatus(active.requestStatus) || 'Pending', request: active };
    });
  }

  function applicationCode(applicant) {
    if (!applicant) return '—';
    if (applicant.applicationReference) return applicant.applicationReference;
    var year = applicant.applicationDate ? new Date(applicant.applicationDate).getFullYear() : new Date().getFullYear();
    return 'ABEC-' + year + '-' + String(applicant.applicantId).padStart(4, '0');
  }

  function studentByApplicant(applicantId) {
    return state.students.filter(function (student) {
      return String(student.applicantId) === String(applicantId);
    })[0] || null;
  }

  function applicantById(applicantId) {
    return state.applicants.filter(function (applicant) {
      return String(applicant.applicantId) === String(applicantId);
    })[0] || null;
  }

  function sectionRows() {
    if (state.tab === 'applicants') {
      return state.applicants.filter(function (applicant) {
        return !studentByApplicant(applicant.applicantId);
      }).map(function (applicant) {
        return { kind: 'applicant', applicant: applicant, student: null };
      });
    }
    return state.students.filter(function (student) {
      return state.tab === 'archived' ? !!student.isArchived : !student.isArchived;
    }).map(function (student) {
      return { kind: state.tab === 'archived' ? 'archived' : 'enrolled', applicant: applicantById(student.applicantId), student: student };
    });
  }

  function rowId(row) {
    if (row.student) return String(row.student.studentId);
    return applicationCode(row.applicant);
  }

  function rowName(row) {
    return (row.applicant && row.applicant.fullName) || (row.student && row.student.fullName) || '—';
  }

  function rowCourseId(row) {
    return (row.applicant && row.applicant.courseId) || (row.student && row.student.courseId) || '';
  }

  function rowCourse(row) {
    return courseLabel((row.applicant && row.applicant.courseName) || (row.student && row.student.courseName) || '');
  }

  function rowEmail(row) {
    return (row.applicant && row.applicant.email) || (row.student && row.student.email) || '';
  }

  function rowPhone(row) {
    return (row.applicant && row.applicant.contactNumber) || (row.student && row.student.contactNumber) || '';
  }

  function matchesQuery(row) {
    var q = state.filters.q.trim().toLowerCase();
    if (!q) return true;
    var applicantId = row.applicant ? String(row.applicant.applicantId) : '';
    var studentId = row.student ? String(row.student.studentId) : '';
    var haystack = [
      rowId(row), applicantId, studentId, rowName(row), rowEmail(row), rowPhone(row),
      row.applicant && row.applicant.applicationReference
    ].join(' ').toLowerCase();
    return haystack.indexOf(q) >= 0;
  }

  function filteredRows() {
    return sectionRows().filter(function (row) {
      if (!matchesQuery(row)) return false;
      if (state.filters.course && String(rowCourseId(row)) !== String(state.filters.course)) return false;
      if (state.tab === 'applicants') {
        if (state.filters.status && String(row.applicant.applicationStatus || '') !== state.filters.status) return false;
      } else if (state.tab === 'enrolled') {
        if (state.filters.status && String(row.student.accountStatus || '') !== state.filters.status) return false;
        var requests = requestSet(row.student.studentId);
        if (state.filters.requests === 'Not Requested' && requests.some(function (item) { return item.request; })) return false;
        if (state.filters.requests && state.filters.requests !== 'Not Requested' && !requests.some(function (item) { return visibleStatus(item.status) === state.filters.requests; })) return false;
      } else if (state.filters.archive) {
        var archive = state.archiveByStudent[String(row.student.studentId)];
        if (!archive || archive.archiveReason !== state.filters.archive) return false;
      }
      return true;
    });
  }

  function badge(text, tone) {
    return '<span class="doc-badge doc-badge-' + tone + '">' + esc(text || '—') + '</span>';
  }

  function visibleStatus(status) {
    return String(status || '').toLowerCase() === 'ready for release' ? 'Processing' : (status || '');
  }

  function statusTone(status) {
    var key = String(status || '').toLowerCase();
    if (key === 'pending' || key === 'pending (follow up)') return 'pending';
    if (key === 'processing') return 'processing';
    if (key === 'on hold') return 'hold';
    if (key === 'ready for release') return 'ready';
    if (key === 'released') return 'released';
    if (key === 'rejected') return 'rejected';
    if (key === 'submitted' || key === 'approved' || key === 'active' || key === 'confirmed slot' || key === 'confirmed') return 'ok';
    if (key === 'missing' || key === 'declined' || key === 'inactive') return 'bad';
    if (key === 'waitlisted') return 'wait';
    if (key === 'not requested' || key === 'not prepared') return 'muted';
    return 'muted';
  }

  function statusTheme(status) {
    var tone = statusTone(status);
    return ['pending', 'processing', 'hold', 'ready', 'released', 'rejected'].indexOf(tone) >= 0 ? tone : 'pending';
  }

  function showToast(text, kind) {
    window.AbecFeedback.notify({ message: text, type: kind });
  }

  function setNotice(text, kind) {
    state.notice = '';
    window.AbecFeedback.inline(document.getElementById('doc-notice'), '', kind);
    window.AbecFeedback.inline(document.getElementById('doc-queue-notice'), '', kind);
    showToast(text, kind);
  }

  function readFilters() {
    var previousCourse = state.filters.course;
    state.filters.q = (document.getElementById('doc-search') || {}).value || '';
    state.filters.course = (document.getElementById('doc-course') || {}).value || '';
    state.filters.status = (document.getElementById('doc-status') || {}).value || '';
    state.filters.docs = (document.getElementById('doc-docs') || {}).value || '';
    state.filters.type = (document.getElementById('doc-type') || {}).value || '';
    state.filters.requests = (document.getElementById('doc-requests') || {}).value || '';
    state.filters.archive = (document.getElementById('doc-archive') || {}).value || '';
    render();
    if (String(previousCourse) !== String(state.filters.course)) loadReleaseBoard();
  }

  function resetFilters(keepCourse) {
    ['doc-search', 'doc-status', 'doc-docs', 'doc-type', 'doc-requests', 'doc-archive'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = '';
    });
    var course = keepCourse ? state.filters.course : '';
    var courseSelect = document.getElementById('doc-course');
    if (courseSelect && !keepCourse) courseSelect.value = '';
    state.filters = { q: '', course: course, status: '', docs: '', type: '', requests: '', archive: '' };
    if (!keepCourse) state.releaseBoard = null;
    render();
  }

  function clearFilters() {
    resetFilters(false);
  }

  function switchTab(tab) {
    state.tab = tab;
    closeModal();
    resetFilters(false);
  }

  function placeEnrolledFilters() {
    var dock = document.getElementById('doc-enrolled-controls');
    var toolbar = document.querySelector('#doc-main-view .doc-toolbar');
    var status = document.getElementById('doc-status-wrap');
    var requests = document.getElementById('doc-requests-wrap');
    var clear = document.getElementById('doc-clear');
    var count = document.getElementById('doc-count');
    var enrolled = state.tab === 'enrolled' && !state.queueOpen;
    if (enrolled && dock) {
      if (clear) dock.appendChild(clear);
      if (status) dock.appendChild(status);
      if (requests) dock.appendChild(requests);
      return;
    }
    if (!toolbar) return;
    if (status) toolbar.insertBefore(status, count || null);
    if (requests) toolbar.insertBefore(requests, count || null);
    if (clear) toolbar.insertBefore(clear, count || null);
  }

  function renderTabs() {
    document.querySelectorAll('[data-doc-tab]').forEach(function (button) {
      var on = button.getAttribute('data-doc-tab') === state.tab;
      button.classList.toggle('is-active', on);
      button.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    var requests = document.getElementById('doc-requests-wrap');
    var archive = document.getElementById('doc-archive-wrap');
    var statusWrap = document.getElementById('doc-status-wrap');
    var status = document.getElementById('doc-status');
    placeEnrolledFilters();
    if (requests) requests.hidden = state.tab !== 'enrolled';
    if (archive) archive.hidden = state.tab !== 'archived';
    if (statusWrap) statusWrap.hidden = state.tab === 'archived';
    if (status && state.tab !== 'archived') {
      var label = state.tab === 'applicants' ? 'Application status' : 'Enrollment status';
      status.setAttribute('aria-label', label);
      var current = status.value;
      var options = state.tab === 'applicants'
        ? ['<option value="">All application statuses</option>'].concat(REVIEW_STATUSES.concat(['Confirmed Slot', 'Declined', 'Expired']).map(function (item) {
          return '<option value="' + esc(item) + '">' + esc(item) + '</option>';
        }))
        : ['<option value="">Enrollment status</option>', '<option value="Active">Active</option>', '<option value="Inactive">Inactive</option>'];
      status.innerHTML = options.join('');
      status.value = current;
    }
    var archiveSelect = document.getElementById('doc-archive');
    if (archiveSelect) {
      var reasons = [];
      Object.keys(state.archiveByStudent).forEach(function (key) {
        var reason = state.archiveByStudent[key].archiveReason;
        if (reason && reasons.indexOf(reason) < 0) reasons.push(reason);
      });
      var selected = archiveSelect.value;
      archiveSelect.innerHTML = '<option value="">All archive reasons</option>' + reasons.map(function (reason) {
        return '<option value="' + esc(reason) + '">' + esc(reason) + '</option>';
      }).join('');
      archiveSelect.value = selected;
    }
  }

  function renderCourses() {
    var select = document.getElementById('doc-course');
    if (!select) return;
    var current = state.filters.course || select.value;
    select.innerHTML = '<option value="">All Courses</option>' + state.courses.map(function (course) {
      return '<option value="' + esc(course.courseId) + '">' + esc(courseLabel(course.courseName)) + '</option>';
    }).join('');
    select.value = current;
  }

  function courseOrder(name) {
    var label = courseLabel(name).toLowerCase();
    if (label.indexOf('bookkeep') >= 0) return 0;
    if (label.indexOf('customer') >= 0) return 1;
    if (label.indexOf('computer') >= 0) return 2;
    if (label.indexOf('electronic') >= 0) return 3;
    return 10;
  }

  function tableColumns() {
    if (state.tab === 'applicants') {
      return ['Full Name', 'Course', 'Email Address', 'Submitted Documents', 'Status', 'Actions'];
    }
    return ['Full Name', 'Course', 'Email Address', state.tab === 'archived' ? 'Archive Date' : 'Enrollment Date', 'Enrollment Status', 'Submitted Documents', 'Requests', 'Actions'];
  }

  function queuedRequests() {
    return (state.requestList || []).slice().sort(function (a, b) {
      var byDate = String(a.requestDate || '').localeCompare(String(b.requestDate || ''));
      if (byDate) return byDate;
      return Number(a.requestId) - Number(b.requestId);
    }).map(function (request, index) {
      return { request: request, queueNo: index + 1 };
    });
  }

  function outstandingCount() {
    return queuedRequests().filter(function (item) {
      return String(item.request.requestStatus || '') !== 'Released' && String(item.request.requestStatus || '') !== 'Rejected';
    }).length;
  }

  function filteredQueue() {
    var q = state.queueFilters.q.trim().toLowerCase();
    return queuedRequests().filter(function (item) {
      var request = item.request;
      if (q) {
        var name = String(request.studentName || '').toLowerCase();
        var email = String(request.email || '').toLowerCase();
        var queueHit = /^\d+$/.test(q) && String(item.queueNo) === q;
        if (name.indexOf(q) < 0 && email.indexOf(q) < 0 && !queueHit) return false;
      }
      if (state.queueFilters.type && !sameDocument(request.documentType, state.queueFilters.type)) return false;
      if (state.queueFilters.status && visibleStatus(request.requestStatus) !== state.queueFilters.status) return false;
      return true;
    });
  }

  function renderTable() {
    var head = document.getElementById('doc-head');
    var body = document.getElementById('doc-body');
    var count = document.getElementById('doc-count');
    if (!head || !body) return;
    var columns = tableColumns();
    head.innerHTML = '<tr>' + columns.map(function (name) { return '<th>' + esc(name) + '</th>'; }).join('') + '</tr>';

    if (state.loading) {
      body.innerHTML = '<tr><td class="doc-empty" colspan="' + columns.length + '">Loading records...</td></tr>';
      if (count) count.textContent = '';
      return;
    }
    if (state.error) {
      body.innerHTML = '<tr><td class="doc-empty doc-empty-error" colspan="' + columns.length + '">' + esc(state.error) + '</td></tr>';
      if (count) count.textContent = '';
      return;
    }

    var rows = filteredRows();
    if (count) count.textContent = rows.length + (rows.length === 1 ? ' record' : ' records');
    if (!rows.length) {
      var empty = state.tab === 'applicants'
        ? 'No applicants match these filters.'
        : (state.tab === 'archived' ? 'No archived students match these filters.' : 'No enrolled students match these filters.');
      body.innerHTML = '<tr><td class="doc-empty" colspan="' + columns.length + '">' + empty + '</td></tr>';
      return;
    }
    body.innerHTML = rows.map(renderRow).join('');
  }

  function renderRow(row) {
    var key = (row.student ? 's' + row.student.studentId : 'a' + row.applicant.applicantId);
    var applicantId = row.applicant ? row.applicant.applicantId : (row.student && row.student.applicantId);
    var docs = applicantId ? credentialSet(applicantId) : CREDENTIALS.map(function (item) { return { status: 'Missing' }; });
    var submitted = docs.filter(function (item) { return item.status === 'Submitted'; }).length;
    var docBadge = badge(submitted + ' of ' + CREDENTIALS.length + ' submitted', submitted === CREDENTIALS.length ? 'ok' : 'wait');
    var pending = docs.filter(function (item) { return item.doc && item.doc.isFollowUp; }).length;
    if (pending) docBadge += ' ' + badge(pending + ' pending follow up', 'wait');
    if (state.tab === 'applicants') {
      var status = row.applicant.applicationStatus || '—';
      return '<tr>' +
        '<td class="doc-name">' + esc(rowName(row)) + '</td>' +
        '<td>' + esc(rowCourse(row) || 'N/A') + '</td>' +
        '<td>' + esc(na(rowEmail(row))) + '</td>' +
        '<td>' + docBadge + '</td>' +
        '<td>' + badge(status, statusTone(status)) + '</td>' +
        '<td><button type="button" class="doc-action" data-doc-open="' + esc(key) + '">Review</button></td>' +
        '</tr>';
    }
    var requests = requestSet(row.student.studentId);
    var requested = requests.filter(function (item) { return item.request; }).length;
    var archive = state.archiveByStudent[String(row.student.studentId)];
    var when = state.tab === 'archived'
      ? formatDate(archive && archive.archiveDate)
      : formatDate(row.student.confirmedAt || row.student.createdAt);
    var enrollment = row.student.accountStatus || row.student.applicationStatus || '—';
    return '<tr>' +
      '<td class="doc-name">' + esc(rowName(row)) + '</td>' +
      '<td>' + esc(rowCourse(row) || 'N/A') + '</td>' +
      '<td>' + esc(na(rowEmail(row))) + '</td>' +
      '<td>' + esc(when) + '</td>' +
      '<td>' + badge(enrollment, statusTone(enrollment)) + '</td>' +
      '<td>' + docBadge + '</td>' +
      '<td>' + badge(requested ? (requested + ' requested') : 'Not Requested', requested ? 'info' : 'muted') + '</td>' +
      '<td><button type="button" class="doc-action" data-doc-open="' + esc(key) + '">Review</button></td>' +
      '</tr>';
  }

  function renderQueueBadge() {
    var outstanding = outstandingCount();
    var count = document.getElementById('doc-queue-count');
    var screen = document.getElementById('doc-queue-screen-count');
    if (count) count.textContent = '(' + outstanding + ')';
    if (screen) screen.textContent = outstanding + ' outstanding';
  }

  function renderQueue() {
    renderQueueBadge();
    var body = document.getElementById('doc-queue-body');
    var total = document.getElementById('doc-queue-total');
    var result = document.getElementById('doc-queue-result');
    if (!body) return;
    if (state.loading || state.error) {
      body.innerHTML = '<tr><td class="doc-empty" colspan="7">' + esc(state.loading ? 'Loading document requests...' : state.error) + '</td></tr>';
      if (total) total.textContent = '';
      if (result) result.textContent = '';
      return;
    }
    var all = queuedRequests();
    var rows = filteredQueue();
    if (total) total.textContent = all.length + (all.length === 1 ? ' request record' : ' request records');
    if (result) result.textContent = 'Showing ' + rows.length + ' of ' + all.length;
    if (!state.requestsReady) {
      body.innerHTML = '<tr><td class="doc-empty" colspan="7">Document requests could not be loaded.</td></tr>';
      return;
    }
    if (!rows.length) {
      body.innerHTML = '<tr><td class="doc-empty" colspan="7">No document requests match these filters.</td></tr>';
      return;
    }
    body.innerHTML = rows.map(function (item) {
      var request = item.request;
      return '<tr>' +
        '<td data-label="Queue No.">' + esc(item.queueNo) + '</td>' +
        '<td data-label="Student Name" class="doc-name">' + esc(request.studentName || '—') + '</td>' +
        '<td data-label="Course">' + esc(courseLabel(request.courseName) || 'N/A') + '</td>' +
        '<td data-label="Requested Document">' + esc(request.documentType || '—') + '</td>' +
        '<td data-label="Request Date">' + esc(formatDate(request.requestDate)) + '</td>' +
        '<td data-label="Status">' + badge(visibleStatus(request.requestStatus) || '—', statusTone(visibleStatus(request.requestStatus))) + '</td>' +
        '<td data-label="Action"><button type="button" class="doc-action" data-review-request="' + esc(request.requestId) + '">Review</button></td>' +
        '</tr>';
    }).join('');
  }

  function openQueue() {
    var view = document.getElementById('doc-queue-view');
    var main = document.getElementById('doc-main-view');
    if (!view || !main) return;
    closeModal();
    state.queueOpen = true;
    main.hidden = true;
    view.hidden = false;
    var back = document.getElementById('doc-queue-back');
    var title = document.getElementById('doc-page-title');
    var total = document.getElementById('doc-queue-total');
    var badge = document.getElementById('doc-queue-screen-count');
    if (back) back.hidden = false;
    if (title) title.textContent = 'Requested Documents';
    if (total) total.hidden = false;
    if (badge) badge.hidden = false;
    renderQueue();
  }

  function closeQueue() {
    closeRequestReview();
    state.queueOpen = false;
    var view = document.getElementById('doc-queue-view');
    var main = document.getElementById('doc-main-view');
    if (main) main.hidden = false;
    if (view) view.hidden = true;
    var back = document.getElementById('doc-queue-back');
    var title = document.getElementById('doc-page-title');
    var total = document.getElementById('doc-queue-total');
    var badge = document.getElementById('doc-queue-screen-count');
    if (back) back.hidden = true;
    if (title) title.textContent = 'Document Management';
    if (total) total.hidden = true;
    if (badge) badge.hidden = true;
  }

  function readQueueFilters() {
    state.queueFilters.q = (document.getElementById('doc-queue-search') || {}).value || '';
    state.queueFilters.type = (document.getElementById('doc-queue-type') || {}).value || '';
    state.queueFilters.status = (document.getElementById('doc-queue-status') || {}).value || '';
    renderQueue();
  }

  function clearQueueFilters() {
    ['doc-queue-search', 'doc-queue-type', 'doc-queue-status'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = '';
    });
    state.queueFilters = { q: '', type: '', status: '' };
    renderQueue();
  }

  function sectionCourseCounts() {
    var counts = {};
    var total = 0;
    sectionRows().forEach(function (row) {
      total += 1;
      var id = String(rowCourseId(row));
      counts[id] = (counts[id] || 0) + 1;
    });
    return { total: total, counts: counts };
  }

  function renderCourseRelease() {
    var host = document.getElementById('doc-course-release');
    var filters = document.getElementById('doc-course-filters');
    if (!host || !filters) return;
    host.hidden = state.queueOpen;
    if (state.queueOpen) return;
    var courses = state.courses.slice().sort(function (a, b) {
      return courseOrder(a.courseName) - courseOrder(b.courseName) || courseLabel(a.courseName).localeCompare(courseLabel(b.courseName));
    });
    var allActive = !state.filters.course;
    filters.innerHTML = '<button type="button" class="doc-course-btn' + (allActive ? ' is-active' : '') + '" data-course-filter="" aria-pressed="' + (allActive ? 'true' : 'false') + '">All Courses</button>' +
      courses.map(function (course) {
      var active = String(state.filters.course) === String(course.courseId);
      return '<button type="button" class="doc-course-btn' + (active ? ' is-active' : '') + '" data-course-filter="' + esc(course.courseId) + '" aria-pressed="' + (active ? 'true' : 'false') + '">' + esc(courseLabel(course.courseName)) + '</button>';
    }).join('');

  }

  async function loadReleaseBoard() {
    if (state.tab !== 'enrolled' || !state.filters.course || !state.batchId) {
      state.releaseBoard = null;
      state.boardLoading = false;
      renderCourseRelease();
      return;
    }
    var courseId = String(state.filters.course);
    var batchId = state.batchId;
    state.boardLoading = true;
    renderCourseRelease();
    var path = '/api/course-documents/board?courseId=' + encodeURIComponent(courseId);
    if (batchId) path += '&batchId=' + encodeURIComponent(batchId);
    var boardBatch = state.batchId;
    var result = await scopedApi.get(path);
    if (boardBatch !== state.batchId) return;
    if (String(state.filters.course) !== courseId) return;
    state.boardLoading = false;
    if (!result.success || !result.data) {
      state.releaseBoard = { error: result.message || 'Release information could not be loaded.' };
      renderCourseRelease();
      return;
    }
    state.releaseBoard = result.data;
    renderCourseRelease();
    renderTable();
  }

  async function saveAssessmentDate(value) {
    if (state.readOnly) { showToast("This completed batch is view-only.", "error"); return; }
    var batchId = state.batchId;
    if (!batchId) return;
    var result = await scopedApi.put('/api/course-documents/batches/' + encodeURIComponent(batchId) + '/assessment', {
      assessmentDate: value || null
    });
    showToast(result.message || (result.success ? 'Assessment date saved.' : 'The assessment date was not saved.'), result.success ? 'ok' : 'error');
    if (result.success) loadReleaseBoard();
  }

  function render() {
    renderTabs();
    renderCourses();
    renderCourseRelease();
    renderTable();
    renderQueueBadge();
    if (state.queueOpen) renderQueue();
    if (state.openRequestId) renderRequestReview();
  }

  function findRow(key) {
    if (String(key).charAt(0) === 's') {
      var student = state.students.filter(function (item) { return 's' + item.studentId === key; })[0];
      if (!student) return null;
      return { applicant: applicantById(student.applicantId), student: student };
    }
    var applicant = state.applicants.filter(function (item) { return 'a' + item.applicantId === key; })[0];
    if (!applicant) return null;
    return { applicant: applicant, student: studentByApplicant(applicant.applicantId) };
  }

  function fileUrl(applicantId, documentId, inline) {
    return '/api/applicants/' + encodeURIComponent(applicantId) + '/registration-documents/' + encodeURIComponent(documentId) + '/download' + (inline ? '?inline=true' : '');
  }

  function formUrl(applicantId, inline) {
    return '/api/applicants/' + encodeURIComponent(applicantId) + '/application-form' + (inline ? '?inline=true' : '');
  }

  function canPreview(doc) {
    var type = String((doc && doc.contentType) || '').toLowerCase();
    var name = String((doc && doc.originalFileName) || '').toLowerCase();
    return type.indexOf('pdf') >= 0 || type.indexOf('image/') === 0 || /\.(pdf|png|jpe?g|gif|webp)$/.test(name);
  }

  async function openRecord(key, focus) {
    var recordBatch = state.batchId;
    var row = findRow(key);
    var modal = document.getElementById('doc-modal');
    var body = document.getElementById('doc-modal-body');
    if (!row || !modal || !body) return;
    state.openKey = key;
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    setReviewHeading(rowName(row), enrolledCourseName(row, row.applicant, null));
    body.innerHTML = '<p class="doc-empty">Loading record...</p>';
    var applicant = row.applicant;
    if (row.student && row.student.applicantId && (!applicant || !applicant.address)) {
      var detail = await scopedApi.get('/api/applicants/' + encodeURIComponent(row.student.applicantId));
      if (detail.success && detail.data) applicant = detail.data;
    }
    var coursePack = null;
    if (row.student) {
      if (recordBatch && recordBatch !== state.batchId) return;
      var packRes = await scopedApi.post('/api/course-documents/student/' + encodeURIComponent(row.student.studentId) + '/prepare', {});
      var verified = await scopedApi.get('/api/course-documents/student/' + encodeURIComponent(row.student.studentId) + '/eligibility');
      if (packRes.success) packRes.data.eligibility = verified.success ? verified.data : {};
      coursePack = packRes.success ? packRes.data : { error: packRes.message || 'Course documents could not be loaded.' };
    }
    if (state.openKey !== key || recordBatch !== state.batchId) return;
    setReviewHeading(rowName(row), enrolledCourseName(row, applicant, coursePack));
    body.innerHTML = modalHtml(row, applicant, coursePack);
  }

  function setReviewHeading(name, course) {
    var title = document.getElementById('doc-modal-title');
    var courseEl = document.getElementById('doc-modal-course');
    if (title) title.textContent = name || 'Student record';
    if (!courseEl) return;
    courseEl.textContent = course || '';
    courseEl.hidden = !course;
  }

  function enrolledCourseName(row, applicant, coursePack) {
    if (!row || !row.student || row.student.isArchived) return '';
    var raw = (applicant && applicant.courseName)
      || (row.student && row.student.courseName)
      || (coursePack && coursePack.timeline && coursePack.timeline.courseName)
      || '';
    return courseLabel(raw);
  }

  function shownField(label, value) {
    var text = String(value == null ? '' : value).trim();
    if (!text) return '';
    return '<div><span>' + esc(label) + '</span><strong>' + esc(text) + '</strong></div>';
  }

  function courseFileButtons(doc) {
    if (!doc || !doc.hasFile) return '';
    return '<button type="button" class="doc-link" data-course-view="' + esc(doc.courseDocumentId) + '">View</button>' +
      '<button type="button" class="doc-link" data-course-download="' + esc(doc.courseDocumentId) + '">Download</button>';
  }

  function courseReleaseSection(row, pack, applicant) {
    if (!row.student) return '';
    if (!pack || pack.error) {
      return '<section class="doc-course-docs"><h4>Course-related documents</h4><p class="doc-muted">' + esc((pack && pack.error) || 'Course documents could not be loaded.') + '</p></section>';
    }
    var requests = requestSet(row.student.studentId);
    var courseName = enrolledCourseName(row, applicant, pack);
    var cards = (pack.documents || []).map(function (doc) {
      var request = requests.filter(function (item) { return item.name === doc.documentType; })[0];
      var requestStatus = request && request.request ? visibleStatus(request.status) : '';
      var released = doc.preparationStatus === 'Released';
      var ready = doc.preparationStatus === 'Ready for Release';
      var flags = doc.isOverdue ? ' is-overdue' : '';
      var requestLine = '';
      if (requestStatus && requestStatus !== 'Released') {
        requestLine = '<p>Request: ' + esc(requestStatus) + (request.request && request.request.holdReason && (requestStatus === 'On Hold' || requestStatus === 'Rejected') ? ' — ' + esc(request.request.holdReason) : '') + '</p>';
      } else if (requestStatus === 'Released' && released) {
        requestLine = '<p>Request fulfilled</p>';
      }
      var uploadText = 'Upload ' + doc.documentType;
      if (doc.documentType === 'Certificate of Completion' && courseName) {
        uploadText = 'Upload Certificate of Completion for ' + courseName + '.';
      }
      var drop = released ? '' :
        '<label class="req-drop course-doc-drop">' +
          '<strong>' + esc(uploadText) + '</strong>' +
          '<span>PDF, JPG, or PNG. Uploading does not release the document.</span>' +
          '<input class="course-doc-file" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/png,image/jpeg" data-course-file="' + esc(doc.courseDocumentId) + '">' +
        '</label>';
      var release = ready
        ? '<button type="button" class="doc-link" data-course-release="' + esc(doc.courseDocumentId) + '" data-course-name="' + esc(doc.documentType) + '">Release</button>'
        : '';
      return '<article class="course-release-card' + flags + '">' +
        '<strong>' + esc(doc.documentType) + '</strong>' +
        badge(doc.preparationStatus, statusTone(doc.preparationStatus)) +
        (doc.isOverdue ? badge('Overdue', 'bad') : '') +
        (doc.fileName ? '<p>' + esc(doc.fileName) + '</p>' : '<p>No file uploaded</p>') +
        requestLine +
        (doc.releaseDeadlineDisplay ? '<p>Deadline ' + esc(doc.releaseDeadlineDisplay) + '</p>' : '') +
        (doc.releasedAt ? '<p>Released ' + esc(formatDate(doc.releasedAt)) + '</p>' : '') +
        '<div class="doc-file-actions">' + courseFileButtons(doc) + release + '</div>' +
        drop +
      '</article>';
    }).join('');
    var timeline = pack.timeline || {};
    return '<section class="doc-course-docs"><h4>Course-related documents</h4>' +
      '<p class="doc-muted">' + esc(timeline.expectedReleaseLabel || '') + '</p>' +
      '<div class="doc-course-grid">' + cards + '</div></section>';
  }

  function modalHtml(row, applicant, coursePack) {
    var applicantId = (applicant && applicant.applicantId) || (row.student && row.student.applicantId);
    var docs = applicantId ? credentialSet(applicantId) : CREDENTIALS.map(function (item) {
      return { name: item.name, status: 'Unavailable', doc: null };
    });
    var docRows = docs.map(function (item) {
      var actions = '<span class="doc-muted">Not submitted</span>';
      if (item.status === 'Unavailable') actions = '<span class="doc-muted">Records unavailable</span>';
      else if (item.doc && item.doc.isFollowUp) {
        actions = '<span class="doc-muted">Pending applicant submission</span>';
        if (!state.readOnly && !(row.student && row.student.isArchived))
          actions += '<label class="doc-link registration-follow-up-upload">Upload PDF<input type="file" class="registration-follow-up-file" accept="application/pdf,.pdf" data-applicant="' + applicantId + '" data-document="' + item.doc.documentId + '" aria-label="Upload ' + esc(item.name) + '"></label>';
      }
      else if (item.doc) {
        var download = '<a class="doc-link" href="' + fileUrl(applicantId, item.doc.documentId, false) + '">Download</a>';
        actions = canPreview(item.doc)
          ? '<a class="doc-link" href="' + fileUrl(applicantId, item.doc.documentId, true) + '" target="_blank" rel="noopener">View</a>' + download
          : '<span class="doc-muted">Preview is not available for this file.</span>' + download;
      }
      return '<div class="doc-card"><strong>' + esc(item.name) + '</strong>' +
        badge(item.status, statusTone(item.status)) + '<div class="doc-file-actions">' + actions + '</div></div>';
    }).join('');
    var info = shownField('Full name', rowName(row)) +
      shownField('Contact number', rowPhone(row)) +
      shownField('Email address', rowEmail(row)) +
      shownField('Course', rowCourse(row)) +
      (applicant ? shownField('Registration date', formatDate(applicant.applicationDate)) : '') +
      (row.student ? shownField('Enrollment date', formatDate(row.student.confirmedAt || row.student.createdAt)) : '') +
      (applicant ? shownField('Address', applicant.address) : '') +
      (applicant ? shownField('Birthdate', applicant.birthdate ? formatDate(applicant.birthdate) : '') : '') +
      (applicant ? shownField('Gender', applicant.gender) : '');
    if (row.student && row.student.isArchived) {
      var archive = state.archiveByStudent[String(row.student.studentId)];
      info += shownField('Archive date', archive && archive.archiveDate ? formatDate(archive.archiveDate) : '');
      info += shownField('Archive reason', archive && archive.archiveReason);
    }
    var requestSection = '';
    if (row.student && row.student.isArchived) {
      var requests = requestSet(row.student.studentId).map(function (item) {
        var detail = 'Not requested';
        if (item.status === 'Unavailable') detail = 'Request records are unavailable.';
        else if (item.request) {
          detail = item.status === 'Released' ? 'Released' : 'Requested';
          detail += ' · ' + formatDate(item.request.requestDate);
          if (item.request.releaseDate) detail += ' · Released ' + formatDate(item.request.releaseDate);
        }
        return '<div class="doc-card"><strong>' + esc(item.name) + '</strong>' + badge(item.status, statusTone(item.status)) + '<p>' + esc(detail) + '</p></div>';
      }).join('');
      requestSection = '<section class="doc-requests"><h4>Requestable documents</h4><div class="doc-request-grid">' + requests + '</div></section>';
    }
    var form = applicant
      ? '<p class="doc-muted">Open the registration form generated from this record.</p><div class="doc-file-actions"><a class="doc-link" href="' + formUrl(applicant.applicantId, true) + '" target="_blank" rel="noopener">View</a><a class="doc-link" href="' + formUrl(applicant.applicantId, false) + '">Download</a></div>'
      : '<p class="doc-muted">Application form is not available for this record.</p>';
    return '<div class="doc-review">' +
      '<section class="doc-creds"><h4>Registration documents</h4><div class="doc-cred-grid">' + docRows + '</div></section>' +
      courseReleaseSection(row, coursePack, applicant) +
      eligibilityForm(row, coursePack) +
      '<section class="doc-info"><h4>Basic information</h4><div class="doc-info-grid">' + info + '</div></section>' +
      '<section class="doc-form"><h4>Application form</h4>' + form + '</section>' +
      requestSection +
      '</div>';
  }

  function eligibilityForm(row, pack) {
    if (!row.student) return '';
    var v = pack && pack.eligibility || {};
    return '<section class="doc-info"><h4>Individual document eligibility</h4><p>Verify actual payment and the student’s required training and assessment days. Batch completion does not set these values.</p>' +
      '<form data-eligibility-student="' + row.student.studentId + '">' +
      [['feesPaid','feesPaidAt','All required fees paid'],['trainingCompleted','trainingCompletedAt','Required training days completed'],['assessmentCompleted','assessmentCompletedAt','Required assessment days completed']].map(function (x) {
        return '<label style="display:block;margin:.6rem 0"><input type="checkbox" name="' + x[0] + '"' + (v[x[1]] ? ' checked' : '') + '> ' + x[2] + '</label>';
      }).join('') + '<button class="doc-link" type="submit">Save verification</button><p data-eligibility-message role="status"></p></form></section>';
  }

  function findQueued(requestId) {
    return queuedRequests().filter(function (item) {
      return String(item.request.requestId) === String(requestId);
    })[0] || null;
  }

  function fileSizeLabel(bytes) {
    var n = Number(bytes || 0);
    if (!n) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function requestFileUrl(requestId, inline) {
    return activeBatchPath('/api/document-requests/' + encodeURIComponent(requestId) + '/file' + (inline ? '?inline=true' : ''));
  }

  function allowedNext(status) {
    return ALLOWED_NEXT[status] || [];
  }

  function renderRequestReview() {
    var body = document.getElementById('doc-request-body');
    var title = document.getElementById('doc-request-title');
    var item = findQueued(state.openRequestId);
    if (!body || !item) return;
    var request = item.request;
    var student = state.students.filter(function (row) {
      return String(row.studentId) === String(request.studentId);
    })[0];
    var fullName = request.studentName || (student && student.fullName) || '—';
    if (title) title.textContent = 'Queue ' + item.queueNo;
    var facts = [
      ['Course', courseLabel(request.courseName || (student && student.courseName)) || 'N/A'],
      ['Email address', request.email || (student && student.email) || 'N/A'],
      ['Contact number', request.contactNumber || (student && student.contactNumber) || 'N/A']
    ].map(function (pair) {
      return '<div><span>' + esc(pair[0]) + '</span><strong>' + esc(pair[1]) + '</strong></div>';
    }).join('');
    var meta = '<div><span>Request date</span><strong>' + esc(formatDate(request.requestDate)) + '</strong></div>';
    if (request.reason) meta += '<div><span>Reason</span><strong>' + esc(request.specificReason ? request.reason + ' · ' + request.specificReason : request.reason) + '</strong></div>';
    if (request.holdReason) meta += '<div><span>Hold reason</span><strong>' + esc(request.holdReason) + '</strong></div>';
    if (request.releaseDate) meta += '<div><span>Release date</span><strong>' + esc(formatDate(request.releaseDate)) + '</strong></div>';
    var allowed = allowedNext(request.requestStatus);
    var canEditFile = (request.requestStatus === 'Pending' || request.requestStatus === 'Processing');
    var picks = STATUS_ACTIONS.map(function (action) {
      var enabled = allowed.indexOf(action.next) >= 0;
      return '<button type="button" class="doc-link" data-next-status="' + esc(action.next) + '" data-request-id="' + esc(request.requestId) + '"' + (enabled ? '' : ' disabled') + '>' + esc(action.label) + '</button>';
    }).join('');
    var fileBlock = '';
    if (request.hasFile) {
      var size = fileSizeLabel(request.releaseFileSize);
      fileBlock = '<div class="req-file-row"><p><strong>' + esc(request.releaseFileName || 'Uploaded file') + '</strong>' + (size ? ' · ' + esc(size) : '') + '</p>' +
        '<div class="req-file-links"><a class="doc-link" href="' + requestFileUrl(request.requestId, true) + '" target="_blank" rel="noopener">View</a>' +
        '<a class="doc-link" href="' + requestFileUrl(request.requestId, false) + '">Download</a>' +
        (canEditFile ? '<button type="button" class="doc-link" data-request-replace="' + esc(request.requestId) + '">Replace</button><button type="button" class="doc-link" data-request-remove="' + esc(request.requestId) + '">Remove</button>' : '') +
        '</div></div>';
    } else if (!canEditFile) {
      fileBlock = '<p class="req-file">No file is stored for this requested document.</p>';
    }
    var upload = '';
    if (canEditFile) {
      upload = '<div class="req-drop' + (state.uploading ? ' is-busy' : '') + '" id="doc-request-drop" data-request-id="' + esc(request.requestId) + '" tabindex="0" role="button" aria-label="Upload document file">' +
        '<input id="doc-request-file" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" hidden>' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M12 16V7m0 0l-3.5 3.5M12 7l3.5 3.5M6 19h12a2 2 0 002-2v-1a4 4 0 00-4-4h-.5A5 5 0 007.2 9.4 3.5 3.5 0 016 16.5"/></svg>' +
        '<strong>Drop the document here, or click to browse</strong>' +
        '<span>PDF, JPG, JPEG, or PNG. Maximum 20 MB. Uploading does not change the request status.</span>' +
        (state.uploading ? '<div class="req-progress" aria-hidden="true"><i></i></div>' : '') +
        '</div><p class="req-upload-msg" id="doc-request-upload-msg"></p>';
    }
    var shownStatus = visibleStatus(request.requestStatus) || '—';
    var card = document.querySelector('#doc-request-modal .doc-request-card');
    if (card) card.className = 'doc-modal-card doc-request-card relative is-' + statusTheme(shownStatus);
    body.innerHTML = '<div class="req-sheet">' +
      '<section><p class="req-kicker">Student information</p><h4 class="req-name">' + esc(fullName) + '</h4><div class="req-facts">' + facts + '</div></section>' +
      '<section class="req-doc"><div class="req-doc-head"><div><p class="req-kicker">Requested document</p><h4>' + esc(request.documentType || '—') + '</h4></div>' +
        badge(shownStatus, statusTone(shownStatus)) + '</div>' +
        '<div class="req-meta">' + meta + '</div>' + fileBlock + upload +
        '<div class="req-status"><p class="req-kicker">Actions</p><div class="req-picks">' + picks + '</div>' +
        '<p class="req-note">' + esc(STATUS_MEANING[shownStatus] || '') + '</p></div></section>' +
      '</div>';
  }

  function openRequestReview(requestId) {
    var modal = document.getElementById('doc-request-modal');
    if (!modal || !findQueued(requestId)) return;
    state.openRequestId = Number(requestId);
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    renderRequestReview();
  }

  function closeRequestReview() {
    var modal = document.getElementById('doc-request-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.setAttribute('aria-hidden', 'true');
    }
    state.openRequestId = 0;
  }

  function closeModal() {
    var modal = document.getElementById('doc-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    state.openKey = '';
  }

  function confirmCopy(next) {
    if (next === 'Processing') return { title: 'Move to Processing', message: 'Are you sure you want to move this document request to Processing?', ok: 'Confirm' };
    if (next === 'On Hold') return { title: 'Place On Hold', message: 'Are you sure you want to place this document request On Hold?', ok: 'Confirm' };
    if (next === 'Rejected') return { title: 'Reject Request', message: 'Are you sure you want to reject this document request?', ok: 'Confirm' };
    return {
      title: 'Confirm Document Release',
      message: 'Are you sure you want to release this document? Once confirmed, the document status will be updated to Released, and the student will be notified through their ABEC dashboard and registered email address.',
      ok: 'Confirm Release'
    };
  }

  function statusIcon(next) {
    if (next === 'Released') {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6M7 3h7l5 5v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z"/></svg>';
    }
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l2.5 2.5M12 21a9 9 0 100-18 9 9 0 000 18z"/></svg>';
  }

  function closeConfirm() {
    if (state.savingStatus) return;
    state.confirm = null;
    var dialog = document.getElementById('doc-confirm');
    if (!dialog) return;
    dialog.classList.add('hidden');
    dialog.setAttribute('aria-hidden', 'true');
  }

  function openCourseReleaseConfirm(documentId, docName) {
    if (!documentId || state.savingStatus) return;
    var row = findRow(state.openKey);
    state.confirm = { kind: 'course-release', documentId: documentId, next: 'Released' };
    var dialog = document.getElementById('doc-confirm');
    document.getElementById('doc-confirm-title').textContent = 'Confirm Document Release';
    document.getElementById('doc-confirm-message').textContent = 'Release this document to the student? The file is already uploaded. Releasing records the official release and does not change the other documents.';
    document.getElementById('doc-confirm-doc').textContent = docName || 'Document';
    document.getElementById('doc-confirm-student').textContent = row ? rowName(row) : '—';
    document.getElementById('doc-confirm-flow').textContent = 'Ready for Release → Released';
    document.getElementById('doc-confirm-icon').innerHTML = statusIcon('Released');
    var hold = document.getElementById('doc-confirm-hold-wrap');
    hold.hidden = true;
    var ok = document.getElementById('doc-confirm-ok');
    ok.textContent = 'Confirm Release';
    ok.disabled = false;
    document.getElementById('doc-confirm-cancel').disabled = false;
    var confirmCard = dialog.querySelector('.doc-confirm-card');
    if (confirmCard) confirmCard.className = 'doc-confirm-card relative is-released';
    dialog.classList.remove('hidden');
    dialog.setAttribute('aria-hidden', 'false');
  }

  async function releaseCourseDocument(documentId) {
    state.savingStatus = true;
    var ok = document.getElementById('doc-confirm-ok');
    var cancel = document.getElementById('doc-confirm-cancel');
    if (ok) { ok.disabled = true; ok.textContent = 'Saving…'; }
    if (cancel) cancel.disabled = true;
    var result;
    try {
      result = await scopedApi.post('/api/course-documents/' + encodeURIComponent(documentId) + '/release', {});
    } catch (err) {
      result = { success: false, message: 'Unable to release the document.' };
    } finally {
      state.savingStatus = false;
      closeConfirm();
    }
    showToast(result.message || (result.success ? 'Document released.' : 'The document was not released.'), result.success ? 'ok' : 'error');
    if (result.success && state.openKey) openRecord(state.openKey);
    if (result.success) loadReleaseBoard();
  }

  async function uploadRegistrationFollowUp(input) {
    var file = input.files && input.files[0];
    if (!file || state.uploading || state.readOnly) return;
    if (!/\.pdf$/i.test(file.name) || file.size > 100 * 1024 * 1024 || !file.size) {
      showToast('Upload a non-empty PDF of 100 MB or smaller.', 'error');
      input.value = '';
      return;
    }
    var batch = state.batchId, key = state.openKey;
    var data = new FormData();
    data.append('file', file);
    state.uploading = true;
    input.disabled = true;
    try {
      var result = await scopedApi.postForm('/api/applicants/' + encodeURIComponent(input.getAttribute('data-applicant')) +
        '/registration-documents/' + encodeURIComponent(input.getAttribute('data-document')) + '/file', data);
      if (batch !== state.batchId) return;
      showToast(result.message || (result.success ? 'Document uploaded.' : 'The document was not uploaded.'), result.success ? 'ok' : 'error');
      if (result.success) {
        await load();
        if (state.openKey === key && batch === state.batchId) await openRecord(key);
      }
    } catch (e) {
      showToast('Unable to upload the document. Refresh the record to check its status.', 'error');
    } finally {
      state.uploading = false;
      input.disabled = false;
      input.value = '';
    }
  }

  async function uploadCourseFile(documentId, file) {
    if (!documentId || !file || state.uploading) return;
    state.uploading = true;
    var session = AbecApi.getSession();
    var data = new FormData();
    data.append('file', file);
    var headers = {};
    if (session && session.role === 'Admin' && session.userId) headers['X-Abec-Admin-Id'] = String(session.userId);
    var result;
    try {
      var response = await fetch((AbecApi.baseUrl || '') + '/api/course-documents/' + encodeURIComponent(documentId) + '/file', {
        method: 'POST',
        headers: headers,
        body: data
      });
      var payload = await response.json().catch(function () { return null; });
      result = AbecApi.normalize(payload || { success: false, message: 'The upload did not return a result.' });
    } catch (err) {
      result = { success: false, message: 'Unable to upload the document.' };
    } finally {
      state.uploading = false;
    }
    showToast(result.message || (result.success ? 'Document uploaded.' : 'The document was not uploaded.'), result.success ? 'ok' : 'error');
    if (result.success && state.openKey) openRecord(state.openKey);
  }

  async function openCourseFile(documentId, inline) {
    var id = Number(documentId);
    if (!Number.isSafeInteger(id) || id <= 0) {
      showToast('Select a valid document.', 'error');
      return;
    }
    // Navigate only to a fixed, authenticated same-origin route. The server verifies
    // ownership, storage containment and content type before streaming the preview.
    if (inline) {
      window.open('/api/course-documents/' + id + '/file?inline=true', '_blank', 'noopener,noreferrer');
      return;
    }
    var session = AbecApi.getSession();
    var headers = {};
    if (session && session.role === 'Admin' && session.userId) headers['X-Abec-Admin-Id'] = String(session.userId);
    var response = await fetch((AbecApi.baseUrl || '') + '/api/course-documents/' + encodeURIComponent(documentId) + '/file' + (inline ? '?inline=true' : ''), { headers: headers });
    if (!response.ok) {
      showToast('The file could not be opened.', 'error');
      return;
    }
    var contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (['application/pdf', 'image/jpeg', 'image/png'].indexOf(contentType) < 0) {
      showToast('The server returned an unsupported document type.', 'error');
      return;
    }
    var blob = await response.blob();
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'document';
    link.click();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  function openConfirm(requestId, next) {
    var item = findQueued(requestId);
    if (!item || state.savingStatus) return;
    var request = item.request;
    if (allowedNext(request.requestStatus).indexOf(next) < 0) return;
    var student = state.students.filter(function (row) {
      return String(row.studentId) === String(request.studentId);
    })[0];
    var copy = confirmCopy(next);
    state.confirm = { requestId: request.requestId, next: next };
    var dialog = document.getElementById('doc-confirm');
    document.getElementById('doc-confirm-title').textContent = copy.title;
    document.getElementById('doc-confirm-message').textContent = copy.message;
    document.getElementById('doc-confirm-doc').textContent = request.documentType || '—';
    document.getElementById('doc-confirm-student').textContent = request.studentName || (student && student.fullName) || '—';
    document.getElementById('doc-confirm-flow').textContent = (visibleStatus(request.requestStatus) || '—') + ' → ' + next;
    document.getElementById('doc-confirm-icon').innerHTML = statusIcon(next);
    var hold = document.getElementById('doc-confirm-hold-wrap');
    var holdInput = document.getElementById('doc-confirm-hold');
    hold.hidden = next !== 'On Hold';
    holdInput.value = next === 'On Hold' ? (request.holdReason || '') : '';
    var ok = document.getElementById('doc-confirm-ok');
    ok.textContent = copy.ok;
    ok.disabled = false;
    document.getElementById('doc-confirm-cancel').disabled = false;
    var confirmCard = dialog.querySelector('.doc-confirm-card');
    if (confirmCard) confirmCard.className = 'doc-confirm-card relative is-' + statusTheme(next);
    dialog.classList.remove('hidden');
    dialog.setAttribute('aria-hidden', 'false');
  }

  function statusFeedback(next, shown) {
    if (!shown || !shown.refresh) {
      return { text: 'The status update was unsuccessful. ' + ((shown && shown.text) || 'The document status was not changed.'), kind: 'error' };
    }
    if (shown.kind !== 'ok') return { text: shown.text, kind: 'warn' };
    if (next === 'Processing') return { text: 'Document status updated to Processing.', kind: 'ok' };
    if (next === 'On Hold') return { text: 'Document status updated to On Hold.', kind: 'ok' };
    if (next === 'Released') return { text: 'Document successfully released.', kind: 'ok' };
    if (next === 'Rejected') return { text: 'Document request rejected.', kind: 'ok' };
    return { text: shown.text || 'Document status updated.', kind: 'ok' };
  }

  function outcome(result, fallback) {
    var message = String((result && result.message) || fallback || '');
    var partial = message.indexOf('EMAIL_NOT_SENT:') === 0 || message.indexOf('NOTIFY_FAILED:') === 0;
    return {
      text: message.replace(/^(EMAIL_NOT_SENT:|NOTIFY_FAILED:)\s*/, '') || fallback,
      kind: result && result.success && !partial ? 'ok' : 'error',
      refresh: !!(result && result.success)
    };
  }

  async function updateRequest(requestId, status, reason) {
    var current = findQueued(requestId);
    if (!current || allowedNext(current.request.requestStatus).indexOf(status) < 0) {
      showToast('The status update was unsuccessful. That status change is not allowed for the current request.', 'error');
      return;
    }
    state.savingStatus = true;
    var ok = document.getElementById('doc-confirm-ok');
    var cancel = document.getElementById('doc-confirm-cancel');
    if (ok) { ok.disabled = true; ok.textContent = 'Saving…'; }
    if (cancel) cancel.disabled = true;
    var result;
    try {
      result = await scopedApi.put('/api/document-requests/' + encodeURIComponent(requestId) + '/status', {
        status: status,
        holdReason: reason || null
      });
    } catch (err) {
      result = { success: false, message: 'Unable to update the document request.' };
    } finally {
      state.savingStatus = false;
      closeConfirm();
    }
    var shown = outcome(result, result && result.success ? 'Document request updated.' : 'The document status was not changed.');
    var feedback = statusFeedback(status, shown);
    showToast(feedback.text, feedback.kind);
    if (!shown.refresh) return;
    var keepQueue = state.queueOpen;
    var keepRequest = state.openRequestId;
    await load();
    state.queueOpen = keepQueue;
    state.openRequestId = keepRequest;
    if (keepQueue) openQueue();
    if (keepRequest) openRequestReview(keepRequest);
  }

  async function uploadRequestFile(requestId, file) {
    var item = findQueued(requestId);
    if (!item || (item.request.requestStatus !== 'Pending' && item.request.requestStatus !== 'Processing') || String(state.openRequestId) !== String(requestId)) {
      setNotice('A file can be uploaded only for the open Pending or Processing request.', 'error');
      return;
    }
    if (!file) return;
    var name = String(file.name || '').toLowerCase();
    if (!/\.(pdf|png|jpe?g)$/.test(name)) {
      var msg = document.getElementById('doc-request-upload-msg');
      window.AbecFeedback.inline(msg, 'Allowed file types: PDF, JPG, JPEG, PNG.', 'error');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      var big = document.getElementById('doc-request-upload-msg');
      window.AbecFeedback.inline(big, 'Each file must be 20 MB or smaller.', 'error');
      return;
    }
    state.uploading = true;
    renderRequestReview();
    var chosen = document.getElementById('doc-request-upload-msg');
    if (chosen) chosen.textContent = file.name + (file.size ? ' · ' + fileSizeLabel(file.size) : '') + ' · Uploading…';
    var data = new FormData();
    data.append('file', file);
    var result = await scopedApi.postForm('/api/document-requests/' + encodeURIComponent(requestId) + '/file', data);
    state.uploading = false;
    var shown = outcome(result, result && result.success ? 'Document file uploaded.' : 'Unable to upload the file.');
    if (!shown.refresh) {
      renderRequestReview();
      var err = document.getElementById('doc-request-upload-msg');
      window.AbecFeedback.inline(err, shown.text, shown.kind);
      return;
    }
    var keepQueue = state.queueOpen;
    var keepRequest = state.openRequestId;
    await load();
    state.queueOpen = keepQueue;
    state.openRequestId = keepRequest;
    if (keepQueue) openQueue();
    if (keepRequest) openRequestReview(keepRequest);
    var okMsg = document.getElementById('doc-request-upload-msg');
    window.AbecFeedback.inline(okMsg, shown.text, shown.kind);
  }

  async function removeRequestFile(requestId) {
    var item = findQueued(requestId);
    if (!item || (item.request.requestStatus !== 'Pending' && item.request.requestStatus !== 'Processing') || String(state.openRequestId) !== String(requestId) || state.uploading) return;
    state.uploading = true;
    renderRequestReview();
    var result;
    try {
      result = await scopedApi.request('/api/document-requests/' + encodeURIComponent(requestId) + '/file', { method: 'DELETE' });
    } catch (err) {
      result = { success: false, message: 'Unable to remove the document.' };
    }
    state.uploading = false;
    var shown = outcome(result, result && result.success ? 'Document file removed.' : 'Unable to remove the document.');
    if (!shown.refresh) {
      renderRequestReview();
      var error = document.getElementById('doc-request-upload-msg');
      window.AbecFeedback.inline(error, shown.text, shown.kind);
      return;
    }
    var keepQueue = state.queueOpen;
    var keepRequest = state.openRequestId;
    await load();
    state.queueOpen = keepQueue;
    state.openRequestId = keepRequest;
    if (keepQueue) openQueue();
    if (keepRequest) openRequestReview(keepRequest);
    var ok = document.getElementById('doc-request-upload-msg');
    window.AbecFeedback.inline(ok, shown.text, shown.kind);
  }

  async function load() {
    var version = ++state.loadVersion;
    state.loading = true;
    state.error = '';
    render();
    var batchResult = historyBatchId
      ? { success: true, data: { batchId: historyBatchId, status: 'Completed' } }
      : await scopedApi.get('/api/batches/active');
    if (version !== state.loadVersion) return;
    if (!batchResult.success) { clearBatchRecords(); state.batchId = ''; state.readOnly = true; state.loading = false; state.error = batchResult.message || 'The active batch could not be loaded.'; render(); return; }
    var selected = batchResult.data;
    var activeId = selected ? String(selected.batchId) : '';
    if (activeId !== state.batchId) clearBatchRecords();
    state.batchId = activeId;
    state.readOnly = !selected || selected.status !== 'Active';
    if (!selected) { state.loading = false; state.error = 'No active batch. Manage batches in Batch Management.'; render(); return; }
    var snapshot = initialHistorySnapshot;
    initialHistorySnapshot = null;
    var snapshotPath = '/api/batches/' + encodeURIComponent(state.batchId) + '/documents';
    if (historyBatchId) snapshotPath += '?batchId=' + encodeURIComponent(state.batchId);
    var loaded = await Promise.all([
      snapshot ? Promise.resolve({ success: true, data: snapshot }) : scopedApi.get(snapshotPath), scopedApi.get('/api/courses')
    ]);
    if (version !== state.loadVersion) return;
    if (!loaded[0].success) { state.loading = false; state.error = loaded[0].message; render(); return; }
    var data = loaded[0].data;
    if (!data || !data.batch || String(data.batch.batchId) !== state.batchId) {
      clearBatchRecords(); state.loading = false; state.error = 'The document records do not match the selected batch.'; render(); return;
    }
    state.readOnly = data.readOnly;
    var results = [
      {success:true, data:data.applicants}, {success:true, data:data.students}, loaded[1],
      {success:true, data:data.registrationDocuments}, {success:true, data:data.requests}, {success:true, data:data.archives}
    ];
    state.loading = false;
    if (!results[0].success || !results[1].success) {
      state.error = (!results[0].success ? results[0].message : results[1].message) || 'Unable to load student records.';
      render();
      return;
    }
    state.applicants = (results[0].data || []).filter(function (a) { return String(a.batchId) === state.batchId; });
    state.students = (results[1].data || []).filter(function (s) { return String(s.batchId) === state.batchId; });
    state.courses = results[2].success ? (results[2].data || []) : [];
    state.docsReady = !!results[3].success;
    state.docsByApplicant = {};
    (results[3].success ? (results[3].data || []) : []).forEach(function (doc) {
      var key = String(doc.applicantId);
      if (!state.docsByApplicant[key]) state.docsByApplicant[key] = [];
      state.docsByApplicant[key].push(doc);
    });
    state.requestsReady = !!results[4].success;
    state.requestList = results[4].success ? (results[4].data || []).filter(function (r) {
      return state.students.some(function (s) { return s.studentId === r.studentId; });
    }) : [];
    state.requestsByStudent = {};
    state.requestList.forEach(function (request) {
      var key = String(request.studentId);
      if (!state.requestsByStudent[key]) state.requestsByStudent[key] = [];
      state.requestsByStudent[key].push(request);
    });
    state.archiveByStudent = {};
    (results[5].success ? (results[5].data || []) : []).forEach(function (archive) {
      var key = String(archive.studentId);
      var current = state.archiveByStudent[key];
      if (!current || String(archive.archiveDate || '') > String(current.archiveDate || '')) state.archiveByStudent[key] = archive;
    });
    if (!results[3].success) setNotice(results[3].message || 'Registration documents could not be loaded.', 'error');
    else if (!results[4].success) setNotice(results[4].message || 'Document requests could not be loaded.', 'error');
    render();
    if (historyBatchId) openQueue();
    else applyNotificationTarget();
  }

  async function refreshActiveBatch() {
    if (historyBatchId) return;
    if (state.loading) return;
    var result = await scopedApi.get('/api/batches/active');
    if (!result.success) return;
    var active = result.data;
    if ((active ? String(active.batchId) : '') !== state.batchId || state.readOnly !== (!active || active.status !== 'Active')) { await load(); return; }
  }

  function clearBatchRecords() {
    state.applicants = []; state.students = []; state.requestList = []; state.requestsByStudent = {}; state.docsByApplicant = {}; state.archiveByStudent = {};
    state.releaseBoard = null; state.openKey = ''; state.openRequestId = 0; state.confirm = null; state.queueOpen = false;
    state.docsReady = false; state.requestsReady = false;
    closeQueue(); closeModal();
    var queueBody = document.getElementById('doc-queue-body'); if (queueBody) queueBody.innerHTML = '';
    ['doc-modal', 'doc-request-modal', 'doc-confirm'].forEach(function (id) { var el = document.getElementById(id); if (el) el.classList.add('hidden'); });
    document.body.style.overflow = '';
  }

  function applyNotificationTarget() {
    var params = new URLSearchParams(window.location.search);
    if (params.get('view') !== 'requests') return;
    params = AbecApi.consumePageAction(['view', 'applicantId', 'requestType', 'requestName']);

    openQueue();
    var applicantId = params.get('applicantId') || '';
    var requestType = params.get('requestType') || '';
    var requestName = (params.get('requestName') || '').trim().toLowerCase();
    if (!applicantId && !requestName) return;

    var target = (state.requestList || []).filter(function (request) {
      var student = state.students.filter(function (item) {
        return String(item.studentId) === String(request.studentId);
      })[0];
      var sameApplicant = applicantId && student && String(student.applicantId) === String(applicantId);
      var sameName = requestName && String(request.studentName || '').trim().toLowerCase() === requestName;
      var sameType = !requestType || sameDocument(request.documentType, requestType);
      return (sameApplicant || sameName) && sameType;
    }).sort(function (a, b) {
      return String(b.requestDate || '').localeCompare(String(a.requestDate || ''));
    })[0];

    if (!target) return;
    var review = document.querySelector('[data-review-request="' + CSS.escape(String(target.requestId)) + '"]');
    var row = review ? review.closest('tr') : null;
    if (row) {
      row.classList.add('abec-notification-highlight');
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      window.setTimeout(function () { row.classList.remove('abec-notification-highlight'); }, 5600);
    }
    openRequestReview(target.requestId);
  }

  function initialize() {
    if (!document.getElementById('doc-body')) return;
    if (!AbecApi.requireRole('Admin')) return;
    if (initialized) return load();
    initialized = true;
    document.addEventListener('submit', async function (event) {
      var form = event.target.closest('[data-eligibility-student]');
      if (!form) return;
      event.preventDefault();
      var button = form.querySelector('button'); button.disabled = true;
      var payload = {};
      ['feesPaid','trainingCompleted','assessmentCompleted'].forEach(function (name) { payload[name] = form.elements[name].checked; });
      var result = await scopedApi.put('/api/course-documents/student/' + form.dataset.eligibilityStudent + '/eligibility', payload);
      button.disabled = false;
      window.AbecFeedback.inline(form.querySelector('[data-eligibility-message]'), result.message, result.success ? 'success' : 'error');
    });
    // Historical batch links no longer select the data shown on this page.
    var pageUrl = new URL(location.href);
    if (!historyBatchId && pageUrl.searchParams.has('batchId')) {
      pageUrl.searchParams.delete('batchId');
      history.replaceState(null, '', pageUrl);
    }
    window.setInterval(refreshActiveBatch, 15000);
    document.getElementById('doc-tabs').addEventListener('click', function (event) {
      var button = event.target.closest('[data-doc-tab]');
      if (!button) return;
      switchTab(button.getAttribute('data-doc-tab'));
    });
    ['doc-search', 'doc-course', 'doc-status', 'doc-docs', 'doc-type', 'doc-requests', 'doc-archive'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener(id === 'doc-search' ? 'input' : 'change', readFilters);
    });
    document.getElementById('doc-clear').addEventListener('click', clearFilters);
    document.getElementById('doc-open-queue').addEventListener('click', openQueue);
    document.getElementById('doc-queue-back').addEventListener('click', function () {
      if (historyBatchId) window.closeBatchDocuments();
      else closeQueue();
    });
    document.getElementById('doc-queue-search').addEventListener('input', readQueueFilters);
    document.getElementById('doc-queue-type').addEventListener('change', readQueueFilters);
    document.getElementById('doc-queue-status').addEventListener('change', readQueueFilters);
    document.getElementById('doc-queue-clear').addEventListener('click', clearQueueFilters);
    document.getElementById('doc-queue-wrap').addEventListener('click', function (event) {
      var review = event.target.closest('[data-review-request]');
      if (review) openRequestReview(review.getAttribute('data-review-request'));
    });
    var requestModal = document.getElementById('doc-request-modal');
    requestModal.addEventListener('click', function (event) {
      if (event.target.id === 'doc-request-modal' || event.target.closest('[data-request-close]')) {
        closeRequestReview();
        return;
      }
      var pick = event.target.closest('[data-next-status]');
      if (pick) {
        if (pick.disabled) return;
        openConfirm(pick.getAttribute('data-request-id'), pick.getAttribute('data-next-status'));
        return;
      }
      var replace = event.target.closest('[data-request-replace]');
      if (replace) {
        var replaceInput = document.getElementById('doc-request-file');
        if (replaceInput && !state.uploading) replaceInput.click();
        return;
      }
      var remove = event.target.closest('[data-request-remove]');
      if (remove) {
        removeRequestFile(remove.getAttribute('data-request-remove'));
        return;
      }
      if (event.target.closest('#doc-request-drop') && event.target.id !== 'doc-request-file') {
        var input = document.getElementById('doc-request-file');
        if (input && !state.uploading) input.click();
      }
    });
    requestModal.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (!event.target.closest('#doc-request-drop')) return;
      event.preventDefault();
      var input = document.getElementById('doc-request-file');
      if (input && !state.uploading) input.click();
    });
    requestModal.addEventListener('change', function (event) {
      if (event.target.id !== 'doc-request-file') return;
      var file = event.target.files && event.target.files[0];
      var zone = document.getElementById('doc-request-drop');
      uploadRequestFile(zone ? zone.getAttribute('data-request-id') : state.openRequestId, file);
      event.target.value = '';
    });
    requestModal.addEventListener('dragover', function (event) {
      if (!event.target.closest('#doc-request-drop')) return;
      event.preventDefault();
      event.target.closest('#doc-request-drop').classList.add('is-over');
    });
    requestModal.addEventListener('dragleave', function (event) {
      var zone = event.target.closest('#doc-request-drop');
      if (zone) zone.classList.remove('is-over');
    });
    requestModal.addEventListener('drop', function (event) {
      var zone = event.target.closest('#doc-request-drop');
      if (!zone) return;
      event.preventDefault();
      zone.classList.remove('is-over');
      var file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
      uploadRequestFile(zone.getAttribute('data-request-id'), file);
    });
    document.getElementById('doc-confirm').addEventListener('click', function (event) {
      if (event.target.id === 'doc-confirm-cancel' || event.target.hasAttribute('data-confirm-cancel')) {
        closeConfirm();
        return;
      }
      if (event.target.id !== 'doc-confirm-ok' || !state.confirm || state.savingStatus) return;
      if (state.confirm.kind === 'course-release') {
        releaseCourseDocument(state.confirm.documentId);
        return;
      }
      var reason = document.getElementById('doc-confirm-hold');
      updateRequest(state.confirm.requestId, state.confirm.next, reason && !reason.closest('[hidden]') ? reason.value.trim() : '');
    });
    document.getElementById('doc-table-wrap').addEventListener('click', function (event) {
      var open = event.target.closest('[data-doc-open]');
      if (open) openRecord(open.getAttribute('data-doc-open'), open.getAttribute('data-doc-focus'));
    });
    document.getElementById('doc-course-release').addEventListener('click', function (event) {
      var button = event.target.closest('[data-course-filter]');
      if (!button) return;
      var select = document.getElementById('doc-course');
      if (select) select.value = button.getAttribute('data-course-filter') || '';
      readFilters();
    });
    document.getElementById('doc-course-release').addEventListener('change', function (event) {
      if (event.target.id === 'doc-assessment-date') saveAssessmentDate(event.target.value);
    });
    var reviewModal = document.getElementById('doc-modal');
    reviewModal.addEventListener('click', function (event) {
      if (event.target.id === 'doc-modal' || event.target.closest('[data-doc-close]')) {
        closeModal();
        return;
      }
      var release = event.target.closest('[data-course-release]');
      if (release) {
        openCourseReleaseConfirm(release.getAttribute('data-course-release'), release.getAttribute('data-course-name') || 'Document');
        return;
      }
      var view = event.target.closest('[data-course-view]');
      if (view) openCourseFile(view.getAttribute('data-course-view'), true);
      var download = event.target.closest('[data-course-download]');
      if (download) openCourseFile(download.getAttribute('data-course-download'), false);
    });
    reviewModal.addEventListener('change', function (event) {
      if (event.target.classList.contains('registration-follow-up-file')) {
        uploadRegistrationFollowUp(event.target);
        return;
      }
      if (!event.target.classList.contains('course-doc-file')) return;
      var file = event.target.files && event.target.files[0];
      uploadCourseFile(event.target.getAttribute('data-course-file'), file);
      event.target.value = '';
    });
    reviewModal.addEventListener('dragover', function (event) {
      if (!event.target.closest('.course-doc-drop')) return;
      event.preventDefault();
      event.target.closest('.course-doc-drop').classList.add('is-over');
    });
    reviewModal.addEventListener('dragleave', function (event) {
      var zone = event.target.closest('.course-doc-drop');
      if (zone) zone.classList.remove('is-over');
    });
    reviewModal.addEventListener('drop', function (event) {
      var zone = event.target.closest('.course-doc-drop');
      if (!zone) return;
      event.preventDefault();
      zone.classList.remove('is-over');
      var input = zone.querySelector('.course-doc-file');
      var file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
      uploadCourseFile(input ? input.getAttribute('data-course-file') : '', file);
    });
    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;
      if (state.confirm) closeConfirm();
      else if (state.openRequestId) closeRequestReview();
      else closeModal();
    });
    return load();
  }

  // Reuse the canonical page markup and the exact queue/review workflow. Batch
  // history supplies its own snapshot; normal Document Management remains active-only.
  window.AbecRequestedDocuments = {
    prepare: function (host) {
      if (!document.body.classList.contains('batch-management-page')) return Promise.reject(new Error('Historical requests must be opened from Batch Management.'));
      if (document.getElementById('doc-body')) return Promise.resolve();
      if (!templateLoad) templateLoad = (async function () {
        var response = await fetch('/Views/Admin/DocumentManagement.html', { credentials: 'same-origin' });
        if (!response.ok) throw new Error('The Requested Documents view could not be loaded.');
        var template = new DOMParser().parseFromString(await response.text(), 'text/html');
        var board = template.querySelector('.doc-board');
        var dialogs = ['doc-confirm', 'doc-request-modal', 'doc-modal'].map(function (id) { return template.getElementById(id); });
        if (!board || !board.querySelector('#doc-body') || !board.querySelector('#doc-queue-body') || dialogs.some(function (el) { return !el; }))
          throw new Error('The Requested Documents view is unavailable. Sign in again and retry.');
        host.replaceChildren(document.importNode(board, true));
        dialogs.forEach(function (dialog) { document.body.appendChild(document.importNode(dialog, true)); });
      })().catch(function (err) { templateLoad = null; throw err; });
      return templateLoad;
    },
    open: async function (snapshot) {
      if (!document.body.classList.contains('batch-management-page') || !snapshot || !snapshot.batch) return false;
      historyBatchId = Number(snapshot.batch.batchId);
      initialHistorySnapshot = snapshot;
      state.queueOpen = true;
      await initialize();
      return !state.error && state.batchId === String(historyBatchId);
    },
    clear: function () {
      ++state.loadVersion;
      initialHistorySnapshot = null;
      clearBatchRecords();
      closeConfirm();
    },
    closeReview: function () { closeConfirm(); closeRequestReview(); closeModal(); },
    busy: function () { return state.savingStatus || state.uploading; },
    reviewOpen: function () { return !!(state.confirm || state.openRequestId || state.openKey); }
  };
  document.addEventListener('DOMContentLoaded', initialize);
})();
