/* Student Document Request page ↔ shared document request statuses from DB */
(function () {
  'use strict';
  if (!window.AbecApi) return;

  var coursePack = null;
  var requestRows = [];
  var currentStudentId = 0;

  var ALLOWED_STATUSES = [
    'Not Requested',
    'Pending',
    'Processing',
    'On Hold',
    'Released',
    'Rejected'
  ];

  var refreshTimer = null;

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /** Shared canonical statuses — never display Approved. */
  function normalizeStatus(status) {
    var raw = String(status == null ? '' : status).trim();
    var lower = raw.toLowerCase();
    if (!lower || lower === 'not requested' || lower === 'notrequested') return 'Not Requested';
    if (lower === 'pending') return 'Pending';
    if (lower === 'processing' || lower === 'approved') return 'Processing';
    if (lower === 'on hold' || lower === 'onhold' || lower === 'hold') return 'On Hold';
    if (lower === 'rejected' || lower === 'reject') return 'Rejected';
    if (lower === 'ready for release' || lower === 'readyforrelease' || lower === 'ready') return 'Processing';
    if (lower === 'released' || lower === 'archived') return 'Released';
    for (var i = 0; i < ALLOWED_STATUSES.length; i++) {
      if (ALLOWED_STATUSES[i].toLowerCase() === lower) return ALLOWED_STATUSES[i];
    }
    return 'Not Requested';
  }

  function statusBadgeClass(status) {
    var key = normalizeStatus(status).toLowerCase();
    if (key === 'not requested') return 'bg-slate-100 text-slate-600 border border-slate-200';
    if (key === 'pending') return 'bg-amber-100 text-amber-800 border border-amber-200';
    if (key === 'processing') return 'bg-sky-100 text-sky-800 border border-sky-200';
    if (key === 'on hold') return 'bg-orange-100 text-orange-800 border border-orange-200';
    if (key === 'ready for release') return 'bg-emerald-100 text-emerald-800 border border-emerald-200';
    if (key === 'released') return 'bg-violet-100 text-violet-800 border border-violet-200';
    if (key === 'rejected') return 'bg-rose-100 text-rose-800 border border-rose-200';
    return 'bg-slate-100 text-slate-600 border border-slate-200';
  }

  function iconFor(docType) {
    var lower = String(docType || '').toLowerCase();
    if (lower.indexOf('payment') !== -1 || lower.indexOf('receipt') !== -1) {
      return 'M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z';
    }
    if (lower.indexOf('completion') !== -1) {
      return 'M12 14l9-5-9-5-9 5 9 5z M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z M12 14v7';
    }
    if (lower.indexOf('training') !== -1) {
      return 'M12 14l9-5-9-5-9 5 9 5zm0 0v7';
    }
    if (lower.indexOf('national') !== -1 || lower.indexOf('tesda') !== -1 || lower.indexOf('certificate') !== -1) {
      return 'M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z';
    }
    return 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z';
  }

  function releaseNote(status) {
    if (normalizeStatus(status) !== 'Released') return '';
    return '<p class="mt-2 flex items-start gap-1.5 text-xs font-semibold leading-snug text-green-700">' +
      '<svg class="mt-0.5 h-4 w-4 shrink-0 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path stroke-linecap="round" stroke-linejoin="round" d="M8 12.5l2.5 2.5L16 9.5"></path></svg>' +
      '<span>Officially released and ready for collection.</span></p>';
  }

  function statusBadgeHtml(status, size) {
    var label = normalizeStatus(status);
    var pad = size === 'lg' ? 'px-3 py-1.5 text-[11px]' : 'px-2.5 py-1 text-[10px]';
    return '<span class="inline-flex items-center shrink-0 rounded-full font-bold uppercase tracking-wide ' + pad + ' ' + statusBadgeClass(label) + '">' + esc(label) + '</span>';
  }

  function prepLabel(status) {
    var raw = String(status == null ? '' : status).trim().toLowerCase();
    if (raw === 'ready for release') return 'Ready for Release';
    if (raw === 'released') return 'Released';
    return 'Not Prepared';
  }

  function prepBadgeClass(status) {
    var label = prepLabel(status);
    if (label === 'Ready for Release') return 'bg-emerald-100 text-emerald-800 border border-emerald-200';
    if (label === 'Released') return 'bg-violet-100 text-violet-800 border border-violet-200';
    return 'bg-slate-100 text-slate-600 border border-slate-200';
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

  function latestRequest(documentType) {
    var matches = requestRows.filter(function (row) {
      return sameDocument(row.documentType, documentType);
    });
    matches.sort(function (a, b) { return String(b.requestDate || '').localeCompare(String(a.requestDate || '')); });
    return matches[0] || null;
  }

  function renderReleaseBoard() {
    var host = document.getElementById('doc-release-info');
    if (!host) return;
    var timeline = coursePack && coursePack.timeline;
    if (!timeline) {
      host.textContent = 'Release information is not available yet.';
      return;
    }
    var lines = ['<p class="font-bold text-abec-navy">Document Release Information</p>'];
    if (timeline.programSummary) lines.push('<p class="mt-1">Course program: ' + esc(timeline.programSummary) + '</p>');
    if (timeline.batchName) lines.push('<p class="mt-1">Batch: ' + esc(timeline.batchName) + '</p>');
    lines.push('<p class="mt-1">' + esc(timeline.studentReleaseMessage || 'The release date has not yet been determined.') + '</p>');
    if (timeline.trainingCompletionDisplay) lines.push('<p class="mt-1">Training completion: ' + esc(timeline.trainingCompletionDisplay) + '</p>');
    if (timeline.assessmentDisplay) lines.push('<p class="mt-1">Assessment date: ' + esc(timeline.assessmentDisplay) + '</p>');
    host.innerHTML = lines.join('');
  }

  function renderCatalog() {
    var host = document.getElementById('credentials-grid');
    if (!host) return;
    var existing = coursePack && coursePack.documents || [];
    var documents = (coursePack && coursePack.catalog || []).map(function (item) {
      var stored = existing.find(function (d) { return sameDocument(d.documentType, item.documentType); }) || {};
      return Object.assign({}, stored, item, { preparationStatus: item.status === 'Released' ? 'Released' : stored.preparationStatus || 'Not Prepared' });
    });
    if (!documents.length) {
      host.innerHTML = '<div class="rounded-xl border border-slate-200 px-4 py-8 text-center text-sm text-slate-500 md:col-span-2">Course documents could not be loaded.</div>';
      return;
    }

    host.innerHTML = documents.map(function (doc) {
      var prep = prepLabel(doc.preparationStatus);
      var request = latestRequest(doc.documentType);
      var requestStatus = request ? normalizeStatus(request.requestStatus) : '';
      var released = prep === 'Released';
      var action = '';
      if (released) {
        action = doc.downloadUrl
          ? '<div class="mt-3 flex gap-2"><a class="doc-link" href="' + esc(doc.downloadUrl) + '?inline=true" target="_blank" rel="noopener">View</a><a class="doc-link" href="' + esc(doc.downloadUrl) + '">Download</a></div>'
          : '<p class="mt-3 text-xs">Released. Contact the registrar if a soft copy is unavailable.</p>';
      } else if (doc.requestBlockedMessage && !/already have an open request for this document/i.test(doc.requestBlockedMessage)) {
        action = '<p class="mt-2 text-xs text-slate-600">' + esc(doc.requestBlockedMessage) + '</p>';
      }
      var requestBlock = '';
      if (request && !released && requestStatus !== 'Released') {
        requestBlock = '<div class="mt-3"><p class="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">Request</p>' +
          statusBadgeHtml(requestStatus, 'lg') +
          (request.holdReason && (requestStatus === 'On Hold' || requestStatus === 'Rejected')
            ? '<p class="text-[11px] text-orange-700 mt-1.5 font-medium">Reason: ' + esc(request.holdReason) + '</p>'
            : '') +
          '</div>';
      } else if (request && released && requestStatus === 'Released') {
        requestBlock = '<p class="mt-2 text-[11px] font-semibold text-emerald-700">Request fulfilled</p>';
      }

      return (
        '<div class="rounded-xl border border-slate-200 bg-white px-4 py-4 flex flex-col h-full' + (doc.isOverdue ? ' border-rose-200' : '') + '">' +
          '<div class="flex items-start gap-3">' +
            '<div class="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 text-abec-navy">' +
              '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="' + iconFor(doc.documentType) + '" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg>' +
            '</div>' +
            '<div class="min-w-0 flex-1">' +
              '<p class="text-sm font-bold text-abec-navy">' + esc(doc.documentType) + '</p>' +
              (doc.documentType === 'National Certificate (TESDA)' ? '<p class="mt-1 text-xs font-semibold text-slate-700">' + esc(coursePack.timeline && coursePack.timeline.courseName || 'Enrolled course') + '</p><p class="mt-2 text-xs text-slate-600">' + esc(doc.description) + '</p>' : '') +
              (released ? releaseNote('Released') : '') +
              '<div class="mt-3 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2.5">' +
                '<p class="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">Release status</p>' +
                '<span class="inline-flex items-center shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide ' + prepBadgeClass(prep) + '">' + esc(prep) + '</span>' +
                (doc.isOverdue ? '<p class="text-[11px] font-semibold text-rose-700 mt-2">Past the expected release deadline.</p>' : '') +
                (doc.releaseDeadlineDisplay ? '<p class="text-[11px] text-slate-600 mt-2">Expected release: ' + esc(doc.releaseDeadlineDisplay) + '</p>' : '') +
                (doc.releasedAt ? '<p class="text-[11px] text-slate-500 mt-1">Released ' + esc(AbecApi.formatDate(doc.releasedAt)) + '</p>' : '') +
                requestBlock +
              '</div>' +
              action +
            '</div>' +
          '</div>' +
        '</div>'
      );
    }).join('');

  }

  function purposeDisplay(r) {
    var reason = r.reason || '—';
    var specific = r.specificReason || '';
    if (window.AbecOtherReason) return AbecOtherReason.formatDisplay(reason, specific);
    if (String(reason).toLowerCase() === 'other' && specific) return 'Other — ' + specific;
    return reason;
  }

  function renderRecent(list) {
    var tbody = document.getElementById('recent-requests-body');
    if (!tbody) return;
    var rows = (list || []).slice().sort(function (a, b) { return new Date(b.requestDate) - new Date(a.requestDate); });
    tbody.innerHTML = rows.length ? rows.map(function (r) {
      return '<tr class="hover:bg-slate-50/80" tabindex="-1" data-request-id="' + esc(r.requestId) + '" data-document-type="' + esc(r.documentType) + '">' +
        '<td data-label="Document" class="px-6 py-4 text-slate-800">' + esc(r.documentType) + '</td>' +
        '<td data-label="Requested" class="px-6 py-4 text-slate-600">' + esc(AbecApi.formatDate(r.requestDate)) + '</td>' +
        '<td data-label="Status" class="px-6 py-4">' + statusBadgeHtml(r.requestStatus) + '</td>' +
        '<td data-label="Purpose" class="px-6 py-4 text-slate-600">' + esc(purposeDisplay(r)) + '</td></tr>';
    }).join('') : '<tr><td colspan="4" class="px-6 py-10 text-center text-sm text-slate-500">No document requests yet.</td></tr>';
  }

  var notificationTargetApplied = false;
  function applyNotificationTarget() {
    if (notificationTargetApplied) return;
    var params = new URLSearchParams(window.location.search);
    if (params.has('requestType')) params = AbecApi.consumePageAction(['requestType']);
    var requestType = (params.get('requestType') || '').trim().toLowerCase();
    if (!requestType) return;
    var row = Array.from(document.querySelectorAll('#recent-requests-body [data-document-type]')).find(function (el) {
      return (el.getAttribute('data-document-type') || '').trim().toLowerCase() === requestType;
    });
    if (!row) return;
    notificationTargetApplied = true;
    row.focus({ preventScroll: true });
    row.classList.add('abec-notification-highlight');
    row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    window.setTimeout(function () { row.classList.remove('abec-notification-highlight'); }, 5600);
  }

  function fillProfile(profile) {
    var nameEl = document.getElementById('req-full-name');
    var contactEl = document.getElementById('req-contact');
    var courseEl = document.getElementById('req-course');
    if (nameEl) nameEl.value = profile.fullName || '';
    if (contactEl) contactEl.value = profile.email || profile.contactNumber || '';
    if (courseEl) {
      courseEl.innerHTML = '';
      var opt = document.createElement('option');
      opt.value = profile.courseName || '';
      opt.textContent = (window.AbecApi && AbecApi.displayCourseName)
        ? (AbecApi.displayCourseName(profile.courseName) || 'No enrolled course')
        : (profile.courseName || 'No enrolled course');
      opt.selected = true;
      courseEl.appendChild(opt);
      courseEl.disabled = true;
    }
  }

  function populateDocumentSelect(selected) {
    var select = document.getElementById('req-document');
    if (!select) return;
    select.innerHTML = '<option value="' + esc(selected) + '">' + esc(selected) + '</option>';
    select.disabled = true;
    var title = document.getElementById('new-request-title');
    if (title) title.textContent = 'Request ' + selected;

  }

  async function refreshStatuses(session, includeProfile) {
    if (includeProfile) {
      var profileRes = await AbecApi.get('/api/student/' + session.userId + '/profile');
      var profile = (profileRes.success && profileRes.data) ? profileRes.data : { fullName: session.displayName };
      var name = profile.fullName || session.displayName || 'Student';
      var initialsEl = document.getElementById('sidebar-initials');
      if (initialsEl) initialsEl.textContent = AbecApi.initials(name);
      var nameEl = document.getElementById('sidebar-name');
      if (nameEl) nameEl.textContent = name;
      var roleEl = document.getElementById('sidebar-role');
      if (roleEl) {
        roleEl.textContent = (window.AbecApi && AbecApi.displayCourseName)
          ? (AbecApi.displayCourseName(profile.courseName) || 'Student')
          : (profile.courseName || 'Student');
      }
      fillProfile(profile);
    }

    currentStudentId = session.userId;
    var releaseRes = await AbecApi.get('/api/course-documents/student/' + session.userId);
    coursePack = releaseRes.success ? releaseRes.data : null;
    renderReleaseBoard();

    var listRes = await AbecApi.get('/api/document-requests/student/' + session.userId);
    requestRows = listRes.success ? (listRes.data || []) : [];
    renderCatalog();
    renderRecent(requestRows);
    applyNotificationTarget();
  }

  document.addEventListener('DOMContentLoaded', function () {
    var path = (window.location.pathname || '').toLowerCase();
    if (path.indexOf('documentrequest') === -1) return;

    var session = AbecApi.requireRole('Student');
    if (!session) return;

    refreshStatuses(session, true);
    // Keep student statuses in sync with admin DB updates.
    refreshTimer = setInterval(function () {
      refreshStatuses(session, false);
    }, 15000);

    window.addEventListener('beforeunload', function () {
      if (refreshTimer) clearInterval(refreshTimer);
    });
  });
})();
