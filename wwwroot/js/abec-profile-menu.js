/* Header profile/account menu (Admin + Student) — replaces sidebar footer links. */
(function (window) {
  'use strict';
  if (!window.AbecApi) return;

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function hideSidebarProfile() {
    document.querySelectorAll('.abec-sidebar-footer').forEach(function (el) {
      el.classList.add('hidden');
      el.setAttribute('aria-hidden', 'true');
    });
  }

  function closeMenu() {
    var panel = document.getElementById('abec-profile-menu-panel');
    var btn = document.getElementById('abec-profile-menu-btn');
    if (panel) panel.classList.add('hidden');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  function toggleMenu() {
    var panel = document.getElementById('abec-profile-menu-panel');
    var btn = document.getElementById('abec-profile-menu-btn');
    if (!panel || !btn) return;
    var open = panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function ensureProfileMenu(options) {
    if (document.getElementById('abec-profile-menu')) return;

    var session = AbecApi.getSession() || {};
    var displayName = session.displayName || session.username || session.email || options.roleLabel;
    var role = session.role || options.roleLabel;
    var initials = AbecApi.initials(displayName);

    var wrap = document.createElement('div');
    wrap.id = 'abec-profile-menu';
    wrap.className = 'relative z-50 shrink-0';
    var sidebar = options.placement === 'sidebar';
    wrap.className = sidebar ? 'abec-profile-menu abec-profile-menu-sidebar' : 'relative z-50 shrink-0';
    wrap.innerHTML =
      '<button id="abec-profile-menu-btn" type="button" class="abec-profile-menu-btn" aria-expanded="false" aria-controls="abec-profile-menu-panel" aria-haspopup="true">' +
        '<span id="sidebar-initials" class="abec-profile-menu-avatar" aria-hidden="true">' + esc(initials) + '</span>' +
        '<span class="abec-profile-menu-copy">' +
          '<span id="sidebar-name" class="abec-profile-menu-label" data-bind="student-name">' + esc(displayName) + '</span>' +
          (sidebar ? '<span id="sidebar-role" class="abec-profile-menu-role">Student</span>' : '') +
        '</span>' +
        '<svg class="abec-profile-menu-caret" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>' +
      '</button>' +
      '<div id="abec-profile-menu-panel" class="abec-profile-menu-panel hidden" role="menu">' +
        '<div class="abec-profile-menu-head">' +
          '<span class="abec-profile-menu-avatar abec-profile-menu-avatar-lg">' + esc(initials) + '</span>' +
          '<div class="min-w-0">' +
            '<p class="text-sm font-semibold text-slate-800 truncate">' + esc(displayName) + '</p>' +
            '<p class="text-xs text-slate-500">' + esc(role) + '</p>' +
          '</div>' +
        '</div>' +
        '<a class="abec-profile-menu-item" role="menuitem" href="' + esc(options.settingsHref) + '">User Settings</a>' +
        '<a class="abec-profile-menu-item abec-profile-menu-item-danger" role="menuitem" href="' + esc(options.signOutHref) + '">Sign Out</a>' +
      '</div>';

    options.mountEl.appendChild(wrap);

    document.getElementById('abec-profile-menu-btn').addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      toggleMenu();
    });

    document.addEventListener('click', function (e) {
      var root = document.getElementById('abec-profile-menu');
      if (!root || root.contains(e.target)) return;
      closeMenu();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeMenu();
    });
  }

  function mountAdmin() {
    hideSidebarProfile();
    var actions = document.querySelector('.abec-header-actions');
    if (!actions) {
      var header = document.querySelector('main.abec-main header');
      if (header) {
        actions = document.createElement('div');
        actions.className = 'abec-header-actions flex items-center gap-3 shrink-0 relative z-40';
        header.appendChild(actions);
      }
    }
    if (!actions) return;
    if (!actions.classList.contains('flex')) {
      actions.classList.add('flex', 'items-center', 'gap-3', 'shrink-0', 'relative', 'z-40');
    }
    ensureProfileMenu({
      roleLabel: 'Admin',
      settingsHref: 'UserSettings.html',
      signOutHref: '../Home/SignOutPage.html',
      mountEl: actions
    });
  }

  function mountStudent() {
    var mountEl = document.getElementById('student-header-actions');
    if (!mountEl) return;
    ensureProfileMenu({
      roleLabel: 'Student',
      settingsHref: 'UserSettings.html',
      signOutHref: '../Home/SignOutPage.html',
      mountEl: mountEl
    });
  }

  window.AbecProfileMenu = {
    mountAdmin: mountAdmin,
    mountStudent: mountStudent
  };
})(window);
