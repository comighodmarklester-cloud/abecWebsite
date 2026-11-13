/* Report. Uses the same applicant, student, course, and archive APIs as the management pages. */
(function () {
  'use strict';
  if (!window.AbecApi) return;

  var ARCHIVE_CATEGORIES = ['Deactivated', 'Rejected Slots', 'Graduated'];
  var overviewInteraction = { slices: [], total: 0, defaultText: '', hovered: '', focused: '', selected: '', active: '', pointer: null };
  function responseLabel(value) { var text = String(value == null ? '' : value).trim(); return text || 'Not recorded'; }
  function yesNo(value) { return value === true ? 'Yes' : value === false ? 'No' : 'Not recorded'; }
  var PROFILE_CATEGORIES = {
    gender: ['Male', 'Female', 'Prefer Not to Say'],
    civilStatus: ['Single', 'Married', 'Widower', 'Separated'],
    age: ['Under 18', '18?24', '25?34', '35?44', '45?54', '55 and over'],
    educationLevel: ['Elementary Graduate', 'High School Graduate', 'TVET Graduate', 'College Level', 'College Graduate', 'Others'],
    employmentStatus: ['Casual', 'Contractual', 'Job Order', 'Probationary', 'Self-Employed', 'Overseas Filipino Worker (OFW)'],
    applicantClassification: ['Technical and Vocational Education and Training (TVET) Graduating Student', 'Technical and Vocational Education and Training (TVET) Graduate', 'Overseas Filipino Worker (OFW)', 'Industry Worker', 'College Graduate', 'Alternative Learning System (ALS) Graduate', 'Senior/Junior High School Graduate'],
    qualificationType: ['Full Qualification', 'COC', 'Renewal'],
    identityIdType: ['School ID', 'PhilID / National ID', "Driver's License", 'Passport', 'UMID', 'Other Accepted ID'],
    tesdaPreviouslyEnrolled: ['Yes', 'No'], tesdaCurrentlyEnrolled: ['Yes', 'No'], tesdaCompletedQualification: ['Yes', 'No'],
    ofw: ['OFW', 'Non-OFW']
  };
  var PROFILE_FIELDS = [
    { key: 'gender', label: 'Gender', read: function (a) { return sexLabel(a.gender); } },
    { key: 'civilStatus', label: 'Civil status', read: function (a) { return civilLabel(a.civilStatus); } },
    { key: 'age', label: 'Age group', read: function (a) { return ageGroup(ageYears(a, null)); } },
    { key: 'educationLevel', label: 'Educational attainment', read: function (a) { return responseLabel(a.educationLevel); } },
    { key: 'employmentStatus', label: 'Employment status', read: function (a) { return responseLabel(a.employmentStatus); } },
    { key: 'applicantClassification', label: 'Applicant classification', read: function (a) { return responseLabel(a.applicantClassification); } },
    { key: 'qualificationType', label: 'Qualification type', read: function (a) { return responseLabel(a.qualificationType); } },
    { key: 'province', label: 'Province', read: function (a) { return responseLabel(a.province); } },
    { key: 'identityIdType', label: 'Identity document type', read: function (a) { return responseLabel(a.identityIdType); } },
    { key: 'tesdaPreviouslyEnrolled', label: 'Previously enrolled in TESDA', read: function (a) { return yesNo(a.tesdaPreviouslyEnrolled); } },
    { key: 'tesdaCurrentlyEnrolled', label: 'Currently enrolled in TESDA', read: function (a) { return yesNo(a.tesdaCurrentlyEnrolled); } },
    { key: 'tesdaCompletedQualification', label: 'Completed a TESDA qualification', read: function (a) { return yesNo(a.tesdaCompletedQualification); } },
    { key: 'ofw', label: 'OFW status', read: ofwLabel }
  ];
  var state = {
    loading: true,
    error: '',
    warning: '',
    batchId: new URLSearchParams(location.search).get('batchId') || '',
    explicitBatch: new URLSearchParams(location.search).has('batchId'),
    loadVersion: 0,
    batchName: '',
    downloading: false,
    view: 'overview',
    entrancePending: 'overview',
    courseView: 'applicants',
    archiveBatchId: '',
    archiveCourseId: '',
    archiveReport: null,
    archiveLoading: false,
    archiveError: '',
    archiveVersion: 0,
    profileField: 'gender',
    batches: [],
    period: 'all',
    from: '',
    to: '',
    applicants: [],
    students: [],
    courses: []
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

  function breakdownTable(rows, options) {
    options = options || {};
    var shares = sharePercents(rows.map(function (row) { return row.value; }));
    var max = Math.max.apply(null, rows.map(function (row) { return row.value; }).concat([1]));
    return '<table class="report-breakdown" aria-label="' + esc(options.description || 'Category counts and percentages') + '">' +
      '<colgroup><col class="report-breakdown-name-col"><col class="report-breakdown-count-col"><col class="report-breakdown-percent-col"></colgroup>' +
      '<thead><tr><th scope="col">' + esc(options.label || 'Status') + '</th><th scope="col">Count</th><th scope="col">Percentage</th></tr></thead><tbody>' +
      rows.map(function (row, index) {
        var percentage = row.percentage == null ? shares[index] : row.percentage;
        var attribute = options.attribute ? ' ' + options.attribute + '="' + esc(row.label) + '"' : '';
        return '<tr class="report-breakdown-row"' + attribute + '><th scope="row"><span class="report-breakdown-name">' +
          (row.color ? '<i aria-hidden="true" style="background:' + row.color + '"></i>' : '') +
          (options.interactive ? '<button type="button" class="report-status-button" data-overview-status="' + esc(row.label) + '" aria-pressed="false" aria-label="' + esc(row.label) + ': ' + row.value + ', ' + percentage + '% of total" aria-describedby="report-status-summary">' : '') +
          '<span title="' + esc(row.label) + '">' + esc(row.label) + '</span>' + (options.interactive ? '</button>' : '') + '</span>' +
          (options.bars ? '<div class="archive-chart-track" aria-hidden="true"><div class="report-archive-fill' + (options.animate ? ' is-entering' : '') + '" style="width:' + (row.value * 100 / max) + '%;background:' + row.color + '"></div></div>' : '') +
          '</th><td class="report-breakdown-count">' + row.value + '</td><td class="report-breakdown-percent">' + percentage + '%</td></tr>';
      }).join('') + '</tbody></table>';
  }

  function doughnut(slices, animate) {
    var total = slices.reduce(function (sum, slice) { return sum + slice.value; }, 0);
    if (!total) return '<div class="report-doughnut" data-report-motion="reveal">' + emptyChart('No registration records in this batch.') + breakdownTable(slices) + '</div>';
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
    return '<div class="report-doughnut"><svg viewBox="0 0 120 120" role="img" aria-label="Distribution chart">' +
      '<g class="report-donut-rotation' + (animate ? ' is-spinning' : '') + '"><g transform="rotate(-90 60 60)">' + rings + '</g></g>' +
      '<circle cx="60" cy="60" r="30" fill="#fff"></circle>' +
      '<text x="60" y="57" text-anchor="middle" class="report-doughnut-total">' + total + '</text>' +
      '<text x="60" y="70" text-anchor="middle" class="report-doughnut-label">total</text></svg>' +
      breakdownTable(slices) + '</div>';
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

  function countLabeled(records, key, order) {
    var counts = Object.create(null);
    records.forEach(function (record) {
      counts[record[key]] = (counts[record[key]] || 0) + 1;
    });
    var names = (order || []).slice();
    Object.keys(counts).forEach(function (name) {
      if (names.indexOf(name) < 0 && counts[name]) names.push(name);
    });
    return names.map(function (name) { return { label: name, value: counts[name] || 0 }; });
  }

  function coloredSlices(rows, palette) {
    return rows.map(function (row, index) {
      return { label: row.label, value: row.value, color: palette[index % palette.length] };
    });
  }

  function populationSlices(bounds) {
    var slices = [
      { label: 'Pending', value: 0, color: '#d97706' },
      { label: 'Approved', value: 0, color: '#2563eb' },
      { label: 'Waitlisted', value: 0, color: '#7c3aed' },
      { label: 'Rejected', value: 0, color: '#dc2626' },
      { label: 'Confirmed Slot', value: 0, color: '#0891b2' },
      { label: 'Enrolled Students', value: 0, color: '#0f766e' },
      { label: 'Archived Students', value: 0, color: '#475569' },
      { label: 'Declined', value: 0, color: '#be185d' },
      { label: 'Expired', value: 0, color: '#a16207' },
      { label: 'Other', value: 0, color: '#94a3b8' }
    ];
    var students = studentByApplicant();
    var applicantIds = {};
    function add(label) {
      var slice = slices.find(function (row) { return row.label.toLowerCase() === label.toLowerCase(); });
      (slice || slices[slices.length - 1]).value += 1;
    }
    state.applicants.forEach(function (applicant) {
      applicantIds[String(applicant.applicantId)] = true;
      if (!inPeriod(applicant.applicationDate, bounds)) return;
      var student = students[String(applicant.applicantId)];
      var label = student ? (student.isArchived ? 'Archived Students' : 'Enrolled Students') : String(applicant.applicationStatus || 'Other').trim();
      if (label.toLowerCase() === 'confirmed') label = 'Confirmed Slot';
      add(label);
    });
    // Preserve independently created student records without counting an enrollment twice.
    state.students.forEach(function (student) {
      if (!applicantIds[String(student.applicantId)] && inPeriod(enrollmentDate(student), bounds))
        add(student.isArchived ? 'Archived Students' : 'Enrolled Students');
    });
    return slices;
  }

  function populationPie(slices) {
    var total = slices.reduce(function (sum, row) { return sum + row.value; }, 0);
    var shares = sharePercents(slices.map(function (slice) { return slice.value; }));
    var angle = -Math.PI / 2;
    var svg = '', labels = [];
    slices.forEach(function (slice, index) {
      if (!slice.value) return;
      var end = angle + Math.PI * 2 * slice.value / total;
      var description = slice.label + ' — ' + slice.value + (slice.value === 1 ? ' applicant' : ' applicants') + ' (' + shares[index] + '%)';
      var title = '<title>' + esc(description) + '</title>';
      var attributes = ' class="report-pie-segment" style="--report-segment-color:' + slice.color + '" data-overview-status="' + esc(slice.label) + '" role="button" tabindex="0" aria-pressed="false" aria-label="' + esc(description) + '" aria-describedby="report-status-summary"';
      var shape = slice.value === total ? '<circle cx="100" cy="100" r="100"'
        : '<path d="M 100 100 L ' + (100 + 100 * Math.cos(angle)) + ' ' + (100 + 100 * Math.sin(angle)) +
          ' A 100 100 0 ' + (end - angle > Math.PI ? 1 : 0) + ' 1 ' + (100 + 100 * Math.cos(end)) + ' ' + (100 + 100 * Math.sin(end)) + ' Z"';
      svg += shape + attributes + ' fill="' + slice.color + '">' + title + (slice.value === total ? '</circle>' : '</path>');
      var middle = (angle + end) / 2;
      labels.push({ label: slice.label, value: slice.value, percentage: shares[index], color: slice.color,
        x: 200 + 102 * Math.cos(middle), y: 140 + 102 * Math.sin(middle), right: Math.cos(middle) >= 0 });
      angle = end;
    });
    if (!total) svg = '<circle class="report-pie-empty" cx="100" cy="100" r="100"/><text x="100" y="98" text-anchor="middle" class="report-pie-zero">0</text>' +
      '<text x="100" y="113" text-anchor="middle" class="report-pie-empty-label">No records in this period</text>';
    var callouts = '';
    [false, true].forEach(function (right) {
      var side = labels.filter(function (label) { return label.right === right; }).sort(function (a, b) { return a.y - b.y; });
      side.forEach(function (label, index) { label.lineY = Math.max(30, label.y, index ? side[index - 1].lineY + 27 : 0); });
      for (var i = side.length - 1; i >= 0; i--) side[i].lineY = Math.min(side[i].lineY, i === side.length - 1 ? 246 : side[i + 1].lineY - 27);
      side.forEach(function (label) {
        var elbow = right ? 299 : 101, textX = right ? 308 : 92;
        callouts += '<g class="report-pie-callout"><path d="M ' + label.x + ' ' + label.y + ' L ' + elbow + ' ' + label.lineY + ' L ' + (right ? 304 : 96) + ' ' + label.lineY + '" stroke="' + label.color + '"/>' +
          '<circle cx="' + label.x + '" cy="' + label.y + '" r="1.7" fill="' + label.color + '"/>' +
          '<text x="' + textX + '" y="' + (label.lineY - 3) + '" text-anchor="' + (right ? 'start' : 'end') + '">' + esc(label.label) + '</text>' +
          '<text class="report-pie-callout-value" x="' + textX + '" y="' + (label.lineY + 9) + '" text-anchor="' + (right ? 'start' : 'end') + '">' + label.value + (label.value === 1 ? ' applicant' : ' applicants') + ' (' + label.percentage + '%)</text></g>';
      });
    });
    return '<svg class="report-status-pie" viewBox="0 0 400 280" role="group" aria-label="Applicant and student status distribution: ' + total + ' people. Select a category for an explanation.">' +
      '<g class="report-pie-flat" transform="translate(100 40)">' +
      '<g class="report-pie-face">' + svg + '</g>' +
      '</g><g class="report-pie-labels" aria-hidden="true">' + callouts + '</g></svg>' +
      '<ul class="report-mobile-status-labels">' + slices.map(function (slice, index) {
        return slice.value ? '<li><i aria-hidden="true" style="background:' + slice.color + '"></i><span>' + esc(slice.label) + ' — <strong>' + slice.value +
          (slice.value === 1 ? ' applicant' : ' applicants') + '</strong> (' + shares[index] + '%)</span></li>' : '';
      }).join('') + '</ul>';
  }

  function populationLegend(slices) {
    var shares = sharePercents(slices.map(function (slice) { return slice.value; }));
    var order = ['Pending', 'Waitlisted', 'Confirmed Slot', 'Archived Students', 'Expired', 'Approved', 'Rejected', 'Enrolled Students', 'Declined', 'Other'];
    var ordered = order.map(function (label) {
      var index = slices.findIndex(function (slice) { return slice.label === label; });
      return Object.assign({}, slices[index], { percentage: shares[index] });
    });
    return breakdownTable(ordered, { attribute: 'data-population-status', interactive: true, description: 'Applicant and student status counts and percentages' });
  }

  function overviewCategoryExplanation(slice) {
    var n = slice.value;
    var applications = n + (n === 1 ? ' application has ' : ' applications have ');
    var people = n + (n === 1 ? ' person is ' : ' people are ');
    var explanations = {
      'Pending': [applications + 'not yet received a final application decision.', 'These applicants are awaiting review and have not moved into an approved, waitlisted, or rejected category.'],
      'Approved': [applications + 'been approved.', 'These applicants have an Approved application status and are not counted as enrolled or archived students.'],
      'Waitlisted': [applications + 'been placed on the waiting list.', 'These applicants are awaiting a possible slot and have not yet moved into the Approved or Confirmed Slot category.'],
      'Rejected': [applications + 'been rejected.', 'This count reflects recorded application decisions, rather than archived student accounts.'],
      'Confirmed Slot': [applications + 'a confirmed slot.', 'These applicants have confirmed their slot and do not yet have a linked student record in this report.'],
      'Enrolled Students': [n + (n === 1 ? ' student has ' : ' students have ') + 'an enrolled student record.', 'These student records are not archived and replace any linked application status in the chart.'],
      'Archived Students': [n + (n === 1 ? ' student has ' : ' students have ') + 'been archived.', 'These archived student records replace any linked application status, regardless of their archive reason.'],
      'Declined': [applications + 'a declined slot offer.', 'These applicants declined an offered slot and are separate from applications currently marked Rejected.'],
      'Expired': [applications + 'an expired slot offer.', 'These offers are marked Expired after the slot response deadline has passed.'],
      'Other': [people + 'in the Other category.', 'Their recorded application status is missing or falls outside the named application statuses.']
    };
    var sentences = explanations[slice.label];
    var percentage = sharePercents(overviewInteraction.slices.map(function (row) { return row.value; }))[overviewInteraction.slices.indexOf(slice)];
    return sentences[0] + ' ' + sentences[1] + ' This category represents ' + percentage + '% of the ' + overviewInteraction.total +
      ' people shown for ' + (state.batchName || 'this batch') + (periodBounds().start ? ' in the selected period.' : '.') +
      ' Each person is counted once, so this category does not overlap with the other segments.';
  }

  function overviewFacingAngle(card, chart) {
    if (!card || !chart) return 0;
    var from = chart.getBoundingClientRect();
    var to = card.getBoundingClientRect();
    return Math.atan2(to.top + to.height / 2 - from.top - from.height / 2,
      to.left + to.width / 2 - from.left - from.width / 2) * 180 / Math.PI;
  }

  function syncOverviewInteraction() {
    var summary = document.getElementById('report-status-summary');
    var heading = document.getElementById('report-status-heading');
    var card = document.getElementById('report-status-explanation');
    var chart = document.getElementById('report-status-chart');
    var active = overviewInteraction.hovered || overviewInteraction.selected || overviewInteraction.focused;
    var slice = overviewInteraction.slices.find(function (row) { return row.label === active; });
    var hoveredSlice = overviewInteraction.slices.find(function (row) { return row.label === overviewInteraction.hovered; });
    if (heading) heading.textContent = hoveredSlice ? hoveredSlice.label : 'What the Graph Shows';
    var facing = overviewFacingAngle(card, chart && chart.querySelector('svg'));
    if (summary) summary.textContent = slice ? overviewCategoryExplanation(slice) : overviewInteraction.defaultText;
    if (card) {
      card.style.backgroundColor = '#ffffff';
      card.style.setProperty('--report-wash-angle', (facing + 90) + 'deg');
      var vertical = Math.abs(Math.sin(facing * Math.PI / 180)) > Math.abs(Math.cos(facing * Math.PI / 180));
      card.style.setProperty('--report-wash-origin', vertical ? (facing > 0 ? 'center top' : 'center bottom') : (Math.cos(facing * Math.PI / 180) >= 0 ? 'left center' : 'right center'));
      card.style.setProperty('--report-wash-start', vertical ? 'scaleY(0)' : 'scaleX(0)');
      if (slice) card.style.setProperty('--report-wash-color', slice.color);
      if (slice && overviewInteraction.active !== active) {
        card.classList.remove('is-explaining');
        void card.offsetWidth; // Restart the color spread only when the category changes.
      }
      card.classList.toggle('is-explaining', !!slice);
      card.classList.toggle('is-selected', !!slice && !!overviewInteraction.selected);
    }
    var board = document.getElementById('report-overview');
    if (!board) return;
    board.querySelectorAll('[data-overview-status]').forEach(function (element) {
      var label = element.getAttribute('data-overview-status');
      element.setAttribute('aria-pressed', String(label === overviewInteraction.selected));
      element.classList.toggle('is-selected', label === overviewInteraction.selected);
      element.classList.toggle('is-preview', label === active);
    });
    overviewInteraction.active = slice ? active : '';
  }

  function clearOverviewInteraction() {
    overviewInteraction.selected = overviewInteraction.hovered = overviewInteraction.focused = '';
    overviewInteraction.pointer = null;
    syncOverviewInteraction();
  }

  function bindOverviewInteraction() {
    var chart = document.getElementById('report-status-chart');
    var legend = document.getElementById('report-status-legend');
    function category(target) { return target && target.closest ? target.closest('[data-overview-status]') : null; }
    [chart, legend].forEach(function (surface) {
      if (!surface) return;
      surface.addEventListener('pointerover', function (event) {
        if (event.pointerType === 'touch') return;
        var element = category(event.target);
        overviewInteraction.hovered = element ? element.getAttribute('data-overview-status') : '';
        if (surface === chart) overviewInteraction.pointer = { x: event.clientX, y: event.clientY };
        syncOverviewInteraction();
      });
      surface.addEventListener('pointermove', function (event) {
        if (surface !== chart || event.pointerType === 'touch') return;
        var previous = overviewInteraction.pointer;
        if (previous && previous.x === event.clientX && previous.y === event.clientY) return;
        overviewInteraction.pointer = { x: event.clientX, y: event.clientY };
        var element = category(event.target);
        overviewInteraction.hovered = element ? element.getAttribute('data-overview-status') : '';
        syncOverviewInteraction();
      });
      surface.addEventListener('pointerout', function (event) {
        var next = category(event.relatedTarget);
        overviewInteraction.hovered = next && surface.contains(next) ? next.getAttribute('data-overview-status') : '';
        syncOverviewInteraction();
      });
      surface.addEventListener('focusin', function (event) {
        var element = category(event.target);
        overviewInteraction.focused = element ? element.getAttribute('data-overview-status') : '';
        syncOverviewInteraction();
      });
      surface.addEventListener('focusout', function (event) {
        var next = category(event.relatedTarget);
        overviewInteraction.focused = next && surface.contains(next) ? next.getAttribute('data-overview-status') : '';
        syncOverviewInteraction();
      });
      surface.addEventListener('click', function (event) {
        var element = category(event.target);
        if (!element) return;
        var label = element.getAttribute('data-overview-status');
        if (overviewInteraction.selected === label) clearOverviewInteraction();
        else { overviewInteraction.selected = label; syncOverviewInteraction(); }
      });
      surface.addEventListener('keydown', function (event) {
        var element = category(event.target);
        if (element && element.classList.contains('report-pie-segment') && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        }
      });
    });
    if (chart) chart.addEventListener('pointerleave', function (event) {
      if (event.pointerType === 'touch') return;
      overviewInteraction.hovered = '';
      if (!overviewInteraction.selected) overviewInteraction.focused = '';
      overviewInteraction.pointer = null;
      syncOverviewInteraction();
    });
    document.addEventListener('click', function (event) {
      var element = category(event.target);
      if (element && ((chart && chart.contains(element)) || (legend && legend.contains(element)))) return;
      clearOverviewInteraction();
    });
    document.addEventListener('keydown', function (event) { if (event.key === 'Escape') clearOverviewInteraction(); });
  }

  function updateOverview(bounds) {
    var board = document.getElementById('report-overview');
    var chart = document.getElementById('report-status-chart');
    var summary = document.getElementById('report-status-summary');
    var totalLabel = document.getElementById('report-population-total');
    var legend = document.getElementById('report-status-legend');
    if (!board || !chart || !summary || !totalLabel || !legend) return;
    overviewInteraction.hovered = overviewInteraction.focused = '';
    board.setAttribute('aria-busy', String(state.loading));
    if (state.loading || state.error || bounds.incomplete) {
      var message = state.loading ? 'Loading batch report…' : state.error || 'Select both dates to view the status chart.';
      chart.innerHTML = emptyChart(message);
      legend.innerHTML = '';
      summary.textContent = message;
      overviewInteraction.slices = []; overviewInteraction.total = 0; overviewInteraction.defaultText = message;
      overviewInteraction.selected = '';
      syncOverviewInteraction();
      totalLabel.textContent = state.loading ? 'Loading' : 'Unavailable';
      return;
    }
    var slices = populationSlices(bounds);
    var total = slices.reduce(function (sum, row) { return sum + row.value; }, 0);
    var largest = slices.reduce(function (best, row) { return row.value > best.value ? row : best; }, slices[0]);
    var largestPercentage = sharePercents(slices.map(function (row) { return row.value; }))[slices.indexOf(largest)];
    chart.innerHTML = populationPie(slices);
    legend.innerHTML = populationLegend(slices);
    if (bounds.start) chart.innerHTML += '<p class="report-note">The status chart uses application dates. Students without a linked application use their enrollment date.</p>';
    totalLabel.textContent = total + (total === 1 ? ' person' : ' people');
    overviewInteraction.slices = slices;
    overviewInteraction.total = total;
    overviewInteraction.defaultText = !total
      ? (state.batchName || 'This batch') + ' has no applicant or student records' + (bounds.start ? ' in the selected period. ' : ' yet. ') +
        'This graph groups applicants and students by their current status. Each person appears once, with enrolled or archived student records replacing their linked application status.'
      : (state.batchName || 'This batch') + ' has ' + total + (total === 1 ? ' person' : ' people') + (bounds.start ? ' in the selected period. ' : '. ') +
        'The graph shows how applicants and students are distributed across their current statuses. The largest group is ' + largest.label + ', with ' + largest.value + ' (' + largestPercentage + '%). ' +
        'Enrolled and archived students replace their applicant status, so each person appears once.';
    syncOverviewInteraction();
    if (state.entrancePending === 'overview') state.entrancePending = '';
  }

  function syncOverviewActions() {
    var available = !state.loading && !state.error && !periodBounds().incomplete;
    document.querySelectorAll('[data-report-open]').forEach(function (button) {
      button.disabled = state.loading || (!!state.error && button.getAttribute('data-report-open') !== 'archives');
      button.setAttribute('aria-pressed', String(button.getAttribute('data-report-open') === state.view));
    });
    var overview = document.getElementById('report-overview');
    var batchPicker = document.getElementById('report-batch-picker');
    if (batchPicker) batchPicker.hidden = state.view === 'archives';
    var root = document.getElementById('report-root');
    if (overview) overview.hidden = state.view !== 'overview';
    if (root) root.hidden = state.view === 'overview';
    var download = document.getElementById('report-download');
    if (download) {
      var archiveReady = !state.loading && !state.archiveLoading && !state.archiveError && !!state.archiveReport;
      download.disabled = state.downloading || (state.view === 'archives' ? !archiveReady : !available || !state.batchId || !state.batchName);
      download.setAttribute('aria-label', 'Download report for selected filters as PDF');
      download.setAttribute('aria-busy', String(state.downloading));
    }
  }

  async function downloadReport() {
    var archiveView = state.view === 'archives';
    if (state.loading || state.downloading) return;
    if (archiveView ? state.archiveLoading || state.archiveError || !state.archiveReport : state.error || !state.batchId || !state.batchName) return;
    // Snapshot the selected scope before awaiting the response or allowing another view change.
    var batchId = archiveView ? state.archiveBatchId : state.batchId;
    var batchName = archiveView ? state.archiveReport.batchName : state.batchName;
    var params = new URLSearchParams();
    if (archiveView && state.archiveCourseId) params.set('courseId', state.archiveCourseId);
    var query = params.toString();
    var path = batchId ? '/api/batches/' + encodeURIComponent(batchId) + '/report' : '/api/batches/report';
    state.downloading = true;
    syncOverviewActions();
    try {
      var response = await fetch((AbecApi.baseUrl || '') + path + (query ? '?' + query : ''), {
        method: 'GET', credentials: 'include', headers: { Accept: 'application/pdf' }
      });
      if (!response.ok || (response.headers.get('content-type') || '').toLowerCase().indexOf('application/pdf') === -1) {
        var payload = await response.json().catch(function () { return null; });
        throw new Error(payload && (payload.message || payload.Message) || 'The batch report could not be downloaded. Please try again.');
      }
      var blob = await response.blob();
      if (!blob.size) throw new Error('The server returned an empty report. Please try again.');
      var objectUrl = URL.createObjectURL(blob);
      try {
        var link = document.createElement('a');
        link.href = objectUrl;
        var safeName = batchName.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'Batch_' + batchId;
        link.download = 'ABEC_Report_' + safeName + '.pdf';
        // Keep the response-derived download anchor detached from the page DOM.
        try { link.click(); } finally { link.remove(); }
      } finally { window.setTimeout(function () { URL.revokeObjectURL(objectUrl); }, 1500); }
      if (window.AbecFeedback) window.AbecFeedback.notify({ message: 'Downloaded report for ' + batchName + '.', type: 'success' });
    } catch (error) {
      var message = error && error.message || 'Cannot reach the ABEC server to download the report.';
      if (window.AbecFeedback) window.AbecFeedback.notify({ message: message, type: 'error' });
      else window.alert(message);
    } finally {
      state.downloading = false;
      syncOverviewActions();
    }
  }

  function render() {
    var root = document.getElementById('report-root');
    if (!root) return;
    updateOverview(periodBounds());
    syncOverviewActions();
    if (state.loading) {
      root.innerHTML = '<p class="report-empty">Loading reports…</p>';
      return;
    }
    if (state.error && state.view !== 'archives') {
      root.innerHTML = '<p class="report-empty is-error">' + esc(state.error) + '</p>';
      return;
    }
    var warning = state.warning ? '<p class="report-empty is-error">' + esc(state.warning) + '</p>' : '';

    var bounds = periodBounds();
    if (bounds.incomplete) {
      root.innerHTML = warning + emptyChart('Select both dates for the custom range.');
      return;
    }

    var enrolled = enrolledStudents();

    var periodApplicants = state.applicants.filter(function (row) { return inPeriod(row.applicationDate, bounds); });
    var periodEnrolled = enrolled.filter(function (row) { return inPeriod(enrollmentDate(row), bounds); });
    var courseRows = sortedCourses().map(function (course) {
      var applicants = periodApplicants.filter(function (row) { return String(row.courseId) === String(course.courseId); }).length;
      var enrolledCount = periodEnrolled.filter(function (row) { return String(row.courseId) === String(course.courseId); }).length;
      var capacity = Number(course.capacity);
      if (!isFinite(capacity) || capacity < 0) capacity = 0;
      var occupied = state.students.filter(function (row) { return String(row.courseId) === String(course.courseId); }).length;
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

    var body = '';
    var controls = '';
    var title = '';
    var animateEntrance = state.entrancePending === state.view && !document.hidden;
    var chartReady = state.view !== 'archives' || (!state.archiveLoading && !state.archiveError && !!state.archiveReport);
    if (state.view === 'courses') {
      title = 'Course Statistics';
      controls = reportSelect('report-course-view', 'View', [['applicants', 'Applicants'], ['enrollment', 'Enrolled']], state.courseView);
      body = courseGraphs(courseRows, state.courseView, animateEntrance) + breakdownTable(courseRows.map(function (row) {
        return { label: row.name, value: state.courseView === 'enrollment' ? row.enrolled : row.applicants };
      }), { label: 'Course', description: 'Course counts and percentages' });
    } else if (state.view === 'archives') {
      title = 'Archives &amp; Student Status';
      controls = reportSelect('report-archive-course', 'Course', [['', 'All Courses']].concat(sortedCourses().map(function (course) {
        return [String(course.courseId), courseLabel(course.courseName)];
      })), state.archiveCourseId) +
        reportSelect('report-archive-batch', 'Batch', [['', 'All Batches']].concat(state.batches.map(function (batch) {
          return [String(batch.batchId), batch.batchName];
        })), state.archiveBatchId);
      body = state.archiveLoading ? emptyChart('Loading archive categories...') : state.archiveError ? emptyChart(state.archiveError) :
        archiveCategoryGraph(animateEntrance) + '<p class="report-note" role="status">' + (state.archiveReport ? state.archiveReport.totalAccounts : 0) +
        (state.archiveReport && state.archiveReport.totalAccounts === 1 ? ' account &middot; ' : ' accounts &middot; ') + esc(state.archiveReport ? courseLabel(state.archiveReport.courseName) : 'All Courses') + ' &middot; ' +
        esc(state.archiveReport ? state.archiveReport.batchName : 'All Batches') +
        '. This view shows Deactivated, Rejected Slots, and Graduated only. Graduated includes students whose full batch is completed. Other saved archive reasons remain in the system. Rejected Slots includes rejected applications and declined slot offers without an enrolled student account.</p>';
    } else if (state.view === 'demographics') {
      title = 'Profile statistics';
      var field = PROFILE_FIELDS.find(function (row) { return row.key === state.profileField; }) || PROFILE_FIELDS[0];
      controls = reportSelect('report-profile-field', 'Registration field', PROFILE_FIELDS.map(function (row) { return [row.key, row.label]; }), field.key);
      var order = (PROFILE_CATEGORIES[field.key] || []).slice();
      state.applicants.forEach(function (applicant) {
        var label = field.read(applicant);
        if (order.indexOf(label) < 0) order.push(label);
      });
      if (order.indexOf('Not recorded') < 0) order.push('Not recorded');
      var responses = countLabeled(periodApplicants.map(function (a) { return { response: field.read(a) }; }), 'response', order);
      body = '<h4 class="report-breakdown-title">' + field.label + '</h4>' +
        doughnut(coloredSlices(responses, ['#1d4ed8', '#0f766e', '#d97706', '#7c3aed', '#db2777', '#64748b', '#94a3b8']), animateEntrance) +
        '<p class="report-note">' + periodApplicants.length + ' registration form responses in this batch. Includes every application status, including people who later enrolled or were archived. Blank answers are counted as Not recorded.</p>';
    }
    root.innerHTML = '<section class="report-view" data-report-section="' + state.view + '"' + (animateEntrance && chartReady ? ' data-report-entrance="true"' : '') + ' aria-labelledby="report-view-title">' +
      '<header class="report-view-head"><h3 id="report-view-title" tabindex="-1">' + title + '</h3>' + (state.view === 'courses' || state.view === 'archives' ? '' : '<p>' + esc(state.batchName) + '</p>') + '</header>' +
      '<div class="report-view-controls">' + controls + '</div>' + warning +
      '<div class="report-view-content">' + body + '</div></section>';
    syncOverviewActions();
    if (animateEntrance && chartReady && state.view !== 'overview') {
      prepareChartEntrance(root);
      state.entrancePending = '';
    }
  }

  function prepareChartEntrance(root) {
    // Normalize SVG strokes so line charts draw progressively regardless of path length.
    root.querySelectorAll('[data-report-motion="line"] path[fill="none"], [data-report-motion="line"] polyline, [data-report-motion="area"] path[fill="none"], [data-report-motion="area"] polyline, .report-line path[fill="none"], .report-line polyline, [data-report-line]').forEach(function (stroke) {
      stroke.setAttribute('pathLength', '1');
      stroke.classList.toggle('report-line-stroke', true);
    });
  }

  function courseGraphs(rows, view, animate) {
    if (!rows.length) return emptyChart('No courses are configured.');
    var key = view === 'enrollment' ? 'enrolled' : 'applicants';
    var label = view === 'enrollment' ? 'Enrolled' : 'Applicants';
    var max = Math.max.apply(null, rows.map(function (row) { return row[key]; }).concat([1]));
    return '<div class="report-all-courses">' + rows.map(function (row, index) {
      return '<article class="report-course-graph"><h4 title="' + esc(row.name) + '">' + esc(row.name) + '</h4>' +
        '<div class="report-course-track" role="img" aria-label="' + esc(row.name + ': ' + row[key] + ' ' + label) + '"><div class="report-course-fill' + (animate ? ' is-entering' : '') + '" style="height:' + Math.round(row[key] * 100 / max) + '%"></div></div>' +
        '<p><strong>' + row[key] + '</strong></p></article>';
    }).join('') + '</div>';
  }

  function archiveCategoryGraph(animate) {
    var counts = Object.create(null);
    ((state.archiveReport && state.archiveReport.categories) || []).forEach(function (row) { counts[row.reason] = row.count; });
    var values = ARCHIVE_CATEGORIES.map(function (name) { return counts[name] || 0; });
    var colors = ['#0b2747', '#2563eb', '#7c3aed', '#dc2626', '#d97706', '#0891b2', '#64748b'];
    var rows = ARCHIVE_CATEGORIES.map(function (name, index) { return { label: name, value: values[index], color: colors[index] }; });
    return '<figure class="report-archive-graph" data-report-motion="reveal" aria-labelledby="archive-chart-title"><figcaption id="archive-chart-title">Accounts by Archive Category</figcaption>' +
      breakdownTable(rows, { bars: true, animate: animate, attribute: 'data-archive-category', description: 'Archive status counts and percentages' }) +
      (values.every(function (value) { return value === 0; }) ? '<p class="report-empty">No accounts match the selected course and batch.</p>' : '') + '</figure>';
  }

  async function loadArchiveCategories() {
    // Keep the replay pending through loading, errors, and superseded requests.
    state.entrancePending = 'archives';
    var version = ++state.archiveVersion;
    var batchId = state.archiveBatchId;
    var courseId = state.archiveCourseId;
    var params = new URLSearchParams();
    params.set('studentStatusOnly', 'true');
    if (batchId) params.set('batchId', batchId);
    if (courseId) params.set('courseId', courseId);
    state.archiveLoading = true; state.archiveError = ''; state.archiveReport = null;
    render();
    try {
      var query = params.toString();
      var result = await AbecApi.get('/api/archives/categories' + (query ? '?' + query : ''));
      if (version !== state.archiveVersion) return;
      if (!result.success || !result.data) state.archiveError = result.message || 'Archive categories could not be loaded.';
      else if (String(result.data.batchId || '') !== batchId || String(result.data.courseId || '') !== courseId)
        state.archiveError = 'The archive report does not match the selected course and batch.';
      else state.archiveReport = result.data;
    } catch (_) {
      if (version === state.archiveVersion) state.archiveError = 'Archive categories could not be loaded.';
    }
    if (version === state.archiveVersion) {
      state.archiveLoading = false;
      if (state.view === 'archives') render();
    }
  }

  function reportSelect(id, label, options, selected) {
    return '<label class="report-view-select" for="' + id + '">' + label + '<select id="' + id + '">' + options.map(function (option) {
      return '<option value="' + esc(option[0]) + '"' + (selected === option[0] ? ' selected' : '') + '>' + esc(option[1]) + '</option>';
    }).join('') + '</select></label>';
  }

  async function load() {
    state.entrancePending = state.view;
    var version = ++state.loadVersion;
    state.loading = true;
    state.error = '';
    state.warning = '';
    state.batchName = '';
    state.applicants = []; state.students = [];
    render();
    var batches = await AbecApi.get('/api/batches');
    if (version !== state.loadVersion) return;
    if (!batches.success) { state.loading = false; state.error = batches.message; render(); return; }
    var list = batches.data || [];
    state.batches = list;
    if (!state.explicitBatch) state.batchId = String((list.find(function (b) { return b.status === 'Active'; }) || {}).batchId || '');
    var selected = list.find(function (b) { return String(b.batchId) === state.batchId; });
    state.batchName = selected ? selected.batchName : '';
    var select = document.getElementById('report-batch');
    select.innerHTML = (state.batchId ? '' : '<option value="">No active batch</option>') + list.map(function (b) {
      return '<option value="' + b.batchId + '">' + esc(b.batchName) + ' (' + esc(b.status) + ')</option>';
    }).join('');
    select.value = state.batchId;
    document.getElementById('report-batch-note').textContent = selected
      ? (selected.status === 'Active' ? 'Active batch' : 'Historical batch')
      : 'No active batch. Select a historical batch to review its report.';
    if (state.explicitBatch && !selected) { state.loading = false; state.error = 'The selected batch was not found.'; render(); return; }
    var suffix = state.batchId ? '?batchId=' + encodeURIComponent(state.batchId) : '';
    var results = await Promise.all([
      AbecApi.get('/api/applicants' + suffix),
      AbecApi.get('/api/activations' + suffix),
      AbecApi.get('/api/courses')
    ]);
    if (version !== state.loadVersion) return;
    state.loading = false;
    if (!results[0].success || !results[1].success || !results[2].success) {
      state.error = results[0].message || results[1].message || results[2].message || 'Reports could not be loaded.';
      render();
      return;
    }
    state.applicants = results[0].data || [];
    state.students = results[1].data || [];
    state.courses = results[2].data || [];
    state.warning = '';
    if (state.view === 'archives') await loadArchiveCategories();
    else render();
  }

  window.abecReportsRefresh = load;

  document.addEventListener('DOMContentLoaded', function () {
    if (!document.getElementById('report-root')) return;
    if (!AbecApi.requireRole('Admin')) return;
    bindOverviewInteraction();
    document.getElementById('report-batch').addEventListener('change', function (event) {
      state.batchId = event.target.value; state.explicitBatch = !!state.batchId;
      var url = new URL(location.href);
      if (state.batchId) url.searchParams.set('batchId', state.batchId); else url.searchParams.delete('batchId');
      history.replaceState(null, '', url);
      load();
    });
    document.querySelectorAll('[data-report-open]').forEach(function (button) {
      button.addEventListener('click', function () {
        var nextView = button.getAttribute('data-report-open');
        clearOverviewInteraction();
        state.view = nextView;
        state.entrancePending = nextView;
        if (state.view === 'archives') loadArchiveCategories();
        else render();
        var heading = document.getElementById('report-view-title');
        if (state.view !== 'overview' && heading) heading.focus({ preventScroll: true });
      });
    });
    document.getElementById('report-download').addEventListener('click', downloadReport);
    var root = document.getElementById('report-root');
    root.addEventListener('change', function (event) {
      var id = event.target.id;
      if (id === 'report-archive-course' || id === 'report-archive-batch') {
        if (id === 'report-archive-course') state.archiveCourseId = event.target.value;
        else state.archiveBatchId = event.target.value;
        loadArchiveCategories(); return;
      }
      if (id === 'report-course-view') state.courseView = event.target.value;
      else if (id === 'report-profile-field') state.profileField = event.target.value;
      else return;
      state.entrancePending = state.view;
      render();
      var select = document.getElementById(id);
      if (select) select.focus({ preventScroll: true });
    });
    var resizeTimer;
    window.addEventListener('resize', function () {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(render, 120);
    });
    function refreshArchives() {
      if (state.view === 'archives' && !document.hidden) loadArchiveCategories();
    }
    window.addEventListener('abec:archives-changed', refreshArchives);
    window.addEventListener('storage', function (event) {
      if (event.key === 'abec-archives-changed') refreshArchives();
    });
    window.addEventListener('focus', refreshArchives);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { state.entrancePending = state.view; return; }
      if (state.entrancePending !== state.view) return;
      if (state.view === 'archives') loadArchiveCategories();
      else render();
    });
    load();
  });
})();
