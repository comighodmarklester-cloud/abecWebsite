/* Course Management ↔ live course/student APIs */
(function () {
  'use strict';
  if (!window.AbecApi) return;

  var slugHints = {
    bookkeeping: ['bookkeeping'],
    css: ['computer system', 'computer systems', 'servicing'],
    customer: ['customer'],
    epas: ['electronic product', 'electronic products', 'assembly']
  };

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function normalize(text) {
    return String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function courseLabel(name) {
    if (window.AbecApi && typeof AbecApi.displayCourseName === 'function') return AbecApi.displayCourseName(name);
    return String(name || '').replace(/\s*NC\s*II\b/gi, ' ').replace(/\s{2,}/g, ' ').trim();
  }

  function matchCourseToSlug(courseName) {
    var name = normalize(courseName);
    if (name.indexOf('bookkeeping') !== -1) return 'bookkeeping';
    if (name.indexOf('customer') !== -1) return 'customer';
    if (name.indexOf('electronic') !== -1 || name.indexOf('epas') !== -1) return 'epas';
    if (name.indexOf('computer') !== -1 || name.indexOf('servicing') !== -1) return 'css';
    return null;
  }

  function occupancyMeta(filled, capacity) {
    var pct = capacity > 0 ? Math.round((filled / capacity) * 100) : 0;
    if (filled >= capacity) {
      return {
        pct: pct,
        badgeText: 'Full',
        badgeClass: 'bg-red-100 text-red-700',
        barColor: 'bg-red-500',
        pctClass: 'font-bold text-red-600',
        availableWrap: 'bg-red-50 rounded-lg py-2',
        availableText: 'text-2xl font-bold text-red-600',
        note: 'This course has reached maximum capacity. No additional students can be enrolled until a slot opens.'
      };
    }
    if (pct >= 80) {
      return {
        pct: pct,
        badgeText: 'Almost Full',
        badgeClass: 'bg-amber-100 text-amber-700',
        barColor: 'bg-amber-500',
        pctClass: 'font-bold text-amber-600',
        availableWrap: 'bg-amber-50 rounded-lg py-2',
        availableText: 'text-2xl font-bold text-amber-600',
        note: 'Limited slots remaining for this course.'
      };
    }
    return {
      pct: pct,
      badgeText: 'Available',
      badgeClass: 'bg-emerald-100 text-emerald-700',
      barColor: 'bg-emerald-500',
      pctClass: 'font-bold text-emerald-600',
      availableWrap: 'bg-emerald-50 rounded-lg py-2',
      availableText: 'text-2xl font-bold text-emerald-600',
      note: 'Slots are still available for new enrollees in this course.'
    };
  }

  function initials(name) {
    return AbecApi.initials ? AbecApi.initials(name) : String(name || '?').slice(0, 2).toUpperCase();
  }

  function formatDate(value) {
    return AbecApi.formatDate ? AbecApi.formatDate(value) : (value ? String(value).slice(0, 10) : '—');
  }

  function findCard(slug) {
    return document.querySelector('.course-card[data-course="' + slug + '"]');
  }

  function updateCard(card, course) {
    if (!card || !course) return;
    var filled = course.filledSlots || 0;
    var capacity = course.capacity || 25;
    var remaining = Math.max(0, capacity - filled);
    var meta = occupancyMeta(filled, capacity);

    card.setAttribute('data-course-id', String(course.courseId));
    card.setAttribute('data-status', filled >= capacity ? 'full' : 'available');

    var badge = card.querySelector('[data-bind="status-badge"]');
    if (badge) {
      badge.textContent = meta.badgeText;
      badge.className = 'shrink-0 text-[10px] font-bold uppercase px-2.5 py-1 rounded ' + meta.badgeClass;
    }

    var pctEl = card.querySelector('[data-bind="occupied-pct"]');
    if (pctEl) {
      pctEl.textContent = meta.pct + '% Occupied';
      pctEl.className = meta.pctClass;
    }

    var bar = card.querySelector('[data-bind="progress-bar"]');
    if (bar) {
      bar.style.width = meta.pct + '%';
      bar.className = 'h-full rounded-full ' + meta.barColor;
    }

    var filledEl = card.querySelector('[data-bind="filled"]');
    var totalEl = card.querySelector('[data-bind="total"]');
    var availableEl = card.querySelector('[data-bind="available"]');
    var slotBox = card.querySelector('[data-slot-box]');
    if (filledEl) filledEl.textContent = String(filled);
    if (totalEl) totalEl.textContent = String(capacity);
    if (slotBox) slotBox.className = meta.availableWrap;
    if (availableEl) {
      availableEl.textContent = String(remaining);
      availableEl.className = meta.availableText;
    }
    var addBtn = card.querySelector('.course-add-slot');
    var courseName = courseLabel(course.courseName || ((card.querySelector('h3') || {}).textContent || ''));
    var heading = card.querySelector('h3');
    if (heading && courseName) heading.textContent = courseName;
    var tipText = 'Edit slots for ' + (courseName || 'this course');
    if (addBtn) {
      addBtn.setAttribute('aria-label', tipText);
      var tip = addBtn.querySelector('.course-add-slot-tip');
      if (tip) tip.textContent = tipText;
    }
  }

  async function loadCourses() {
    var result = await AbecApi.get('/api/courses');
    if (!result.success || !result.data) return;
    window.__abecCourses = result.data;
    window.__abecCourseBySlug = {};

    result.data.forEach(function (course) {
      var slug = matchCourseToSlug(course.courseName);
      if (!slug) return;
      window.__abecCourseBySlug[slug] = course;
      var card = findCard(slug);
      if (card) updateCard(card, course);
    });
  }

  function resolveCourseRef(idOrSlug) {
    var map = window.__abecCourseBySlug || {};
    if (map[idOrSlug]) return map[idOrSlug];

    var numeric = parseInt(idOrSlug, 10);
    if (!isNaN(numeric) && numeric > 0) {
      return (window.__abecCourses || []).find(function (c) { return c.courseId === numeric; }) || null;
    }

    var card = findCard(idOrSlug);
    if (card) {
      var cid = parseInt(card.getAttribute('data-course-id') || '0', 10);
      if (cid) return (window.__abecCourses || []).find(function (c) { return c.courseId === cid; }) || null;
    }
    return null;
  }

  function applyDetailStats(course) {
    var filled = course.filledSlots || 0;
    var capacity = course.capacity || 25;
    var remaining = Math.max(0, capacity - filled);
    var meta = occupancyMeta(filled, capacity);

    var title = document.getElementById('course-title');
    if (title) title.textContent = courseLabel(course.courseName) || 'Course';
    document.title = (courseLabel(course.courseName) || 'Course') + ' - ABEC Admin';

    var totalEl = document.getElementById('stat-total');
    var filledEl = document.getElementById('stat-filled');
    var remainingEl = document.getElementById('stat-remaining');
    if (totalEl) totalEl.textContent = String(capacity);
    if (filledEl) filledEl.textContent = String(filled);
    if (remainingEl) remainingEl.textContent = String(remaining);

    var bar = document.getElementById('occupancy-bar');
    var ratio = document.getElementById('occupancy-ratio');
    var note = document.getElementById('occupancy-note');
    if (bar) {
      bar.style.width = meta.pct + '%';
      bar.className = 'h-full rounded-full transition-all duration-500 ' + meta.barColor;
    }
    if (ratio) ratio.textContent = filled + '/' + capacity;
    if (note) note.textContent = meta.note;

    var badge = document.getElementById('capacity-badge');
    if (badge) {
      badge.textContent = meta.badgeText;
      badge.className = 'inline-block text-[10px] font-bold uppercase px-3 py-1 rounded-full ' + meta.badgeClass;
    }
  }

  var liveStudents = [];
  var STUDENT_PREVIEW_LIMIT = 6;

  function studentRowHtml(s, rowClass) {
    var name = s.fullName || '—';
    var email = s.email || '—';
    var phone = s.contactNumber || '—';
    var date = formatDate(s.confirmedAt || s.createdAt || s.applicationDate);
    var conf = s.confirmationStatus || s.applicationStatus || 'Confirmed Slot';
    return (
      '<tr class="' + rowClass + ' hover:bg-slate-50/60" data-name="' + esc(name.toLowerCase()) + '" data-gmail="' + esc(email.toLowerCase()) + '">' +
      '<td class="px-5 py-3 text-sm text-slate-700">' + esc(email) + '</td>' +
      '<td class="px-5 py-3"><div class="flex items-center gap-3">' +
      '<div class="w-8 h-8 rounded-full bg-slate-100 text-abec-blue flex items-center justify-center text-[10px] font-bold border border-slate-200">' + esc(initials(name)) + '</div>' +
      '<div><span class="text-sm font-semibold text-slate-800 block">' + esc(name) + '</span>' +
      '<span class="text-[10px] font-bold uppercase text-emerald-700">' + esc(conf) + '</span></div></div></td>' +
      '<td class="px-5 py-3 text-sm text-slate-600">' + esc(date) + '</td>' +
      '<td class="px-5 py-3 text-sm text-slate-600">' + esc(phone) + '</td>' +
      '<td class="px-5 py-3 text-center"><button type="button" class="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-red-50 hover:text-red-700 hover:border-red-200 transition-colors" aria-label="Archive ' + esc(name) + '"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg> Archive</button></td>' +
      '</tr>'
    );
  }

  function studentsMatching(query) {
    var q = String(query || '').trim().toLowerCase();
    if (!q) return liveStudents.slice();
    return liveStudents.filter(function (s) {
      var name = String(s.fullName || '').toLowerCase();
      var email = String(s.email || '').toLowerCase();
      return name.indexOf(q) !== -1 || email.indexOf(q) !== -1;
    });
  }

  function paintStudentPreview() {
    var tbody = document.getElementById('student-table-body');
    var note = document.getElementById('student-preview-note');
    if (!tbody) return;
    var query = (document.getElementById('student-search') || {}).value || '';
    var matches = studentsMatching(query);
    if (!liveStudents.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="px-5 py-8 text-center text-sm text-slate-500">No confirmed students enrolled in this course yet.</td></tr>';
      if (note) note.textContent = '';
      return;
    }
    if (!matches.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="px-5 py-8 text-center text-sm text-slate-500">No students match this search.</td></tr>';
      if (note) note.textContent = '0 of ' + liveStudents.length + ' students';
      return;
    }
    var preview = matches.slice(0, STUDENT_PREVIEW_LIMIT);
    tbody.innerHTML = preview.map(function (s) { return studentRowHtml(s, 'student-row'); }).join('');
    if (note) note.textContent = 'Showing ' + preview.length + ' of ' + liveStudents.length + ' students';
  }

  function paintStudentModal() {
    var tbody = document.getElementById('student-modal-body');
    if (!tbody) return;
    var query = (document.getElementById('student-modal-search') || {}).value || '';
    var matches = studentsMatching(query);
    if (!liveStudents.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="px-5 py-8 text-center text-sm text-slate-500">No confirmed students enrolled in this course yet.</td></tr>';
      return;
    }
    if (!matches.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="px-5 py-8 text-center text-sm text-slate-500">No students match this search.</td></tr>';
      return;
    }
    tbody.innerHTML = matches.map(function (s) { return studentRowHtml(s, 'student-modal-row'); }).join('');
  }

  function renderLiveStudents(students) {
    liveStudents = students || [];
    var pageSearch = document.getElementById('student-search');
    if (pageSearch) pageSearch.value = '';
    paintStudentPreview();
    var modal = document.getElementById('course-students-modal');
    if (modal && !modal.classList.contains('hidden')) paintStudentModal();
  }

  function openCourseStudentsModal() {
    var modal = document.getElementById('course-students-modal');
    var title = document.getElementById('course-students-modal-title');
    var courseName = courseLabel((document.getElementById('course-title') || {}).textContent || 'Course');
    if (title) title.textContent = courseName + ' — All Students';
    var search = document.getElementById('student-modal-search');
    if (search) search.value = '';
    paintStudentModal();
    if (modal) modal.classList.remove('hidden');
  }

  function closeCourseStudentsModal() {
    var modal = document.getElementById('course-students-modal');
    if (modal) modal.classList.add('hidden');
  }

  window.filterStudents = paintStudentPreview;
  window.filterCourseStudentModal = paintStudentModal;
  window.openCourseStudentsModal = openCourseStudentsModal;
  window.closeCourseStudentsModal = closeCourseStudentsModal;

  var editSlotsBusy = false;
  var slotNoticeTimer = 0;

  function setEditSlotsMessage(text, kind) {
    var el = document.getElementById('add-slots-message');
    if (!el) return;
    el.textContent = text || '';
    el.className = text ? 'is-' + (kind || 'error') : '';
  }

  function showSlotNotice(text) {
    var el = document.getElementById('course-slot-notice');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('is-visible', !!text);
    if (slotNoticeTimer) clearTimeout(slotNoticeTimer);
    if (text) {
      slotNoticeTimer = setTimeout(function () {
        el.classList.remove('is-visible');
      }, 5000);
    }
  }

  function resetEditSlotsControls() {
    var input = document.getElementById('add-slots-count');
    var confirmBtn = document.getElementById('add-slots-confirm');
    var cancelBtn = document.getElementById('add-slots-cancel');
    var minus = document.getElementById('edit-slots-minus');
    var plus = document.getElementById('edit-slots-plus');
    if (input) input.disabled = false;
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Save Changes';
    }
    if (cancelBtn) cancelBtn.disabled = false;
    if (minus) minus.disabled = false;
    if (plus) plus.disabled = false;
  }

  function openEditSlots(button) {
    var card = button && button.closest ? button.closest('.course-card') : null;
    if (!card) return;
    var slug = card.getAttribute('data-course') || '';
    var course = (window.__abecCourseBySlug || {})[slug];
    var name = courseLabel((course && course.courseName) || ((card.querySelector('h3') || {}).textContent || '').trim() || 'Course');
    var modal = document.getElementById('add-slots-modal');
    var title = document.getElementById('add-slots-title');
    var input = document.getElementById('add-slots-count');
    if (!course || !course.courseId || typeof course.capacity !== 'number') {
      setEditSlotsMessage('Course details are still loading. Try again in a moment.', 'error');
      if (modal) modal.classList.remove('hidden');
      return;
    }
    var filled = course.filledSlots || 0;
    if (title) title.textContent = 'Edit Slots for ' + name;
    if (input) {
      input.value = String(course.capacity);
      input.min = String(Math.max(1, filled));
      input.disabled = false;
    }
    resetEditSlotsControls();
    if (modal) {
      modal.setAttribute('data-course-id', String(course.courseId));
      modal.setAttribute('data-course-slug', slug);
      modal.setAttribute('data-filled', String(filled));
      modal.setAttribute('data-capacity', String(course.capacity));
      modal.classList.remove('hidden');
    }
    setEditSlotsMessage('', '');
    if (input) input.focus();
  }

  function closeEditSlotsModal() {
    if (editSlotsBusy) return;
    var modal = document.getElementById('add-slots-modal');
    if (modal) modal.classList.add('hidden');
    setEditSlotsMessage('', '');
    resetEditSlotsControls();
  }

  function stepEditSlots(delta) {
    if (editSlotsBusy) return;
    var input = document.getElementById('add-slots-count');
    var modal = document.getElementById('add-slots-modal');
    if (!input || !modal) return;
    var filled = parseInt(modal.getAttribute('data-filled') || '0', 10) || 0;
    var floor = Math.max(1, filled);
    var saved = parseInt(modal.getAttribute('data-capacity') || '0', 10) || floor;
    var raw = String(input.value || '').trim();
    var current = /^[1-9]\d*$/.test(raw) ? parseInt(raw, 10) : saved;
    var next = current + delta;
    if (next < floor) next = floor;
    if (next > 500) next = 500;
    input.value = String(next);
  }

  async function confirmEditSlots() {
    if (editSlotsBusy) return;
    var modal = document.getElementById('add-slots-modal');
    var input = document.getElementById('add-slots-count');
    var confirmBtn = document.getElementById('add-slots-confirm');
    var raw = input ? String(input.value || '').trim() : '';
    var filled = parseInt((modal && modal.getAttribute('data-filled')) || '0', 10) || 0;
    if (!/^[1-9]\d*$/.test(raw)) {
      setEditSlotsMessage('Enter a whole number of slots from 1 to 500.', 'error');
      return;
    }
    var capacity = parseInt(raw, 10);
    if (capacity < 1 || capacity > 500) {
      setEditSlotsMessage('Enter a whole number of slots from 1 to 500.', 'error');
      return;
    }
    if (capacity < filled) {
      setEditSlotsMessage('This course already has ' + filled + ' enrolled ' + (filled === 1 ? 'student' : 'students') + '. Slot capacity cannot be lower than the occupied slots.', 'error');
      return;
    }
    var courseId = parseInt((modal && modal.getAttribute('data-course-id')) || '0', 10);
    if (!courseId) {
      setEditSlotsMessage('This course could not be identified.', 'error');
      return;
    }
    editSlotsBusy = true;
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Saving…';
    }
    var cancelBtn = document.getElementById('add-slots-cancel');
    if (cancelBtn) cancelBtn.disabled = true;
    setEditSlotsMessage('', '');
    var result = await AbecApi.post('/api/courses/' + courseId + '/slots', { slotCapacity: capacity });
    editSlotsBusy = false;
    if (!result.success || !result.data) {
      resetEditSlotsControls();
      setEditSlotsMessage(result.message || 'Unable to save the slot capacity.', 'error');
      return;
    }
    await loadCourses();
    var detail = document.getElementById('view-detail');
    if (detail && !detail.classList.contains('hidden') && window.__abecActiveCourseId === courseId) {
      applyDetailStats(result.data);
    }
    resetEditSlotsControls();
    if (modal) modal.classList.add('hidden');
    setEditSlotsMessage('', '');
    showSlotNotice(result.message || 'Slot capacity saved.');
  }

  window.openEditSlots = openEditSlots;
  window.closeEditSlotsModal = closeEditSlotsModal;
  window.stepEditSlots = stepEditSlots;
  window.confirmEditSlots = confirmEditSlots;

  async function loadCourseDetailLive(idOrSlug) {
    await loadCourses();
    var course = resolveCourseRef(idOrSlug);
    var tbody = document.getElementById('student-table-body');
    if (!course) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="px-5 py-10 text-center text-sm text-red-600">Course record was not found in the database.</td></tr>';
      return;
    }

    applyDetailStats(course);
    window.__abecActiveCourseId = course.courseId;
    window.__abecActiveCourseSlug = matchCourseToSlug(course.courseName) || idOrSlug;

    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="5" class="px-5 py-10 text-center text-sm text-slate-500">Loading enrolled students...</td></tr>';
    }

    var studentsResult = await AbecApi.get('/api/courses/' + course.courseId + '/students');
    if (!studentsResult.success) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="px-5 py-10 text-center text-sm text-red-600">' + esc(studentsResult.message || 'Unable to load students.') + '</td></tr>';
      return;
    }

    // Refresh course stats in case enrollment changed.
    var fresh = await AbecApi.get('/api/courses/' + course.courseId);
    if (fresh.success && fresh.data) applyDetailStats(fresh.data);

    renderLiveStudents(studentsResult.data || []);
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function toDateInput(value) {
    if (!value) return '';
    var d = new Date(value);
    if (!isNaN(d.getTime())) {
      return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    }
    return String(value).slice(0, 10);
  }

  function toTimeInput(value) {
    if (value == null || value === '') return '';
    var s = String(value);
    var m = s.match(/(\d{1,2}):(\d{2})/);
    if (m) return pad2(m[1]) + ':' + m[2];
    return '';
  }

  function toTimeSpan(value) {
    if (!value) return '';
    return String(value).length === 5 ? value + ':00' : value;
  }

  function formatTimeRange(start, end) {
    var a = toTimeInput(start);
    var b = toTimeInput(end);
    if (!a && !b) return '—';
    return a + ' - ' + b;
  }

  function courseDotClass(courseName) {
    var slug = matchCourseToSlug(courseName);
    if (slug === 'bookkeeping') return 'bg-blue-400';
    if (slug === 'css') return 'bg-emerald-400';
    if (slug === 'customer') return 'bg-amber-400';
    if (slug === 'epas') return 'bg-violet-400';
    return 'bg-slate-400';
  }

  function courseFillClass(courseName) {
    var slug = matchCourseToSlug(courseName);
    if (slug === 'bookkeeping') return 'cal-fill-bookkeeping';
    if (slug === 'css') return 'cal-fill-css';
    if (slug === 'customer') return 'cal-fill-customer';
    if (slug === 'epas') return 'cal-fill-epas';
    return 'cal-fill-default';
  }

  function courseShortLabel(courseName) {
    var slug = matchCourseToSlug(courseName);
    if (slug === 'bookkeeping') return 'Bookkeeping';
    if (slug === 'css') return 'CSS';
    if (slug === 'customer') return 'Customer';
    if (slug === 'epas') return 'EPAS';
    var name = courseLabel(courseName || 'Course');
    return name.length > 10 ? name.slice(0, 10) + '...' : name;
  }

  function statusBadgeHtml(status) {
    var active = String(status || '').toLowerCase() === 'active';
    if (active) {
      return '<span class="text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">Active</span>';
    }
    return '<span class="text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">Inactive</span>';
  }

  function dayCodeFromDate(value) {
    var d = new Date(value);
    if (isNaN(d.getTime())) return null;
    return ['S', 'M', 'T', 'W', 'Th', 'F', 'S'][d.getDay()];
  }

  function setFormMessage(id, message, isError) {
    var el = document.getElementById(id);
    if (!el) return;
    if (!message) {
      el.classList.add('hidden');
      el.textContent = '';
      return;
    }
    el.textContent = message;
    el.className = 'text-xs ' + (isError ? 'text-red-600' : 'text-emerald-700');
  }

  function showConflictAlert(show, message) {
    var alert = document.getElementById('conflict-alert');
    if (!alert) return;
    if (message) {
      var text = alert.querySelector('p');
      if (text) {
        text.innerHTML = '<span class="font-bold">Conflict Detected.</span> ' + esc(message);
      }
    }
    alert.classList.toggle('hidden', !show);
  }

  function populateCourseSelect(selectedId) {
    var select = document.getElementById('select-course');
    if (!select) return;
    var courses = window.__abecCourses || [];
    var html = '<option value="">Select course</option>';
    courses.forEach(function (c) {
      html += '<option value="' + esc(String(c.courseId)) + '">' + esc(courseLabel(c.courseName)) + '</option>';
    });
    select.innerHTML = html;
    if (selectedId) select.value = String(selectedId);
  }

  async function ensureActiveBatchId() {
    if (window.__abecActiveBatchId) return window.__abecActiveBatchId;
    var active = await AbecApi.get('/api/batches/active');
    if (active.success && active.data && active.data.batchId) {
      window.__abecActiveBatchId = active.data.batchId;
      return window.__abecActiveBatchId;
    }
    return 0;
  }

  function mapScheduleDetail(s) {
    var dateKey = toDateInput(s.scheduleDate);
    var room = String(s.room || '').replace(/[\u2013\u2014]/g, '-').trim();
    var trainer = String(s.trainer || '').trim();
    var trainers = Array.isArray(s.trainers) && s.trainers.length ? s.trainers : (trainer ? [{ name: trainer, email: '' }] : []);
    var savedDays = parseDayCodes(s.trainingDays);
    if (!savedDays.length) {
      var weekday = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', ''][new Date(s.scheduleDate).getDay()];
      if (weekday) savedDays = [weekday];
    }
    return {
      course: courseLabel(s.courseName || ''),
      courseId: s.courseId,
      trainer: trainer,
      trainers: trainers,
      room: room,
      startDate: dateKey,
      endDate: dateKey,
      startTime: toTimeInput(s.startTime),
      endTime: toTimeInput(s.endTime),
      status: s.status || 'Inactive',
      trainingDays: s.trainingDays || '',
      days: savedDays,
      batchId: s.batchId
    };
  }

  function isActiveSchedule(schedule) {
    return String((schedule && schedule.status) || '').toLowerCase() === 'active';
  }

  function pickCourseSchedule(list) {
    if (!list || !list.length) return null;
    var active = list.filter(isActiveSchedule);
    if (active.length) return active[0];
    return list.slice().sort(function (a, b) {
      var byDate = String(b.scheduleDate || '').localeCompare(String(a.scheduleDate || ''));
      return byDate || ((b.scheduleId || 0) - (a.scheduleId || 0));
    })[0];
  }

  function courseQualification(name) {
    var match = String(name || '').match(/\bNC\s*II\b/i);
    return match ? 'NC II' : '';
  }

  function scheduleIcon(path) {
    return '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="' + path + '"></path></svg>';
  }

  function scheduleDetail(label, value, icon) {
    if (!value) return '';
    return '<div class="schedule-detail-item">' + icon + '<div><span>' + esc(label) + '</span><strong>' + esc(value) + '</strong></div></div>';
  }

  function trainingPeriod(schedule) {
    var start = schedule.batchStartDate ? formatDate(schedule.batchStartDate) : '';
    var end = schedule.batchEndDate ? formatDate(schedule.batchEndDate) : '';
    if (start && end && start !== end) return start + ' – ' + end;
    return start || end;
  }

  function renderScheduleCards(courses, schedules) {
    var grid = document.getElementById('schedule-card-grid');
    if (!grid) return;
    var byCourse = {};
    (schedules || []).forEach(function (schedule) {
      var key = String(schedule.courseId);
      if (!byCourse[key]) byCourse[key] = [];
      byCourse[key].push(schedule);
    });
    window.__abecScheduleByCourse = {};
    var slugOrder = { bookkeeping: 0, css: 1, customer: 2, epas: 3 };
    var ordered = (courses || []).slice().sort(function (a, b) {
      var as = slugOrder[matchCourseToSlug(a.courseName)];
      var bs = slugOrder[matchCourseToSlug(b.courseName)];
      if (as == null) as = 9;
      if (bs == null) bs = 9;
      return as - bs || String(a.courseName || '').localeCompare(String(b.courseName || ''));
    });
    if (!ordered.length) {
      grid.innerHTML = '<p class="text-sm text-slate-500">No courses are available.</p>';
      return;
    }
    var roomIcon = scheduleIcon('M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6');
    var dayIcon = scheduleIcon('M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z');
    var timeIcon = scheduleIcon('M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z');
    var batchIcon = scheduleIcon('M7 7h10M7 12h10M7 17h6');
    var trainerIcon = scheduleIcon('M16 7a4 4 0 11-8 0 4 4 0 018 0zM4 21a8 8 0 0116 0');
    grid.innerHTML = ordered.map(function (course) {
      var picked = pickCourseSchedule(byCourse[String(course.courseId)] || []);
      if (picked) window.__abecScheduleByCourse[String(course.courseId)] = picked;
      var name = courseLabel(course.courseName) || 'Course';
      var qualification = courseQualification(course.courseName);
      var duration = String(course.programSummary || course.duration || '').trim();
      var active = !!(picked && isActiveSchedule(picked));
      var headerMeta = [];
      if (picked && picked.batchName) headerMeta.push(picked.batchName);
      if (duration) headerMeta.push(duration);
      var body = picked
        ? '<div class="schedule-card-section"><h5>Schedule details</h5><div class="schedule-detail-grid">' +
            scheduleDetail('Training room', picked.room, roomIcon) +
            scheduleDetail('Training days', formatTrainingDays(picked.trainingDays) || picked.dayOfWeek, dayIcon) +
            scheduleDetail('Schedule date', formatDate(picked.scheduleDate), dayIcon) +
            scheduleDetail('Training hours', formatTimeRange(picked.startTime, picked.endTime), timeIcon) +
            scheduleDetail('Batch', picked.batchName, batchIcon) +
            scheduleDetail('Training period', trainingPeriod(picked), dayIcon) +
          '</div></div>' +
          '<div class="schedule-card-section"><h5>Trainer</h5><div class="schedule-detail-grid">' +
            scheduleDetail('Assigned trainer', picked.trainer, trainerIcon) +
          '</div></div>'
        : '<div class="schedule-card-section"><p class="schedule-empty-note">No schedule assigned yet</p></div>';
      return (
        '<article class="schedule-course-card abec-card abec-card-static" data-course-id="' + esc(course.courseId) + '">' +
          '<div class="schedule-card-head">' +
            '<div class="schedule-card-head-top">' +
        '<span></span>' +
              '<div class="schedule-card-actions">' +
                statusBadgeHtml(active ? 'Active' : 'Inactive') +
                '<button type="button" class="schedule-edit-btn" onclick="editCourseSchedule(' + Number(course.courseId) + ')">Edit</button>' +
              '</div>' +
            '</div>' +
            '<h4 class="schedule-card-title">' + esc(name) + '</h4>' +
            (headerMeta.length ? '<p class="schedule-card-meta">' + esc(headerMeta.join(' · ')) + '</p>' : '') +
          '</div>' +
          body +
        '</article>'
      );
    }).join('');
  }

  function editCourseSchedule(courseId) {
    var picked = (window.__abecScheduleByCourse || {})[String(courseId)];
    if (picked && picked.scheduleId && window.scheduleDetails && window.scheduleDetails[picked.scheduleId] && typeof window.openScheduleConfig === 'function') {
      window.openScheduleConfig(picked.scheduleId);
      return;
    }
    if (typeof window.openCreateScheduleModal === 'function') window.openCreateScheduleModal(courseId);
  }

  window.editCourseSchedule = editCourseSchedule;

  async function loadSchedules() {
    var grid = document.getElementById('schedule-card-grid');
    if (grid) grid.innerHTML = '<p class="text-sm text-slate-500">Loading schedules...</p>';
    await loadCourses();
    var result = await AbecApi.get('/api/schedules');
    if (!result.success) {
      if (grid) grid.innerHTML = '<p class="text-sm text-red-600">' + esc(result.message || 'Unable to load schedules.') + '</p>';
      return;
    }
    var all = result.data || [];
    window.__abecSchedules = all;
    window.__abecActiveSchedules = all.filter(isActiveSchedule);
    window.__abecSavedSchedules = all.filter(function (schedule) { return !isActiveSchedule(schedule); });
    var details = {};
    all.forEach(function (schedule) {
      details[schedule.scheduleId] = mapScheduleDetail(schedule);
    });
    window.scheduleDetails = details;
    renderScheduleCards(window.__abecCourses || [], all);
  }

  var WEEKDAY_CODES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  var EXTRA_KEY = 'abec-schedule-extras';

  function courseMatchKey(name) {
    return String(name || '').toLowerCase().replace(/\bnc\s*ii\b/g, '').replace(/[^a-z]/g, '');
  }

  function trainerForCourse(name) {
    var key = courseMatchKey(name);
    if (key.indexOf('electronic') >= 0) return 'Richard Bañares';
    if (key.indexOf('bookkeep') >= 0) return 'Edwin Magalona';
    if (key.indexOf('customer') >= 0) return 'Elsie Bulawan';
    if (key.indexOf('computer') >= 0 && key.indexOf('servic') >= 0) return 'Randy Bautista';
    return '';
  }

  function isGenericTrainerLabel(name) {
    return /^trainer\s*\d+$/i.test(String(name || '').trim());
  }

  function roomsForCourse(name) {
    var key = courseMatchKey(name);
    if (key.indexOf('electronic') >= 0) return ['Room 303', 'Room 304'];
    if (key.indexOf('bookkeep') >= 0) return ['Room 305', 'Room 307'];
    if (key.indexOf('customer') >= 0) return ['Room 302'];
    if (key.indexOf('computer') >= 0 && key.indexOf('servic') >= 0) return ['Room 301', 'Computer Laboratory'];
    return [];
  }

  function readExtras() {
    try { return JSON.parse(sessionStorage.getItem(EXTRA_KEY) || '{}') || {}; }
    catch (err) { return {}; }
  }

  function writeExtras(data) {
    sessionStorage.setItem(EXTRA_KEY, JSON.stringify(data));
  }

  function normName(value) {
    return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
  }

  function uniqueNames(list) {
    var seen = {};
    var out = [];
    (list || []).forEach(function (item) {
      var text = String(item || '').trim().replace(/\s+/g, ' ');
      var key = normName(text);
      if (!key || seen[key]) return;
      seen[key] = true;
      out.push(text);
    });
    return out;
  }

  function extraTrainers(courseName) {
    var key = courseMatchKey(courseName);
    var stored = (readExtras().trainers || []).filter(function (item) {
      return item && courseMatchKey(item.course) === key;
    }).map(function (item) { return item.name; });
    var fromSchedules = (window.__abecSchedules || []).filter(function (row) {
      return courseMatchKey(row.courseName) === key;
    }).map(function (row) { return row.trainer; });
    return uniqueNames(stored.concat(fromSchedules)).filter(function (name) {
      return !isGenericTrainerLabel(name);
    });
  }

  var roomCatalog = [];

  function findCatalogRoom(name) {
    var key = normName(name);
    return roomCatalog.filter(function (room) { return normName(room.roomName) === key; })[0] || null;
  }

  async function loadTrainingRooms() {
    var result = await AbecApi.get('/api/training-rooms');
    roomCatalog = result.success && result.data ? result.data : [];
    return result;
  }

  function courseContext(scope) {
    if (scope === 'config') {
      var id = (document.getElementById('config-schedule-id') || {}).value;
      var data = (window.scheduleDetails || {})[id] || {};
      return {
        courseId: data.courseId || '',
        courseName: data.course || ((document.getElementById('config-course') || {}).value || '')
      };
    }
    var select = document.getElementById('select-course');
    var option = select && select.selectedIndex >= 0 ? select.options[select.selectedIndex] : null;
    return {
      courseId: select && select.value ? select.value : '',
      courseName: option && select.value ? option.text : ''
    };
  }

  function roomsAssignedToCourse(courseName, courseId) {
    var defaults = roomsForCourse(courseName);
    var added = roomCatalog.filter(function (room) {
      return courseId && String(room.courseId) === String(courseId);
    }).map(function (room) { return room.roomName; });
    return uniqueNames(defaults.concat(added));
  }

  function optionHtml(value, label) {
    return '<option value="' + esc(value) + '">' + esc(label || value) + '</option>';
  }

  function fillTrainerSelect(select, courseName, selected) {
    if (!select) return;
    var official = trainerForCourse(courseName);
    var keepSelected = selected && !isGenericTrainerLabel(selected) ? selected : '';
    var names = uniqueNames([official].concat(extraTrainers(courseName), keepSelected ? [keepSelected] : []))
      .filter(function (name) { return !isGenericTrainerLabel(name); });
    select.innerHTML = '<option value="">Select trainer</option>' + names.map(function (name) { return name ? optionHtml(name) : ''; }).join('');
    if (selected && isGenericTrainerLabel(selected)) { select.value = ''; return; }
    var pick = keepSelected || official;
    if (pick && names.some(function (name) { return name === pick; })) select.value = pick;
    else if (!selected && names.length === 1) select.value = names[0];
  }

  function otherRoomNames(courseName, courseId) {
    var assigned = roomsAssignedToCourse(courseName, courseId).map(normName);
    return uniqueNames(roomCatalog.map(function (room) { return room.roomName; })).filter(function (name) {
      return assigned.indexOf(normName(name)) < 0;
    });
  }

  function fillRoomSelect(select, courseName, courseId, selected) {
    if (!select) return;
    var showAll = select.getAttribute('data-room-mode') === 'all';
    var assigned = roomsAssignedToCourse(courseName, courseId);
    var match = assigned.filter(function (room) { return normName(room) === normName(selected); })[0];
    var borrowedName = '';
    if (!match && selected && selected !== '__existing__' && selected !== '__course__') {
      var borrowed = findCatalogRoom(selected);
      borrowedName = borrowed ? borrowed.roomName : String(selected).trim();
    }
    var html = '<option value="">Select training room</option>';
    assigned.forEach(function (room) { html += optionHtml(room); });
    if (showAll) {
      var others = otherRoomNames(courseName, courseId);
      if (others.length) {
        html += '<option disabled value="">Other rooms</option>';
        others.forEach(function (room) { html += optionHtml(room); });
      }
      html += optionHtml('__course__', 'Course rooms');
    } else {
      if (borrowedName) html += optionHtml(borrowedName);
      html += optionHtml('__existing__', 'Use Existing Room');
    }
    select.innerHTML = html;
    if (match) select.value = match;
    else if (borrowedName) select.value = borrowedName;
  }

  function handleRoomMenu(select) {
    if (!select) return;
    var scope = select.id === 'config-room' ? 'config' : 'create';
    var ctx = courseContext(scope);
    if (select.value === '__existing__') {
      select.setAttribute('data-room-mode', 'all');
      fillRoomSelect(select, ctx.courseName, ctx.courseId, '');
      return;
    }
    if (select.value === '__course__') {
      select.removeAttribute('data-room-mode');
      fillRoomSelect(select, ctx.courseName, ctx.courseId, '');
    }
  }

  function chosenRoom(scope) {
    var roomSelect = document.getElementById(scope === 'config' ? 'config-room' : 'select-room');
    var value = ((roomSelect || {}).value || '').trim();
    if (!value || value === '__existing__' || value === '__course__') return '';
    return value;
  }

  function selectedDayCodes(containerId) {
    return Array.prototype.map.call(document.querySelectorAll('#' + containerId + ' .selected'), function (btn) {
      return btn.getAttribute('data-day');
    }).filter(function (code) { return WEEKDAY_CODES.indexOf(code) >= 0; });
  }

  function applyDaySelection(containerId, codes, useDefault) {
    var wanted = useDefault ? WEEKDAY_CODES.slice() : (codes || []);
    document.querySelectorAll('#' + containerId + ' [data-day]').forEach(function (btn) {
      var on = wanted.indexOf(btn.getAttribute('data-day')) >= 0;
      btn.classList.toggle('selected', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function parseDayCodes(value) {
    return String(value || '').split(',').map(function (part) { return part.trim(); }).filter(function (code) {
      return WEEKDAY_CODES.indexOf(code) >= 0;
    });
  }

  function courseRecord(courseId) {
    return (window.__abecCourses || []).filter(function (course) {
      return String(course.courseId) === String(courseId);
    })[0] || null;
  }

  function requiredTrainingSessions(course) {
    if (!course) return 0;
    var hours = Number(course.totalHours) || 0;
    var perDay = Number(course.hoursPerDay) || 0;
    if (hours > 0 && perDay > 0) return Math.ceil(hours / perDay);
    var training = Number(course.trainingDays) || 0;
    var ojt = Number(course.ojtDays) || 0;
    if (training > 0) return training + Math.max(0, ojt);
    return 0;
  }

  function scheduleEndDate(course, startValue, dayCodes) {
    var sessions = requiredTrainingSessions(course);
    if (!startValue || sessions < 1 || !dayCodes || !dayCodes.length) return '';
    var parts = String(startValue).split('-');
    if (parts.length !== 3) return '';
    var cursor = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    if (isNaN(cursor.getTime())) return '';
    var weekday = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    var allowed = {};
    dayCodes.forEach(function (code) {
      if (weekday[code] !== undefined) allowed[weekday[code]] = true;
    });
    if (!Object.keys(allowed).length) return '';
    var found = 0;
    var guard = 0;
    while (found < sessions && guard < 4000) {
      if (allowed[cursor.getDay()]) {
        found += 1;
        if (found === sessions) {
          var month = String(cursor.getMonth() + 1).padStart(2, '0');
          var day = String(cursor.getDate()).padStart(2, '0');
          return cursor.getFullYear() + '-' + month + '-' + day;
        }
      }
      cursor.setDate(cursor.getDate() + 1);
      guard += 1;
    }
    return '';
  }

  function syncCreateEndDate() {
    var end = document.getElementById('end-date');
    if (!end) return;
    var courseId = (document.getElementById('select-course') || {}).value || '';
    var start = (document.getElementById('start-date') || {}).value || '';
    if (!courseId || !start) {
      end.value = '';
      return;
    }
    var course = courseRecord(courseId);
    var days = selectedDayCodes('day-buttons');
    var calculated = scheduleEndDate(course, start, days);
    if (!calculated) {
      end.value = '';
      var reason = !days.length
        ? 'Select at least one training day before the end date can be calculated.'
        : 'This course has no training-hour configuration, so an end date was not calculated.';
      setFormMessage('create-schedule-msg', reason, true);
      return;
    }
    end.value = calculated;
    var msg = document.getElementById('create-schedule-msg');
    if (msg && /end date|training day|training-hour/i.test(msg.textContent || '')) {
      setFormMessage('create-schedule-msg', '', false);
    }
  }

  function formatTrainingDays(value) {
    var codes = parseDayCodes(value);
    if (!codes.length) return '';
    if (codes.join(',') === WEEKDAY_CODES.join(',')) return 'Monday–Friday';
    var labels = { Mon: 'Mon', Tue: 'Tue', Wed: 'Wed', Thu: 'Thu', Fri: 'Fri' };
    return codes.map(function (code) { return labels[code] || code; }).join(', ');
  }

  function rememberTrainer(courseName, name) {
    var data = readExtras();
    data.trainers = data.trainers || [];
    var key = courseMatchKey(courseName);
    if (!data.trainers.some(function (item) { return courseMatchKey(item.course) === key && normName(item.name) === normName(name); })) {
      data.trainers.push({ course: courseName, name: name });
    }
    writeExtras(data);
  }

  function refreshCreatePickers(selectedTrainer, selectedRoom) {
    var ctx = courseContext('create');
    var roomSelect = document.getElementById('select-room');
    if (roomSelect && !selectedRoom) roomSelect.removeAttribute('data-room-mode');
    fillTrainerSelect(document.getElementById('select-trainer'), ctx.courseName, selectedTrainer || trainerForCourse(ctx.courseName));
    fillRoomSelect(roomSelect, ctx.courseName, ctx.courseId, selectedRoom || '');
  }

  window.abecRefreshCreatePickers = function () {
    var ctx = courseContext('create');
    refreshCreatePickers(trainerForCourse(ctx.courseName), '');
  };

  window.abecFillConfigPickers = function () {
    var ctx = courseContext('config');
    var data = (window.scheduleDetails || {})[(document.getElementById('config-schedule-id') || {}).value] || {};
    fillTrainerSelect(document.getElementById('config-trainer'), ctx.courseName, data.trainer || '');
    fillRoomSelect(document.getElementById('config-room'), ctx.courseName, ctx.courseId, data.room || '');
    applyDaySelection('config-day-buttons', data.days || [], false);
  };

  function hideRoomPanels(scope) {
    [scope + '-room-pop', scope + '-existing-room'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.hidden = true;
    });
  }

  function bindScheduleExtras() {
    if (window.__abecScheduleExtrasBound) return;
    window.__abecScheduleExtrasBound = true;
    document.addEventListener('change', function (event) {
      var target = event.target;
      if (!target) return;
      if (target.id === 'select-course') {
        window.__abecPendingReplaceScheduleId = null;
        window.__abecReplacementCandidate = null;
        hideRoomPanels('create');
        var ctx = courseContext('create');
        refreshCreatePickers(trainerForCourse(ctx.courseName), '');
        syncCreateEndDate();
        var selectedActive = (window.__abecActiveSchedules || []).filter(function (row) { return String(row.courseId) === String(target.value); })[0];
        if (selectedActive) {
          var courseName = target.options[target.selectedIndex] ? target.options[target.selectedIndex].text : selectedActive.courseName;
          var replaceModal = document.getElementById('replace-schedule-modal');
          var replaceMessage = document.getElementById('replace-schedule-message');
          window.__abecReplacementCandidate = selectedActive;
          if (replaceMessage) replaceMessage.textContent = 'The schedule for ‘' + courseName + '’ is currently active. Do you want to replace it?';
          if (replaceModal) replaceModal.classList.remove('hidden');
        }
      }
      if (target.id === 'start-date') syncCreateEndDate();
      if (target.id === 'select-room' || target.id === 'config-room') handleRoomMenu(target);
    });
    document.addEventListener('click', function (event) {
      var dayBtn = event.target.closest && event.target.closest('#day-buttons [data-day]');
      if (dayBtn) syncCreateEndDate();
      var add = event.target.closest && event.target.closest('[data-add]');
      var save = event.target.closest && event.target.closest('[data-save]');
      var cancel = event.target.closest && event.target.closest('[data-cancel]');
      var button = add || save || cancel;
      if (!button) return;
      var kind = button.getAttribute('data-add') || button.getAttribute('data-save') || button.getAttribute('data-cancel');
      var scope = button.getAttribute('data-scope');
      var pop = document.getElementById(scope + '-' + kind + '-pop');
      if (add && pop) {
        pop.hidden = false;
        var focus = pop.querySelector('input');
        if (focus) focus.focus();
        return;
      }
      if (cancel && pop) {
        pop.hidden = true;
        pop.querySelectorAll('input').forEach(function (field) { field.value = ''; });
        return;
      }
      if (!save) return;
      var input = document.getElementById(scope + '-' + kind + '-name');
      var name = input ? input.value.trim().replace(/\s+/g, ' ') : '';
      var ctx = courseContext(scope);
      var messageId = scope === 'config' ? 'update-schedule-msg' : 'create-schedule-msg';
      if (!ctx.courseName || !ctx.courseId) {
        setFormMessage(messageId, 'Select a course before adding a trainer or room.', true);
        return;
      }
      if (!name) {
        setFormMessage(messageId, kind === 'room' ? 'Room name is required.' : 'Trainer name is required.', true);
        return;
      }
      if (kind === 'trainer') {
        if (name.length > 50) {
          setFormMessage(messageId, 'Trainer names must be 50 characters or fewer.', true);
          return;
        }
        if (isGenericTrainerLabel(name)) {
          setFormMessage(messageId, 'Enter the trainer’s actual name.', true);
          return;
        }
        var existingTrainer = extraTrainers(ctx.courseName).concat([trainerForCourse(ctx.courseName)]).filter(function (item) {
          return normName(item) === normName(name);
        })[0];
        if (!existingTrainer) rememberTrainer(ctx.courseName, name);
        fillTrainerSelect(document.getElementById(scope === 'config' ? 'config-trainer' : 'select-trainer'), ctx.courseName, existingTrainer || name);
        if (pop) {
          pop.hidden = true;
          if (input) input.value = '';
        }
        return;
      }
      if (name.length > 100) {
        setFormMessage(messageId, 'Room names must be 100 characters or fewer.', true);
        return;
      }
      var descriptionInput = document.getElementById(scope + '-room-description');
      var description = descriptionInput ? descriptionInput.value.trim().replace(/\s+/g, ' ') : '';
      saveRoom(scope, ctx, name, description, messageId, pop, input, descriptionInput);
    });
  }

  async function saveRoom(scope, ctx, name, description, messageId, pop, input, descriptionInput) {
    var result = await AbecApi.post('/api/training-rooms', {
      roomName: name,
      description: description,
      courseId: Number(ctx.courseId)
    });
    if (!result.success || !result.data) {
      setFormMessage(messageId, (result && result.message) || 'Unable to save the training room.', true);
      return;
    }
    await loadTrainingRooms();
    var roomSelect = document.getElementById(scope === 'config' ? 'config-room' : 'select-room');
    if (roomSelect) roomSelect.removeAttribute('data-room-mode');
    fillRoomSelect(roomSelect, ctx.courseName, ctx.courseId, result.data.roomName);
    if (pop) pop.hidden = true;
    if (input) input.value = '';
    if (descriptionInput) descriptionInput.value = '';
    var savedNew = result.message === 'Training room saved.';
    setFormMessage(messageId, savedNew ? 'Training room saved.' : 'This room is already registered and was selected without creating a duplicate.', false);
  }

  window.abecPrepareCreateScheduleForm = async function () {
    await loadCourses();
    await loadTrainingRooms();
    populateCourseSelect();
    setFormMessage('create-schedule-msg', '', false);
    showConflictAlert(false);

    var form = document.getElementById('create-schedule-form');
    if (form) form.reset();
    window.__abecPendingReplaceScheduleId = null;
    window.__abecReplacementCandidate = null;

    applyDaySelection('day-buttons', [], true);
    syncCreateEndDate();
    var startTime = document.getElementById('start-time');
    var endTime = document.getElementById('end-time');
    if (startTime) startTime.value = '08:00';
    if (endTime) endTime.value = '17:00';
    ['create-trainer-pop', 'create-room-pop', 'create-existing-room', 'create-room-kind'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.hidden = true;
    });
    bindScheduleExtras();
    refreshCreatePickers();

    var status = document.getElementById('select-status');
    if (status) status.value = 'Active';
    var startDate = document.getElementById('start-date');
    if (startDate) startDate.removeAttribute('min');
  };

  window.confirmReplaceSchedule = function () {
    var candidate = window.__abecReplacementCandidate;
    window.__abecPendingReplaceScheduleId = candidate ? candidate.scheduleId : null;
    var modal = document.getElementById('replace-schedule-modal');
    if (modal) modal.classList.add('hidden');
  };

  window.cancelReplaceSchedule = function () {
    window.__abecPendingReplaceScheduleId = null;
    window.__abecReplacementCandidate = null;
    var modal = document.getElementById('replace-schedule-modal');
    if (modal) modal.classList.add('hidden');
    var select = document.getElementById('select-course');
    if (select) select.value = '';
  };

  function earliestAllowedStartDate() {
    var now = new Date();
    var monthDate = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
    var janFirst = new Date(now.getFullYear(), 0, 1);
    var earliest = monthDate > janFirst ? monthDate : janFirst;
    return earliest.getFullYear() + '-' + String(earliest.getMonth() + 1).padStart(2, '0') + '-' + String(earliest.getDate()).padStart(2, '0');
  }

  function validStartDate(value) {
    if (!value) return true;
    var today = new Date();
    var picked = new Date(value + 'T00:00:00');
    var min = new Date(earliestAllowedStartDate() + 'T00:00:00');
    return !isNaN(picked.getTime()) && picked.getFullYear() === today.getFullYear() && picked >= min && picked <= new Date(today.getFullYear(), today.getMonth(), today.getDate());
  }

  function validateStartDate(value, messageId) {
    if (validStartDate(value)) return true;
    setFormMessage(messageId, 'Select a start date within the allowed date range.', true);
    return false;
  }

  window.abecSaveSchedule = async function () {
    setFormMessage('create-schedule-msg', '', false);
    showConflictAlert(false);

    var courseId = parseInt((document.getElementById('select-course') || {}).value || '0', 10);
    var trainer = ((document.getElementById('select-trainer') || {}).value || '').trim();
    var room = chosenRoom('create');
    var date = (document.getElementById('start-date') || {}).value || '';
    var start = (document.getElementById('start-time') || {}).value || '';
    var end = (document.getElementById('end-time') || {}).value || '';
    var days = selectedDayCodes('day-buttons');
    var status = ((document.getElementById('select-status') || {}).value || 'Inactive').trim();
    var batchId = await ensureActiveBatchId();

    if (!courseId || !batchId || !trainer || !room || !date || !start || !end || !days.length) {
      setFormMessage('create-schedule-msg', 'Please complete course, trainer, training room, days, date, and time fields.', true);
      return;
    }
    if (!validateStartDate(date, 'create-schedule-msg')) return;

    var result = await AbecApi.post('/api/schedules', {
      courseId: courseId,
      batchId: batchId,
      scheduleDate: date,
      startTime: toTimeSpan(start),
      endTime: toTimeSpan(end),
      room: room,
      trainer: trainer,
      replaceScheduleId: window.__abecPendingReplaceScheduleId || null,
      trainingDays: days.join(','),
      status: status
    });

    if (!result.success) {
      var msg = result.message || 'Unable to create schedule.';
      setFormMessage('create-schedule-msg', msg, true);
      if (/conflict|active schedule/i.test(msg)) showConflictAlert(true, msg);
      return;
    }

    if (typeof window.closeCreateScheduleModal === 'function') window.closeCreateScheduleModal();
    await loadSchedules();
  };

  window.abecUpdateSchedule = async function () {
    setFormMessage('update-schedule-msg', '', false);
    showConflictAlert(false);

    var id = parseInt((document.getElementById('config-schedule-id') || {}).value || '0', 10);
    var trainer = ((document.getElementById('config-trainer') || {}).value || '').trim();
    var room = chosenRoom('config');
    var date = (document.getElementById('config-start-date') || {}).value || '';
    var start = (document.getElementById('config-start-time') || {}).value || '';
    var end = (document.getElementById('config-end-time') || {}).value || '';
    var days = selectedDayCodes('config-day-buttons');
    var statusEl = document.querySelector('input[name="config-status"]:checked');
    var status = statusEl ? statusEl.value : 'Inactive';

    if (!id || !trainer || !room || !date || !start || !end || !days.length) {
      setFormMessage('update-schedule-msg', 'Please complete trainer, training room, days, date, and time fields.', true);
      return;
    }
    if (!validateStartDate(date, 'update-schedule-msg')) return;

    var result = await AbecApi.put('/api/schedules/' + id, {
      scheduleDate: date,
      startTime: toTimeSpan(start),
      endTime: toTimeSpan(end),
      room: room,
      trainer: trainer,
      trainingDays: days.join(','),
      status: status
    });

    if (!result.success) {
      var msg = result.message || 'Unable to update schedule.';
      setFormMessage('update-schedule-msg', msg, true);
      if (/conflict|active schedule/i.test(msg)) showConflictAlert(true, msg);
      return;
    }

    if (typeof window.closeScheduleConfig === 'function') window.closeScheduleConfig();
    await loadSchedules();
  };

  var historyPage = 1;
  var historySearchTimer = 0;

  function formatHistoryWhen(value) {
    if (!value) return '—';
    var d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function renderHistoryRows(items) {
    var body = document.getElementById('course-history-body');
    if (!body) return;
    if (!items || !items.length) {
      body.innerHTML = '<tr><td colspan="6" class="px-4 py-10 text-center text-sm text-slate-500">No course changes have been recorded yet.</td></tr>';
      return;
    }
    body.innerHTML = items.map(function (item) {
      return '<tr>' +
        '<td class="px-4 py-3 font-semibold text-slate-800">' + esc(courseLabel(item.courseName) || 'Course') + '</td>' +
        '<td class="px-4 py-3 text-slate-700">' + esc(item.action || '—') + '</td>' +
        '<td class="px-4 py-3 text-slate-600">' + esc(item.previousValue || '—') + '</td>' +
        '<td class="px-4 py-3 text-slate-600">' + esc(item.newValue || '—') + '</td>' +
        '<td class="px-4 py-3 text-slate-600 whitespace-nowrap">' + esc(formatHistoryWhen(item.createdAt)) + '</td>' +
        '<td class="px-4 py-3 text-slate-700">' + esc(item.modifiedBy || '—') + '</td>' +
        '</tr>';
    }).join('');
  }

  async function loadCourseHistory(page) {
    historyPage = page || 1;
    var search = ((document.getElementById('course-history-search') || {}).value || '').trim();
    var body = document.getElementById('course-history-body');
    var meta = document.getElementById('course-history-meta');
    if (body) body.innerHTML = '<tr><td colspan="6" class="px-4 py-10 text-center text-sm text-slate-500">Loading history…</td></tr>';
    var result = await AbecApi.get('/api/courses/history?page=' + historyPage + '&pageSize=12&search=' + encodeURIComponent(search));
    if (!result.success || !result.data) {
      if (body) body.innerHTML = '<tr><td colspan="6" class="px-4 py-10 text-center text-sm text-red-600">' + esc(result.message || 'Unable to load course history.') + '</td></tr>';
      if (meta) meta.textContent = '';
      return;
    }
    var data = result.data;
    var items = data.items || [];
    var total = data.totalCount || 0;
    var size = data.pageSize || 12;
    var current = data.page || historyPage;
    renderHistoryRows(items);
    var start = total ? ((current - 1) * size) + 1 : 0;
    var end = Math.min(total, current * size);
    if (meta) meta.textContent = total ? ('Showing ' + start + '–' + end + ' of ' + total) : 'No matching changes';
    var prev = document.getElementById('course-history-prev');
    var next = document.getElementById('course-history-next');
    if (prev) prev.disabled = current <= 1;
    if (next) next.disabled = current * size >= total;
    historyPage = current;
    window.__abecHistoryPage = current;
  }

  function openCourseHistory() {
    var modal = document.getElementById('course-history-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    loadCourseHistory(1);
    var search = document.getElementById('course-history-search');
    if (search) search.focus();
  }

  function closeCourseHistory() {
    var modal = document.getElementById('course-history-modal');
    if (modal) modal.classList.add('hidden');
  }

  function queueHistorySearch() {
    if (historySearchTimer) clearTimeout(historySearchTimer);
    historySearchTimer = setTimeout(function () { loadCourseHistory(1); }, 250);
  }

  window.openCourseHistory = openCourseHistory;
  window.closeCourseHistory = closeCourseHistory;
  window.queueHistorySearch = queueHistorySearch;
  window.loadCourseHistory = loadCourseHistory;

  function installOverrides() {
    window.loadCourseDetail = function (id) {
      loadCourseDetailLive(id || 'bookkeeping');
    };

    window.openCourse = function (id) {
      if (typeof window.showView === 'function') window.showView('detail', id);
      else loadCourseDetailLive(id);
    };

    var originalShowView = window.showView;
    if (typeof originalShowView === 'function') {
      window.showView = function (name, courseId) {
        originalShowView(name, courseId);
        if (name === 'overview') loadCourses();
        if (name === 'schedule') loadSchedules();
      };
    }
  }

  document.addEventListener('DOMContentLoaded', async function () {
    AbecApi.requireRole('Admin');
    bindScheduleExtras();
    installOverrides();
    await loadTrainingRooms();
    await loadCourses();
    await ensureActiveBatchId();

    // Re-load detail from API if the page booted into detail with static placeholders.
    var detail = document.getElementById('view-detail');
    if (detail && !detail.classList.contains('hidden')) {
      var slug = window.__abecActiveCourseSlug;
      if (!slug) {
        var title = (document.getElementById('course-title') || {}).textContent || '';
        slug = matchCourseToSlug(title) || 'bookkeeping';
      }
      await loadCourseDetailLive(slug);
    }

    var schedule = document.getElementById('view-schedule');
    if (schedule && !schedule.classList.contains('hidden')) {
      await loadSchedules();
    }

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) {
        loadCourses();
        if (detail && !detail.classList.contains('hidden')) {
          loadCourseDetailLive(window.__abecActiveCourseSlug || window.__abecActiveCourseId || 'bookkeeping');
        }
        if (schedule && !schedule.classList.contains('hidden')) {
          loadSchedules();
        }
      }
    });
    setInterval(function () {
      var overview = document.getElementById('view-overview');
      if (overview && !overview.classList.contains('hidden')) loadCourses();
    }, 15000);
  });
})();
