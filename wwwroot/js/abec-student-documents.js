/* Student Document Request page ↔ shared document request statuses from DB */
(function () {
  'use strict';
  if (!window.AbecApi) return;

  var PURPOSE_LABELS = {
    job: 'Job Application',
    school: 'Further Studies',
    personal: 'Personal Records',
    other: 'Other'
  };

  var DOC_OPTIONS = [
    { value: 'National Certificate (TESDA)', label: 'National Certificate (TESDA)' },
    { value: 'Payment Receipt', label: 'Payment Receipt' },
    { value: 'Certificate of Completion', label: 'Certificate of Completion' }
  ];

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

  function statusHint(status) {
    switch (normalizeStatus(status)) {
      case 'Not Requested': return 'You have not requested this document yet.';
      case 'Pending': return 'Your request was submitted and is waiting for admin action.';
      case 'Processing': return 'The admin is currently processing this document.';
      case 'On Hold': return 'This request is temporarily on hold.';
      case 'Released': return 'Officially released and ready for collection.';
      case 'Rejected': return 'This request was rejected. You can submit a new request.';
      default: return '';
    }
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

  function timelineSteps(status) {
    var current = normalizeStatus(status);
    var order = ['Pending', 'Processing', 'On Hold', 'Released'];
    if (current === 'Not Requested') {
      return order.map(function (label) { return { label: label, state: 'pending' }; });
    }
    if (current === 'Rejected') {
      return [
        { label: 'Pending', state: 'done' },
        { label: 'Rejected', state: 'current' }
      ];
    }

    return order.map(function (label) {
      if (label === 'On Hold' && current !== 'On Hold') {
        return { label: label, state: 'skipped' };
      }
      if (current === 'On Hold') {
        if (label === 'Pending' || label === 'Processing') return { label: label, state: 'done' };
        if (label === 'On Hold') return { label: label, state: 'current' };
        return { label: label, state: 'pending' };
      }
      var linear = ['Pending', 'Processing', 'Released'];
      var eIdx = linear.indexOf(current);
      var labelIdx = linear.indexOf(label);
      if (label === 'On Hold') return { label: label, state: 'skipped' };
      if (labelIdx < 0) return { label: label, state: 'pending' };
      if (labelIdx < eIdx) return { label: label, state: 'done' };
      if (labelIdx === eIdx) return { label: label, state: 'current' };
      return { label: label, state: 'pending' };
    });
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

  function requestIsActive(request) {
    if (!request) return false;
    var status = normalizeStatus(request.requestStatus);
    return status === 'Pending' || status === 'Processing' || status === 'On Hold';
  }

  function requestsAreOpen() {
    var timeline = coursePack && coursePack.timeline;
    return !!(timeline && timeline.requestsOpen);
  }

  function eligibleDocumentTypes() {
    if (!requestsAreOpen()) return [];
    return (coursePack && coursePack.documents || []).filter(function (doc) {
      return prepLabel(doc.preparationStatus) !== 'Released' && !requestIsActive(latestRequest(doc.documentType));
    }).map(function (doc) { return doc.documentType; });
  }

  function renderReleaseBoard() {
    var host = document.getElementById('doc-release-info');
    if (!host) return;
    var timeline = coursePack && coursePack.timeline;
    if (!timeline) {
      host.textContent = 'Release information is not available yet.';
      return;
    }
    var course = (window.AbecApi && AbecApi.displayCourseName)
      ? (AbecApi.displayCourseName(timeline.courseName) || 'Your course')
      : (timeline.courseName || 'Your course');
    var lines = ['<p class="font-bold text-abec-navy">' + esc(course) + ' — Document Release Information</p>'];
    if (timeline.programSummary) lines.push('<p class="mt-1">Course program: ' + esc(timeline.programSummary) + '</p>');
    if (timeline.batchName) lines.push('<p class="mt-1">Batch: ' + esc(timeline.batchName) + '</p>');
    lines.push('<p class="mt-1">' + esc(timeline.studentReleaseMessage || 'The release date has not yet been determined.') + '</p>');
    if (!timeline.requestsOpen) {
      lines.push('<p class="mt-2 font-semibold text-amber-800">Document requests will become available after you complete your training.</p>');
    }
    if (timeline.trainingCompletionDisplay) lines.push('<p class="mt-1">Training completion: ' + esc(timeline.trainingCompletionDisplay) + '</p>');
    if (timeline.assessmentDisplay) lines.push('<p class="mt-1">Assessment date: ' + esc(timeline.assessmentDisplay) + '</p>');
    host.innerHTML = lines.join('');
  }

  function renderCatalog() {
    var host = document.getElementById('credentials-grid');
    if (!host) return;
    var documents = (coursePack && coursePack.documents) || [];
    if (!documents.length) {
      host.innerHTML = '<div class="rounded-xl border border-slate-200 px-4 py-8 text-center text-sm text-slate-500 md:col-span-2">Course documents could not be loaded.</div>';
      return;
    }

    host.innerHTML = documents.map(function (doc) {
      var prep = prepLabel(doc.preparationStatus);
      var request = latestRequest(doc.documentType);
      var requestStatus = request ? normalizeStatus(request.requestStatus) : '';
      var released = prep === 'Released';
      var active = requestIsActive(request);
      var canRequest = requestsAreOpen() && !released && !active;
      var action = '';
      if (canRequest) {
        action = '<button type="button" class="doc-request-btn mt-3 w-full bg-abec-navy hover:bg-[#1A4B7A] text-white text-xs font-bold px-3 py-2.5 rounded-md transition-colors" data-doc-type="' + esc(doc.documentType) + '">' +
          (requestStatus === 'Rejected' ? 'Request Again' : 'Request Document') + '</button>';
      } else if (released) {
        action = doc.hasFile
          ? '<div class="mt-3 flex gap-2"><a class="inline-flex flex-1 items-center justify-center rounded-md bg-abec-navy px-3 py-2.5 text-xs font-bold text-white" href="/api/course-documents/' + encodeURIComponent(doc.courseDocumentId) + '/file?studentId=' + encodeURIComponent(currentStudentId) + '&inline=true" target="_blank" rel="noopener">View</a>' +
            '<a class="inline-flex flex-1 items-center justify-center rounded-md border border-abec-navy px-3 py-2.5 text-xs font-bold text-abec-navy" href="/api/course-documents/' + encodeURIComponent(doc.courseDocumentId) + '/file?studentId=' + encodeURIComponent(currentStudentId) + '">Download</a></div>'
          : '<p class="mt-3 text-[11px] text-slate-500">This document has been released.</p>';
      } else {
        action = '<p class="mt-3 text-[11px] text-slate-500">Your request is open. Status updates when ABEC processes it.</p>';
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

    host.querySelectorAll('.doc-request-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        openModal(btn.getAttribute('data-doc-type') || '');
      });
    });
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
    var trackHost = document.getElementById('request-tracking-list');
    if (!tbody) return;

    var rows = (list || []).map(function (r) {
      return Object.assign({}, r, { requestStatus: normalizeStatus(r.requestStatus) });
    }).sort(function (a, b) { return new Date(b.requestDate) - new Date(a.requestDate); });

    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="px-6 py-10 text-center text-sm text-slate-500">No recent document requests.</td></tr>';
      if (trackHost) {
        trackHost.innerHTML = '<p class="text-sm text-slate-500 px-1 py-4">Submit a request to start tracking progress.</p>';
      }
      return;
    }

    tbody.innerHTML = rows.slice(0, 3).map(function (r) {
      return (
        '<tr class="hover:bg-slate-50/80" data-request-id="' + esc(r.requestId) + '" data-document-type="' + esc(r.documentType) + '">' +
          '<td data-label="Document" class="px-6 py-4 text-slate-800">' + esc(r.documentType) + '</td>' +
          '<td data-label="Requested" class="px-6 py-4 text-slate-600">' + esc(AbecApi.formatDate(r.requestDate)) + '</td>' +
          '<td data-label="Status" class="px-6 py-4">' + statusBadgeHtml(r.requestStatus) + '</td>' +
          '<td data-label="Purpose" class="px-6 py-4 text-slate-600">' + esc(purposeDisplay(r)) + '</td>' +
        '</tr>'
      );
    }).join('');

    if (trackHost) {
      trackHost.innerHTML = rows.map(function (r) {
        var steps = timelineSteps(r.requestStatus);
        return (
          '<article data-document-type="' + esc(r.documentType) + '" class="rounded-xl border border-slate-200 p-4">' +
            '<div class="flex flex-wrap items-center justify-between gap-2 mb-3">' +
              '<div>' +
                '<p class="text-sm font-bold text-abec-navy">' + esc(r.documentType) + '</p>' +
                '<p class="text-xs text-slate-500 mt-0.5">' + esc(AbecApi.formatDate(r.requestDate)) + '</p>' +
                '<p class="text-xs text-slate-600 mt-1">Purpose: ' + esc(purposeDisplay(r)) + '</p>' +
                releaseNote(r.requestStatus) +
              '</div>' +
              statusBadgeHtml(r.requestStatus, 'lg') +
            '</div>' +
            (r.requestStatus === 'Released' ? '' : '<p class="text-xs text-slate-600 mb-3">' + esc(statusHint(r.requestStatus)) + '</p>') +
            (r.holdReason && r.requestStatus === 'On Hold'
              ? '<p class="text-xs text-orange-700 mb-3">Hold reason: ' + esc(r.holdReason) + '</p>'
              : '') +
            '<ol class="grid grid-cols-2 sm:grid-cols-4 gap-2">' +
              steps.map(function (step) {
                var cls = 'rounded-lg border px-2 py-2 text-center text-[10px] font-bold ';
                if (step.state === 'done') cls += 'border-emerald-200 bg-emerald-50 text-emerald-700';
                else if (step.state === 'current') cls += 'border-abec-navy bg-abec-navy text-white';
                else if (step.state === 'skipped') cls += 'border-slate-100 bg-slate-50 text-slate-300';
                else cls += 'border-slate-200 bg-white text-slate-400';
                return '<li class="' + cls + '">' + esc(step.label) + '</li>';
              }).join('') +
            '</ol>' +
          '</article>'
        );
      }).join('');
    }
  }

  var notificationTargetApplied = false;
  function applyNotificationTarget() {
    if (notificationTargetApplied) return;
    var params = new URLSearchParams(window.location.search);
    var requestType = (params.get('requestType') || '').trim().toLowerCase();
    if (!requestType) return;
    var row = Array.from(document.querySelectorAll('#request-tracking-list [data-document-type]')).find(function (el) {
      return (el.getAttribute('data-document-type') || '').trim().toLowerCase() === requestType;
    });
    if (!row) return;
    notificationTargetApplied = true;
    openStudentDialog('request-tracking-modal');
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
    var eligible = eligibleDocumentTypes();
    var options = DOC_OPTIONS.filter(function (d) { return eligible.indexOf(d.value) >= 0; });
    if (!options.length) options = DOC_OPTIONS.filter(function (d) { return d.value === selected; });
    select.innerHTML = options.map(function (d) {
      return '<option value="' + esc(d.value) + '"' + (d.value === selected ? ' selected' : '') + '>' + esc(d.label) + '</option>';
    }).join('');
  }

  function openModal(docType) {
    var modal = document.getElementById('new-request-modal');
    if (!modal) return;
    populateDocumentSelect(docType || DOC_OPTIONS[0].value);
    var purposeEl = document.getElementById('req-purpose');
    var purposeOtherEl = document.getElementById('req-purpose-other');
    if (purposeEl) purposeEl.value = 'job';
    if (purposeOtherEl) purposeOtherEl.value = '';
    if (window.AbecOtherReason) {
      AbecOtherReason.bindOtherReason('#req-purpose', '#req-purpose-other-wrap', '#req-purpose-other');
    }
    openStudentDialog('new-request-modal');
  }

  var dialogTrigger = null;
  var activeDialogId = '';

  function openStudentDialog(id) {
    var modal = document.getElementById(id);
    if (!modal) return;
    if (activeDialogId) closeStudentDialog();
    dialogTrigger = document.activeElement;
    activeDialogId = id;
    modal.classList.remove('hidden');
    document.body.classList.add('student-dialog-open');
    var title = modal.querySelector('[tabindex="-1"]');
    if (title) title.focus();
  }

  function closeStudentDialog() {
    var modal = document.getElementById(activeDialogId);
    if (modal) modal.classList.add('hidden');
    activeDialogId = '';
    document.body.classList.remove('student-dialog-open');
    if (dialogTrigger && dialogTrigger.isConnected) dialogTrigger.focus();
    dialogTrigger = null;
  }

  function closeModal() {
    if (activeDialogId === 'new-request-modal') closeStudentDialog();
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

  async function submitRequest(session, form) {
    var docEl = form.querySelector('#req-document');
    var purposeEl = form.querySelector('#req-purpose');
    var purposeOtherEl = form.querySelector('#req-purpose-other');
    var documentType = (docEl && docEl.value) || '';
    var purposeKey = (purposeEl && purposeEl.value) || 'other';
    var reason = PURPOSE_LABELS[purposeKey] || purposeKey || 'Document request';
    var specificReason = null;

    if (!documentType) {
      alert('Please select a document type.');
      return;
    }
    if (eligibleDocumentTypes().indexOf(documentType) < 0) {
      alert('This document has already been released or already has an open request.');
      return;
    }

    if (window.AbecOtherReason) {
      var check = AbecOtherReason.requireIfOther(reason, purposeOtherEl && purposeOtherEl.value, 'specific reason');
      if (!check.ok) {
        alert(check.message);
        if (purposeOtherEl) purposeOtherEl.focus();
        return;
      }
      specificReason = check.specificReason;
    } else if (String(reason).toLowerCase() === 'other') {
      var detail = (purposeOtherEl && purposeOtherEl.value || '').trim();
      if (!detail) {
        alert('Please enter a specific reason when Other is selected.');
        return;
      }
      specificReason = detail;
    }

    var payload = {
      documentType: documentType,
      reason: reason
    };
    if (specificReason) payload.specificReason = specificReason;

    var result = await AbecApi.post('/api/document-requests/student/' + session.userId, payload);

    alert(result.message || (result.success ? 'Request submitted. Status is now Pending.' : 'Unable to submit request.'));
    if (result.success) {
      closeModal();
      form.reset();
      if (window.AbecOtherReason) {
        AbecOtherReason.bindOtherReason('#req-purpose', '#req-purpose-other-wrap', '#req-purpose-other');
      }
      await refreshStatuses(session, true);
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    var path = (window.location.pathname || '').toLowerCase();
    if (path.indexOf('documentrequest') === -1) return;

    var session = AbecApi.requireRole('Student');
    if (!session) return;

    var modal = document.getElementById('new-request-modal');
    var trackingBtn = document.getElementById('btn-request-tracking');
    var trackingModal = document.getElementById('request-tracking-modal');
    var form = document.getElementById('new-request-form');

    if (trackingBtn) trackingBtn.addEventListener('click', function () {
      openStudentDialog('request-tracking-modal');
    });
    if (trackingModal) trackingModal.querySelectorAll('[data-close-tracking]').forEach(function (el) {
      el.addEventListener('click', closeStudentDialog);
    });
    if (modal) {
      modal.querySelectorAll('[data-close-modal]').forEach(function (el) {
        el.addEventListener('click', closeModal);
      });
    }
    document.addEventListener('keydown', function (e) {
      if (!activeDialogId) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        closeStudentDialog();
      }
      if (e.key !== 'Tab') return;
      var dialog = document.getElementById(activeDialogId);
      var focusable = Array.from(dialog.querySelectorAll('button, a[href], input, select, textarea, [tabindex="0"]')).filter(function (el) {
        return !el.disabled && el.getClientRects().length;
      });
      if (!focusable.length) { e.preventDefault(); return; }
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (e.shiftKey && (document.activeElement === first || focusable.indexOf(document.activeElement) < 0)) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || focusable.indexOf(document.activeElement) < 0)) {
        e.preventDefault(); first.focus();
      }
    });
    if (form) {
      form.addEventListener('submit', async function (e) {
        e.preventDefault();
        await submitRequest(session, form);
      });
    }

    if (window.AbecOtherReason) {
      AbecOtherReason.bindOtherReason('#req-purpose', '#req-purpose-other-wrap', '#req-purpose-other');
    }

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
