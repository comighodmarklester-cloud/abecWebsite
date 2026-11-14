/* Multi-step enrollment wizard */
(function () {
  'use strict';
  if (!window.AbecApi) return;

  var MAX_BYTES = 100 * 1024 * 1024;
  var MAX_MB_LABEL = 'Each file must be 100 MB or smaller.';
  var ID_EXT = ['.pdf', '.jpg', '.jpeg', '.png'];
  var DOC_TYPES = [
    { id: 'TOR', label: 'Transcript of Records (TOR)', fileName: 'TOR.pdf' },
    { id: 'Form138', label: 'Form 138', fileName: 'Form138.pdf' },
    { id: 'HonorableDismissal', label: 'Honorable Dismissal', fileName: 'HonorableDismissal.pdf' },
    { id: 'GoodMoral', label: 'Certificate of Good Moral Character', fileName: 'GoodMoral.pdf' },
    { id: 'BirthCertificate', label: 'Birth Certificate (PSA)', fileName: 'BirthCertificate.pdf' }
  ];

  var state = {
    current: 1,
    credentialFiles: [],
    followUps: {},
    documentsTouched: false,
    identityFile: null,
    submitting: false,
    submitted: false,
    tesdaAckCurrent: false,
    tesdaAckSameQual: false,
    screening: { status: 'No Potential Conflict', summary: '', requiresAdmin: false }
  };

  window.AbecEnrollWizard = {
    usesWizardForm: true,
    goToStep: goToStep,
    getCurrentStep: function () { return state.current; }
  };

  function $(id) { return document.getElementById(id); }
  function shared() { return window.AbecEnrollShared || {}; }
  function val(id) { return ($(id) && $(id).value) ? String($(id).value).trim() : ''; }

  function showFormMessage(text, kind) {
    window.AbecFeedback.inline($('enroll-form-message'), text, kind || 'info');
  }

  function goToStep(n) {
    state.current = Math.max(1, Math.min(7, n));
    showFormMessage('', '');
    document.querySelectorAll('.enroll-wizard-panel').forEach(function (panel) {
      panel.classList.toggle('hidden', parseInt(panel.getAttribute('data-step'), 10) !== state.current);
    });
    document.querySelectorAll('.enroll-step-indicator-item').forEach(function (el) {
      var step = parseInt(el.getAttribute('data-step'), 10);
      el.classList.toggle('is-active', step === state.current);
      el.classList.toggle('is-done', step < state.current);
    });
    document.querySelectorAll('.enroll-step-connector').forEach(function (el) {
      el.classList.toggle('is-done', parseInt(el.getAttribute('data-after-step'), 10) < state.current);
    });
    if (state.current === 4 && shared().syncAddressUiFromState) shared().syncAddressUiFromState();
    if (state.current === 5) { renderCredentialList(); renderIdentityFile(); }
    if (state.current === 6) refreshTesdaScreeningUi();
    if (state.current === 7) renderReview();
  }

  function courseName() {
    var S = shared();
    return (S.getSelectedCourseName && S.getSelectedCourseName()) || '';
  }

  function normalizeQualification(name) {
    return String(name || '').toLowerCase().replace(/nc\s*ii/gi, '').replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function qualificationsMatch(completed, applied) {
    var a = normalizeQualification(completed);
    var b = normalizeQualification(applied);
    if (!a || !b) return false;
    return a === b || a.indexOf(b) >= 0 || b.indexOf(a) >= 0;
  }

  function getRadio(name) {
    var el = document.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : '';
  }

  function computeScreening() {
    var currentEnrolled = getRadio('tesda-current-enrolled') === 'yes';
    var completed = getRadio('tesda-completed') === 'yes';
    var appliedCourse = courseName();
    var completedName = val('tesda-completed-name');
    var status = 'No Potential Conflict';
    var summaryParts = [];
    var requiresAdmin = false;
    if (currentEnrolled) {
      status = 'For Admin Verification';
      requiresAdmin = true;
      summaryParts.push('Applicant indicated current enrollment in a TESDA program.');
    }
    if (completed && completedName) {
      if (qualificationsMatch(completedName, appliedCourse)) {
        status = 'Potential Eligibility Issue';
        requiresAdmin = true;
        summaryParts.push('Completed TESDA qualification appears to match the applied ABEC qualification.');
      } else {
        summaryParts.push('Completed TESDA qualification differs from applied qualification.');
      }
    }
    state.screening = { status: status, summary: summaryParts.join(' '), requiresAdmin: requiresAdmin };
    return state.screening;
  }

  function refreshTesdaScreeningUi() {
    var current = getRadio('tesda-current-enrolled');
    $('tesda-current-notice')?.classList.toggle('hidden', current !== 'yes');
    var completed = getRadio('tesda-completed');
    $('tesda-completed-details')?.classList.toggle('hidden', completed !== 'yes');
    var screening = computeScreening();
    var box = $('tesda-screening-result');
    if (box) {
      var tone = screening.status === 'Potential Eligibility Issue' ? 'red'
        : screening.status === 'For Admin Verification' ? 'amber' : 'green';
      box.className = 'tesda-screening-box tone-' + tone;
      var title = screening.status === 'No Potential Conflict' ? 'No Potential Conflict Detected' : screening.status;
      box.innerHTML = '<p class="font-bold text-sm">' + escapeHtml(title) + '</p>' +
        '<p class="text-xs mt-2 leading-relaxed">' + escapeHtml(screeningMessage(screening)) + '</p>';
    }
    $('tesda-same-qual-warning')?.classList.add('hidden');
    if (completed === 'yes' && val('tesda-completed-name') && qualificationsMatch(val('tesda-completed-name'), courseName())) {
      $('tesda-same-qual-warning')?.classList.remove('hidden');
    }
  }

  function screeningMessage(s) {
    if (s.status === 'No Potential Conflict') {
      return 'The applicant\'s declared TESDA information does not currently indicate a potential conflict with the applied ABEC qualification. Final eligibility will be verified by ABEC.';
    }
    if (s.status === 'For Admin Verification') {
      return 'Your answers require follow-up verification by the ABEC Administrator. You may continue and submit your application.';
    }
    return (s.summary || 'A potential eligibility concern was noted during initial screening.') +
      ' You may still submit your application. Final eligibility will be determined by the ABEC Administrator.';
  }

  function meaningful(value) {
    var text = String(value || '').trim();
    if (!text) return false;
    if (text.toUpperCase() === 'N/A') return true;
    return /[\p{L}\p{N}]/u.test(text);
  }

  function setFieldError(inputId, message) {
    var S = shared();
    if (S.setError) S.setError(inputId, inputId + '-error', message || '');
  }

  function validateAssessment() {
    var schoolName = val('enroll-school-name');
    var schoolAddress = val('enroll-school-address');
    var schoolNameErr = meaningful(schoolName) ? '' : 'Enter the school, training center, or company name, or mark it as not applicable.';
    var schoolAddressErr = meaningful(schoolAddress) ? '' : 'Enter the address, or mark it as not applicable.';
    var courseErr = courseName() ? '' : 'Please select a course.';
    var qual = getRadio('enroll-qualification');
    var qualErr = qual ? '' : 'Please select a qualification type.';
    var cocErr = qual === 'COC' && !meaningful(val('enroll-coc-specify')) ? 'Please specify the COC qualification.' : '';
    var classErr = val('enroll-classification') ? '' : 'Please select an applicant classification.';
    setFieldError('enroll-school-name', schoolNameErr);
    setFieldError('enroll-school-address', schoolAddressErr);
    setFieldError('enroll-course', courseErr);
    setFieldError('enroll-classification', classErr);
    var cocBox = $('enroll-coc-error');
    if (cocBox) cocBox.textContent = cocErr;
    var blocked = schoolNameErr || schoolAddressErr || courseErr || qualErr || cocErr || classErr;
    showFormMessage(blocked || '', blocked ? 'error' : '');
    return !blocked;
  }

  function validatePersonal() {
    var S = shared();
    if (!S.validateNamePart) return false;
    var errors = [
      ['enroll-firstname', S.validateNamePart(val('enroll-firstname'), true)],
      ['enroll-middlename', S.validateNamePart(val('enroll-middlename'), false)],
      ['enroll-lastname', S.validateNamePart(val('enroll-lastname'), true)],
      ['enroll-suffix', S.validateNamePart(val('enroll-suffix'), false)],
      ['enroll-gender', S.validateGender(val('enroll-gender'))],
      ['enroll-civil-status', val('enroll-civil-status') ? '' : 'Please select a civil status.'],
      ['enroll-birthdate', S.validateBirthdate(val('enroll-birthdate'))],
      ['enroll-age', S.validateAge(val('enroll-age'), val('enroll-birthdate'))],
      ['enroll-birthplace', meaningful(val('enroll-birthplace')) ? '' : 'Please enter your birth place.']
    ];
    var first = '';
    errors.forEach(function (row) {
      setFieldError(row[0], row[1]);
      if (row[1] && !first) first = row[1];
    });
    showFormMessage(first, first ? 'error' : '');
    return !first;
  }

  function validateContact() {
    var S = shared();
    var telErr = meaningful(val('enroll-tel')) ? '' : 'Enter a telephone number, or mark it as not applicable.';
    var faxErr = meaningful(val('enroll-fax')) ? '' : 'Enter a fax number, or mark it as not applicable.';
    var mobileErr = S.validateContact ? S.validateContact(val('enroll-contact')) : '';
    var emailErr = S.validateEmail ? S.validateEmail(val('enroll-email')) : '';
    var education = getRadio('enroll-education');
    var educationErr = education ? '' : 'Please select your highest educational attainment.';
    var eduOtherErr = education === 'Others' && !meaningful(val('enroll-education-other')) ? 'Please specify your educational attainment.' : '';
    var employmentErr = getRadio('enroll-employment') ? '' : 'Please select an employment status.';
    setFieldError('enroll-tel', telErr);
    setFieldError('enroll-contact', mobileErr);
    setFieldError('enroll-email', emailErr);
    setFieldError('enroll-fax', faxErr);
    var eduErr = $('enroll-education-error');
    if (eduErr) eduErr.textContent = educationErr || eduOtherErr;
    var empErr = $('enroll-employment-error');
    if (empErr) empErr.textContent = employmentErr;
    var blocked = telErr || faxErr || mobileErr || emailErr || educationErr || eduOtherErr || employmentErr;
    showFormMessage(blocked || '', blocked ? 'error' : '');
    return !blocked;
  }

  function validateAddress() {
    var S = shared();
    if (S.readAddressInputs) S.readAddressInputs();
    var street = val('enroll-street');
    var barangay = val('enroll-barangay');
    var district = val('enroll-district');
    var city = val('enroll-city');
    var province = val('enroll-province');
    var region = val('enroll-region');
    var zip = val('enroll-zip');
    var streetErr = meaningful(street) ? '' : 'Please enter your number, street, zone, or purok.';
    var barangayErr = meaningful(barangay) ? '' : 'Please enter your barangay.';
    var districtErr = meaningful(district) ? '' : 'Enter your district, or mark it as not applicable.';
    var cityErr = meaningful(city) ? '' : 'Please enter your municipality or city.';
    var provinceErr = meaningful(province) ? '' : 'Please enter your province.';
    var regionErr = region ? '' : 'Please select a region.';
    var zipErr = /^\d{4}$/.test(zip) ? '' : 'Please enter a 4-digit ZIP code.';
    setFieldError('enroll-street', streetErr);
    setFieldError('enroll-barangay', barangayErr);
    setFieldError('enroll-district', districtErr);
    setFieldError('enroll-city', cityErr);
    setFieldError('enroll-province', provinceErr);
    setFieldError('enroll-region', regionErr);
    setFieldError('enroll-zip', zipErr);
    var blocked = streetErr || barangayErr || districtErr || cityErr || provinceErr || regionErr || zipErr;
    showFormMessage(blocked || '', blocked ? 'error' : '');
    return !blocked;
  }

  function validatePdfFile(file) {
    if (!file) return 'Invalid file.';
    if (file.size > MAX_BYTES) return MAX_MB_LABEL;
    if (!/\.pdf$/i.test(file.name) && file.type && file.type !== 'application/pdf') return 'Please upload PDF files only.';
    if (!/\.pdf$/i.test(file.name)) return 'Please upload PDF files only.';
    return '';
  }

  function validateIdentityFile(file) {
    if (!file) return 'Please upload one valid ID document.';
    if (file.size > MAX_BYTES) return MAX_MB_LABEL;
    var ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
    if (ID_EXT.indexOf(ext) < 0) return 'Allowed ID file types: PDF, JPG, JPEG, PNG.';
    return '';
  }

  function inferDocType(fileName) {
    var stem = String(fileName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!stem) return '';
    if (stem === 'tor' || stem.indexOf('transcript') >= 0) return 'TOR';
    if (stem === 'form138' || stem.indexOf('form138') >= 0) return 'Form138';
    if (stem.indexOf('honorable') >= 0 || stem.indexOf('dismissal') >= 0) return 'HonorableDismissal';
    if (stem.indexOf('goodmoral') >= 0 || stem.indexOf('moralcharacter') >= 0) return 'GoodMoral';
    if (stem.indexOf('birthcertificate') >= 0 || stem === 'psa') return 'BirthCertificate';
    return '';
  }

  function missingDocTypes() {
    return DOC_TYPES.filter(function (type) {
      return !state.credentialFiles.some(function (item) { return item.type === type.id; });
    });
  }

  function addCredentialFiles(fileList) {
    var files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return;
    state.documentsTouched = true;
    renderCredentialList();
    var missing = missingDocTypes();
    if (!missing.length) {
      showFormMessage('All required documents are already uploaded. Remove one to replace it.', 'error');
      return;
    }
    if (files.length > missing.length) {
      showFormMessage('Only the required documents that are still missing can be added.', 'error');
      return;
    }
    var accepted = [];
    for (var i = 0; i < files.length; i++) {
      var err = validatePdfFile(files[i]);
      if (err) { showFormMessage(err, 'error'); return; }
      accepted.push(files[i]);
    }
    var assigned = {};
    var planned = accepted.map(function (file) {
      var guessed = inferDocType(file.name);
      var typeId = guessed && missing.some(function (type) { return type.id === guessed; }) && !assigned[guessed] ? guessed : '';
      if (typeId) assigned[typeId] = true;
      return { file: file, typeId: typeId };
    });
    planned.forEach(function (item) {
      if (item.typeId) return;
      var next = missing.filter(function (type) { return !assigned[type.id]; })[0];
      if (!next) return;
      item.typeId = next.id;
      assigned[next.id] = true;
    });
    planned.forEach(function (item) {
      if (!item.typeId) return;
      state.credentialFiles = state.credentialFiles.filter(function (existing) { return existing.type !== item.typeId; });
      state.credentialFiles.push({ file: item.file, type: item.typeId, status: 'Ready' });
      delete state.followUps[item.typeId];
    });
    showFormMessage('', '');
    renderCredentialList();
  }

  function docType(typeId) {
    return DOC_TYPES.filter(function (item) { return item.id === typeId; })[0] || null;
  }

  function docLabel(typeId) {
    var found = docType(typeId);
    return found ? found.label : typeId;
  }

  function docFileName(typeId) {
    var found = docType(typeId);
    return found ? found.fileName : 'document.pdf';
  }

  function renderCredentialList() {
    var list = $('enroll-credential-list');
    if (!list) return;
    list.innerHTML = DOC_TYPES.map(function (type) {
      var index = -1;
      state.credentialFiles.forEach(function (entry, entryIndex) {
        if (entry.type === type.id) index = entryIndex;
      });
      if (index < 0) {
        return '<div class="flex items-center justify-between gap-2 border border-dashed border-slate-300 rounded-lg px-3 py-2 text-xs">' +
          '<div><p class="font-semibold text-slate-800">' + escapeHtml(type.label) + '</p></div>' +
          (state.documentsTouched ? '<div class="flex flex-wrap items-center justify-end gap-2"><span class="text-[11px] font-semibold text-amber-700">Missing</span>' +
            '<label class="inline-flex items-center gap-1 text-slate-600"><input type="checkbox" class="enroll-doc-follow-up" data-type="' + type.id + '" aria-label="Follow up ' + escapeHtml(type.label) + '"' + (state.followUps[type.id] ? ' checked' : '') + '> Follow up</label>' +
            (state.followUps[type.id] ? '<span class="text-[11px] text-amber-700">Pending</span>' : '') + '</div>' : '') + '</div>';
      }
      return '<div class="flex items-center justify-between gap-2 border border-slate-200 rounded-lg px-3 py-2 text-xs">' +
        '<div class="min-w-0"><p class="font-semibold text-slate-800">' + escapeHtml(type.label) + '</p>' +
        '<p class="truncate text-slate-600">' + escapeHtml(type.fileName) + ' · Uploaded</p></div>' +
        '<div class="flex gap-2 shrink-0"><button type="button" class="enroll-doc-view text-[#1A4B7A] font-semibold" data-index="' + index + '">View</button>' +
        '<button type="button" class="enroll-doc-remove text-red-700 font-semibold" data-index="' + index + '">Remove</button></div></div>';
    }).join('');
  }

  function renderIdentityFile() {
    var box = $('enroll-identity-file-display');
    if (!box) return;
    if (!state.identityFile) {
      box.innerHTML = '';
      return;
    }
    box.innerHTML = '<div class="flex items-center justify-between gap-2 border border-slate-200 rounded-lg px-3 py-2 text-xs">' +
      '<div class="min-w-0"><p class="font-semibold">Valid ID</p><p class="truncate">' + escapeHtml(state.identityFile.name) + ' · Ready</p></div>' +
      '<div class="flex gap-2"><button type="button" id="enroll-id-view" class="text-[#1A4B7A] font-semibold">View</button>' +
      '<button type="button" id="enroll-id-remove" class="text-red-700 font-semibold">Remove</button></div></div>';
  }

  function validateDocuments() {
    state.documentsTouched = true;
    renderCredentialList();
    var missing = DOC_TYPES.filter(function (type) {
      return !state.followUps[type.id] && !state.credentialFiles.some(function (item) { return item.type === type.id; });
    });
    if (missing.length) {
      showFormMessage('Please upload or mark for follow up: ' + missing.map(function (item) { return item.label; }).join(', ') + '.', 'error');
      return false;
    }
    var idTypeErr = val('enroll-id-type') ? '' : 'Please select an ID type.';
    var idFileErr = validateIdentityFile(state.identityFile);
    if (idTypeErr || idFileErr) {
      showFormMessage(idTypeErr || idFileErr, 'error');
      return false;
    }
    showFormMessage('', '');
    return true;
  }

  function validateTesda() {
    if (getRadio('tesda-current-enrolled') === 'yes' && !state.tesdaAckCurrent) {
      showFormMessage('Please read the TESDA Training Notice and click I Understand before continuing.', 'info');
      return false;
    }
    if ($('tesda-same-qual-warning') && !$('tesda-same-qual-warning').classList.contains('hidden') && !state.tesdaAckSameQual) {
      showFormMessage('Please read the Qualification Notice and click I Understand before continuing.', 'info');
      return false;
    }
    if (getRadio('tesda-completed') === 'yes' && !val('tesda-completed-name')) {
      showFormMessage('Please enter the TESDA qualification you completed.', 'error');
      return false;
    }
    computeScreening();
    return true;
  }

  function reviewRow(label, value) {
    return '<div class="flex justify-between gap-3 py-1"><span class="text-slate-500">' + escapeHtml(label) + '</span><span class="text-right text-slate-800">' + escapeHtml(value || '—') + '</span></div>';
  }

  function section(title, step, rows) {
    return '<section class="border border-slate-200 rounded-lg p-3"><div class="flex items-center justify-between mb-1"><h4 class="text-xs font-bold uppercase tracking-wide text-[#0A2540]">' +
      escapeHtml(title) + '</h4><button type="button" class="enroll-review-edit text-xs font-semibold text-[#1A4B7A]" data-edit-step="' + step + '">Edit</button></div>' + rows + '</section>';
  }

  function renderReview() {
    computeScreening();
    var host = $('review-sections');
    if (!host) return;
    var docs = state.credentialFiles.map(function (item, index) {
      return '<div class="flex justify-between gap-2 py-1 text-xs"><span>' + escapeHtml(docLabel(item.type)) + ' · ' + escapeHtml(docFileName(item.type)) +
        '</span><button type="button" class="enroll-doc-view text-[#1A4B7A] font-semibold" data-index="' + index + '">View</button></div>';
    }).join('');
    var qual = getRadio('enroll-qualification');
    docs += DOC_TYPES.filter(function (item) { return state.followUps[item.id]; }).map(function (item) {
      return reviewRow(item.label, 'Pending (Follow up)');
    }).join('');
    host.innerHTML =
      section('Assessment and Applicant Information', 1,
        reviewRow('School / training center / company', val('enroll-school-name')) +
        reviewRow('Address', val('enroll-school-address')) +
        reviewRow('Assessment', courseName()) +
        reviewRow('Qualification type', qual) +
        (qual === 'COC' ? reviewRow('COC specification', val('enroll-coc-specify')) : '') +
        reviewRow('Applicant classification', $('enroll-classification') && $('enroll-classification').selectedOptions[0] ? $('enroll-classification').selectedOptions[0].text : '')) +
      section('Personal Information', 2,
        reviewRow('Name', [val('enroll-firstname'), val('enroll-middlename'), val('enroll-lastname'), val('enroll-suffix')].filter(Boolean).join(' ')) +
        reviewRow('Gender', val('enroll-gender')) +
        reviewRow('Civil status', val('enroll-civil-status')) +
        reviewRow('Date of birth', ($('enroll-birthdate-display') && $('enroll-birthdate-display').textContent) || val('enroll-birthdate')) +
        reviewRow('Age', val('enroll-age')) +
        reviewRow('Birth place', val('enroll-birthplace'))) +
      section('Contact Information', 3,
        reviewRow('Telephone', val('enroll-tel')) +
        reviewRow('Mobile number', val('enroll-contact')) +
        reviewRow('Email', val('enroll-email')) +
        reviewRow('Fax', val('enroll-fax'))) +
      section('Applicant Background', 3,
        reviewRow('Highest educational attainment', getRadio('enroll-education')) +
        (getRadio('enroll-education') === 'Others' ? reviewRow('Specification', val('enroll-education-other')) : '') +
        reviewRow('Employment status', getRadio('enroll-employment'))) +
      section('Residential Address', 4,
        reviewRow('Number / street / zone / purok', val('enroll-street')) +
        reviewRow('Barangay', AbecApi.formatBarangay ? AbecApi.formatBarangay(val('enroll-barangay')) : val('enroll-barangay')) +
        reviewRow('District', val('enroll-district')) +
        reviewRow('Municipality / city', val('enroll-city')) +
        reviewRow('Province', val('enroll-province')) +
        reviewRow('Region', $('enroll-region') && $('enroll-region').selectedOptions[0] ? $('enroll-region').selectedOptions[0].text : '') +
        reviewRow('ZIP code', val('enroll-zip'))) +
      section('Required Documents', 5, docs || '<p class="text-xs text-slate-500">No documents uploaded.</p>') +
      section('Valid ID', 5, reviewRow('ID type', val('enroll-id-type')) + reviewRow('File', state.identityFile ? state.identityFile.name : '') +
        (state.identityFile ? '<button type="button" id="review-id-view" class="text-xs font-semibold text-[#1A4B7A]">View ID</button>' : '')) +
      section('TESDA Eligibility Check', 6, reviewRow('Result', state.screening.status) + reviewRow('Summary', state.screening.summary || 'No additional notes.'));
  }

  function previewFile(file) {
    if (!file) return;
    var url = URL.createObjectURL(file);
    window.open(url, '_blank', 'noopener');
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }

  async function loadCourses() {
    var select = $('enroll-course');
    if (!select) return;
    var current = select.value;
    try {
      var result = await AbecApi.get('/api/courses');
      if (!result || !result.success) {
        showFormMessage((result && result.message) || 'Courses could not be loaded. Refresh the page and try again.', 'error');
        return;
      }
      var courses = result.data || [];
      select.innerHTML = '<option value="" selected disabled>Select a course</option>';
      courses.forEach(function (course) {
        if (!course || !course.courseId || !course.courseName) return;
        var option = document.createElement('option');
        option.value = String(course.courseId);
        option.textContent = course.courseName;
        select.appendChild(option);
      });
      if (current) select.value = current;
    } catch (e) {
      showFormMessage('Courses could not be loaded. Refresh the page and try again.', 'error');
    }
  }

  function wireNa(checkbox) {
    var input = $(checkbox.getAttribute('data-na-for'));
    if (!input) return;
    checkbox.addEventListener('change', function () {
      if (checkbox.checked) {
        if (input.value && input.value.trim().toUpperCase() !== 'N/A') input.dataset.prev = input.value;
        input.value = 'N/A';
        input.readOnly = true;
      } else {
        input.readOnly = false;
        input.value = input.dataset.prev && input.dataset.prev.trim().toUpperCase() !== 'N/A' ? input.dataset.prev : '';
      }
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  function setPrivacyOpen(open) {
    var modal = $('enroll-privacy-modal');
    if (!modal) return;
    modal.classList.toggle('hidden', !open);
    modal.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (open) {
      var closeBtn = $('enroll-privacy-close');
      if (closeBtn) closeBtn.focus();
    } else {
      var opener = $('enroll-privacy-open');
      if (opener) opener.focus();
    }
  }

  function validatePrivacy() {
    var box = $('enroll-privacy-ack');
    var error = $('enroll-privacy-ack-error');
    var ok = !!(box && box.checked);
    window.AbecFeedback.inline(error, '', 'error');
    if (box) box.setAttribute('aria-invalid', ok ? 'false' : 'true');
    if (!ok) showFormMessage('Please acknowledge that you have read and understood the Data Privacy Notice before submitting.', 'error');
    return ok;
  }

  async function submitApplication() {
    if (state.submitting || state.submitted) return;
    var checks = [
      [validateAssessment, 1],
      [validatePersonal, 2],
      [validateContact, 3],
      [validateAddress, 4],
      [validateDocuments, 5],
      [validateTesda, 6]
    ];
    for (var i = 0; i < checks.length; i++) {
      if (!checks[i][0]()) { goToStep(checks[i][1]); return; }
    }
    if (!validatePrivacy()) {
      if (state.current !== 7) {
        goToStep(7);
        validatePrivacy();
      }
      return;
    }
    var S = shared();
    if (S.readAddressInputs) S.readAddressInputs();
    var courseSelect = $('enroll-course');
    var regionSelect = $('enroll-region');
    var regionOption = regionSelect && regionSelect.selectedOptions[0];
    var payload = {
      firstName: S.toTitleCaseName(val('enroll-firstname')),
      middleName: val('enroll-middlename') ? S.toTitleCaseName(val('enroll-middlename')) : null,
      lastName: S.toTitleCaseName(val('enroll-lastname')),
      suffix: val('enroll-suffix') ? S.toTitleCaseName(val('enroll-suffix')) : null,
      gender: val('enroll-gender'),
      civilStatus: val('enroll-civil-status'),
      birthdate: val('enroll-birthdate'),
      age: parseInt(val('enroll-age'), 10),
      birthPlace: val('enroll-birthplace'),
      email: val('enroll-email'),
      telephone: val('enroll-tel'),
      contactNumber: S.toApiContact(val('enroll-contact')),
      fax: val('enroll-fax'),
      otherContact: '',
      educationLevel: getRadio('enroll-education'),
      educationSpecification: getRadio('enroll-education') === 'Others' ? val('enroll-education-other') : null,
      employmentStatus: getRadio('enroll-employment'),
      province: val('enroll-province'),
      cityMunicipality: val('enroll-city'),
      barangay: AbecApi.formatBarangay ? AbecApi.formatBarangay(val('enroll-barangay')) : val('enroll-barangay'),
      streetDetails: val('enroll-street'),
      addressDistrict: val('enroll-district'),
      addressRegion: regionOption ? regionOption.text : '',
      addressRegionCode: regionOption ? regionOption.getAttribute('data-code') : '',
      zipCode: val('enroll-zip'),
      address: S.buildFullAddress(),
      courseId: courseSelect ? parseInt(courseSelect.value, 10) : 0,
      courseName: courseName(),
      schoolName: val('enroll-school-name'),
      schoolAddress: val('enroll-school-address'),
      qualificationType: getRadio('enroll-qualification'),
      cocSpecification: getRadio('enroll-qualification') === 'COC' ? val('enroll-coc-specify') : null,
      applicantClassification: val('enroll-classification'),
      tesdaCurrentlyEnrolled: getRadio('tesda-current-enrolled') === 'yes',
      tesdaCompletedQualification: getRadio('tesda-completed') === 'yes',
      tesdaCompletedQualificationName: getRadio('tesda-completed') === 'yes' ? val('tesda-completed-name') : null,
      tesdaScreeningStatus: state.screening.status,
      tesdaScreeningSummary: state.screening.summary,
      privacyNoticeAcknowledged: !!($('enroll-privacy-ack') && $('enroll-privacy-ack').checked),
      identityIdType: val('enroll-id-type'),
      credentialDocumentTypes: state.credentialFiles.map(function (item) { return item.type; }),
      followUpDocumentTypes: DOC_TYPES.filter(function (item) { return state.followUps[item.id]; }).map(function (item) { return item.id; })
    };
    var formData = new FormData();
    formData.append('data', JSON.stringify(payload));
    state.credentialFiles.forEach(function (item) {
      formData.append('credentialFiles', item.file, docFileName(item.type));
    });
    if (state.identityFile) formData.append('identityFile', state.identityFile, state.identityFile.name);

    state.submitting = true;
    var btn = $('enroll-wizard-submit');
    if (window.AbecFeedback) window.AbecFeedback.buttonBusy(btn, true, 'Loading');
    else if (btn) { btn.disabled = true; btn.textContent = 'Loading...'; }
    var result;
    try {
      result = await AbecApi.postForm('/api/applicants/enroll/files', formData, { showLoader: false });
    } catch (err) {
      result = { success: false, message: 'Unable to submit your application. Please try again.' };
    } finally {
      state.submitting = false;
      if (window.AbecFeedback) window.AbecFeedback.buttonBusy(btn, false);
      else if (btn) { btn.disabled = false; btn.textContent = 'Submit Application'; }
    }
    if (!result || !result.success) {
      showFormMessage((result && result.message) || 'Unable to submit your application. Please try again.', 'error');
      return;
    }
    state.submitted = true;
    showFormMessage(result.message || 'Your application has been submitted.', 'success');
    if (btn) { btn.disabled = true; btn.textContent = 'Submitted'; }
    if (typeof window.AbecEnrollWizard.onSubmitted === 'function') window.AbecEnrollWizard.onSubmitted(result);
    setTimeout(function () {
      resetWizard();
      if (typeof showEnrollStep === 'function') showEnrollStep('intro');
      if (typeof closeEnrollModal === 'function') closeEnrollModal();
    }, 2800);
  }

  function resetWizard() {
    state.credentialFiles = [];
    state.followUps = {};
    state.documentsTouched = false;
    state.identityFile = null;
    state.submitting = false;
    state.submitted = false;
    state.tesdaAckCurrent = false;
    state.tesdaAckSameQual = false;
    var form = $('enroll-wizard-form');
    if (form && shared().resetForm) shared().resetForm(form);
    document.querySelectorAll('[data-na-for]').forEach(function (box) {
      box.checked = false;
      var input = $(box.getAttribute('data-na-for'));
      if (input) {
        input.readOnly = false;
        delete input.dataset.prev;
      }
    });
    document.querySelectorAll('#enroll-coc-wrap, #enroll-education-other-wrap').forEach(function (el) { el.classList.add('hidden'); });
    renderCredentialList();
    renderIdentityFile();
    var btn = $('enroll-wizard-submit');
    if (btn) { btn.disabled = false; btn.textContent = 'Submit Application'; }
    loadCourses();
    goToStep(1);
  }

  function escapeHtml(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function wireDropzone(id, inputId, onFiles) {
    var zone = $(id);
    var input = $(inputId);
    if (!zone || !input) return;
    zone.addEventListener('click', function () { input.click(); });
    zone.addEventListener('dragover', function (e) { e.preventDefault(); zone.classList.add('is-drag'); });
    zone.addEventListener('dragleave', function () { zone.classList.remove('is-drag'); });
    zone.addEventListener('drop', function (e) {
      e.preventDefault();
      zone.classList.remove('is-drag');
      onFiles(e.dataTransfer.files);
    });
    input.addEventListener('change', function () { onFiles(input.files); input.value = ''; });
  }

  function initEnrollWizard() {
    if (!$('enroll-wizard-form')) return;
    loadCourses();
    document.querySelectorAll('[data-na-for]').forEach(wireNa);
    document.querySelectorAll('input[name="enroll-qualification"]').forEach(function (el) {
      el.addEventListener('change', function () {
        $('enroll-coc-wrap')?.classList.toggle('hidden', getRadio('enroll-qualification') !== 'COC');
        if (getRadio('enroll-qualification') !== 'COC' && $('enroll-coc-specify')) $('enroll-coc-specify').value = '';
      });
    });
    document.querySelectorAll('input[name="enroll-education"]').forEach(function (el) {
      el.addEventListener('change', function () {
        $('enroll-education-other-wrap')?.classList.toggle('hidden', getRadio('enroll-education') !== 'Others');
      });
    });
    wireDropzone('enroll-credential-dropzone', 'enroll-credential-input', addCredentialFiles);
    wireDropzone('enroll-identity-dropzone', 'enroll-identity-file', function (files) {
      if (!files || !files.length) return;
      if (files.length > 1) { showFormMessage('Upload one ID file.', 'error'); return; }
      var err = validateIdentityFile(files[0]);
      if (err) { showFormMessage(err, 'error'); return; }
      state.identityFile = files[0];
      state.documentsTouched = true;
      renderCredentialList();
      renderIdentityFile();
    });

    $('enroll-wizard-form').addEventListener('change', function (e) {
      if (!e.target.classList.contains('enroll-doc-follow-up')) return;
      var type = e.target.getAttribute('data-type');
      if (docType(type)) state.followUps[type] = e.target.checked;
      window.AbecFeedback.dismissInline($('enroll-form-message'));
      renderCredentialList();
      var checkbox = document.querySelector('.enroll-doc-follow-up[data-type="' + type + '"]');
      if (checkbox) checkbox.focus();
    });

    $('enroll-wizard-form').addEventListener('click', async function (e) {
      var nextBtn = e.target.closest('.enroll-wizard-next-step');
      if (nextBtn) {
        e.preventDefault();
        var ok = true;
        if (state.current === 1) ok = validateAssessment();
        else if (state.current === 2) ok = validatePersonal();
        else if (state.current === 3) ok = validateContact();
        else if (state.current === 4) ok = validateAddress();
        else if (state.current === 5) ok = validateDocuments();
        else if (state.current === 6) ok = validateTesda();
        if (ok) goToStep(state.current + 1);
        return;
      }
      if (e.target.closest('.enroll-wizard-back-step')) {
        e.preventDefault();
        if (state.current === 1 && typeof showEnrollStep === 'function') showEnrollStep('intro');
        else goToStep(state.current - 1);
        return;
      }
      var edit = e.target.closest('.enroll-review-edit');
      if (edit) {
        e.preventDefault();
        goToStep(parseInt(edit.getAttribute('data-edit-step'), 10));
        return;
      }
      var view = e.target.closest('.enroll-doc-view');
      if (view) {
        e.preventDefault();
        var item = state.credentialFiles[parseInt(view.getAttribute('data-index'), 10)];
        if (item) previewFile(item.file);
        return;
      }
      var remove = e.target.closest('.enroll-doc-remove');
      if (remove) {
        e.preventDefault();
        var index = parseInt(remove.getAttribute('data-index'), 10);
        var target = state.credentialFiles[index];
        if (target && await window.AbecFeedback.confirm({ title: 'Remove document', message: 'Remove ' + docLabel(target.type) + '?', confirmLabel: 'Remove' })) {
          state.credentialFiles.splice(index, 1);
          renderCredentialList();
          if (state.current === 7) renderReview();
        }
        return;
      }
      if (e.target.id === 'enroll-id-view' || e.target.id === 'review-id-view') {
        e.preventDefault();
        previewFile(state.identityFile);
      }
      if (e.target.id === 'enroll-id-remove') {
        e.preventDefault();
        if (await window.AbecFeedback.confirm({ title: 'Remove ID', message: 'Remove the uploaded ID?', confirmLabel: 'Remove' })) {
          state.identityFile = null;
          renderIdentityFile();
        }
      }
    });

    $('enroll-wizard-form').addEventListener('submit', function (event) {
      event.preventDefault();
      return submitApplication();
    });
    $('enroll-privacy-open')?.addEventListener('click', function () { setPrivacyOpen(true); });
    $('enroll-privacy-ack')?.addEventListener('change', function () {
      if ($('enroll-privacy-ack').checked) validatePrivacy();
    });
    document.querySelectorAll('[data-enroll-privacy-close]').forEach(function (el) {
      el.addEventListener('click', function () { setPrivacyOpen(false); });
    });
    document.querySelectorAll('input[name="tesda-current-enrolled"],input[name="tesda-completed"],#tesda-completed-name').forEach(function (el) {
      el.addEventListener('change', refreshTesdaScreeningUi);
      el.addEventListener('input', refreshTesdaScreeningUi);
    });
    $('tesda-ack-current')?.addEventListener('click', function () { state.tesdaAckCurrent = true; showFormMessage('Noted. You may continue.', 'info'); });
    $('tesda-ack-same-qual')?.addEventListener('click', function () { state.tesdaAckSameQual = true; showFormMessage('Noted. You may continue.', 'info'); });
    goToStep(1);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initEnrollWizard);
  else initEnrollWizard();
})();
