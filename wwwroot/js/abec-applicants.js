/* Applicant page ↔ backend bridge */
(function () {
  'use strict';
  if (!window.AbecApi) return;

  var statusStyles = {
    pending: 'bg-amber-100 text-amber-700',
    approved: 'bg-green-100 text-green-700',
    confirmed: 'bg-emerald-100 text-emerald-800',
    rejected: 'bg-red-100 text-red-700',
    waitlisted: 'bg-slate-200 text-slate-600',
    declined: 'bg-orange-100 text-orange-800',
    expired: 'bg-rose-100 text-rose-800'
  };

  function displayStatus(app) {
    var s = app.applicationStatus || 'Pending';
    if (s === 'Confirmed' || s === 'Confirmed Slot' || app.isSlotConfirmed) {
      return 'Confirmed Slot';
    }
    if (s === 'Declined' || (s === 'Rejected' && (app.declinedAt || app.slotResponse === 'Declined'))) {
      return 'Declined by Applicant';
    }
    if (s === 'Expired' || app.isResponseExpired) return 'Response Expired (24h)';
    if (s === 'Approved' && app.responseDeadline) {
      return 'Approved — Await Response';
    }
    return s;
  }

  function filterBucket(status) {
    if (status === 'confirmed' || status === 'confirmed slot') return 'approved';
    if (status === 'expired') return 'rejected';
    if (status === 'declined') return 'rejected';
    return status;
  }

  function uiStatus(app) {
    var s = (app.applicationStatus || '').toLowerCase();
    if (s === 'confirmed' || s === 'confirmed slot') return 'confirmed';
    if (s === 'rejected' && (app.declinedAt || app.slotResponse === 'Declined')) return 'declined';
    if (app.isResponseExpired) return 'expired';
    return s || 'pending';
  }

  function cardHtml(app) {
    var status = uiStatus(app);
    var bucket = filterBucket(status);
    var label = displayStatus(app);
    var initials = AbecApi.initials(app.fullName);
    var avatar = status === 'pending' ? 'amber'
      : status === 'rejected' || status === 'declined' ? 'red'
      : status === 'waitlisted' || status === 'expired' ? 'slate'
      : 'green';
    return (
      '<article class="applicant-card abec-card cursor-pointer" ' +
      'data-id="' + app.applicantId + '" ' +
      'data-status="' + bucket + '" ' +
      'data-raw-status="' + status + '" ' +
      'data-confirmed="' + (status === 'confirmed' ? '1' : '0') + '" ' +
      'data-deadline="' + escapeAttr(app.responseDeadline || '') + '" ' +
      'data-training="' + escapeAttr(app.assignedTrainingDateTime || '') + '" ' +
      'data-has-student="' + (app.hasStudentAccount ? '1' : '0') + '" ' +
      'data-avatar="' + avatar + '" ' +
      'data-name="' + escapeAttr(app.fullName) + '" ' +
      'data-display-name="' + escapeAttr(app.fullName) + '" ' +
      'data-date="' + escapeAttr(AbecApi.formatDate(app.applicationDate)) + '" ' +
      'data-iso="' + escapeAttr(String(app.applicationDate || '').slice(0, 10)) + '" ' +
      'data-email="' + escapeAttr(app.email) + '" ' +
      'data-phone="' + escapeAttr(app.contactNumber) + '" ' +
      'data-address="' + escapeAttr(app.address) + '" ' +
      'data-course="' + escapeAttr(app.courseName) + '" ' +
      'data-course-id="' + (app.courseId || '') + '" ' +
      'data-tesda-screening="' + escapeAttr(app.tesdaScreeningStatus || '') + '" ' +
      'data-tesda-summary="' + escapeAttr(app.tesdaScreeningSummary || '') + '" ' +
      'data-identity-type="' + escapeAttr(app.identityIdType || '') + '" ' +
      'data-reference="' + escapeAttr(app.applicationReference || '') + '" ' +
      'data-classification="' + escapeAttr(app.applicantClassification || '') + '" ' +
      'data-qualification="' + escapeAttr(app.qualificationType || '') + '" ' +
      'data-region="' + escapeAttr(app.addressRegion || '') + '" ' +
      'data-email-status="' + escapeAttr(app.emailNotificationStatus || '') + '" ' +
      'data-has-reg-docs="' + (app.hasRegistrationDocuments ? '1' : '0') + '" ' +
      'data-initials="' + escapeAttr(initials) + '" ' +
      'onclick="handleCardClick(this, event)">' +
      '<div class="flex items-start gap-4 p-5">' +
      '<label class="select-checkbox hidden pt-1" onclick="event.stopPropagation()">' +
      '<input type="checkbox" class="applicant-check rounded border-slate-300" onchange="toggleCardSelection(this)">' +
      '</label>' +
      '<div class="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ' + (avatar === 'amber' ? 'bg-amber-100 text-amber-700' : avatar === 'red' ? 'bg-red-100 text-red-700' : avatar === 'slate' ? 'bg-slate-200 text-slate-600' : 'bg-green-100 text-green-700') + '">' + initials + '</div>' +
      '<div class="min-w-0 flex-1">' +
      '<div class="flex items-start justify-between gap-3">' +
      '<div class="min-w-0">' +
      '<h4 class="text-sm font-bold text-abec-blue">' + escapeHtml(app.fullName) + '</h4>' +
      '<p class="text-[13px] text-slate-700 mt-1 leading-snug">' + escapeHtml(courseLabel(app.courseName) || 'No course selected') + '</p>' +
      '<p class="text-[11px] text-slate-400 mt-0.5">' + escapeHtml(app.email) + '</p>' +
      '</div>' +
      '<span class="inline-block px-2.5 py-0.5 rounded text-[10px] font-bold uppercase ' + (statusStyles[status] || statusStyles.pending) + '">' + escapeHtml(label) + '</span>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '</article>'
    );
  }

  function courseLabel(name) {
    return (window.AbecApi && AbecApi.displayCourseName) ? AbecApi.displayCourseName(name) : String(name || '');
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/'/g, '&#39;');
  }

  async function loadApplicants() {
    var list = document.getElementById('applicant-list');
    if (!list) return;
    var result = await AbecApi.get('/api/applicants');
    if (!result.success) {
      alert(result.message || 'Unable to load applicants.');
      return;
    }

    var empty = document.getElementById('applicants-empty');
    list.querySelectorAll('.applicant-card').forEach(function (c) { c.remove(); });

    (result.data || []).forEach(function (app) {
      list.insertAdjacentHTML('beforeend', cardHtml(app));
    });

    if (empty) empty.classList.toggle('hidden', (result.data || []).length > 0);
    if (typeof filterApplicants === 'function') filterApplicants();
    if (typeof updateSelectToolbarVisibility === 'function') updateSelectToolbarVisibility();

    await loadCourseSlots();

    var params = new URLSearchParams(window.location.search);
    var filterStatus = (params.get('status') || '').toLowerCase();
    if (filterStatus === 'approved' || filterStatus === 'waitlisted' || filterStatus === 'rejected' || filterStatus === 'pending') {
      var btn = document.querySelector('.status-pill[data-status="' + filterStatus + '"]');
      if (btn && typeof setStatusFilter === 'function') setStatusFilter(btn);
    }

    var openId = params.get('id');
    if (openId) {
      var card = document.querySelector('.applicant-card[data-id="' + openId + '"]');
      if (card && typeof openApplicantModal === 'function') {
        openApplicantModal(card);
      } else if (card && typeof handleCardClick === 'function') {
        handleCardClick(card, { stopPropagation: function () {} });
      }
    }

    var highlightId = params.get('highlight');
    if (highlightId) {
      var highlightCard = document.querySelector('.applicant-card[data-id="' + CSS.escape(highlightId) + '"]');
      if (highlightCard) {
        highlightCard.classList.add('abec-notification-highlight');
        highlightCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        window.setTimeout(function () { highlightCard.classList.remove('abec-notification-highlight'); }, 5600);
      }
    }
  }

  async function loadCourseSlots() {
    var grid = document.getElementById('slot-overview-grid');
    var filter = document.getElementById('course-filter');
    var selected = filter ? filter.value : 'all';
    if (window.AbecRecords && typeof window.AbecRecords.getCourse === 'function') {
      selected = window.AbecRecords.getCourse() || selected;
    }

    var result = await AbecApi.get('/api/courses');
    if (!result.success || !result.data) {
      if (grid) {
        grid.innerHTML = '<div class="slot-card abec-card abec-card-static p-5 text-sm text-slate-400">Unable to load course slots.</div>';
      }
      return;
    }

    var courses = result.data || [];
    if (window.AbecRecords && typeof window.AbecRecords.getCourse === 'function') {
      selected = window.AbecRecords.getCourse() || selected;
    }
    if (filter) {
      filter.innerHTML = '<option value="all">All Courses</option>' + courses.map(function (c) {
        return '<option value="' + escapeAttr(c.courseName) + '">' + escapeHtml(courseLabel(c.courseName)) + '</option>';
      }).join('');
      filter.value = selected;
      if (!Array.prototype.some.call(filter.options, function (o) { return o.value === selected; })) {
        filter.value = 'all';
      }
    }

    if (!grid) return;
    if (!courses.length) {
      grid.innerHTML = '<div class="slot-card abec-card abec-card-static p-5 text-sm text-slate-400">No courses available.</div>';
      return;
    }

    grid.innerHTML = courses.map(function (c) {
      var capacity = Number(c.capacity);
      if (!isFinite(capacity) || capacity < 0) capacity = 0;
      var filled = Number(c.filledSlots) || 0;
      // Available always mirrors occupancy: capacity − occupied.
      var remaining = Math.max(0, capacity - filled);
      if (typeof c.remainingSlots === 'number') {
        remaining = Math.max(0, c.remainingSlots);
      }
      var pct = capacity > 0 ? Math.min(100, Math.round((filled / capacity) * 100)) : 0;
      var isFull = remaining <= 0;
      var active = filter && filter.value === c.courseName;
      return (
        '<button type="button" class="slot-card abec-card abec-card-static p-5 text-left w-full' +
          (isFull ? ' is-full' : '') + (active ? ' is-active' : '') + '" ' +
          'aria-pressed="' + (active ? 'true' : 'false') + '" ' +
          'data-course="' + escapeAttr(c.courseName) + '" ' +
          'data-course-id="' + escapeAttr(c.courseId) + '" ' +
          'data-filled="' + filled + '" data-capacity="' + capacity + '" data-remaining="' + remaining + '" ' +
          'onclick="filterBySlotCourse(this)">' +
          '<p class="text-[15px] font-bold text-abec-navy leading-snug" title="' + escapeAttr(courseLabel(c.courseName)) + '">' + escapeHtml(courseLabel(c.courseName)) + '</p>' +
          '<p class="slot-available text-sm font-bold mt-1.5 ' + (isFull ? 'text-amber-700' : 'text-abec-blue') + '">' +
            remaining + ' Available Slot' + (remaining === 1 ? '' : 's') +
          '</p>' +
          '<div class="slot-progress mt-3" aria-hidden="true"><span style="width:' + pct + '%"></span></div>' +
        '</button>'
      );
    }).join('');

    if (window.AbecRecords && typeof window.AbecRecords.paintCourseStats === 'function') {
      window.AbecRecords.paintCourseStats();
    }
    if (typeof filterApplicants === 'function') filterApplicants();
  }

  function paintCourseCards(courseName) {
    document.querySelectorAll('#slot-overview-grid .slot-card[data-course]').forEach(function (el) {
      var on = !!courseName && courseName !== 'all' && el.getAttribute('data-course') === courseName;
      el.classList.toggle('is-active', on);
      el.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  window.filterBySlotCourse = function (card) {
    var course = card.getAttribute('data-course') || 'all';
    var filter = document.getElementById('course-filter');
    var current = filter ? filter.value : 'all';
    var next = current === course ? 'all' : course;
    if (window.AbecRecords && typeof window.AbecRecords.setCourse === 'function') {
      window.AbecRecords.setCourse(next);
      return;
    }
    if (!filter) return;
    filter.value = next;
    if (typeof filterApplicants === 'function') filterApplicants();
    paintCourseCards(next);
  };

  document.addEventListener('change', function (e) {
    if (!e.target || e.target.id !== 'course-filter') return;
    var value = e.target.value || 'all';
    if (window.AbecRecords && typeof window.AbecRecords.setCourse === 'function') {
      window.AbecRecords.setCourse(value);
      return;
    }
    paintCourseCards(value);
  });

  async function updateStatus(id, status) {
    var result = await AbecApi.put('/api/applicants/' + id + '/status', { status: status });
    if (!result.success) {
      alert(result.message || 'Unable to update status.');
      return false;
    }
    if (result.message) alert(result.message);
    return true;
  }

  async function addToSlot(id) {
    var result = await AbecApi.post('/api/applicants/' + id + '/add-to-slot');
    if (!result.success) {
      alert(result.message || 'Unable to add applicant to slot.');
      return false;
    }
    alert(result.message || 'Applicant added to training slot.');
    return true;
  }

  window.bulkUpdateStatus = async function (newStatus) {
    var selected = typeof getSelectedCards === 'function' ? getSelectedCards() : [];
    if (!selected.length) {
      alert('Please select at least one applicant.');
      return;
    }
    var ids = selected.map(function (card) { return parseInt(card.getAttribute('data-id'), 10); }).filter(Boolean);
    var result = await AbecApi.post('/api/applicants/bulk-status', { ids: ids, status: newStatus });
    if (!result.success) {
      alert(result.message || 'Bulk update failed.');
      return;
    }
    if (result.message) alert(result.message);
    if (typeof exitSelectionMode === 'function') exitSelectionMode();
    await loadApplicants();
    refreshRecordsBoard();
  };

  window.bulkAddToSlot = async function () {
    var selected = typeof getSelectedCards === 'function' ? getSelectedCards() : [];
    if (!selected.length) {
      alert('Please select at least one applicant.');
      return;
    }
    for (var i = 0; i < selected.length; i++) {
      var card = selected[i];
      if (card.getAttribute('data-confirmed') !== '1') {
        alert('Only applicants who confirmed their slot can be added to a training batch.');
        return;
      }
      var ok = await addToSlot(card.getAttribute('data-id'));
      if (!ok) return;
    }
    if (typeof exitSelectionMode === 'function') exitSelectionMode();
    await loadApplicants();
    refreshRecordsBoard();
  };

  window.restoreToPending = async function () {
    if (!window.activeModalCard) return;
    var id = window.activeModalCard.getAttribute('data-id');
    if (!(await updateStatus(id, 'pending'))) return;
    if (typeof closeApplicantModal === 'function') closeApplicantModal();
    await loadApplicants();
    refreshRecordsBoard();
  };

  function refreshRecordsBoard() {
    if (window.AbecRecords && typeof window.AbecRecords.reload === 'function') {
      window.AbecRecords.reload();
    }
  }

  var originalUpdateModalActions = window.updateModalActions;
  window.updateModalActions = function (status) {
    var card = window.activeModalCard;
    var raw = card ? (card.getAttribute('data-raw-status') || status) : status;
    if (raw === 'confirmed') {
      document.querySelectorAll('.modal-action-btn').forEach(function (btn) {
        var action = btn.getAttribute('data-action');
        btn.classList.toggle('hidden', action !== 'add-slot' || (card && card.getAttribute('data-has-student') === '1'));
      });
      document.getElementById('modal-actions').classList.remove('hidden');
      return;
    }
    if (raw === 'expired' || raw === 'declined') {
      document.querySelectorAll('.modal-action-btn').forEach(function (btn) {
        var action = btn.getAttribute('data-action');
        btn.classList.toggle('hidden', ['approve', 'waitlist', 'reject'].indexOf(action) === -1);
      });
      document.getElementById('modal-actions').classList.remove('hidden');
      return;
    }
    if (typeof originalUpdateModalActions === 'function') originalUpdateModalActions(status);
    if ((status === 'approved' || raw === 'approved') && card && card.getAttribute('data-confirmed') !== '1') {
      var addBtn = document.querySelector('.modal-action-btn[data-action="add-slot"]');
      if (addBtn) addBtn.classList.add('hidden');
    }
  };

  var originalOpen = window.openApplicantModal;
  window.openApplicantModal = function (card) {
    if (typeof originalOpen === 'function') originalOpen(card);
    window.updateModalActions(card.getAttribute('data-status'));
  };

  document.addEventListener('DOMContentLoaded', function () {
    AbecApi.requireRole('Admin');
    loadApplicants();

    document.querySelectorAll('.modal-action-btn').forEach(function (btn) {
      if (btn.getAttribute('data-action') === 'restore') return;
      btn.addEventListener('click', async function () {
        if (!window.activeModalCard) return;
        var id = window.activeModalCard.getAttribute('data-id');
        var action = btn.getAttribute('data-action');
        if (action === 'add-slot') {
          if (window.activeModalCard.getAttribute('data-confirmed') !== '1') {
            alert('Applicant must confirm their training slot before being added to a batch.');
            return;
          }
          if (!(await addToSlot(id))) return;
        } else if (action === 'approve' || action === 'reject' || action === 'waitlist') {
          var nextStatus = action === 'approve' ? 'approved'
            : action === 'reject' ? 'rejected'
            : 'waitlisted';
          var promptText = action === 'approve'
            ? 'Approve this application?'
            : action === 'reject'
              ? 'Reject this application?'
              : 'Move this application to the waitlist?';
          if (!(await window.AbecFeedback.confirm({
            title: action === 'approve' ? 'Approve application' : action === 'reject' ? 'Reject application' : 'Move to waitlist',
            message: promptText,
            confirmLabel: 'Continue'
          }))) return;
          if (!(await updateStatus(id, nextStatus))) return;
        } else {
          return;
        }
        if (typeof closeApplicantModal === 'function') closeApplicantModal();
        await loadApplicants();
        refreshRecordsBoard();
      });
    });
  });

  window.abecReloadApplicants = loadApplicants;
})();
