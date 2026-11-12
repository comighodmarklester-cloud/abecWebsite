/* Course creation and the in-page schedule calendar. */
(function () {
  'use strict';
  var saving = false, calendarMonth = new Date(), selectedDay = '';
  function el(id) { return document.getElementById(id); }
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function dateKey(date) { return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0'); }
  function localDate(value) { return new Date(String(value || '').slice(0, 10) + 'T00:00:00'); }
  window.openAddCourse = function () {
    el('add-course-form').reset();
    el('add-course-message').textContent = '';
    el('add-course-dialog').showModal();
  };
  document.addEventListener('DOMContentLoaded', function () {
    var form = el('add-course-form');
    if (!form) return;
    el('add-course-dialog').addEventListener('cancel', function (event) { if (saving) event.preventDefault(); });
    el('add-course-cancel').addEventListener('click', function () { if (!saving) el('add-course-dialog').close(); });
    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      if (saving || !form.reportValidity()) return;
      var data = new FormData(form), payload = {};
      ['courseName', 'courseDescription'].forEach(function (key) { payload[key] = String(data.get(key) || '').trim(); });
      ['trainingDays', 'ojtDays', 'hoursPerDay', 'slotCapacity'].forEach(function (key) { payload[key] = Number(data.get(key)); });
      saving = true;
      el('add-course-save').disabled = el('add-course-cancel').disabled = true;
      el('add-course-save').textContent = 'Saving…';
      try {
        var result = await AbecApi.post('/api/courses', payload);
        if (!result.success) { el('add-course-message').textContent = result.message || 'Unable to save this course.'; return; }
        el('add-course-dialog').close();
        await window.abecReloadCourses();
        if (typeof window.showView === 'function') window.showView('overview');
        window.AbecFeedback.inline(el('course-slot-notice'), result.message || 'Course saved successfully.', 'success');
      } catch (error) { el('add-course-message').textContent = 'Unable to save this course. Please try again.'; }
      finally { saving = false; el('add-course-save').disabled = el('add-course-cancel').disabled = false; el('add-course-save').textContent = 'Save Course'; }
    });
    el('schedule-calendar-prev').addEventListener('click', function () { changeCalendarMonth(-1); });
    el('schedule-calendar-next').addEventListener('click', function () { changeCalendarMonth(1); });
    el('schedule-calendar-grid').addEventListener('click', function (event) {
      var button = event.target.closest('[data-calendar-day]');
      if (button) { selectedDay = button.dataset.calendarDay; renderCalendar(); }
    });
  });

  function changeCalendarMonth(delta) {
    calendarMonth.setMonth(calendarMonth.getMonth() + delta);
    selectedDay = dateKey(calendarMonth);
    renderCalendar();
  }

  function eventsOn(date) {
    var day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];
    return (window.__abecActiveSchedules || []).filter(function (schedule) {
      var start = localDate(schedule.scheduleDate);
      var codes = String(schedule.trainingDays || '').split(',').map(function (code) { return code.trim(); });
      if (!codes.filter(Boolean).length) return dateKey(date) === dateKey(start);
      var course = (window.__abecCourses || []).find(function (row) { return row.courseId === schedule.courseId; });
      var endValue = window.abecScheduleEndDate(course, dateKey(start), codes);
      var end = endValue ? localDate(endValue) : start;
      return date >= start && date <= end && codes.indexOf(day) >= 0;
    });
  }
  function renderCalendar() {
    el('schedule-calendar-month').textContent = calendarMonth.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
    var year = calendarMonth.getFullYear(), month = calendarMonth.getMonth();
    var first = new Date(year, month, 1).getDay(), days = new Date(year, month + 1, 0).getDate(), html = '';
    for (var blank = 0; blank < first; blank++) html += '<span aria-hidden="true"></span>';
    for (var day = 1; day <= days; day++) {
      var date = new Date(year, month, day), key = dateKey(date), events = eventsOn(date);
      html += '<button type="button" data-calendar-day="' + key + '" aria-pressed="' + (key === selectedDay) + '" aria-label="' + esc(date.toLocaleDateString('en-PH', { dateStyle: 'full' })) + ', ' + events.length + ' scheduled classes"' + (key === dateKey(new Date()) ? ' aria-current="date"' : '') + '><strong>' + day + '</strong>' + (events.length ? '<span>' + events.length + ' class' + (events.length === 1 ? '' : 'es') + '</span>' : '') + '</button>';
    }
    el('schedule-calendar-grid').innerHTML = html;
    var selected = localDate(selectedDay), events = eventsOn(selected);
    el('schedule-calendar-details').innerHTML = '<h4>' + esc(selected.toLocaleDateString('en-PH', { dateStyle: 'full' })) + '</h4>' + (events.length ? events.map(function (row) {
      return '<article><strong>' + esc(row.courseName) + '</strong><p>' + esc(row.room) + ' · ' + esc(row.trainer) + '</p><p>' + esc(String(row.startTime).slice(0, 5)) + ' – ' + esc(String(row.endTime).slice(0, 5)) + '</p></article>';
    }).join('') : '<p>No active classes scheduled for this day.</p>');
  }
  window.openScheduleCalendar = async function () {
    calendarMonth = new Date(); calendarMonth.setDate(1); selectedDay = dateKey(new Date());
    el('schedule-calendar-dialog').showModal();
    el('schedule-calendar-grid').innerHTML = '';
    el('schedule-calendar-details').textContent = 'Loading schedules…';
    el('schedule-calendar-prev').disabled = el('schedule-calendar-next').disabled = true;
    try {
      var result = await window.abecReloadSchedules();
      if (!result || !result.success) {
        el('schedule-calendar-details').textContent = (result && result.message) || 'Unable to load the calendar. Close it and try again.';
        return;
      }
      renderCalendar();
      el('schedule-calendar-prev').disabled = el('schedule-calendar-next').disabled = false;
    } catch (error) { el('schedule-calendar-details').textContent = 'Unable to load the calendar. Close it and try again.'; }
  };
})();
