/* Admin notification bell + shared helpers (injected, non-destructive). */
(function () {
  'use strict';
  if (!window.AbecApi) return;

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function isUnread(status) {
    return String(status || '').toLowerCase() !== 'read';
  }

  function findActionsHost() {
    var overviewActions = document.querySelector('#view-overview .shrink-0 .flex.flex-wrap.items-center.gap-3');
    if (overviewActions) return overviewActions;

    var header = document.querySelector('main.abec-main header[data-purpose="page-header"]')
      || document.querySelector('main.abec-main > header')
      || document.querySelector('main.abec-main header');
    if (header) {
      var existing = header.querySelector('.abec-header-actions');
      if (existing) return existing;
      header.classList.add('flex', 'flex-wrap', 'items-start', 'justify-between', 'gap-4', 'relative', 'z-40');
      var actions = document.createElement('div');
      actions.className = 'abec-header-actions flex items-center gap-3 shrink-0 relative z-40';
      header.appendChild(actions);
      return actions;
    }

    return document.querySelector('main.abec-main .shrink-0.flex.flex-col.lg\\:flex-row .flex.flex-wrap') || null;
  }

  function resetPanelPosition() {
    var panel = document.getElementById('abec-bell-panel');
    if (!panel) return;
    ['position', 'top', 'left', 'right', 'bottom', 'width', 'maxHeight', 'zIndex'].forEach(function (prop) {
      panel.style[prop] = '';
    });
    var home = document.getElementById('abec-admin-bell');
    if (home && panel.parentElement !== home) home.appendChild(panel);
  }

  function placeRecordsPanel() {
    if (!document.body.classList.contains('records-page') && !document.body.classList.contains('activation-page') && !document.body.classList.contains('documents-page') && !document.body.classList.contains('batch-management-page')) return;
    var panel = document.getElementById('abec-bell-panel');
    var btn = document.getElementById('abec-bell-btn');
    if (!panel || !btn || panel.classList.contains('hidden')) return;
    if (panel.parentElement !== document.body) document.body.appendChild(panel);

    var rect = btn.getBoundingClientRect();
    var margin = 12;
    var gap = 8;
    var width = Math.min(360, Math.max(160, window.innerWidth - margin * 2));
    var left = rect.right - width;
    if (left < margin) left = margin;
    if (left + width > window.innerWidth - margin) left = Math.max(margin, window.innerWidth - margin - width);

    var spaceBelow = window.innerHeight - rect.bottom - gap - margin;
    var spaceAbove = rect.top - gap - margin;
    var openUp = spaceBelow < 160 && spaceAbove > spaceBelow;
    var heightCap = Math.max(160, window.innerHeight - 120);
    var available = Math.max(0, openUp ? spaceAbove : spaceBelow);
    var maxHeight = Math.min(heightCap, available);

    panel.style.position = 'fixed';
    panel.style.right = 'auto';
    panel.style.left = left + 'px';
    panel.style.width = width + 'px';
    panel.style.zIndex = '80';
    panel.style.maxHeight = maxHeight + 'px';

    if (openUp) {
      panel.style.top = 'auto';
      panel.style.bottom = (window.innerHeight - rect.top + gap) + 'px';
    } else {
      panel.style.bottom = 'auto';
      panel.style.top = (rect.bottom + gap) + 'px';
    }
  }

  function closePanel() {
    var panel = document.getElementById('abec-bell-panel');
    var btn = document.getElementById('abec-bell-btn');
    if (panel) panel.classList.add('hidden');
    if (btn) btn.setAttribute('aria-expanded', 'false');
    resetPanelPosition();
  }

  function togglePanel() {
    var panel = document.getElementById('abec-bell-panel');
    var btn = document.getElementById('abec-bell-btn');
    if (!panel || !btn) return;
    var open = panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      loadAdminNotifications();
      placeRecordsPanel();
    } else {
      resetPanelPosition();
    }
  }

  function ensureBell() {
    if (document.getElementById('abec-admin-bell')) return;

    var wrap = document.createElement('div');
    wrap.id = 'abec-admin-bell';
    wrap.className = 'relative z-50 shrink-0 flex items-center gap-2';
    wrap.innerHTML =
      '<button id="abec-refresh-btn" type="button" class="abec-refresh-btn" aria-label="Refresh page" title="Refresh page">' +
      '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h5M20 20v-5h-5M5.5 15a7 7 0 0011.75 2.25L20 15M4 9l2.75-2.25A7 7 0 0118.5 9"/></svg>' +
      '</button>' +
      '<button id="abec-bell-btn" type="button" class="abec-notif-bell-btn" aria-label="Notifications" aria-expanded="false" aria-controls="abec-bell-panel">' +
      '<svg class="w-5 h-5 text-slate-700 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>' +
      '<span id="abec-bell-count" class="abec-notif-badge hidden">0</span>' +
      '</button>' +
      '<div id="abec-bell-panel" class="abec-notif-panel hidden" role="dialog" aria-label="Admin notifications">' +
      '<div class="abec-notif-panel-head"><span>Notifications</span>' +
      '<button type="button" id="abec-mark-all-read" class="abec-notif-mark-all">Mark all read</button></div>' +
      '<div id="abec-bell-list" class="abec-notif-list"></div>' +
      '</div>';

    var actions = findActionsHost();
    var main = document.querySelector('main.abec-main');
    if (actions) {
      actions.appendChild(wrap);
    } else if (main) {
      if (!main.style.position) main.style.position = 'relative';
      wrap.className = 'absolute top-4 right-6 z-50 flex items-center gap-2';
      main.appendChild(wrap);
    } else {
      return;
    }

    document.getElementById('abec-bell-btn').addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      togglePanel();
    });

    document.getElementById('abec-refresh-btn').addEventListener('click', function () {
      if (typeof window.abecReportsRefresh === 'function') {
        window.abecReportsRefresh();
        return;
      }
      if (window.AbecBatches && typeof window.AbecBatches.refresh === 'function') {
        window.AbecBatches.refresh();
        return;
      }
      if (window.AbecDashboard && typeof window.AbecDashboard.refresh === 'function') {
        window.AbecDashboard.refresh();
        return;
      }
      window.location.reload();
    });

    var markAll = document.getElementById('abec-mark-all-read');
    if (markAll) {
      markAll.addEventListener('click', async function (e) {
        e.preventDefault();
        e.stopPropagation();
        var items = document.querySelectorAll('#abec-bell-list .abec-notif-item.is-unread');
        for (var i = 0; i < items.length; i++) {
          var id = items[i].getAttribute('data-id');
          if (id) await AbecApi.put('/api/notifications/' + id + '/read');
        }
        await loadAdminNotifications();
      });
    }

    document.addEventListener('click', function (e) {
      var root = document.getElementById('abec-admin-bell');
      var panel = document.getElementById('abec-bell-panel');
      if (!root) return;
      if (root.contains(e.target)) return;
      if (panel && panel.contains(e.target)) return;
      closePanel();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closePanel();
    });

    window.addEventListener('resize', placeRecordsPanel);
    window.addEventListener('scroll', function (e) {
      var panel = document.getElementById('abec-bell-panel');
      if (panel && e.target && panel.contains(e.target)) return;
      placeRecordsPanel();
    }, true);
  }

  async function loadAdminNotifications() {
    ensureBell();
    var list = document.getElementById('abec-bell-list');
    var countEl = document.getElementById('abec-bell-count');
    if (!list || !countEl) return;

    var session = AbecApi.getSession();
    var adminQuery = session && session.userId ? ('?adminId=' + encodeURIComponent(session.userId)) : '';
    var result = await AbecApi.get('/api/notifications/admin' + adminQuery);
    if (!result.success || !result.data) {
      list.innerHTML = '<p class="abec-notif-empty">Unable to load notifications.</p>';
      return;
    }

    var unread = result.data.filter(function (n) { return isUnread(n.status); });
    countEl.textContent = String(unread.length);
    countEl.classList.toggle('hidden', unread.length === 0);

    list.innerHTML = result.data.length
      ? result.data.map(function (n) {
          var title = (n.title || '').toLowerCase();
          var route = '';
           if (title.indexOf('new applicant') !== -1) route = 'new-applicant';
           else if (title.indexOf('confirmed') !== -1) route = 'activation';
           else if (title.indexOf('expired') !== -1) route = 'expired';
           else if (title.indexOf('declined') !== -1) route = 'declined';
           else if (title.indexOf('waitlisted applicant available') !== -1) route = 'waitlisted';
          else if (title.indexOf('document') !== -1) route = 'documents';
          var unreadClass = isUnread(n.status) ? ' is-unread' : '';
           return '<button type="button" data-id="' + esc(n.notificationId) + '" data-route="' + route + '" data-applicant-id="' + esc(n.applicantId || '') + '" data-message="' + esc(n.message || '') + '" class="abec-notif-item' + unreadClass + '">' +
            '<p class="abec-notif-title">' + esc(n.title || 'Notification') + '</p>' +
            '<p class="abec-notif-message">' + esc(n.message || '') + '</p>' +
            '<p class="abec-notif-meta">' + esc(AbecApi.formatDate(n.createdAt)) + (isUnread(n.status) ? ' · Unread' : ' · Read') + '</p>' +
            '</button>';
        }).join('')
      : '<p class="abec-notif-empty">No notifications yet.</p>';

    list.querySelectorAll('.abec-notif-item').forEach(function (btn) {
      btn.addEventListener('click', async function (e) {
        e.preventDefault();
        e.stopPropagation();
        var id = btn.getAttribute('data-id');
        if (id) await AbecApi.put('/api/notifications/' + id + '/read');
         var route = btn.getAttribute('data-route') || '';
         var applicantId = btn.getAttribute('data-applicant-id') || '';
         var message = btn.getAttribute('data-message') || '';
        closePanel();
         if (route === 'documents') {
           var requestedType = message.replace(/^.*?\srequested\s+(.+?)\.?$/i, '$1').trim();
           var requestedName = message.replace(/\srequested\s+.+?\.?$/i, '').trim();
           var documentUrl = '/Views/Admin/DocumentManagement.html?view=requests';
           if (applicantId) documentUrl += '&applicantId=' + encodeURIComponent(applicantId);
           if (requestedType && requestedType !== message) documentUrl += '&requestType=' + encodeURIComponent(requestedType);
           if (requestedName && requestedName !== message && requestedName.toLowerCase() !== 'a student') documentUrl += '&requestName=' + encodeURIComponent(requestedName);
           window.location.href = documentUrl;
           return;
         }
         if (route === 'new-applicant') {
           window.location.href = '/Views/Admin/StudentsApplicants.html?status=pending' + (applicantId ? '&id=' + encodeURIComponent(applicantId) + '&highlight=' + encodeURIComponent(applicantId) : '');
           return;
         }
         if (route === 'expired' || route === 'declined') {
           window.location.href = '/Views/Admin/StudentsApplicants.html?status=rejected' + (applicantId ? '&id=' + encodeURIComponent(applicantId) + '&highlight=' + encodeURIComponent(applicantId) : '');
           return;
         }
         if (route === 'waitlisted') {
           window.location.href = '/Views/Admin/StudentsApplicants.html?status=waitlisted' + (applicantId ? '&id=' + encodeURIComponent(applicantId) + '&highlight=' + encodeURIComponent(applicantId) : '');
           return;
         }
        if (route === 'activation') {
           window.location.href = '/Views/Admin/AccountActivation.html' + (applicantId ? '?id=' + encodeURIComponent(applicantId) : '');
          return;
        }
        loadAdminNotifications();
      });
    });

    mountProfileMenu();
  }

  window.abecReloadAdminNotifications = loadAdminNotifications;
  window.AbecBatchChanges = {
    publish: function () {
      try { localStorage.setItem('abec-active-batch-revision', String(Date.now())); } catch (_) {}
    }
  };
  var knownActiveBatch;
  async function checkActiveBatchChange() {
    if (!/\/(AdminDashboard|BatchManagement|StudentsApplicants|AccountActivation|StudentArchive|Reports|CourseManagement|CourseSchedule|DocumentManagement)\.html$/i.test(location.pathname) || document.hidden) return;
    var result = await AbecApi.get('/api/batches/active');
    if (!result.success) return;
    var current = result.data ? result.data.batchId : 0;
    if (knownActiveBatch !== undefined && knownActiveBatch !== current) { location.reload(); return; }
    knownActiveBatch = current;
  }
  window.addEventListener('storage', function (event) {
    if (event.key === 'abec-active-batch-revision') checkActiveBatchChange();
  });
  window.addEventListener('focus', checkActiveBatchChange);

  function mountProfileMenu() {
    if (!window.AbecProfileMenu) return;
    if (document.body && (document.body.classList.contains('reports-page') || document.body.classList.contains('batch-management-page'))) return;
    AbecProfileMenu.mountAdmin();
  }

  function loadProfileMenuScript(done) {
    if (window.AbecProfileMenu) {
      done();
      return;
    }
    var s = document.createElement('script');
    s.src = '/wwwroot/js/abec-profile-menu.js';
    s.onload = done;
    s.onerror = done;
    document.head.appendChild(s);
  }

  function keepSidebarAccount() {
    var footer = document.querySelector('[data-purpose="main-sidebar"] .abec-sidebar-footer');
    if (!footer || footer.getAttribute('data-account-watch') === '1') return;
    footer.setAttribute('data-account-watch', '1');
    function show() {
      if (footer.classList.contains('hidden')) footer.classList.remove('hidden');
      if (footer.getAttribute('aria-hidden') === 'true') footer.removeAttribute('aria-hidden');
    }
    show();
    new MutationObserver(show).observe(footer, { attributes: true, attributeFilter: ['class', 'aria-hidden'] });
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (document.body && document.body.classList.contains('abec-app')) {
      AbecApi.requireRole('Admin');
      keepSidebarAccount();
      loadAdminNotifications();
      checkActiveBatchChange();
      setInterval(loadAdminNotifications, 30000);
      setInterval(checkActiveBatchChange, 30000);
      loadProfileMenuScript(mountProfileMenu);
    }
  });
})();
