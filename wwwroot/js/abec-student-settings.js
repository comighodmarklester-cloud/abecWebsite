/* Student User Settings — registration profile and own login history */
(function () {
  'use strict';
  if (!window.AbecApi) return;

  var studentId = null;
  var activityRows = [];
  var loadedProfile = null;
  var loginSettings = null;
  var editing = false;
  var saving = false;
  var dialogId = '';
  var dialogTrigger = null;
  var profileFields = ['set-first', 'set-middle', 'set-last', 'set-suffix', 'set-email', 'set-contact', 'set-address', 'set-gender', 'set-birthdate'];

  function setEditing(on) {
    editing = on;
    profileFields.forEach(function (id) { $(id).disabled = !on; });
    $('btn-edit-student').classList.toggle('hidden', on);
    $('btn-save-student').classList.toggle('hidden', !on);
    $('btn-cancel-student').classList.toggle('hidden', !on);
  }

  function openDialog(id) {
    if (dialogId) closeDialog();
    dialogTrigger = document.activeElement;
    dialogId = id;
    $(id).classList.remove('hidden');
    document.body.classList.add('settings-dialog-open');
    var focus = $(id).querySelector('[tabindex="-1"], button');
    if (focus) focus.focus();
  }

  function closeDialog() {
    if (!dialogId || saving) return;
    $(dialogId).classList.add('hidden');
    if (dialogId === 'student-password-modal') $('student-password-form').reset();
    dialogId = '';
    document.body.classList.remove('settings-dialog-open');
    if (dialogTrigger && dialogTrigger.isConnected) dialogTrigger.focus();
    dialogTrigger = null;
  }

  function renderLogin(settings) {
    loginSettings = settings;
    $('btn-student-password').disabled = false;
    $('btn-student-password').textContent = settings.hasPassword ? 'Update Login Settings' : 'Add Password';
    $('set-login-mode').textContent = settings.passwordLoginEnabled
      ? 'Login with username: ' + settings.username
      : 'Security PIN login is enabled.';
    try { localStorage.setItem('abec-student-login-mode', settings.passwordLoginEnabled ? 'password' : 'pin'); } catch (e) { /* optional device preference */ }
  }

  function openPassword() {
    if (!loginSettings) return;
    $('student-password-form').reset();
    $('student-password-title').textContent = loginSettings.hasPassword ? 'Update Login Settings' : 'Add Password';
    $('student-current-password-wrap').classList.toggle('hidden', !loginSettings.hasPassword);
    $('student-current-password').required = loginSettings.hasPassword;
    $('student-new-password').required = !loginSettings.hasPassword;
    $('student-password-help').textContent = loginSettings.hasPassword ? 'Leave blank to keep your password.' : 'Use at least 8 characters.';
    $('student-login-username').value = loginSettings.username || '';
    $('student-password-enabled').checked = loginSettings.passwordLoginEnabled;
    $('student-credential-msg').textContent = '';
    openDialog('student-password-modal');
  }

  async function saveCredentials(event) {
    event.preventDefault();
    if (saving || !$('student-password-form').reportValidity()) return;
    var password = $('student-new-password').value;
    var confirm = $('student-confirm-password').value;
    if (password !== confirm) { $('student-credential-msg').textContent = 'Passwords do not match.'; return; }
    if (new TextEncoder().encode(password).length > 72) { $('student-credential-msg').textContent = 'Password must be at most 72 UTF-8 bytes.'; return; }
    saving = true;
    $('student-credential-save').disabled = true;
    try {
      var result = await AbecApi.put('/api/student/account/credentials', {
        username: $('student-login-username').value.trim(), password: password || null,
        confirmPassword: confirm || null, currentPassword: $('student-current-password').value || null,
        passwordLoginEnabled: $('student-password-enabled').checked
      });
      if (!result.success || !result.data) { $('student-credential-msg').textContent = result.message || 'Login settings could not be saved.'; return; }
      renderLogin(result.data);
      saving = false;
      closeDialog();
      setMsg('Login settings saved.', true);
    } finally { saving = false; $('student-credential-save').disabled = false; }
  }

  function $(id) { return document.getElementById(id); }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function setMsg(text, ok) {
    var el = $('set-msg');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('hidden', !text);
    el.className = 'text-xs mt-2' + (text ? '' : ' hidden') + (ok ? ' text-emerald-700' : ' text-red-600');
  }

  function shown(value) {
    var text = value == null ? '' : String(value).trim();
    return text || 'Not recorded';
  }

  function courseName(value) {
    if (window.AbecApi && AbecApi.displayCourseName) return AbecApi.displayCourseName(value || '') || 'Not recorded';
    return shown(value);
  }

  function formatWhen(value) {
    if (!value) return '—';
    var d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function activityHtml(rows) {
    if (!rows || !rows.length) return '<p class="text-xs text-slate-500">No login activity recorded.</p>';
    return rows.map(function (row) {
      return '<div class="border-b border-slate-100 py-1.5 last:border-0">' +
        '<p class="font-semibold text-slate-800">' + esc(row.action || 'Logged in') + '</p>' +
        '<p class="text-slate-500">' + esc(formatWhen(row.createdAt)) + ' · ' + esc(row.deviceInfo || 'Unknown device') + '</p>' +
        '</div>';
    }).join('');
  }

  function renderActivity(rows) {
    activityRows = (rows || []).slice().sort(function (a, b) {
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
    var recent = $('set-activity');
    var all = $('set-activity-all');
    if (recent) recent.innerHTML = activityRows.length ? activityHtml(activityRows.slice(0, 2)) : '<p class="text-xs text-slate-500">No recent login activity.</p>';
    if (all) all.innerHTML = activityHtml(activityRows);
  }

  function fill(profile) {
    loadedProfile = profile;
    $('set-first').value = profile.firstName || '';
    $('set-middle').value = profile.middleName || '';
    $('set-last').value = profile.lastName || '';
    $('set-suffix').value = profile.suffix || '';
    $('set-email').value = profile.email || '';
    $('set-contact').value = profile.contactNumber || '';
    $('set-address').value = profile.address || '';
    var gender = $('set-gender');
    var genderValue = profile.gender || '';
    if (genderValue && !Array.prototype.some.call(gender.options, function (option) { return option.value === genderValue; })) {
      var extra = document.createElement('option');
      extra.value = genderValue;
      extra.textContent = genderValue;
      gender.appendChild(extra);
    }
    gender.value = genderValue;
    if (profile.birthdate) $('set-birthdate').value = String(profile.birthdate).slice(0, 10);
    $('set-account').textContent = profile.accountStatus || '';
    $('set-course').textContent = courseName(profile.courseName);
    $('set-program').textContent = shown(profile.programSummary || profile.courseDuration);
    $('set-batch').textContent = shown(profile.batchName);
    $('set-civil').textContent = shown(profile.civilStatus);
    $('set-school').textContent = shown(profile.schoolName);
    $('set-school-address').textContent = shown(profile.schoolAddress);
  }

  async function loadProfile() {
    var result = await AbecApi.get('/api/student/account');
    if (!result.success || !result.data || !result.data.profile) {
      setMsg('Account settings could not be loaded. Please sign out and log in again.', false);
      return;
    }
    fill(result.data.profile);
    setEditing(false);
    $('btn-edit-student').disabled = false;
    $('btn-registration').disabled = false;
    $('set-registration').innerHTML = Object.keys(result.data.registration || {}).map(function (label) {
      return '<div><dt class="set-label">' + esc(label) + '</dt><dd class="set-readonly break-words">' + esc(shown(result.data.registration[label])) + '</dd></div>';
    }).join('');
    renderLogin(result.data.login);
  }

  async function loadActivity() {
    var result = await AbecApi.get('/api/student/' + studentId + '/login-activity');
    renderActivity(result && result.success ? result.data : []);
  }

  async function saveProfile() {
    if (!editing || saving) return;
    var invalid = profileFields.map($).find(function (el) { return !el.checkValidity(); });
    if (invalid) { invalid.reportValidity(); return; }
    var first = ($('set-first').value || '').trim();
    var last = ($('set-last').value || '').trim();
    if (!first || !last) {
      setMsg('First name and last name are required.', false);
      return;
    }
    saving = true;
    $('btn-save-student').disabled = true;
    $('btn-cancel-student').disabled = true;
    var result;
    try { result = await AbecApi.put('/api/student/account/profile', {
      firstName: first,
      middleName: ($('set-middle').value || '').trim(),
      lastName: last,
      suffix: ($('set-suffix').value || '').trim(),
      gender: $('set-gender').value || null,
      birthdate: $('set-birthdate').value || null,
      email: ($('set-email').value || '').trim(),
      contactNumber: ($('set-contact').value || '').trim(),
      address: ($('set-address').value || '').trim()
    }); } finally { saving = false; $('btn-save-student').disabled = false; $('btn-cancel-student').disabled = false; }
    if (!result.success) {
      setMsg(result.message || 'Unable to save your profile.', false);
      return;
    }
    if (result.data) fill(result.data);
    setEditing(false);
    var session = AbecApi.getSession();
    if (session && result.data) {
      session.displayName = result.data.fullName;
      session.emailOrUsername = result.data.email;
      AbecApi.setSession(session);
    }
    setMsg(result.message || 'Profile saved.', true);
  }

  document.addEventListener('DOMContentLoaded', function () {
    var session = AbecApi.requireRole('Student');
    if (!session) return;
    studentId = session.userId;
    setEditing(false);
    $('btn-edit-student').addEventListener('click', function () { if (!loadedProfile) return; setMsg('', false); setEditing(true); $('set-first').focus(); });
    $('btn-cancel-student').addEventListener('click', function () { if (saving) return; fill(loadedProfile); setEditing(false); setMsg('', false); });
    $('btn-registration').addEventListener('click', function () { openDialog('registration-modal'); });
    $('btn-student-password').addEventListener('click', openPassword);
    $('student-password-form').addEventListener('submit', saveCredentials);
    document.querySelectorAll('[data-close-settings-modal]').forEach(function (el) { el.addEventListener('click', closeDialog); });
    document.addEventListener('keydown', function (event) {
      if (!dialogId) return;
      if (event.key === 'Escape') { event.preventDefault(); closeDialog(); }
      if (event.key !== 'Tab') return;
      var focusable = Array.from($(dialogId).querySelectorAll('button, input, select, textarea, [tabindex="0"]')).filter(function (el) { return !el.disabled && el.getClientRects().length; });
      if (!focusable.length) { event.preventDefault(); return; }
      var index = focusable.indexOf(document.activeElement);
      if (event.shiftKey && index <= 0) { event.preventDefault(); focusable[focusable.length - 1].focus(); }
      else if (!event.shiftKey && (index < 0 || index === focusable.length - 1)) { event.preventDefault(); focusable[0].focus(); }
    });
    var save = $('btn-save-student');
    if (save) save.addEventListener('click', saveProfile);
    var open = $('btn-view-activity');
    if (open) open.addEventListener('click', function () {
      openDialog('activity-modal');
    });
    document.querySelectorAll('[data-close-activity]').forEach(function (el) {
      el.addEventListener('click', function () {
        closeDialog();
      });
    });
    loadProfile();
    loadActivity();
  });
})();
