/* Admin User Settings — profile, activity, notification prefs */
(function () {
  'use strict';
  if (!window.AbecApi) return;

  var editing = false;
  var adminId = null;
  var saveTimer = null;

  function $(id) { return document.getElementById(id); }

  function setMsg(el, text, ok) {
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('hidden', !text);
    el.classList.toggle('text-emerald-600', !!ok);
    el.classList.toggle('text-red-600', !ok && !!text);
    el.classList.toggle('text-slate-500', !text);
  }

  function setPersonalEditable(on) {
    editing = !!on;
    ['settings-username', 'settings-contact', 'settings-email'].forEach(function (id) {
      var el = $(id);
      if (el) el.disabled = !on;
    });
    var saveBtn = $('btn-save-personal');
    var editBtn = $('btn-edit-personal');
    if (saveBtn) {
      saveBtn.disabled = !on;
      saveBtn.classList.toggle('opacity-60', !on);
      saveBtn.classList.toggle('pointer-events-none', !on);
    }
    if (editBtn) editBtn.textContent = on ? 'Cancel' : 'Edit';
  }

  function formatWhen(value) {
    if (!value) return '—';
    var d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit'
    });
  }

  var activityRows = [];

  function activityRow(r, compact) {
    var when = formatWhen(r.createdAt);
    var device = r.deviceInfo || 'Unknown device';
    if (compact) {
      return '<tr>' +
        '<td class="px-3 py-1.5 font-medium text-slate-800">' + escapeHtml(r.action || '—') + '</td>' +
        '<td class="px-3 py-1.5">' + escapeHtml(device) + '</td>' +
        '<td class="px-3 py-1.5 whitespace-nowrap">' + escapeHtml(when) + '</td>' +
        '</tr>';
    }
    return '<tr>' +
      '<td class="px-3 py-2 font-medium text-slate-800">' + escapeHtml(r.action || '—') + '</td>' +
      '<td class="px-3 py-2">' + escapeHtml(device) + '</td>' +
      '<td class="px-3 py-2 whitespace-nowrap">' + escapeHtml(when) + '</td>' +
      '</tr>';
  }

  function renderActivity(rows) {
    activityRows = (rows || []).filter(function (row) {
      return /log/i.test(row.action || '');
    }).sort(function (a, b) {
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
    var tbody = $('activity-tbody');
    var all = $('activity-all-tbody');
    if (tbody) {
      var recent = activityRows.slice(0, 2);
      tbody.innerHTML = recent.length
        ? recent.map(function (r) { return activityRow(r, true); }).join('')
        : '<tr><td colspan="3" class="px-3 py-4 text-center text-sm text-slate-500">No recent login activity.</td></tr>';
    }
    if (all) {
      all.innerHTML = activityRows.length
        ? activityRows.map(function (r) { return activityRow(r, false); }).join('')
        : '<tr><td colspan="3" class="px-3 py-6 text-center text-slate-500">No login activity recorded.</td></tr>';
    }
  }

  function renderNotifications(list) {
    var host = $('settings-notif-list');
    if (!host) return;
    if (!list || !list.length) {
      host.innerHTML = '<p class="text-xs text-slate-400 text-center py-4">No notifications yet.</p>';
      return;
    }
    host.innerHTML = list.map(function (n) {
      var unread = (n.status || '') === 'Unread';
      return '<button type="button" data-id="' + n.notificationId + '" class="settings-notif-item w-full text-left rounded-lg border border-slate-200 px-3 py-2.5 hover:bg-slate-50 ' +
        (unread ? 'bg-sky-50/60' : 'bg-white') + '">' +
        '<div class="flex items-start justify-between gap-2">' +
        '<p class="text-xs font-semibold text-slate-800">' + escapeHtml(n.title || '') + '</p>' +
        (unread ? '<span class="text-[10px] font-bold uppercase text-abec-blue shrink-0">New</span>' : '') +
        '</div>' +
        '<p class="text-[11px] text-slate-500 mt-0.5 leading-relaxed">' + escapeHtml(n.message || '') + '</p>' +
        '<p class="text-[10px] text-slate-400 mt-1">' + escapeHtml(formatWhen(n.createdAt)) + '</p>' +
        '</button>';
    }).join('');

    host.querySelectorAll('.settings-notif-item').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        var id = btn.getAttribute('data-id');
        await AbecApi.put('/api/notifications/' + id + '/read');
        await loadProfile();
        if (typeof window.abecReloadAdminNotifications === 'function') {
          window.abecReloadAdminNotifications();
        }
      });
    });
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function applyPrefs(prefs) {
    prefs = prefs || {};
    if ($('pref-email')) $('pref-email').checked = !!prefs.emailNotifications;
    if ($('pref-inapp')) $('pref-inapp').checked = !!prefs.inAppAlerts;
    if ($('pref-system')) $('pref-system').checked = !!prefs.systemAlerts;
    if ($('pref-student')) $('pref-student').checked = !!prefs.studentUpdates;
    if ($('pref-document')) $('pref-document').checked = !!prefs.documentRequests;
  }

  function collectPrefs() {
    return {
      emailNotifications: !!($('pref-email') || {}).checked,
      inAppAlerts: !!($('pref-inapp') || {}).checked,
      systemAlerts: !!($('pref-system') || {}).checked,
      studentUpdates: !!($('pref-student') || {}).checked,
      documentRequests: !!($('pref-document') || {}).checked
    };
  }

  async function loadProfile() {
    var result = await AbecApi.get('/api/admin/profile/' + adminId);
    if (!result.success || !result.data) {
      setMsg($('settings-personal-msg'), result.message || 'Unable to load profile.', false);
      return;
    }
    var p = result.data;
    var username = p.username || 'Admin';
    var initials = AbecApi.initials(username);

    if ($('profile-username')) $('profile-username').textContent = username;
    if ($('profile-email-display')) $('profile-email-display').textContent = p.email || '—';
    if ($('profile-avatar')) $('profile-avatar').textContent = initials;
    if ($('sidebar-name')) $('sidebar-name').textContent = username;
    if ($('sidebar-avatar')) $('sidebar-avatar').textContent = initials;

    if (!editing) {
      if ($('settings-username')) $('settings-username').value = username;
      if ($('settings-contact')) $('settings-contact').value = p.contactNumber || '';
      if ($('settings-email')) $('settings-email').value = p.email || '';
    }

    applyPrefs(p.notificationPreferences);
    renderActivity(p.recentActivity || []);
    renderNotifications(p.recentNotifications || []);
  }

  async function savePersonal() {
    var payload = {
      username: (($('settings-username') || {}).value || '').trim(),
      email: (($('settings-email') || {}).value || '').trim(),
      contactNumber: (($('settings-contact') || {}).value || '').trim()
    };
    if (!payload.username || !payload.email || !payload.contactNumber) {
      setMsg($('settings-personal-msg'), 'Please fill in username, email, and contact number.', false);
      return;
    }
    var result = await AbecApi.put('/api/admin/profile/' + adminId, payload);
    if (!result.success) {
      setMsg($('settings-personal-msg'), result.message || 'Unable to save changes.', false);
      return;
    }
    setPersonalEditable(false);
    setMsg($('settings-personal-msg'), result.message || 'Changes saved.', true);
    var session = AbecApi.getSession() || {};
    session.displayName = payload.username;
    session.emailOrUsername = payload.username;
    AbecApi.setSession(session);
    await loadProfile();
  }

  async function savePrefs() {
    var result = await AbecApi.put('/api/admin/profile/' + adminId + '/notification-preferences', collectPrefs());
    setMsg($('pref-msg'), result.message || (result.success ? 'Preferences saved.' : 'Unable to save preferences.'), result.success);
    if (result.success) {
      await loadProfile();
      if (typeof window.abecReloadAdminNotifications === 'function') {
        window.abecReloadAdminNotifications();
      }
    }
  }

  function schedulePrefSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(savePrefs, 250);
  }

  function openPasswordModal(show) {
    var modal = $('password-modal');
    if (!modal) return;
    modal.classList.toggle('hidden', !show);
    if (show) {
      ['pwd-current', 'pwd-new', 'pwd-confirm'].forEach(function (id) {
        if ($(id)) $(id).value = '';
      });
      setMsg($('pwd-msg'), '', false);
    }
  }

  async function savePassword() {
    var current = (($('pwd-current') || {}).value || '');
    var next = (($('pwd-new') || {}).value || '');
    var confirm = (($('pwd-confirm') || {}).value || '');
    if (!current || !next || !confirm) {
      setMsg($('pwd-msg'), 'Please fill in all password fields.', false);
      return;
    }
    if (next.length < 6) {
      setMsg($('pwd-msg'), 'New password must be at least 6 characters.', false);
      return;
    }
    if (next !== confirm) {
      setMsg($('pwd-msg'), 'New password and confirmation do not match.', false);
      return;
    }
    var result = await AbecApi.post('/api/admin/profile/' + adminId + '/change-password', {
      currentPassword: current,
      newPassword: next
    });
    if (!result.success) {
      setMsg($('pwd-msg'), result.message || 'Unable to change password.', false);
      return;
    }
    openPasswordModal(false);
    setMsg($('settings-personal-msg'), result.message || 'Password updated.', true);
    await loadProfile();
  }

  async function loadSmtpSettings() {
    var result = await AbecApi.get('/api/admin/email-settings');
    if (!result.success || !result.data) return;
    var d = result.data;
    var enabled = $('smtp-enabled');
    var user = $('smtp-username');
    var fromName = $('smtp-from-name');
    var publicBase = $('smtp-public-base-url');
    var publicHint = $('smtp-public-base-hint');
    var hint = $('smtp-password-hint');
    var pwd = $('smtp-password');
    if (enabled) enabled.checked = !!d.enabled;
    if (user) user.value = d.username || '';
    if (fromName) fromName.value = d.fromName || 'ABEC System';
    if (publicBase) publicBase.value = d.publicBaseUrl || '';
    if (publicHint) {
      if (d.publicBaseUrlIsReachableRemotely) {
        publicHint.textContent = 'Public URL is set — Confirm Slot links should work from any network.';
        publicHint.className = 'text-[11px] text-emerald-600 mt-1';
      } else {
        publicHint.textContent = 'Must be a public HTTPS URL so applicants on any network (including mobile data) can open Confirm Slot. Localhost and LAN IPs will not work outside your Wi‑Fi.';
        publicHint.className = 'text-[11px] text-amber-700 mt-1';
      }
    }
    if (pwd) pwd.value = '';
    if (hint) {
      hint.textContent = d.passwordConfigured
        ? 'App Password is configured. Leave blank to keep the current password, or enter a new one to replace it.'
        : 'Create one at myaccount.google.com/apppasswords — required for approval emails.';
      hint.className = d.passwordConfigured ? 'text-[11px] text-emerald-600 mt-1' : 'text-[11px] text-slate-400 mt-1';
    }
  }

  async function saveSmtpSettings() {
    var msg = $('smtp-msg');
    var body = {
      enabled: !!($('smtp-enabled') || {}).checked,
      host: 'smtp.gmail.com',
      port: 587,
      username: (($('smtp-username') || {}).value || '').trim(),
      password: (($('smtp-password') || {}).value || '').trim(),
      fromName: (($('smtp-from-name') || {}).value || 'ABEC System').trim(),
      publicBaseUrl: (($('smtp-public-base-url') || {}).value || '').trim()
    };
    var result = await AbecApi.put('/api/admin/email-settings', body);
    if (!result.success) {
      setMsg(msg, result.message || 'Unable to save email settings.', false);
      return;
    }
    setMsg(msg, result.message || 'Email settings saved.', true);
    await loadSmtpSettings();
  }

  document.addEventListener('DOMContentLoaded', function () {
    var session = AbecApi.requireRole('Admin');
    if (!session) return;
    adminId = session.userId;

    setPersonalEditable(false);

    var editBtn = $('btn-edit-personal');
    if (editBtn) {
      editBtn.addEventListener('click', function () {
        if (editing) {
          setPersonalEditable(false);
          setMsg($('settings-personal-msg'), '', false);
          loadProfile();
          return;
        }
        setPersonalEditable(true);
        setMsg($('settings-personal-msg'), 'Editing enabled. Update your details, then click Save Changes.', true);
      });
    }

    var saveBtn = $('btn-save-personal');
    if (saveBtn) saveBtn.addEventListener('click', savePersonal);

    ['pref-email', 'pref-inapp', 'pref-system', 'pref-student', 'pref-document'].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener('change', schedulePrefSave);
    });

    var pwdBtn = $('btn-change-password');
    if (pwdBtn) pwdBtn.addEventListener('click', function () { openPasswordModal(true); });
    document.querySelectorAll('[data-close-password]').forEach(function (el) {
      el.addEventListener('click', function () { openPasswordModal(false); });
    });
    var savePwd = $('btn-save-password');
    if (savePwd) savePwd.addEventListener('click', savePassword);

    var saveSmtp = $('btn-save-smtp');
    if (saveSmtp) saveSmtp.addEventListener('click', saveSmtpSettings);

    function toggleModal(id, open) {
      var modal = $(id);
      if (!modal) return;
      modal.classList.toggle('hidden', !open);
    }
    var emailBtn = $('btn-open-email');
    if (emailBtn) emailBtn.addEventListener('click', function () { toggleModal('email-modal', true); });
    document.querySelectorAll('[data-close-email]').forEach(function (el) {
      el.addEventListener('click', function () { toggleModal('email-modal', false); });
    });
    var alertsBtn = $('btn-view-alerts');
    if (alertsBtn) alertsBtn.addEventListener('click', function () { toggleModal('alerts-modal', true); });
    document.querySelectorAll('[data-close-alerts]').forEach(function (el) {
      el.addEventListener('click', function () { toggleModal('alerts-modal', false); });
    });
    var activityBtn = $('btn-view-activity');
    if (activityBtn) activityBtn.addEventListener('click', function () { toggleModal('activity-modal', true); });
    document.querySelectorAll('[data-close-activity]').forEach(function (el) {
      el.addEventListener('click', function () { toggleModal('activity-modal', false); });
    });

    loadProfile();
    loadSmtpSettings();
  });
})();
