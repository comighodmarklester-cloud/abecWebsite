/* Shared registration profile for Students & Applicants. */
(function () {
  'use strict';

  function courseLabel(name) {
    return (window.AbecApi && AbecApi.displayCourseName) ? AbecApi.displayCourseName(name) : String(name || '').replace(/\s*NC\s*II\b/gi, ' ').replace(/\s{2,}/g, ' ').trim();
  }

  var DOCUMENTS = [
    { label: 'Form138', name: 'Form 138', type: 'Educational certificate' },
    { label: 'TOR', name: 'Transcript of Records (TOR)', type: 'Educational certificate' },
    { label: 'HonorableDismissal', name: 'Honorable Dismissal', type: 'Educational certificate' },
    { label: 'GoodMoral', name: 'Certificate of Good Moral Character', type: 'Educational certificate' },
    { label: 'BirthCertificate', name: 'Birth Certificate (PSA)', type: 'Registration document' },
    { label: 'IdentityID', name: 'Valid ID', type: 'Identification document' }
  ];

  var applicationStyles = {
    pending: 'bg-amber-100 text-amber-700',
    approved: 'bg-green-100 text-green-700',
    confirmed: 'bg-emerald-100 text-emerald-800',
    rejected: 'bg-red-100 text-red-700',
    waitlisted: 'bg-slate-200 text-slate-600',
    declined: 'bg-orange-100 text-orange-800',
    expired: 'bg-rose-100 text-rose-800'
  };

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function optional(value) {
    var cleaned = text(value);
    if (!cleaned || cleaned.toUpperCase() === 'N/A' || cleaned === '—' || cleaned === '-') return '';
    return cleaned;
  }

  function required(value) {
    var cleaned = text(value);
    return cleaned || '—';
  }

  function applicable(value) {
    var cleaned = text(value);
    if (!cleaned) return '—';
    if (cleaned.toUpperCase() === 'N/A') return 'Not applicable';
    return cleaned;
  }

  function yesNo(value) {
    if (value === true || value === 'true') return 'Yes';
    if (value === false || value === 'false') return 'No';
    return '';
  }

  function formatDate(value) {
    if (!value) return '';
    if (window.AbecApi && AbecApi.formatDate) return AbecApi.formatDate(value);
    return text(value);
  }

  function formatWhen(value) {
    if (!value) return '';
    var parsed = new Date(value);
    if (isNaN(parsed.getTime())) return text(value);
    return parsed.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function fileSize(bytes) {
    var size = Number(bytes) || 0;
    if (size < 1024) return size + ' B';
    if (size < 1048576) return Math.max(1, Math.round(size / 1024)) + ' KB';
    return (size / 1048576).toFixed(1) + ' MB';
  }

  function fullName(applicant, record) {
    if (applicant && text(applicant.fullName)) return text(applicant.fullName);
    if (record && text(record.name)) return text(record.name);
    var parts = [];
    if (applicant) {
      ['firstName', 'middleName', 'lastName', 'suffix'].forEach(function (key) {
        if (text(applicant[key])) parts.push(text(applicant[key]));
      });
    }
    return parts.join(' ') || '—';
  }

  function standing(applicant, record) {
    if (record && record.archived) return 'Archived';
    if ((record && record.studentId) || (applicant && applicant.hasStudentAccount)) return 'Enrolled';
    return 'Applicant';
  }

  function applicationKey(applicant, record) {
    var status = text((applicant && applicant.applicationStatus) || (record && record.applicationStatus)).toLowerCase();
    if (status === 'confirmed' || status === 'confirmed slot' || (applicant && applicant.isSlotConfirmed)) return 'confirmed';
    if (status === 'rejected' && applicant && (applicant.declinedAt || applicant.slotResponse === 'Declined')) return 'declined';
    if (status === 'declined') return 'declined';
    if (status === 'expired' || (applicant && applicant.isResponseExpired)) return 'expired';
    return status || 'pending';
  }

  function applicationLabel(applicant, record) {
    var key = applicationKey(applicant, record);
    if (key === 'confirmed') return 'Confirmed Slot';
    if (key === 'declined') return 'Declined by Applicant';
    if (key === 'expired') return 'Response Expired';
    var raw = text((applicant && applicant.applicationStatus) || (record && record.applicationStatus));
    return raw || 'Pending';
  }

  function field(label, value) {
    return '<div class="profile-field"><dt>' + esc(label) + '</dt><dd>' + esc(value) + '</dd></div>';
  }

  function optionalField(label, value) {
    var cleaned = optional(value);
    return cleaned ? field(label, cleaned) : '';
  }

  function sectionIcon(kind) {
    var paths = {
      person: 'M16 11a4 4 0 10-8 0 4 4 0 008 0zM4 20a6 6 0 0116 0',
      contact: 'M4 6h16v12H4zM4 7l8 6 8-6',
      address: 'M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11zM12 10.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3z',
      education: 'M3 9l9-5 9 5-9 5-9-5zM7 11.5V16c2 1.5 8 1.5 10 0v-4.5',
      training: 'M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2M4 7h16v12H4z',
      documents: 'M7 3.5h7l5 5V20a1.5 1.5 0 01-1.5 1.5h-10A1.5 1.5 0 016 20V5A1.5 1.5 0 017.5 3.5z'
    };
    return '<svg class="profile-section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="' + paths[kind] + '"/></svg>';
  }

  function section(title, rows, tone) {
    var body = rows.filter(Boolean).join('');
    if (!body) return '';
    return '<section class="profile-section is-' + tone + '"><h4>' + sectionIcon(tone) + esc(title) + '</h4><dl class="profile-grid">' + body + '</dl></section>';
  }

  function findDocument(documents, label) {
    var key = label.toLowerCase();
    return documents.filter(function (doc) { return text(doc.documentLabel).toLowerCase() === key; })
      .sort(function (a, b) {
        return Number(!!a.isFollowUp) - Number(!!b.isFollowUp) || String(b.uploadedAt || '').localeCompare(String(a.uploadedAt || ''));
      })[0] || null;
  }

  function documentRows(applicant, documents, applicantId) {
    var used = {};
    var rows = DOCUMENTS.map(function (item) {
      var doc = findDocument(documents, item.label);
      if (doc) used[doc.documentId] = true;
      var name = item.name;
      if (item.label === 'IdentityID' && applicant && optional(applicant.identityIdType)) {
        name = 'Valid ID (' + text(applicant.identityIdType) + ')';
      }
      return documentRow(name, item.type, doc, applicantId);
    });
    documents.forEach(function (doc) {
      if (used[doc.documentId]) return;
      rows.push(documentRow(doc.documentLabel || doc.originalFileName || 'Registration document', doc.category || 'Registration document', doc, applicantId));
    });
    return rows.join('');
  }

  function documentRow(name, type, doc, applicantId) {
    var status = doc && doc.isFollowUp ? '<span class="profile-doc-badge is-missing">Pending (Follow up)</span>' : doc
      ? '<span class="profile-doc-badge is-submitted">Submitted</span>'
      : '<span class="profile-doc-badge is-missing">Not Submitted</span>';
    var meta = type;
    var action = '';
    if (doc && !doc.isFollowUp) {
      var bits = [doc.originalFileName, fileSize(doc.sizeBytes), formatDate(doc.uploadedAt)].filter(Boolean);
      if (bits.length) meta += ' · ' + bits.join(' · ');
      var href = (window.AbecApi && AbecApi.baseUrl ? AbecApi.baseUrl : '') +
        '/api/applicants/' + encodeURIComponent(applicantId) +
        '/registration-documents/' + encodeURIComponent(doc.documentId) + '/download';
      action = '<a class="profile-doc-link" href="' + esc(href) + '" target="_blank" rel="noopener">Download</a>';
    }
    return '<article class="profile-doc ' + (doc && !doc.isFollowUp ? 'is-submitted' : 'is-missing') + '"><svg class="profile-doc-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M7 3.5h7l5 5V20a1.5 1.5 0 01-1.5 1.5h-10A1.5 1.5 0 016 20V5A1.5 1.5 0 017.5 3.5z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M14 3.5V9h5.5"/></svg><div><p class="profile-doc-name">' + esc(name) + '</p><p class="profile-doc-meta">' + esc(meta) + '</p></div>' + status + action + '</article>';
  }

  function releaseRows(requests) {
    if (!requests || !requests.length) return '';
    return '<div class="profile-release"><h5>Document release requests</h5><ul>' + requests.map(function (item) {
      return '<li><span>' + esc(item.documentType || 'Document') + '</span><span class="profile-doc-badge is-submitted">' + esc(item.requestStatus || '—') + '</span></li>';
    }).join('') + '</ul></div>';
  }

  function actions(record) {
    if (!record) return '';
    var id = record.applicantId;
    return '<div class="profile-actions">' +
      '<a class="records-btn records-btn-muted" href="StudentsApplicants.html?tab=applicants&id=' + encodeURIComponent(id) + '">View Application</a>' +
      (record.studentId && !record.archived ? '<button type="button" class="records-btn records-btn-muted" id="record-archive-btn">Archive</button>' : '') +
      (record.archived ? '<button type="button" class="records-btn" id="record-restore-btn">Restore</button>' : '') +
      '</div>';
  }

  function render(applicant, documents, context) {
    var record = (context && context.record) || null;
    var person = applicant || {};
    var role = standing(person, record);
    var roleClass = role === 'Enrolled' ? 'is-enrolled' : role === 'Archived' ? 'is-archived' : 'is-applicant';
    var appKey = applicationKey(person, record);
    var initials = window.AbecApi && AbecApi.initials ? AbecApi.initials(fullName(person, record)) : '';
    var addressRows = [
      optionalField('House Number, Street, or Purok', person.streetDetails),
      optionalField('Barangay', person.barangay),
      optionalField('Municipality or City', person.cityMunicipality),
      optionalField('Province', person.province),
      optionalField('District', person.addressDistrict),
      optionalField('Region', person.addressRegion),
      optionalField('ZIP Code', person.zipCode)
    ].filter(Boolean);
    if (!addressRows.length && optional(person.address || (record && record.address))) {
      addressRows.push(field('Address', optional(person.address || record.address)));
    }

    var trainingPeriod = '';
    if (record && record.batchStart && record.batchEnd) {
      trainingPeriod = formatDate(record.batchStart) + ' – ' + formatDate(record.batchEnd);
    }

    var extraTraining = [
      field('Employment Status', required(person.employmentStatus)),
      optionalField('TESDA Screening', person.tesdaScreeningStatus),
      optionalField('TESDA Screening Summary', person.tesdaScreeningSummary),
      optionalField('Previously Enrolled in TESDA', yesNo(person.tesdaPreviouslyEnrolled)),
      optionalField('Previous TESDA Course', person.tesdaPreviousCourse),
      optionalField('Previous TESDA Institution', person.tesdaPreviousInstitution),
      optionalField('Previous TESDA Status', person.tesdaPreviousStatus),
      optionalField('Previous TESDA Year', person.tesdaPreviousYear),
      optionalField('Currently Enrolled in TESDA', yesNo(person.tesdaCurrentlyEnrolled)),
      optionalField('Completed a TESDA Qualification', yesNo(person.tesdaCompletedQualification)),
      optionalField('Completed Qualification', person.tesdaCompletedQualificationName),
      optionalField('Identity Document', person.identityIdType)
    ].filter(Boolean).join('');

    return '<div class="profile-sheet">' +
      '<header class="profile-head">' +
        '<div class="profile-avatar ' + roleClass + '" aria-hidden="true">' + esc(initials) + '</div>' +
        '<div class="profile-head-copy">' +
          '<h3>' + esc(fullName(person, record)) + '</h3>' +
          '<p>' + esc(courseLabel(required(person.courseName || (record && record.course)))) + '</p>' +
          '<div class="profile-statuses">' +
            '<span class="profile-standing ' + roleClass + '">' + esc(role) + '</span>' +
            '<span class="profile-application is-' + esc(appKey) + '">' + esc(applicationLabel(person, record)) + '</span>' +
          '</div>' +
        '</div>' +
        '<button type="button" class="profile-edit-btn" id="profile-edit-btn">Edit Information</button>' +
      '</header>' +
      '<div class="profile-body">' +
      section('Personal Information', [
        field('Full Name', fullName(person, record)),
        field('Age', person.age || person.age === 0 ? person.age : '—'),
        field('Date of Birth', formatDate(person.birthdate) || '—'),
        field('Sex', required(person.gender)),
        field('Civil Status', required(person.civilStatus)),
        field('Place of Birth', required(person.birthPlace))
      ], 'person') +
      section('Contact Information', [
        field('Email Address', required(person.email || (record && record.email))),
        field('Contact Number', required(person.contactNumber || (record && record.phone))),
        optionalField('Telephone', person.telephone),
        optionalField('Fax', person.fax),
        optionalField('Other Contact', person.otherContact)
      ], 'contact') +
      section('Address Information', addressRows, 'address') +
      section('Educational Background', [
        field('Highest Educational Attainment', required(person.educationLevel)),
        optionalField('Educational Specification', person.educationLevel && String(person.educationLevel).toLowerCase() === 'others' ? person.educationSpecification : ''),
        field('School Name', applicable(person.schoolName)),
        field('School Address', applicable(person.schoolAddress))
      ], 'education') +
      section('Training and Application Information', [
        field('Course or Qualification', courseLabel(required(person.courseName || (record && record.course)))),
        field('Training Type', required(person.qualificationType)),
        optionalField('COC Specification', person.qualificationType && String(person.qualificationType).toLowerCase() === 'coc' ? person.cocSpecification : ''),
        field('Applicant Classification', required(person.applicantClassification)),
        optionalField('Batch', person.batchName || (record && record.batchName)),
        optionalField('Training Period', trainingPeriod),
        optionalField('Training Schedule', person.assignedTrainingDateTime),
        field('Application Date', formatDate(person.applicationDate || (record && record.date)) || '—'),
        optionalField('Enrollment Date', record && record.enrolledAt ? formatDate(record.enrolledAt) : ''),
        optionalField('Slot Confirmed', person.confirmedAt ? formatDate(person.confirmedAt) : ''),
        optionalField('Response Deadline', person.responseDeadline ? formatWhen(person.responseDeadline) : ''),
        optionalField('Account Status', record && record.accountStatus)
      ], 'training').replace('</dl></section>', extraTraining ? '</dl><h5 class="profile-subhead">Other registration details</h5><dl class="profile-grid">' + extraTraining + '</dl></section>' : '</dl></section>') +
      '<section class="profile-section is-documents"><h4>' + sectionIcon('documents') + 'Documents</h4>' +
        documentRows(person, documents || [], (person.applicantId || (record && record.applicantId))) +
        releaseRows(context && context.requests) +
      '</section>' +
      '</div>' +
      ((context && context.actions) ? actions(record) : '') +
      '</div>';
  }

  var CHOICES = {
    gender: ['Male', 'Female', 'Prefer Not to Say'],
    civil: ['Single', 'Married', 'Widower', 'Separated'],
    education: ['Elementary Graduate', 'High School Graduate', 'TVET Graduate', 'College Level', 'College Graduate', 'Others'],
    employment: ['Casual', 'Contractual', 'Job Order', 'Probationary', 'Self-Employed', 'Overseas Filipino Worker (OFW)'],
    qualification: ['Full Qualification', 'COC', 'Renewal'],
    classification: [
      'Technical and Vocational Education and Training (TVET) Graduating Student',
      'Technical and Vocational Education and Training (TVET) Graduate',
      'Overseas Filipino Worker (OFW)',
      'Industry Worker',
      'College Graduate',
      'Alternative Learning System (ALS) Graduate',
      'Senior/Junior High School Graduate'
    ],
    identity: ['School ID', 'PhilID / National ID', "Driver's License", 'Passport', 'UMID', 'Other Accepted ID'],
    region: [
      'National Capital Region (NCR)', 'Cordillera Administrative Region (CAR)', 'Ilocos Region (Region I)',
      'Cagayan Valley (Region II)', 'Central Luzon (Region III)', 'CALABARZON (Region IV-A)',
      'MIMAROPA Region (Region IV-B)', 'Bicol Region (Region V)', 'Western Visayas (Region VI)',
      'Central Visayas (Region VII)', 'Eastern Visayas (Region VIII)', 'Zamboanga Peninsula (Region IX)',
      'Northern Mindanao (Region X)', 'Davao Region (Region XI)', 'SOCCSKSARGEN (Region XII)',
      'Caraga (Region XIII)', 'Bangsamoro Autonomous Region in Muslim Mindanao (BARMM)'
    ]
  };

  function inputField(name, label, value, type, required) {
    return '<label>' + esc(label) + '<input name="' + name + '" type="' + (type || 'text') + '" value="' + esc(value || '') + '"' + (required ? ' required' : '') + '></label>';
  }

  function selectField(name, label, options, value, required) {
    var current = text(value);
    var list = options.slice();
    if (current && list.indexOf(current) === -1) list.unshift(current);
    return '<label>' + esc(label) + '<select name="' + name + '"' + (required ? ' required' : '') + '>' +
      (required ? '' : '<option value="">Not specified</option>') +
      list.map(function (item) {
        return '<option value="' + esc(item) + '"' + (item === current ? ' selected' : '') + '>' + esc(item) + '</option>';
      }).join('') + '</select></label>';
  }

  function editorHtml(person) {
    var district = optional(person.addressDistrict);
    return '<form id="profile-edit-form" class="profile-edit">' +
      '<p id="profile-edit-message" class="profile-edit-message"></p>' +
      '<section class="profile-section is-person"><h4>' + sectionIcon('person') + 'Personal Information</h4><div class="profile-grid">' +
        inputField('firstName', 'First name', person.firstName, 'text', true) +
        inputField('middleName', 'Middle name', person.middleName) +
        inputField('lastName', 'Last name', person.lastName, 'text', true) +
        inputField('suffix', 'Suffix', person.suffix) +
        selectField('gender', 'Sex', CHOICES.gender, person.gender, true) +
        selectField('civilStatus', 'Civil Status', CHOICES.civil, person.civilStatus) +
        inputField('birthdate', 'Date of Birth', String(person.birthdate || '').slice(0, 10), 'date', true) +
        inputField('birthPlace', 'Place of Birth', person.birthPlace) +
      '</div></section>' +
      '<section class="profile-section is-contact"><h4>' + sectionIcon('contact') + 'Contact Information</h4><div class="profile-grid">' +
        inputField('email', 'Email Address', person.email, 'email', true) +
        inputField('contactNumber', 'Contact Number', person.contactNumber, 'tel', true) +
        inputField('telephone', 'Telephone', optional(person.telephone)) +
        inputField('fax', 'Fax', optional(person.fax)) +
        inputField('otherContact', 'Other Contact', optional(person.otherContact)) +
      '</div></section>' +
      '<section class="profile-section is-address"><h4>' + sectionIcon('address') + 'Address Information</h4><div class="profile-grid">' +
        inputField('streetDetails', 'House Number, Street, or Purok', person.streetDetails, 'text', true) +
        inputField('barangay', 'Barangay', person.barangay, 'text', true) +
        inputField('cityMunicipality', 'Municipality or City', person.cityMunicipality, 'text', true) +
        inputField('province', 'Province', person.province, 'text', true) +
        inputField('addressDistrict', 'District', district) +
        selectField('addressRegion', 'Region', CHOICES.region, person.addressRegion) +
        inputField('zipCode', 'ZIP Code', person.zipCode) +
      '</div></section>' +
      '<section class="profile-section is-education"><h4>' + sectionIcon('education') + 'Educational Background</h4><div class="profile-grid">' +
        selectField('educationLevel', 'Highest Educational Attainment', CHOICES.education, person.educationLevel) +
        inputField('educationSpecification', 'Educational Specification', person.educationSpecification) +
        inputField('schoolName', 'School Name', person.schoolName) +
        inputField('schoolAddress', 'School Address', person.schoolAddress) +
      '</div></section>' +
      '<section class="profile-section is-training"><h4>' + sectionIcon('training') + 'Training and Application Information</h4><div class="profile-grid">' +
        selectField('qualificationType', 'Training Type', CHOICES.qualification, person.qualificationType) +
        inputField('cocSpecification', 'COC Specification', person.cocSpecification) +
        selectField('applicantClassification', 'Applicant Classification', CHOICES.classification, person.applicantClassification) +
        selectField('employmentStatus', 'Employment Status', CHOICES.employment, person.employmentStatus) +
        selectField('identityIdType', 'Identity Document', CHOICES.identity, person.identityIdType) +
      '</div><p class="profile-edit-note">Course, batch, application status, and uploaded documents stay unchanged.</p></section>' +
      '<div class="profile-edit-actions"><button type="button" class="records-btn records-btn-muted" id="profile-edit-cancel">Cancel</button><button type="submit" class="records-btn" id="profile-edit-save">Save Changes</button></div>' +
      '</form>';
  }

  function editMessage(text, kind) {
    window.AbecFeedback.inline(document.getElementById('profile-edit-message'), text, kind || 'error');
  }

  function pageMessage(text, kind) {
    window.AbecFeedback.inline(document.getElementById('records-message'), text, kind || 'info');
  }

  function readEditor(form) {
    var data = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (el.name) data[el.name] = String(el.value || '').trim();
    });
    return data;
  }

  function validateEditor(data) {
    if (!data.firstName || !data.lastName) return 'Enter the first and last name.';
    if (!/^[A-Za-zÑñ][A-Za-zÑñ\s.\-']*$/.test(data.firstName) || !/^[A-Za-zÑñ][A-Za-zÑñ\s.\-']*$/.test(data.lastName)) {
      return 'Names can use letters, spaces, and normal punctuation only.';
    }
    if (!data.gender) return 'Select a sex.';
    if (!data.birthdate) return 'Enter the date of birth.';
    var born = new Date(data.birthdate + 'T00:00:00');
    if (isNaN(born.getTime()) || born > new Date()) return 'Birthdate cannot be in the future.';
    var age = new Date().getFullYear() - born.getFullYear();
    var anniversary = new Date(born);
    anniversary.setFullYear(born.getFullYear() + age);
    if (anniversary > new Date()) age -= 1;
    if (age < 18) return 'The date of birth must be for a person who is at least 18 years old.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email)) return 'Enter a valid email address.';
    var phone = data.contactNumber.replace(/\s+/g, '');
    if (!/^09\d{9}$/.test(phone) && !/^\+639\d{9}$/.test(phone)) return 'Contact number must be an 11-digit mobile number starting with 09.';
    if (!data.streetDetails || !data.barangay || !data.cityMunicipality || !data.province) return 'Complete the street, barangay, municipality or city, and province.';
    if (data.zipCode && !/^\d{4}$/.test(data.zipCode)) return 'ZIP code must be 4 digits.';
    if (data.educationLevel === 'Others' && !data.educationSpecification) return 'Specify the educational attainment.';
    if (data.qualificationType === 'COC' && !data.cocSpecification) return 'Specify the COC qualification.';
    return '';
  }

  function bindProfile(host, applicant, documents, contextRecord, requests, options) {
    var editBtn = host.querySelector('#profile-edit-btn');
    if (!editBtn) return;
    editBtn.addEventListener('click', function () {
      openEditor(host, applicant, documents, contextRecord, requests, options);
    });
  }

  function openEditor(host, applicant, documents, contextRecord, requests, options) {
    var body = host.querySelector('.profile-body');
    var editBtn = host.querySelector('#profile-edit-btn');
    var reviewActions = document.getElementById('modal-actions');
    if (!body) return;
    if (editBtn) editBtn.hidden = true;
    if (reviewActions && host.id === 'modal-profile-body') reviewActions.classList.add('is-suppressed');
    var recordActions = host.querySelector('.profile-actions');
    if (recordActions) recordActions.classList.add('is-suppressed');
    body.innerHTML = editorHtml(applicant);
    body.querySelector('#profile-edit-cancel').addEventListener('click', function () {
      if (reviewActions) reviewActions.classList.remove('is-suppressed');
      host.innerHTML = render(applicant, documents, { record: contextRecord, requests: requests, actions: !!(options && options.actions) });
      bindProfile(host, applicant, documents, contextRecord, requests, options);
      wireRecordActions(host, contextRecord, applicant);
    });
    body.querySelector('#profile-edit-form').addEventListener('submit', async function (event) {
      event.preventDefault();
      var data = readEditor(event.currentTarget);
      var problem = validateEditor(data);
      if (problem) {
        editMessage(problem, 'error');
        return;
      }
      var saveBtn = document.getElementById('profile-edit-save');
      if (saveBtn && window.AbecFeedback) window.AbecFeedback.buttonBusy(saveBtn, true, 'Loading');
      else if (saveBtn) saveBtn.disabled = true;
      editMessage('', '');
      var result = await AbecApi.put('/api/applicants/' + encodeURIComponent(applicant.applicantId) + '/registration', data);
      if (!result.success) {
        if (saveBtn && window.AbecFeedback) window.AbecFeedback.buttonBusy(saveBtn, false);
        else if (saveBtn) saveBtn.disabled = false;
        editMessage(result.message || 'Unable to save the registration information.', 'error');
        pageMessage(result.message || 'Unable to save the registration information.', 'error');
        return;
      }
      pageMessage(result.message || 'Registration information saved.', 'ok');
      if (reviewActions) reviewActions.classList.remove('is-suppressed');
      if (window.AbecRecords && AbecRecords.reload) await AbecRecords.reload();
      if (window.abecReloadApplicants) await window.abecReloadApplicants();
      await loadInto(host, applicant.applicantId, contextRecord, options);
    });
  }

  function wireRecordActions(host, record, applicant) {
    if (!record) return;
    var archiveBtn = host.querySelector('#record-archive-btn');
    if (archiveBtn && window.AbecRecords && AbecRecords.openArchive) archiveBtn.addEventListener('click', function () { AbecRecords.openArchive(record); });
    var restoreBtn = host.querySelector('#record-restore-btn');
    if (restoreBtn && window.AbecRecords && AbecRecords.restoreRecord) restoreBtn.addEventListener('click', function () { AbecRecords.restoreRecord(record); });
  }

  async function loadInto(host, applicantId, record, options) {
    if (!host) return null;
    var token = String((Number(host.getAttribute('data-profile-token')) || 0) + 1);
    host.setAttribute('data-profile-token', token);
    host.innerHTML = '<p class="profile-loading">Loading profile…</p>';
    var detail = await AbecApi.get('/api/applicants/' + encodeURIComponent(applicantId));
    var docs = await AbecApi.get('/api/applicants/' + encodeURIComponent(applicantId) + '/registration-documents');
    if (host.getAttribute('data-profile-token') !== token) return null;
    var applicant = detail.success && detail.data ? detail.data : null;
    var documents = docs.success && docs.data ? docs.data : [];
    if (!applicant) {
      host.innerHTML = '<p class="profile-loading">This profile could not be loaded from the registration records.</p>';
      return null;
    }
    var live = window.AbecRecords && AbecRecords.getRecord ? AbecRecords.getRecord(applicantId) : null;
    var contextRecord = live || record;
    var requests = [];
    var studentId = contextRecord && contextRecord.studentId;
    if (studentId) {
      var requestRes = await AbecApi.get('/api/document-requests/student/' + encodeURIComponent(studentId));
      if (host.getAttribute('data-profile-token') !== token) return null;
      if (requestRes.success && requestRes.data) requests = requestRes.data;
    }
    host.innerHTML = render(applicant, documents, {
      record: contextRecord,
      requests: requests,
      actions: !!(options && options.actions)
    });
    bindProfile(host, applicant, documents, contextRecord, requests, options);
    wireRecordActions(host, contextRecord, applicant);
    return { applicant: applicant, record: contextRecord };
  }

  window.AbecProfile = {
    render: render,
    loadInto: loadInto
  };
})();
