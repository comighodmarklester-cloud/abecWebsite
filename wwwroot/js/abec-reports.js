/* Report. Uses the same applicant, student, course, request, and archive APIs as the management pages. */
(function () {
  'use strict';
  if (!window.AbecApi) return;

  var ARCHIVE_REASONS = ['Graduated', 'Deactivated', 'Academic Dismissal', 'Withdrawal', 'Inactive Lead', 'Other'];
  var REQUEST_STATUSES = ['Pending', 'Processing', 'On Hold', 'Ready for Release', 'Released', 'Rejected'];
  var STATUS_COLORS = {
    'Pending': '#d97706',
    'Processing': '#ea580c',
    'On Hold': '#dc2626',
    'Ready for Release': '#16a34a',
    'Released': '#2563eb',
    'Rejected': '#7c3aed'
  };

  var state = {
    loading: true,
    error: '',
    warning: '',
    period: 'all',
    demo: 'applicants',
    from: '',
    to: '',
    applicants: [],
    students: [],
    courses: [],
    requests: [],
    archives: []
  };

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function courseLabel(name) {
    return AbecApi.displayCourseName ? AbecApi.displayCourseName(name) : String(name || '');
  }

  function parseDay(value) {
    if (!value) return null;
    var text = String(value);
    var match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    var parsed = new Date(text);
    if (isNaN(parsed.getTime())) return null;
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }

  function dayKey(date) {
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }

  function monthKey(date) {
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
  }

  function formatDay(date) {
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function periodBounds() {
    var today = new Date();
    var start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (state.period === 'month') {
      return { start: new Date(today.getFullYear(), today.getMonth(), 1), end: new Date(today.getFullYear(), today.getMonth() + 1, 0), label: 'This month' };
    }
    if (state.period === 'year') {
      return { start: new Date(today.getFullYear(), 0, 1), end: new Date(today.getFullYear(), 11, 31), label: 'This year' };
    }
    if (state.period === 'custom') {
      var from = parseDay(state.from);
      var to = parseDay(state.to);
      if (!from || !to) return { incomplete: true, label: 'Custom range' };
      if (from > to) { var swap = from; from = to; to = swap; }
      return { start: from, end: to, label: formatDay(from) + ' – ' + formatDay(to) };
    }
    return { label: 'All time' };
  }

  function inPeriod(value, bounds) {
    if (!bounds || !bounds.start) return true;
    var day = parseDay(value);
    if (!day) return false;
    return day >= bounds.start && day <= bounds.end;
  }

  function pct(part, total) {
    if (!total) return null;
    return Math.round((part / total) * 100);
  }

  function sharePercents(values) {
    var total = values.reduce(function (sum, value) { return sum + value; }, 0);
    if (!total) return values.map(function () { return 0; });
    var raw = values.map(function (value) { return (value / total) * 100; });
    var floors = raw.map(function (value) { return Math.floor(value); });
    var used = floors.reduce(function (sum, value) { return sum + value; }, 0);
    var order = raw.map(function (value, index) { return { index: index, frac: value - floors[index] }; })
      .sort(function (a, b) { return b.frac - a.frac; });
    for (var left = 100 - used, step = 0; step < left; step += 1) floors[order[step].index] += 1;
    return floors;
  }

  function studentByApplicant() {
    var map = {};
    state.students.forEach(function (student) {
      if (student && student.applicantId) map[String(student.applicantId)] = student;
    });
    return map;
  }

  function enrolledStudents() {
    return state.students.filter(function (student) { return student && !student.isArchived; });
  }

  function archivedStudents() {
    return state.students.filter(function (student) { return student && student.isArchived; });
  }

  function enrollmentDate(student) {
    return student.createdAt || student.confirmedAt || student.applicationDate;
  }

  function requestBucket(status) {
    var text = String(status || '').trim().toLowerCase();
    if (text === 'pending') return 'Pending';
    if (text === 'processing') return 'Processing';
    if (text === 'on hold' || text === 'onhold' || text === 'hold') return 'On Hold';
    if (text === 'ready for release' || text === 'readyforrelease' || text === 'ready') return 'Ready for Release';
    if (text === 'released') return 'Released';
    if (text === 'rejected') return 'Rejected';
    return 'Other';
  }

  function archiveBucket(reason) {
    var text = String(reason || '').trim();
    var known = ARCHIVE_REASONS.filter(function (name) { return name.toLowerCase() === text.toLowerCase(); })[0];
    if (known) return known;
    if (!text || text.toLowerCase() === 'others') return 'Other';
    return text;
  }

  function latestArchives() {
    var byStudent = {};
    state.archives.forEach(function (row) {
      if (!row || !row.studentId) return;
      var key = String(row.studentId);
      var current = byStudent[key];
      if (!current || String(row.archiveDate || '') > String(current.archiveDate || '')) byStudent[key] = row;
    });
    return Object.keys(byStudent).map(function (key) { return byStudent[key]; });
  }

  function courseOrder(name) {
    var label = courseLabel(name).toLowerCase();
    if (label.indexOf('bookkeep') >= 0) return 0;
    if (label.indexOf('customer') >= 0) return 1;
    if (label.indexOf('computer') >= 0) return 2;
    if (label.indexOf('electronic') >= 0) return 3;
    return 10;
  }

  function sortedCourses() {
    return state.courses.slice().sort(function (a, b) {
      return courseOrder(a.courseName) - courseOrder(b.courseName) || courseLabel(a.courseName).localeCompare(courseLabel(b.courseName));
    });
  }

  function icon(path) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="' + path + '"/></svg>';
  }

  function card(label, value, note, glyph) {
    return '<article class="report-card"><span class="report-card-icon">' + glyph + '</span><p>' + esc(label) + '</p><strong>' + esc(value) + '</strong>' +
      (note ? '<em>' + esc(note) + '</em>' : '<em>&nbsp;</em>') + '</article>';
  }

  function emptyChart(message) {
    return '<p class="report-empty">' + esc(message) + '</p>';
  }

  function bars(rows, max) {
    var scale = Math.max(max, 1);
    return '<div class="report-bars">' + rows.map(function (row) {
      var width = Math.round((row.value / scale) * 100);
      return '<div class="report-bar-row"><span title="' + esc(row.label) + '">' + esc(row.label) + '</span>' +
        '<div><i style="width:' + width + '%;background:' + row.color + '" title="' + esc(row.label) + ': ' + row.value + '"></i></div>' +
        '<b>' + esc(row.value) + (row.share != null ? ' · ' + row.share + '%' : '') + '</b></div>';
    }).join('') + '</div>';
  }

  function doughnut(slices) {
    var total = slices.reduce(function (sum, slice) { return sum + slice.value; }, 0);
    if (!total) return emptyChart('No records in this period.');
    var shares = sharePercents(slices.map(function (slice) { return slice.value; }));
    var radius = 42;
    var circ = 2 * Math.PI * radius;
    var offset = 0;
    var rings = slices.map(function (slice, index) {
      var length = (slice.value / total) * circ;
      var dash = length.toFixed(2) + ' ' + (circ - length).toFixed(2);
      var ring = '<circle cx="60" cy="60" r="' + radius + '" fill="none" stroke="' + slice.color + '" stroke-width="18" stroke-dasharray="' + dash + '" stroke-dashoffset="' + (-offset).toFixed(2) + '"><title>' + esc(slice.label) + ': ' + slice.value + ' (' + shares[index] + '%)</title></circle>';
      offset += length;
      return ring;
    }).join('');
    var legend = slices.map(function (slice, index) {
      return '<li><i style="background:' + slice.color + '"></i><span>' + esc(slice.label) + '</span><b>' + slice.value + '</b><em>' + shares[index] + '%</em></li>';
    }).join('');
    return '<div class="report-doughnut"><svg viewBox="0 0 120 120" role="img" aria-label="Distribution chart">' +
      '<g transform="rotate(-90 60 60)">' + rings + '</g>' +
      '<circle cx="60" cy="60" r="30" fill="#fff"></circle>' +
      '<text x="60" y="57" text-anchor="middle" class="report-doughnut-total">' + total + '</text>' +
      '<text x="60" y="70" text-anchor="middle" class="report-doughnut-label">total</text></svg>' +
      '<ul>' + legend + '</ul></div>';
  }

  function applicantById() {
    var map = {};
    state.applicants.forEach(function (row) {
      if (row && row.applicantId) map[String(row.applicantId)] = row;
    });
    return map;
  }

  function sexLabel(value) {
    var text = String(value || '').trim();
    if (!text) return 'Not recorded';
    if (/prefer/i.test(text)) return 'Prefer Not to Say';
    if (/^male$/i.test(text)) return 'Male';
    if (/^female$/i.test(text)) return 'Female';
    return text;
  }

  function civilLabel(value) {
    var text = String(value || '').trim();
    if (!text) return 'Not recorded';
    var known = ['Single', 'Married', 'Widower', 'Separated'];
    var match = known.filter(function (name) { return name.toLowerCase() === text.toLowerCase(); })[0];
    return match || text;
  }

  function ageYears(applicant, student) {
    var stored = applicant ? Number(applicant.age) : NaN;
    if (isFinite(stored) && stored > 0) return stored;
    var birth = parseDay((student && student.birthdate) || (applicant && applicant.birthdate));
    if (!birth) return 0;
    var today = new Date();
    var years = today.getFullYear() - birth.getFullYear();
    var month = today.getMonth() - birth.getMonth();
    if (month < 0 || (month === 0 && today.getDate() < birth.getDate())) years -= 1;
    return years > 0 ? years : 0;
  }

  function ageGroup(years) {
    if (!years) return 'Not recorded';
    if (years < 18) return 'Under 18';
    if (years < 25) return '18–24';
    if (years < 35) return '25–34';
    if (years < 45) return '35–44';
    if (years < 55) return '45–54';
    return '55 and over';
  }

  function ofwLabel(applicant) {
    var employment = applicant ? String(applicant.employmentStatus || '') : '';
    var classification = applicant ? String(applicant.applicantClassification || '') : '';
    if (/overseas filipino worker/i.test(employment) || /overseas filipino worker/i.test(classification)) return 'OFW';
    if (!employment && !classification) return 'Not recorded';
    return 'Non-OFW';
  }

  function demoRecord(applicant, student) {
    return {
      sex: sexLabel((student && student.gender) || (applicant && applicant.gender)),
      civil: civilLabel((student && student.civilStatus) || (applicant && applicant.civilStatus)),
      age: ageGroup(ageYears(applicant, student)),
      ofw: ofwLabel(applicant)
    };
  }

  function countLabeled(records, key, order) {
    var counts = {};
    records.forEach(function (record) {
      counts[record[key]] = (counts[record[key]] || 0) + 1;
    });
    var names = (order || []).filter(function (name) { return counts[name]; });
    Object.keys(counts).forEach(function (name) {
      if (names.indexOf(name) < 0 && counts[name]) names.push(name);
    });
    return names.map(function (name) { return { label: name, value: counts[name] }; });
  }

  function coloredSlices(rows, palette) {
    return rows.map(function (row, index) {
      return { label: row.label, value: row.value, color: palette[index % palette.length] };
    });
  }

  function render() {
    var root = document.getElementById('report-root');
    var note = document.getElementById('report-period-note');
    if (!root) return;
    if (state.loading) {
      root.innerHTML = '<p class="report-empty">Loading reports…</p>';
      return;
    }
    if (state.error) {
      root.innerHTML = '<p class="report-empty is-error">' + esc(state.error) + '</p>';
      return;
    }
    var warning = state.warning ? '<p class="report-empty is-error">' + esc(state.warning) + '</p>' : '';

    var bounds = periodBounds();
    if (note) {
      note.textContent = bounds.incomplete
        ? 'Choose a start and end date to filter the charts.'
        : (bounds.start
          ? 'Charts use records dated ' + formatDay(bounds.start) + ' through ' + formatDay(bounds.end) + '.'
          : 'Charts include all stored records.');
    }

    if (bounds.incomplete) {
      root.innerHTML = warning + emptyChart('Select both dates for the custom range.');
      return;
    }

    var links = studentByApplicant();
    var enrolled = enrolledStudents();
    var requests = state.requests;

    var periodApplicants = state.applicants.filter(function (row) { return inPeriod(row.applicationDate, bounds); });
    var periodEnrolled = enrolled.filter(function (row) { return inPeriod(enrollmentDate(row), bounds); });
    var stillApplicant = 0;
    var enrolledNow = 0;
    var archivedNow = 0;
    periodApplicants.forEach(function (row) {
      var student = links[String(row.applicantId)];
      if (!student) stillApplicant += 1;
      else if (student.isArchived) archivedNow += 1;
      else enrolledNow += 1;
    });
    var populationMax = Math.max(periodApplicants.length, periodEnrolled.length, 1);

    var courseRows = sortedCourses().map(function (course) {
      var applicants = periodApplicants.filter(function (row) { return String(row.courseId) === String(course.courseId); }).length;
      var enrolledCount = periodEnrolled.filter(function (row) { return String(row.courseId) === String(course.courseId); }).length;
      var capacity = Number(course.capacity);
      if (!isFinite(capacity) || capacity < 0) capacity = 0;
      var occupied = Number(course.filledSlots);
      if (!isFinite(occupied) || occupied < 0) occupied = 0;
      var utilization = capacity > 0 ? Math.round((occupied / capacity) * 100) : null;
      return {
        name: courseLabel(course.courseName) || 'Course',
        applicants: applicants,
        enrolled: enrolledCount,
        capacity: capacity,
        occupied: occupied,
        remaining: Math.max(0, capacity - occupied),
        utilization: utilization
      };
    });
    var enrolledTotal = courseRows.reduce(function (sum, row) { return sum + row.enrolled; }, 0);
    var enrolledShares = sharePercents(courseRows.map(function (row) { return row.enrolled; }));

    var periodRequests = state.requests.filter(function (row) { return inPeriod(row.requestDate, bounds); });
    var statusCounts = {};
    REQUEST_STATUSES.forEach(function (status) { statusCounts[status] = 0; });
    var otherRequests = 0;
    periodRequests.forEach(function (request) {
      var bucket = requestBucket(request.requestStatus);
      if (statusCounts[bucket] == null) otherRequests += 1;
      else statusCounts[bucket] += 1;
    });
    var statusSlices = REQUEST_STATUSES.filter(function (status) { return statusCounts[status] > 0; }).map(function (status) {
      return { label: status, value: statusCounts[status], color: STATUS_COLORS[status] };
    });
    if (otherRequests) statusSlices.push({ label: 'Other', value: otherRequests, color: '#64748b' });
    var statusBars = REQUEST_STATUSES.map(function (status) {
      return { label: status, value: statusCounts[status], color: STATUS_COLORS[status] };
    });
    var statusMax = Math.max.apply(null, statusBars.map(function (row) { return row.value; }).concat([1]));
    var statusShares = sharePercents(statusBars.map(function (row) { return row.value; }));
    statusBars.forEach(function (row, index) { row.share = periodRequests.length ? statusShares[index] : 0; });

    var archiveRows = latestArchives().filter(function (row) { return inPeriod(row.archiveDate, bounds); });
    var archiveCounts = {};
    ARCHIVE_REASONS.forEach(function (reason) { archiveCounts[reason] = 0; });
    archiveRows.forEach(function (row) {
      var bucket = archiveBucket(row.archiveReason);
      archiveCounts[bucket] = (archiveCounts[bucket] || 0) + 1;
    });
    var archiveNames = ARCHIVE_REASONS.slice();
    Object.keys(archiveCounts).forEach(function (name) {
      if (archiveNames.indexOf(name) < 0) archiveNames.push(name);
    });
    var archiveSlices = archiveNames.filter(function (name) { return archiveCounts[name] > 0; }).map(function (name, index) {
      var palette = ['#0B2747', '#2563eb', '#7c3aed', '#dc2626', '#d97706', '#64748b', '#0f766e'];
      return { label: name, value: archiveCounts[name], color: palette[index % palette.length] };
    });

    var studentIds = {};
    state.students.forEach(function (student) {
      if (student && student.applicantId) studentIds[String(student.applicantId)] = true;
    });
    var applicantsById = applicantById();
    var demoApplicants = periodApplicants.filter(function (row) { return !studentIds[String(row.applicantId)]; });
    var demoEnrolledStudents = periodEnrolled;
    var demoRecords = state.demo === 'enrolled'
      ? demoEnrolledStudents.map(function (student) { return demoRecord(applicantsById[String(student.applicantId)], student); })
      : demoApplicants.map(function (row) { return demoRecord(row, null); });
    var demoCount = demoRecords.length;
    var demoLabel = state.demo === 'enrolled' ? 'enrolled student' : 'applicant';
    var demoEmpty = state.demo === 'enrolled' ? 'No enrolled students in this period.' : 'No applicants who have not enrolled are in this period.';
    var civilSlices = coloredSlices(countLabeled(demoRecords, 'civil', ['Single', 'Married', 'Widower', 'Separated', 'Not recorded']), ['#1d4ed8', '#0f766e', '#d97706', '#7c3aed', '#64748b', '#dc2626']);
    var sexSlices = coloredSlices(countLabeled(demoRecords, 'sex', ['Male', 'Female', 'Prefer Not to Say', 'Not recorded']), ['#1d4ed8', '#db2777', '#64748b', '#94a3b8']);
    var ageSlices = coloredSlices(countLabeled(demoRecords, 'age', ['Under 18', '18–24', '25–34', '35–44', '45–54', '55 and over', 'Not recorded']), ['#1e3a8a', '#1d4ed8', '#0f766e', '#d97706', '#7c3aed', '#0B2747', '#94a3b8']);
    var ofwSlices = coloredSlices(countLabeled(demoRecords, 'ofw', ['OFW', 'Non-OFW', 'Not recorded']), ['#0f766e', '#2563eb', '#94a3b8']);

    root.innerHTML = warning +
      '<section><h3>Applicant &amp; Enrollment Statistics</h3>' +
        '<div class="report-grid">' +
          '<article class="report-panel"><h4>Applicants and enrollments</h4>' +
            '<p class="report-note">' + (bounds.start
              ? 'Applications use the application date. Enrollments use the date the student record was created.'
              : 'Applicants are everyone who applied. Enrolled students are current student accounts and do not include archived students.') + '</p>' +
            bars([
              { label: bounds.start ? 'Applications' : 'Applicants', value: periodApplicants.length, color: '#2563eb' },
              { label: bounds.start ? 'Enrollments' : 'Enrolled now', value: periodEnrolled.length, color: '#0f766e' }
            ], populationMax) +
          '</article>' +
          '<article class="report-panel"><h4>Where those applicants stand</h4>' +
            '<p class="report-note">Each applicant is counted once: still an applicant, enrolled now, or archived after enrollment.</p>' +
            doughnut([
              { label: 'Applicants', value: stillApplicant, color: '#2563eb' },
              { label: 'Enrolled Students', value: enrolledNow, color: '#0f766e' },
              { label: 'Archived Students', value: archivedNow, color: '#64748b' }
            ].filter(function (slice) { return slice.value > 0; })) +
          '</article>' +
        '</div></section>' +
      '<section><h3>Course Statistics</h3>' +
        '<article class="report-panel"><h4>Applicants and enrolled students by course</h4>' +
          courseCompare(courseRows) +
        '</article>' +
        '<div class="report-grid" style="margin-top:0.55rem">' +
          '<article class="report-panel"><h4>Share of enrolled students</h4>' +
            '<p class="report-note">Each course’s share of enrolled students' + (bounds.start ? ' recorded in this period' : '') + '.</p>' +
            doughnut(courseRows.filter(function (row) { return row.enrolled > 0; }).map(function (row, index) {
              var colors = ['#1d4ed8', '#0f766e', '#d97706', '#7c3aed', '#dc2626'];
              return { label: row.name, value: row.enrolled, color: colors[index % colors.length] };
            })) +
          '</article>' +
        '</div>' +
        courseTable(courseRows, enrolledShares, enrolledTotal) +
      '</section>' +
      '<section><h3>Document Management Statistics</h3>' +
        '<p class="report-note">These figures count document requests only. Registration uploads are not included. Each request is counted once, using its current status' + (bounds.start ? ' and its request date for the selected period' : '') + '.</p>' +
        '<div class="report-inline-stats">' +
          '<span>Total requests <b>' + periodRequests.length + '</b></span>' +
          '<span>Pending <b>' + (pct(statusCounts.Pending, periodRequests.length) == null ? '—' : pct(statusCounts.Pending, periodRequests.length) + '%') + '</b></span>' +
          '<span>Ready for release <b>' + (pct(statusCounts['Ready for Release'], periodRequests.length) == null ? '—' : pct(statusCounts['Ready for Release'], periodRequests.length) + '%') + '</b></span>' +
          '<span>Released <b>' + (pct(statusCounts.Released, periodRequests.length) == null ? '—' : pct(statusCounts.Released, periodRequests.length) + '%') + '</b></span>' +
        '</div>' +
        '<div class="report-grid">' +
          '<article class="report-panel"><h4>Status share</h4>' + doughnut(statusSlices) + '</article>' +
          '<article class="report-panel"><h4>Requests by status</h4>' + (periodRequests.length ? bars(statusBars, statusMax) : emptyChart('No document requests in this period.')) + '</article>' +
        '</div></section>' +
      '<section><h3>Applicant &amp; Student Demographics</h3>' +
        '<div class="report-demo-toggle" role="tablist" aria-label="Demographic group">' +
          '<button type="button" data-demo="applicants" class="' + (state.demo === 'applicants' ? 'is-active' : '') + '">Applicants</button>' +
          '<button type="button" data-demo="enrolled" class="' + (state.demo === 'enrolled' ? 'is-active' : '') + '">Enrolled Students</button>' +
        '</div>' +
        '<p class="report-note">Applicants are registration records that have not become a student account. Enrolled students are current accounts and are left out of the applicant charts. OFW uses the stored employment status or applicant classification Overseas Filipino Worker (OFW). Sex, civil status, and age come from the registration record.</p>' +
        (demoCount
          ? '<p class="report-note">' + demoCount + ' ' + demoLabel + (demoCount === 1 ? '' : 's') + (bounds.start ? ' in this period.' : '.') + '</p>' +
            '<div class="report-grid">' +
              '<article class="report-panel"><h4>Civil status</h4>' + doughnut(civilSlices) + '</article>' +
              '<article class="report-panel"><h4>Sex</h4>' + doughnut(sexSlices) + '</article>' +
              '<article class="report-panel"><h4>Age group</h4>' + doughnut(ageSlices) + '</article>' +
              '<article class="report-panel"><h4>OFW status</h4>' + doughnut(ofwSlices) + '</article>' +
            '</div>'
          : emptyChart(demoEmpty)) +
      '</section>' +
      '<section><div class="report-section-bar"><h3>Archive &amp; Student Status</h3><a class="report-archive-btn" href="StudentArchive.html">View All Archives</a></div>' +
        '<p class="report-note">One archive record per student. Archived students are not included in enrolled counts. Categories come from the archive reason already stored on the record.</p>' +
        '<article class="report-panel">' + (archiveSlices.length ? doughnut(archiveSlices) : emptyChart('No archived records in this period.')) + '</article>' +
      '</section>';
  }

  function courseCompare(rows) {
    if (!rows.length) return emptyChart('No courses are configured.');
    var applicantTotal = rows.reduce(function (sum, row) { return sum + row.applicants; }, 0);
    var enrolledTotal = rows.reduce(function (sum, row) { return sum + row.enrolled; }, 0);
    if (!applicantTotal && !enrolledTotal) return emptyChart('No applicants or enrolled students in this period.');
    var max = Math.max.apply(null, rows.map(function (row) { return Math.max(row.applicants, row.enrolled); }).concat([1]));
    var applicantShares = sharePercents(rows.map(function (row) { return row.applicants; }));
    var enrolledShares = sharePercents(rows.map(function (row) { return row.enrolled; }));
    var groups = rows.map(function (row, index) {
      var appHeight = row.applicants ? Math.max(8, Math.round((row.applicants / max) * 100)) : 0;
      var enrolledHeight = row.enrolled ? Math.max(8, Math.round((row.enrolled / max) * 100)) : 0;
      var appShare = applicantTotal ? applicantShares[index] + '% of applicants' : '';
      var enrolledShare = enrolledTotal ? enrolledShares[index] + '% of enrolled students' : '';
      return '<div class="course-group">' +
        '<div class="course-pair">' +
          '<div class="course-col" title="Applicants: ' + row.applicants + (appShare ? ' (' + appShare + ')' : '') + '"><b>' + row.applicants + '</b><i><span style="height:' + appHeight + '%;background:#2563eb"></span></i></div>' +
          '<div class="course-col" title="Enrolled students: ' + row.enrolled + (enrolledShare ? ' (' + enrolledShare + ')' : '') + '"><b>' + row.enrolled + '</b><i><span style="height:' + enrolledHeight + '%;background:#0f766e"></span></i></div>' +
        '</div>' +
        '<span class="course-shares">' +
          (applicantTotal ? '<em>' + applicantShares[index] + '%</em>' : '<em></em>') +
          (enrolledTotal ? '<em>' + enrolledShares[index] + '%</em>' : '<em></em>') +
        '</span>' +
        '<strong title="' + esc(row.name) + '">' + esc(row.name) + '</strong>' +
      '</div>';
    }).join('');
    var note = '';
    if (applicantTotal) note += 'Blue percentages are each course’s share of ' + applicantTotal + ' applicant' + (applicantTotal === 1 ? '' : 's') + '. ';
    if (enrolledTotal) note += 'Green percentages are each course’s share of ' + enrolledTotal + ' enrolled student' + (enrolledTotal === 1 ? '' : 's') + '. ';
    note += 'Each applicant and each current student is counted once.';
    return '<div class="course-chart">' + groups + '</div>' +
      '<p class="report-legend"><i style="background:#2563eb"></i> Applicants <i style="background:#0f766e"></i> Enrolled students</p>' +
      (note ? '<p class="report-note">' + note + '</p>' : '');
  }

  function courseTable(rows, shares, enrolledTotal) {
    if (!rows.length) return '';
    return '<div class="report-table-wrap"><table class="report-table"><thead><tr>' +
      '<th>Course</th><th>Applicants</th><th>Enrolled</th><th>Share of enrolled</th><th>Configured slots</th><th>Occupied slots</th><th>Slots left</th><th>Slot use</th>' +
      '</tr></thead><tbody>' + rows.map(function (row, index) {
        var share = enrolledTotal ? shares[index] + '%' : '—';
        return '<tr><td>' + esc(row.name) + '</td><td>' + row.applicants + '</td><td>' + row.enrolled + '</td><td>' + share + '</td><td>' + row.capacity + '</td><td>' + row.occupied + '</td><td>' + row.remaining + '</td><td>' +
          (row.utilization == null ? '—' : row.utilization + '%') + '</td></tr>';
      }).join('') + '</tbody></table>' +
      '<p class="report-note">Slot use is occupied student accounts divided by the configured capacity, including archived accounts, matching Course Management. A course with no slots shows no percentage.</p></div>';
  }

  function readPeriod() {
    var select = document.getElementById('report-period');
    state.period = select ? select.value : 'all';
    state.from = (document.getElementById('report-from') || {}).value || '';
    state.to = (document.getElementById('report-to') || {}).value || '';
    var custom = state.period === 'custom';
    var fromWrap = document.getElementById('report-from-wrap');
    var toWrap = document.getElementById('report-to-wrap');
    if (fromWrap) fromWrap.hidden = !custom;
    if (toWrap) toWrap.hidden = !custom;
    render();
  }

  function clearPeriod() {
    var select = document.getElementById('report-period');
    var from = document.getElementById('report-from');
    var to = document.getElementById('report-to');
    if (select) select.value = 'all';
    if (from) from.value = '';
    if (to) to.value = '';
    readPeriod();
  }

  async function load() {
    state.loading = true;
    state.error = '';
    render();
    var results = await Promise.all([
      AbecApi.get('/api/applicants'),
      AbecApi.get('/api/activations'),
      AbecApi.get('/api/courses'),
      AbecApi.get('/api/document-requests'),
      AbecApi.get('/api/archives')
    ]);
    state.loading = false;
    if (!results[0].success || !results[1].success || !results[2].success) {
      state.error = results[0].message || results[1].message || results[2].message || 'Reports could not be loaded.';
      render();
      return;
    }
    state.applicants = results[0].data || [];
    state.students = results[1].data || [];
    state.courses = results[2].data || [];
    state.requests = results[3].success ? (results[3].data || []) : [];
    state.archives = results[4].success ? (results[4].data || []) : [];
    state.warning = '';
    if (!results[3].success) state.warning = results[3].message || 'Document requests could not be loaded.';
    else if (!results[4].success) state.warning = results[4].message || 'Archive records could not be loaded.';
    render();
  }

  window.abecReportsRefresh = load;

  document.addEventListener('DOMContentLoaded', function () {
    if (!document.getElementById('report-root')) return;
    if (!AbecApi.requireRole('Admin')) return;
    document.getElementById('report-period').addEventListener('change', readPeriod);
    document.getElementById('report-from').addEventListener('change', readPeriod);
    document.getElementById('report-to').addEventListener('change', readPeriod);
    document.getElementById('report-clear').addEventListener('click', clearPeriod);
    document.getElementById('report-root').addEventListener('click', function (event) {
      var button = event.target.closest('[data-demo]');
      if (!button || button.getAttribute('data-demo') === state.demo) return;
      state.demo = button.getAttribute('data-demo');
      render();
    });
    load();
  });
})();
