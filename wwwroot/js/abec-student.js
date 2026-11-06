/* Student portal pages ↔ backend (logged-in student session) */
(function () {
  'use strict';
  if (!window.AbecApi) return;

  var calYear = new Date().getFullYear();
  var calMonth = new Date().getMonth();
  var scheduleDateKeys = {};
  var classSchedules = [];
  var selectedDayKey = '';
  var classCalWired = false;

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function setText(sel, value) {
    document.querySelectorAll(sel).forEach(function (el) {
      el.textContent = value == null || value === '' ? '—' : String(value);
    });
  }

  function toDateKey(value) {
    if (!value) return '';
    var d = new Date(value);
    if (isNaN(d.getTime())) return String(value).slice(0, 10);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function parseTimeParts(value) {
    if (value == null || value === '') return null;
    var s = String(value);
    var m = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!m) return null;
    return { h: parseInt(m[1], 10), m: parseInt(m[2], 10) };
  }

  function toTimeLabel(value) {
    var parts = parseTimeParts(value);
    if (!parts) return value == null ? '' : String(value).slice(0, 5);
    return String(parts.h).padStart(2, '0') + ':' + String(parts.m).padStart(2, '0');
  }

  function toTimeAmPm(value) {
    var parts = parseTimeParts(value);
    if (!parts) return toTimeLabel(value);
    var suffix = parts.h >= 12 ? 'PM' : 'AM';
    var hour = parts.h % 12;
    if (hour === 0) hour = 12;
    return String(hour).padStart(2, '0') + ':' + String(parts.m).padStart(2, '0') + ' ' + suffix;
  }

  function timeRangeLabel(start, end) {
    var a = toTimeAmPm(start);
    var b = toTimeAmPm(end);
    if (!a && !b) return '—';
    return a + (b ? ' - ' + b : '');
  }

  function scheduleHours(start, end) {
    var a = parseTimeParts(start);
    var b = parseTimeParts(end);
    if (!a || !b) return '—';
    var mins = (b.h * 60 + b.m) - (a.h * 60 + a.m);
    if (mins <= 0) return '—';
    return (mins / 60).toFixed(1);
  }

  function dayNameFromSchedule(schedule) {
    if (schedule.dayOfWeek) return schedule.dayOfWeek;
    if (!schedule.scheduleDate) return '—';
    var d = new Date(schedule.scheduleDate);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(undefined, { weekday: 'long' });
  }

  function formatDayTime(schedule) {
    var day = schedule.dayOfWeek || '';
    if (!day && schedule.scheduleDate) {
      var d = new Date(schedule.scheduleDate);
      if (!isNaN(d.getTime())) day = d.toLocaleDateString(undefined, { weekday: 'long' });
    }
    var dateLabel = AbecApi.formatDate(schedule.scheduleDate);
    var start = toTimeLabel(schedule.startTime);
    var end = toTimeLabel(schedule.endTime);
    return (day ? day + ', ' : '') + dateLabel + (start ? ' · ' + start + (end ? '-' + end : '') : '');
  }

  function courseLabel(name, fallback) {
    var text = name == null ? '' : String(name);
    if (window.AbecApi && typeof AbecApi.displayCourseName === 'function') text = AbecApi.displayCourseName(text);
    text = String(text || '').replace(/\s{2,}/g, ' ').trim();
    return text || (fallback == null ? '—' : fallback);
  }

  function statusMeta(accountStatus) {
    var status = String(accountStatus || '').trim();
    var active = /^active$/i.test(status);
    if (active) {
      return {
        label: 'Active',
        chipClass: 'inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full text-[10px] font-bold text-emerald-700 uppercase tracking-wide',
        dotClass: 'w-2 h-2 rounded-full bg-emerald-500'
      };
    }
    if (/inactive/i.test(status)) {
      return {
        label: 'Pending Activation',
        chipClass: 'inline-flex items-center gap-1.5 bg-amber-50 border border-amber-200 px-3 py-1 rounded-full text-[10px] font-bold text-amber-800 uppercase tracking-wide',
        dotClass: 'w-2 h-2 rounded-full bg-amber-500'
      };
    }
    return {
      label: status || 'Unknown',
      chipClass: 'inline-flex items-center gap-1.5 bg-white border border-slate-200 px-3 py-1 rounded-full text-[10px] font-bold text-slate-700 uppercase tracking-wide',
      dotClass: 'w-2 h-2 rounded-full bg-slate-400'
    };
  }

  function batchPeriod(profile) {
    if (profile.batchStartDate && profile.batchEndDate) {
      return AbecApi.formatDate(profile.batchStartDate) + ' - ' + AbecApi.formatDate(profile.batchEndDate);
    }
    return profile.batchName || '—';
  }

  function applySidebar(profile, session) {
    var name = profile.fullName || session.displayName || 'Student';
    setText('[data-bind="student-name"]', name);
    var nameEl = document.getElementById('sidebar-name');
    if (nameEl) nameEl.textContent = name;
    var initialsEl = document.getElementById('sidebar-initials');
    if (initialsEl) initialsEl.textContent = AbecApi.initials(name);
    var role = document.getElementById('sidebar-role');
    if (role) role.textContent = courseLabel(profile.courseName, 'Student');
  }

  function applyHeader(profile) {
    setText('[data-bind="email"]', profile.email || '—');
    setText('[data-bind="batch"]', profile.batchName || '—');
    setText('[data-bind="course"]', courseLabel(profile.courseName, 'Not enrolled'));

    var meta = statusMeta(profile.accountStatus);
    var chip = document.getElementById('header-status-chip');
    var dot = document.getElementById('header-status-dot');
    var text = document.getElementById('header-status-text');
    if (chip) chip.className = meta.chipClass;
    if (dot) dot.className = meta.dotClass;
    if (text) text.textContent = meta.label;
  }

  function applyCourseCard(profile, upcoming) {
    var courseName = courseLabel(profile.courseName, 'Not enrolled');
    setText('#course-title, [data-bind="course"]', courseName);
    setText('#course-qualification, [data-bind="qualification"]', courseLabel(profile.courseDuration, courseName));

    var next = (upcoming && upcoming[0]) || null;
    setText('#course-trainer, [data-bind="trainer"]', next && next.trainer ? next.trainer : '—');
    setText('#course-room, [data-bind="room"]', next && next.room ? next.room : '—');
    setText('#course-batch-period, [data-bind="batch-period"]', batchPeriod(profile));
    setText('#course-enroll-status', profile.accountStatus || '—');
    var nextClass = (upcoming && upcoming[0]) ? formatDayTime(upcoming[0]) : 'No upcoming class';
    setText('#course-next-class', nextClass);
  }

  function renderUpcoming(list) {
    var tbody = document.getElementById('upcoming-classes-body');
    if (!tbody) return;
    if (!list || !list.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="px-6 py-10 text-center text-sm text-slate-500">No active course schedule assigned yet.</td></tr>';
      return;
    }
    tbody.innerHTML = list.map(function (s) {
      return (
        '<tr class="hover:bg-slate-50/70">' +
        '<td class="px-6 py-3.5 text-slate-700">' + esc(formatDayTime(s)) + '</td>' +
        '<td class="px-6 py-3.5 font-semibold text-slate-800">' + esc(courseLabel(s.courseName, 'Training Session')) + '</td>' +
        '<td class="px-6 py-3.5 text-slate-700">' + esc(s.trainer || '—') + '</td>' +
        '<td class="px-6 py-3.5 text-slate-700">' + esc(s.room || '—') + '</td>' +
        '</tr>'
      );
    }).join('');
  }

  function renderDocs(list) {
    var host = document.getElementById('recent-docs');
    if (!host) return;
    if (!list || !list.length) {
      host.innerHTML = '<p class="text-sm text-slate-500 text-center py-6">No document requests yet.</p>';
      return;
    }
    host.innerHTML = '<div class="space-y-3">' + list.map(function (d) {
      return (
        '<div class="flex items-start justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-3">' +
        '<div class="min-w-0">' +
        '<p class="text-sm font-semibold text-slate-800 truncate">' + esc(d.documentType || 'Document') + '</p>' +
        '<p class="text-[11px] text-slate-500 mt-0.5">' + esc(AbecApi.formatDate(d.requestDate)) + '</p>' +
        '</div>' +
        '<span class="shrink-0 text-[10px] font-bold uppercase px-2 py-1 rounded bg-white border border-slate-200 text-slate-600">' +
        esc((function (s) {
          var k = String(s || '').toLowerCase();
          if (k === 'approved') return 'Processing';
          if (k === 'ready' || k === 'ready for release' || k === 'readyforrelease') return 'Processing';
          return s || 'Pending';
        })(d.requestStatus)) + '</span>' +
        '</div>'
      );
    }).join('') + '</div>';
  }

  function renderCalendar() {
    var grid = document.getElementById('student-cal-grid');
    var label = document.getElementById('cal-month-label');
    if (!grid) return;

    var months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    if (label) label.textContent = months[calMonth] + ' ' + calYear;

    var firstDay = new Date(calYear, calMonth, 1).getDay();
    var daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    var daysInPrev = new Date(calYear, calMonth, 0).getDate();
    var today = new Date();
    var isCurrentMonth = today.getFullYear() === calYear && today.getMonth() === calMonth;

    var html = '';
    var cell = 0;
    for (var i = firstDay - 1; i >= 0; i--) {
      html += '<div class="text-slate-300 py-1.5">' + (daysInPrev - i) + '</div>';
      cell++;
    }
    for (var d = 1; d <= daysInMonth; d++) {
      var key = calYear + '-' + String(calMonth + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      var isToday = isCurrentMonth && d === today.getDate();
      var hasClass = !!scheduleDateKeys[key];
      var cls = 'py-1.5 rounded-md ';
      if (isToday) cls += 'bg-abec-navy text-white font-bold ';
      else if (hasClass) cls += 'bg-amber-100 text-amber-900 border border-amber-400 font-semibold ';
      else cls += 'text-slate-700 ';
      html += '<div class="' + cls + '">' + d + '</div>';
      cell++;
    }
    var trailing = 1;
    while (cell % 7 !== 0) {
      html += '<div class="text-slate-300 py-1.5">' + trailing + '</div>';
      trailing++;
      cell++;
    }
    grid.innerHTML = html;
  }

  function wireCalendar(schedules) {
    scheduleDateKeys = {};
    (schedules || []).forEach(function (s) {
      var key = toDateKey(s.scheduleDate);
      if (key) scheduleDateKeys[key] = true;
    });

    var prev = document.getElementById('cal-prev');
    var next = document.getElementById('cal-next');
    if (prev && !prev._abecBound) {
      prev._abecBound = true;
      prev.addEventListener('click', function () {
        calMonth -= 1;
        if (calMonth < 0) { calMonth = 11; calYear -= 1; }
        renderCalendar();
      });
    }
    if (next && !next._abecBound) {
      next._abecBound = true;
      next.addEventListener('click', function () {
        calMonth += 1;
        if (calMonth > 11) { calMonth = 0; calYear += 1; }
        renderCalendar();
      });
    }
    renderCalendar();
  }

  function renderClassCalendar() {
    var grid = document.getElementById('class-cal-grid');
    var label = document.getElementById('class-cal-month-label');
    if (!grid) return;

    var months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    if (label) label.textContent = months[calMonth] + ' ' + calYear;

    var firstDay = new Date(calYear, calMonth, 1).getDay();
    var daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    var daysInPrev = new Date(calYear, calMonth, 0).getDate();
    var today = new Date();
    var isCurrentMonth = today.getFullYear() === calYear && today.getMonth() === calMonth;

    var html = '';
    var cell = 0;
    for (var i = firstDay - 1; i >= 0; i--) {
      html += '<div class="train-day text-slate-300">' + (daysInPrev - i) + '</div>';
      cell++;
    }
    for (var d = 1; d <= daysInMonth; d++) {
      var key = calYear + '-' + String(calMonth + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      var isToday = isCurrentMonth && d === today.getDate();
      var hasClass = !!scheduleDateKeys[key];
      var selected = selectedDayKey === key;
      var cls = 'cal-day train-day rounded-md ';
      if (isToday) cls += 'bg-abec-navy text-white font-bold ';
      else if (hasClass) cls += 'bg-amber-100 text-amber-900 border border-amber-400 font-semibold ';
      else cls += 'text-slate-700 ';
      if (selected) cls += 'is-selected ';
      html += '<button type="button" class="' + cls + '" data-date-key="' + key + '">' + d + '</button>';
      cell++;
    }
    var trailing = 1;
    while (cell % 7 !== 0) {
      html += '<div class="train-day text-slate-300">' + trailing + '</div>';
      trailing++;
      cell++;
    }
    grid.innerHTML = html;
  }

  function wireClassCalendar(schedules) {
    scheduleDateKeys = {};
    (schedules || []).forEach(function (s) {
      var key = toDateKey(s.scheduleDate);
      if (key) scheduleDateKeys[key] = true;
    });

    if (!classCalWired) {
      classCalWired = true;
      var prev = document.getElementById('class-cal-prev');
      var next = document.getElementById('class-cal-next');
      var grid = document.getElementById('class-cal-grid');
      var clearBtn = document.getElementById('btn-clear-day-filter');

      if (prev) {
        prev.addEventListener('click', function () {
          calMonth -= 1;
          if (calMonth < 0) { calMonth = 11; calYear -= 1; }
          renderClassCalendar();
        });
      }
      if (next) {
        next.addEventListener('click', function () {
          calMonth += 1;
          if (calMonth > 11) { calMonth = 0; calYear += 1; }
          renderClassCalendar();
        });
      }
      if (grid) {
        grid.addEventListener('click', function (e) {
          var btn = e.target.closest('[data-date-key]');
          if (!btn) return;
          var key = btn.getAttribute('data-date-key');
          if (!key) return;
          selectedDayKey = selectedDayKey === key ? '' : key;
          renderClassScheduleTable();
          renderDayView();
          renderClassCalendar();
        });
      }
      if (clearBtn) {
        clearBtn.addEventListener('click', function () {
          selectedDayKey = '';
          renderClassScheduleTable();
          renderDayView();
          renderClassCalendar();
        });
      }

      document.querySelectorAll('[data-close-schedule-detail]').forEach(function (el) {
        el.addEventListener('click', closeScheduleDetail);
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeScheduleDetail();
      });
    }

    renderClassCalendar();
  }

  function renderDayView() {
    var panel = document.getElementById('day-view-panel');
    var dateEl = document.getElementById('day-view-date');
    var listEl = document.getElementById('day-view-list');
    var clearBtn = document.getElementById('btn-clear-day-filter');
    var filterLabel = document.getElementById('schedule-filter-label');
    if (!panel || !listEl) return;

    if (!selectedDayKey) {
      panel.classList.add('hidden');
      if (clearBtn) clearBtn.classList.add('hidden');
      if (filterLabel) filterLabel.textContent = 'Showing all active sessions for your course';
      return;
    }

    var items = classSchedules.filter(function (s) { return toDateKey(s.scheduleDate) === selectedDayKey; });
    panel.classList.remove('hidden');
    if (clearBtn) clearBtn.classList.remove('hidden');
    if (dateEl) dateEl.textContent = AbecApi.formatDate(selectedDayKey);
    if (filterLabel) filterLabel.textContent = 'Filtered to ' + AbecApi.formatDate(selectedDayKey);

    if (!items.length) {
      listEl.innerHTML = '<p>No training session is scheduled on this day.</p>';
      return;
    }

    listEl.innerHTML = items.map(function (s) {
      return '<p class="leading-snug"><span class="font-semibold text-slate-800">' + esc(courseLabel(s.courseName, 'Training Session')) + '</span><br>' +
        esc(timeRangeLabel(s.startTime, s.endTime)) +
        (s.trainer ? ' · ' + esc(s.trainer) : '') +
        (s.room ? ' · ' + esc(s.room) : '') + '</p>';
    }).join('');
  }

  function openScheduleDetail(schedule) {
    var modal = document.getElementById('schedule-detail-modal');
    if (!modal || !schedule) return;
    document.getElementById('detail-title').textContent = courseLabel(schedule.courseName, 'Training Session');
    document.getElementById('detail-status').textContent = schedule.status || 'Active';
    document.getElementById('detail-course').textContent = courseLabel(schedule.courseName, '—');
    document.getElementById('detail-day').textContent = dayNameFromSchedule(schedule);
    document.getElementById('detail-date').textContent = AbecApi.formatDate(schedule.scheduleDate) || '—';
    document.getElementById('detail-time').textContent = timeRangeLabel(schedule.startTime, schedule.endTime);
    document.getElementById('detail-trainer').textContent = schedule.trainer || '—';
    document.getElementById('detail-room').textContent = schedule.room || '—';
    document.getElementById('detail-hours').textContent = scheduleHours(schedule.startTime, schedule.endTime);
    document.getElementById('detail-batch').textContent = schedule.batchName || '—';
    modal.classList.add('is-open');
  }

  function closeScheduleDetail() {
    var modal = document.getElementById('schedule-detail-modal');
    if (modal) modal.classList.remove('is-open');
  }

  function applyScheduleSummary(list, profile) {
    var badge = document.getElementById('schedule-status-badge');
    var courseEl = document.getElementById('schedule-course-name');
    var first = (list && list[0]) || null;

    if (!first) {
      if (courseEl) {
        courseEl.textContent = (profile && profile.courseName)
          ? courseLabel(profile.courseName, 'Course')
          : 'Enrolled course';
      }
      if (badge) badge.classList.add('hidden');
      return;
    }

    if (courseEl) {
      var batch = first.batchName || (profile && profile.batchName) || '';
      courseEl.textContent = courseLabel(first.courseName || (profile && profile.courseName), 'Course Schedule') +
        (batch ? ' · ' + batch : '');
    }
    if (badge) {
      badge.textContent = first.status || 'Active';
      badge.classList.remove('hidden');
    }
  }

  function scheduleDetail(icon, label, value) {
    return '<div class="train-detail"><span class="train-detail-icon" aria-hidden="true">' + icon + '</span><div><p class="train-detail-label">' + esc(label) + '</p><p class="train-detail-value">' + esc(value || '—') + '</p></div></div>';
  }

  function renderClassScheduleTable() {
    var host = document.getElementById('class-schedule-body');
    if (!host) return;

    var list = classSchedules;
    if (selectedDayKey) {
      list = classSchedules.filter(function (s) { return toDateKey(s.scheduleDate) === selectedDayKey; });
    }

    if (!classSchedules.length) {
      host.innerHTML = '<p class="train-empty">No training schedule is currently available for your enrolled course.</p>';
      return;
    }

    if (!list.length) {
      host.innerHTML = '<p class="train-empty">No training session is scheduled on the selected day.</p>';
      return;
    }

    var iconUser = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21a8 8 0 0 0-16 0" stroke-linecap="round"/><circle cx="12" cy="7" r="4"/></svg>';
    var iconRoom = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    var iconDate = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18" stroke-linecap="round"/></svg>';
    var iconTime = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2" stroke-linecap="round"/></svg>';

    host.innerHTML = list.map(function (s) {
      var status = s.status || '—';
      var active = /^active$/i.test(status);
      var dateLabel = (dayNameFromSchedule(s) ? dayNameFromSchedule(s) + ', ' : '') + (AbecApi.formatDate(s.scheduleDate) || '—');
      return (
        '<article class="train-card' + (selectedDayKey ? ' is-selected' : '') + '" data-schedule-id="' + esc(s.scheduleId) + '" data-schedule-date="' + esc(toDateKey(s.scheduleDate)) + '">' +
        '<div class="train-card-top"><h3>' + esc(courseLabel(s.courseName, 'Training Session')) + '</h3>' +
        '<span class="train-status' + (active ? ' is-active' : '') + '">' + esc(status) + '</span></div>' +
        '<div class="train-details">' +
        scheduleDetail(iconUser, 'Instructor', s.trainer) +
        scheduleDetail(iconRoom, 'Training room', s.room) +
        scheduleDetail(iconDate, 'Training date', dateLabel) +
        scheduleDetail(iconTime, 'Training time', timeRangeLabel(s.startTime, s.endTime)) +
        '</div></article>'
      );
    }).join('');
  }

  function applyScheduleNotificationTarget() {
    var params = new URLSearchParams(window.location.search);
    var targetDate = params.get('highlightDate');
    if (!targetDate) return;
    var targetKey = toDateKey(targetDate);
    var target = classSchedules.find(function (s) { return toDateKey(s.scheduleDate) === targetKey; });
    if (!target) return;
    selectedDayKey = targetKey;
    renderClassScheduleTable();
    renderDayView();
    renderClassCalendar();
    var card = document.querySelector('[data-schedule-date="' + targetKey + '"]');
    if (!card) return;
    card.classList.add('abec-notification-highlight');
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    openScheduleDetail(target);
    window.setTimeout(function () { card.classList.remove('abec-notification-highlight'); }, 5600);
  }

  function renderScheduleNotifications(list) {
    var host = document.getElementById('schedule-notifications');
    if (!host) return;

    var items = (list || []).filter(function (n) {
      var text = ((n.title || '') + ' ' + (n.message || '')).toLowerCase();
      return text.indexOf('schedule') !== -1 || text.indexOf('class') !== -1 || text.indexOf('trainer') !== -1 || text.indexOf('instructor') !== -1 || text.indexOf('room') !== -1;
    }).sort(function (a, b) {
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });

    if (!items.length) {
      host.innerHTML = '<p class="train-empty">No class schedule updates.</p>';
      return;
    }

    host.innerHTML = items.map(function (n) {
      return (
        '<article class="train-update">' +
        '<h4>' + esc(courseLabel(n.title, 'Update')) + '</h4>' +
        '<p>' + esc(courseLabel(n.message, '')) + '</p>' +
        '<time>' + esc(AbecApi.formatDate(n.createdAt)) + '</time>' +
        '</article>'
      );
    }).join('');
  }

  async function loadClassSchedule(session) {
    var profileRes = await AbecApi.get('/api/student/' + session.userId + '/profile');
    var profile = (profileRes.success && profileRes.data) ? profileRes.data : { fullName: session.displayName };
    applySidebar(profile, session);

    var scheduleRes = await AbecApi.get('/api/student/' + session.userId + '/schedule');
    if (!scheduleRes.success) {
      classSchedules = [];
      applyScheduleSummary([], profile);
      var tbody = document.getElementById('class-schedule-body');
      if (tbody) {
        tbody.innerHTML = '<p class="train-empty">' + esc(scheduleRes.message || 'Unable to load the training schedule.') + '</p>';
      }
      wireClassCalendar([]);
      renderDayView();
    } else {
      classSchedules = scheduleRes.data || [];
      applyScheduleSummary(classSchedules, profile);
      renderClassScheduleTable();
      wireClassCalendar(classSchedules);
      renderDayView();

      if (classSchedules.length) {
        var firstKey = toDateKey(classSchedules[0].scheduleDate);
        if (firstKey) {
          var parts = firstKey.split('-');
          if (parts.length === 3) {
            calYear = parseInt(parts[0], 10);
            calMonth = parseInt(parts[1], 10) - 1;
            renderClassCalendar();
          }
        }
      }
      applyScheduleNotificationTarget();
    }

    var notifRes = await AbecApi.get('/api/notifications/student/' + session.userId);
    if (notifRes.success) renderScheduleNotifications(notifRes.data || []);
    else renderScheduleNotifications([]);
  }

  async function loadDashboard(session) {
    var dash = await AbecApi.get('/api/student/' + session.userId + '/dashboard');
    if (!dash.success || !dash.data) {
      setText('[data-bind="student-name"]', session.displayName || 'Student');
      setText('#header-status-text', 'Unable to load profile');
      var tbody = document.getElementById('upcoming-classes-body');
      if (tbody) tbody.innerHTML = '<tr><td colspan="4" class="px-6 py-10 text-center text-sm text-red-600">' + esc(dash.message || 'Unable to load dashboard.') + '</td></tr>';
      if (typeof window.abecRefreshStudentNotifBadge === 'function') window.abecRefreshStudentNotifBadge();
      return;
    }

    var profile = dash.data.profile || {};
    var upcoming = dash.data.upcomingClasses || [];
    var schedules = dash.data.classSchedules || upcoming;

    applySidebar(profile, session);
    applyHeader(profile);
    applyCourseCard(profile, upcoming);
    var openDocs = (dash.data.recentDocumentRequests || []).filter(function (item) {
      return item && item.requestStatus && item.requestStatus !== 'Released';
    }).length;
    setText('#course-doc-shortcut', openDocs ? (openDocs + ' open') : 'No open requests');
    renderUpcoming(upcoming);
    renderDocs(dash.data.recentDocumentRequests || []);
    wireCalendar(schedules);
    if (typeof window.abecRefreshStudentNotifBadge === 'function') window.abecRefreshStudentNotifBadge();
    applyStudentNotificationTarget();
  }

  function applyStudentNotificationTarget() {
    var params = new URLSearchParams(window.location.search);
    if (params.get('highlight') !== 'status') return;
    var target = document.getElementById('header-status-chip');
    if (!target) return;
    target.classList.add('abec-notification-highlight');
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(function () { target.classList.remove('abec-notification-highlight'); }, 5600);
  }

  async function boot() {
    var session = AbecApi.requireRole('Student');
    if (!session) return;

    var path = window.location.pathname.toLowerCase();

    if (path.indexOf('studentdashboard') !== -1) {
      await loadDashboard(session);
      return;
    }

    if (path.indexOf('classschedule') !== -1) {
      await loadClassSchedule(session);
      return;
    }

    // Keep sidebar identity consistent on other student pages when profile elements exist.
    if (document.querySelector('[data-bind="student-name"], #sidebar-name, #sidebar-initials')) {
      var profileRes = await AbecApi.get('/api/student/' + session.userId + '/profile');
      if (profileRes.success && profileRes.data) applySidebar(profileRes.data, session);
      else applySidebar({ fullName: session.displayName }, session);
    }

    if (path.indexOf('documentrequest') !== -1) {
      return;
    }
  }

  function loadProfileMenuScript(done) {
    if (window.AbecProfileMenu) {
      done();
      return;
    }
    var s = document.createElement('script');
    s.src = '/wwwroot/js/abec-profile-menu.js?v=20261028shell1';
    s.onload = done;
    s.onerror = done;
    document.head.appendChild(s);
  }

  function mountStudentProfileMenu() {
    if (window.AbecProfileMenu) AbecProfileMenu.mountStudent();
  }

  function bindSectionNav() {
    var select = document.getElementById('student-section');
    if (!select) return;
    var path = (window.location.pathname || '').toLowerCase();
    var current = 'StudentDashboard.html';
    if (path.indexOf('classschedule') !== -1) current = 'ClassSchedule.html';
    else if (path.indexOf('documentrequest') !== -1) current = 'DocumentRequest.html';
    else if (path.indexOf('usersettings') !== -1) current = '';
    select.value = current;
    select.addEventListener('change', function () {
      if (!select.value || select.value === current) return;
      window.location.href = select.value;
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    bindSectionNav();
    loadProfileMenuScript(function () {
      mountStudentProfileMenu();
      boot();
    });
  });
})();
