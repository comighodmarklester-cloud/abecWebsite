/* Student notifications popup — full inbox features (from former Notifications page) */
(function () {
  'use strict';
  if (!window.AbecApi) return;

  var STORAGE_KEY = 'abec-student-archived-notifications-v2';
  var LEGACY_STORAGE_KEY = 'abec-student-archived-notifications';
  try { localStorage.removeItem(LEGACY_STORAGE_KEY); } catch (e) { /* ignore */ }

  var currentFilter = 'all';
  var wired = false;

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function popup() { return document.getElementById('student-notifications-popup'); }
  function listEl() { return document.getElementById('notification-list'); }
  function archiveModal() { return document.getElementById('archive-modal'); }
  function archivedList() { return document.getElementById('archived-list'); }

  function cards() { return listEl() ? listEl().querySelectorAll('.notif-card') : []; }
  function archivedCards() { return archivedList() ? archivedList().querySelectorAll('.notif-card') : []; }
  function visibleCards() {
    return Array.from(cards()).filter(function (card) { return !card.classList.contains('hidden'); });
  }
  function selectedCards() {
    return Array.from(cards()).filter(function (card) {
      var cb = card.querySelector('.notif-checkbox');
      return cb && cb.checked;
    });
  }
  function selectedArchivedCards() {
    return Array.from(archivedCards()).filter(function (card) {
      var cb = card.querySelector('.notif-checkbox');
      return cb && cb.checked;
    });
  }

  function categorize(title, message) {
    var text = ((title || '') + ' ' + (message || '')).toLowerCase();
    if (text.indexOf('document') !== -1) return 'documents';
    if (text.indexOf('schedule') !== -1 || text.indexOf('class') !== -1 || text.indexOf('trainer') !== -1 || text.indexOf('course') !== -1) return 'course';
    if (text.indexOf('enroll') !== -1 || text.indexOf('slot') !== -1 || text.indexOf('application') !== -1 || text.indexOf('batch') !== -1 || text.indexOf('activation') !== -1) return 'enrollment';
    return 'system';
  }

  function categoryLabel(category) {
    if (category === 'documents') return 'Documents';
    if (category === 'course') return 'Course';
    if (category === 'enrollment') return 'Enrollment';
    return 'System';
  }

  function categoryIcon(category) {
    if (category === 'documents') {
      return { bg: '#e0f2fe', color: '#0B2747', path: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' };
    }
    if (category === 'course' || category === 'enrollment') {
      return { bg: '#f1f5f9', color: '#334155', path: 'M12 14l9-5-9-5-9 5 9 5z' };
    }
    return { bg: '#fff1f2', color: '#e11d48', path: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' };
  }

  function loadArchive() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch (e) { return []; }
  }

  function saveArchive(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }

  function archivedIds() {
    return loadArchive().map(function (item) { return String(item.notificationId || item.id); });
  }

  function showToast(message) {
    window.AbecFeedback.notify({ message: message });
  }

  function syncInboxEmpty() {
    var inboxEmpty = document.getElementById('inbox-empty');
    if (!inboxEmpty) return;
    inboxEmpty.classList.toggle('hidden', cards().length > 0);
  }

  function isUnread(card) {
    return card.getAttribute('data-read') !== 'true';
  }

  function updateBadge(list) {
    var countEl = document.getElementById('student-bell-count');
    if (!countEl) return;
    var unread = (list || []).filter(function (n) {
      return String(n.status || '').toLowerCase() !== 'read';
    }).length;
    countEl.textContent = String(unread);
    countEl.classList.toggle('hidden', unread === 0);
  }

  function markCardRead(card) {
    card.setAttribute('data-read', 'true');
    card.classList.remove('pl-1', 'is-unread');
    var bar = card.querySelector('.unread-bar');
    var dot = card.querySelector('.unread-dot');
    var label = card.querySelector('.notif-unread-label');
    var btn = card.querySelector('.notif-mark-read');
    if (bar) bar.remove();
    if (dot) dot.remove();
    if (label) label.remove();
    if (btn) btn.remove();
  }

  async function markCardReadApi(card) {
    if (!card || !isUnread(card)) return false;
    var id = card.getAttribute('data-id');
    if (!id) {
      markCardRead(card);
      syncSelectionUi();
      refreshBadgeOnly();
      return true;
    }
    var result = await AbecApi.put('/api/notifications/' + id + '/read');
    if (!result || !result.success) {
      showToast((result && result.message) || 'Could not mark notification as read.');
      return false;
    }
    markCardRead(card);
    syncSelectionUi();
    await refreshBadgeOnly();
    return true;
  }

  function buildMainCard(item) {
    var icon = categoryIcon(item.category);
    var article = document.createElement('article');
    var isRead = item.read !== false;
    article.className = 'notif-card relative rounded-xl border shadow-sm overflow-hidden' + (isRead ? '' : ' pl-1 is-unread');
    article.setAttribute('data-category', item.category || 'system');
    article.setAttribute('data-read', isRead ? 'true' : 'false');
    if (item.notificationId) article.setAttribute('data-id', String(item.notificationId));
    if (item.id) article.setAttribute('data-archived-id', String(item.id));
    if (item.studentId) article.setAttribute('data-student-id', String(item.studentId));
    if (item.applicantId) article.setAttribute('data-applicant-id', String(item.applicantId));
    article.setAttribute('data-raw-title', item.rawTitle || item.title || '');
    article.setAttribute('data-raw-message', item.rawMessage || item.body || '');
    article.innerHTML =
      (isRead ? '' : '<div class="absolute left-0 top-0 bottom-0 w-1 unread-bar" style="background-color:#2563eb;"></div>') +
      '<div class="flex gap-3 p-3.5">' +
        '<label class="notif-check pt-1"><input type="checkbox" class="notif-checkbox" aria-label="Select notification"/></label>' +
        '<div class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style="background-color:' + icon.bg + '; color:' + icon.color + ';">' +
          '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="' + icon.path + '" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg>' +
        '</div>' +
        '<div class="min-w-0 flex-1">' +
          '<div class="flex items-start justify-between gap-2">' +
            '<h3 class="notif-title text-sm font-bold"></h3>' +
            '<span class="notif-meta shrink-0 text-[11px] whitespace-nowrap"></span>' +
          '</div>' +
          '<p class="notif-body text-xs mt-1 leading-relaxed"></p>' +
          '<div class="flex flex-wrap items-center gap-2 mt-2 meta-row"></div>' +
          (isRead
            ? ''
            : '<button type="button" class="notif-mark-read">' +
                '<svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg>' +
                'Mark as Read' +
              '</button>') +
        '</div>' +
      '</div>';
    article.querySelector('.notif-title').textContent = item.title || '';
    article.querySelector('.notif-body').textContent = item.body || '';
    article.querySelector('.notif-meta').textContent = item.meta || '';
    var row = article.querySelector('.meta-row');
    if (!isRead) {
      var unreadLabel = document.createElement('span');
      unreadLabel.className = 'notif-unread-label';
      unreadLabel.innerHTML = '<span class="unread-dot w-1.5 h-1.5 rounded-full" style="background:#2563eb;"></span>Unread';
      row.appendChild(unreadLabel);
    }
    if (item.tag) {
      var tag = document.createElement('span');
      tag.className = 'notif-tag inline-flex items-center rounded-full text-[10px] font-bold uppercase tracking-wide px-2.5 py-1';
      tag.textContent = item.tag;
      row.appendChild(tag);
    }
    if (item.ref) {
      var ref = document.createElement('span');
      ref.className = 'notif-ref text-xs font-medium';
      ref.textContent = item.ref;
      row.appendChild(ref);
    }
    return article;
  }

  function mapApiToItem(n) {
    var category = categorize(n.title, n.message);
    return {
      notificationId: n.notificationId,
      category: category,
      read: String(n.status || '').toLowerCase() === 'read',
      title: (window.AbecApi && AbecApi.displayCourseName) ? (AbecApi.displayCourseName(n.title || '') || 'Notification') : (n.title || 'Notification'),
      body: (window.AbecApi && AbecApi.displayCourseName) ? AbecApi.displayCourseName(n.message || '') : (n.message || ''),
      meta: AbecApi.formatDate(n.createdAt),
      tag: categoryLabel(category),
      ref: '',
      studentId: n.studentId,
      applicantId: n.applicantId,
      rawTitle: n.title || '',
      rawMessage: n.message || ''
    };
  }

  function serializeCard(card) {
    var title = (card.querySelector('.notif-title') || {}).textContent || '';
    var body = (card.querySelector('.notif-body') || {}).textContent || '';
    var metaEl = card.querySelector('.notif-meta');
    var meta = metaEl ? metaEl.textContent.replace(/\s+/g, ' ').trim() : '';
    var tag = (card.querySelector('.notif-tag') || {}).textContent || '';
    var ref = (card.querySelector('.notif-ref') || {}).textContent || '';
    var notificationId = card.getAttribute('data-id');
    return {
      id: card.getAttribute('data-archived-id') || ('arch-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)),
      notificationId: notificationId,
      category: card.getAttribute('data-category') || 'system',
      read: card.getAttribute('data-read') === 'true',
      title: title.trim(),
      body: body.trim(),
      meta: meta,
      tag: tag.trim(),
      ref: ref.trim(),
      studentId: card.getAttribute('data-student-id') || '',
      applicantId: card.getAttribute('data-applicant-id') || '',
      rawTitle: card.getAttribute('data-raw-title') || title.trim(),
      rawMessage: card.getAttribute('data-raw-message') || body.trim(),
      archivedAt: new Date().toISOString()
    };
  }

  function applyFilter(filter) {
    currentFilter = filter || 'all';
    Array.from(cards()).forEach(function (card) {
      var category = card.getAttribute('data-category');
      var show = currentFilter === 'all' || category === currentFilter;
      card.classList.toggle('hidden', !show);
    });
    syncSelectionUi();
  }

  function setActiveFilter(activeBtn) {
    document.querySelectorAll('.notif-filter').forEach(function (b) { b.classList.remove('is-active'); });
    if (activeBtn) activeBtn.classList.add('is-active');
  }

  function willRestoreArchive() {
    return archiveModal() && archiveModal().classList.contains('is-open') && selectedArchivedCards().length > 0;
  }

  function updateArchiveButton() {
    var btnArchiveLabel = document.getElementById('btn-archive-label');
    var btnRestoreSelected = document.getElementById('btn-restore-selected');
    if (btnArchiveLabel) {
      btnArchiveLabel.textContent = willRestoreArchive() ? 'Restore Notifications' : 'Archive Notifications';
    }
    if (btnRestoreSelected) {
      btnRestoreSelected.classList.toggle('hidden', selectedArchivedCards().length === 0);
    }
  }

  function syncSelectionUi() {
    var selectionCount = document.getElementById('selection-count');
    var bulkActions = document.getElementById('bulk-actions');
    var btnSelectAllLabel = document.getElementById('btn-select-all-label');
    var btnSelectAll = document.getElementById('btn-select-all');
    var btnBulkMarkRead = document.getElementById('btn-bulk-mark-read');
    var btnBulkMarkReadWrap = document.getElementById('btn-bulk-mark-read-wrap');
    if (!selectionCount) return;

    var selected = selectedCards();
    var selectedArch = selectedArchivedCards();
    var visible = visibleCards();
    var allSelected = visible.length > 0 && visible.every(function (card) {
      var cb = card.querySelector('.notif-checkbox');
      return cb && cb.checked;
    });

    selected.forEach(function (card) { card.classList.add('is-selected'); });
    Array.from(cards()).forEach(function (card) {
      var cb = card.querySelector('.notif-checkbox');
      if (!cb || !cb.checked) card.classList.remove('is-selected');
    });
    selectedArch.forEach(function (card) { card.classList.add('is-selected'); });
    Array.from(archivedCards()).forEach(function (card) {
      var cb = card.querySelector('.notif-checkbox');
      if (!cb || !cb.checked) card.classList.remove('is-selected');
    });

    var totalSelected = selected.length + selectedArch.length;
    selectionCount.textContent = totalSelected + ' selected';
    if (bulkActions) bulkActions.classList.toggle('is-visible', selected.length > 0);
    if (btnSelectAllLabel) btnSelectAllLabel.textContent = allSelected ? 'Deselect All' : 'Select All';
    if (btnSelectAll) btnSelectAll.style.backgroundColor = allSelected ? '#334155' : '#059669';

    var markEnabled = selected.length > 0 && selected.every(isUnread);
    if (btnBulkMarkRead) {
      btnBulkMarkRead.classList.toggle('is-disabled', !markEnabled);
      btnBulkMarkRead.disabled = !markEnabled;
    }
    if (btnBulkMarkReadWrap) btnBulkMarkReadWrap.classList.toggle('is-blocked', selected.length > 0 && !markEnabled);
    updateArchiveButton();
  }

  function clearAllSelections() {
    document.querySelectorAll('.notif-checkbox').forEach(function (cb) { cb.checked = false; });
    document.querySelectorAll('.notif-card.is-selected').forEach(function (card) { card.classList.remove('is-selected'); });
    syncSelectionUi();
  }

  function setSelectMode(on) {
    var root = popup();
    if (!root) return;
    root.classList.toggle('select-mode', on);
    var label = document.getElementById('btn-select-mode-label');
    if (label) label.textContent = on ? 'Cancel' : 'Select';
    if (!on) clearAllSelections();
    else syncSelectionUi();
  }

  function toggleCardSelection(card) {
    var cb = card.querySelector('.notif-checkbox');
    if (!cb) return;
    cb.checked = !cb.checked;
    syncSelectionUi();
  }

  function openDocDetail(card) {
    var detailModal = document.getElementById('doc-detail-modal');
    if (!detailModal) return;
    var title = (card.querySelector('.notif-title') || {}).textContent || 'Document Request';
    document.getElementById('doc-detail-title').textContent = title.trim();
    var metaEl = card.querySelector('.notif-meta');
    document.getElementById('doc-detail-time').textContent = metaEl
      ? metaEl.textContent.replace(/\s+/g, ' ').trim() || '—'
      : '—';
    var body = (card.querySelector('.notif-body') || {}).textContent || '';
    document.getElementById('doc-detail-body').textContent = body.trim() || 'Details for this document request will appear here when available.';
    detailModal.classList.add('is-open');
    if (isUnread(card)) markCardReadApi(card);
  }

  function closeDocDetail() {
    var detailModal = document.getElementById('doc-detail-modal');
    if (!detailModal) return;
    detailModal.classList.remove('is-open');
  }

  function moveCardsToArchive(cardList) {
    if (!cardList.length) return;
    var stored = loadArchive();
    cardList.forEach(function (card) {
      stored.unshift(serializeCard(card));
      card.remove();
    });
    saveArchive(stored);
    renderArchived();
    syncInboxEmpty();
    syncSelectionUi();
    refreshBadgeOnly();
  }

  function restoreArchivedItems(itemsToRestore) {
    if (!itemsToRestore.length || !listEl()) return;
    var remaining = loadArchive().filter(function (item) {
      return !itemsToRestore.some(function (r) { return r.id === item.id; });
    });
    itemsToRestore.slice().reverse().forEach(function (item) {
      listEl().appendChild(buildMainCard(item));
    });
    saveArchive(remaining);
    renderArchived();
    applyFilter(currentFilter);
    syncInboxEmpty();
    syncSelectionUi();
  }

  function renderArchived() {
    var list = archivedList();
    var archivedCount = document.getElementById('archived-count');
    var archiveEmpty = document.getElementById('archive-empty');
    if (!list) return;
    var items = loadArchive();
    list.innerHTML = '';
    if (archivedCount) archivedCount.textContent = items.length + ' stored';
    if (!items.length) {
      if (archiveEmpty) archiveEmpty.classList.remove('hidden');
      updateArchiveButton();
      return;
    }
    if (archiveEmpty) archiveEmpty.classList.add('hidden');
    items.forEach(function (item) {
      var article = document.createElement('article');
      article.className = 'notif-card relative rounded-xl border shadow-sm overflow-hidden';
      article.setAttribute('data-archived-id', item.id);
      if (item.notificationId) article.setAttribute('data-id', String(item.notificationId));
      article.setAttribute('data-category', item.category || 'system');
      article.setAttribute('data-read', item.read === false ? 'false' : 'true');
      if (item.studentId) article.setAttribute('data-student-id', String(item.studentId));
      if (item.applicantId) article.setAttribute('data-applicant-id', String(item.applicantId));
      article.setAttribute('data-raw-title', item.rawTitle || item.title || '');
      article.setAttribute('data-raw-message', item.rawMessage || item.body || '');
      article.innerHTML =
        '<div class="flex gap-4 p-5">' +
          '<label class="notif-check pt-1"><input type="checkbox" class="notif-checkbox" aria-label="Select archived notification"/></label>' +
          '<div class="w-11 h-11 rounded-lg flex items-center justify-center shrink-0" style="background-color:#f1f5f9; color:#64748b;">' +
            '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg>' +
          '</div>' +
          '<div class="min-w-0 flex-1">' +
            '<div class="flex items-start justify-between gap-3">' +
              '<h3 class="notif-title text-sm font-bold"></h3>' +
              '<span class="notif-meta shrink-0 text-xs whitespace-nowrap"></span>' +
            '</div>' +
            '<p class="notif-body text-sm mt-1 leading-relaxed"></p>' +
            '<div class="flex flex-wrap items-center gap-2 mt-3">' +
              (item.tag ? '<span class="notif-tag inline-flex items-center rounded-full text-[10px] font-bold uppercase tracking-wide px-2.5 py-1"></span>' : '') +
              (item.ref ? '<span class="notif-ref text-xs font-medium"></span>' : '') +
              '<span class="inline-flex items-center rounded-full text-[10px] font-bold uppercase tracking-wide px-2.5 py-1" style="background-color:#e2e8f0; color:#475569;">Archived</span>' +
            '</div>' +
          '</div>' +
        '</div>';
      article.querySelector('.notif-title').textContent = item.title;
      article.querySelector('.notif-body').textContent = item.body;
      article.querySelector('.notif-meta').textContent = item.meta || 'Archived';
      var tagEl = article.querySelector('.notif-tag');
      if (tagEl) tagEl.textContent = item.tag;
      var refEl = article.querySelector('.notif-ref');
      if (refEl) refEl.textContent = item.ref;
      list.appendChild(article);
    });
    updateArchiveButton();
  }

  function openArchiveModal() {
    renderArchived();
    var modal = archiveModal();
    if (!modal) return;
    modal.classList.add('is-open');
    setSelectMode(true);
  }

  function closeArchiveModal() {
    var modal = archiveModal();
    if (!modal) return;
    modal.classList.remove('is-open');
    Array.from(archivedCards()).forEach(function (card) {
      var cb = card.querySelector('.notif-checkbox');
      if (cb) cb.checked = false;
      card.classList.remove('is-selected');
    });
    syncSelectionUi();
  }

  function onCardAreaClick(e) {
    var markBtn = e.target.closest('.notif-mark-read');
    if (markBtn) {
      e.preventDefault();
      e.stopPropagation();
      var markCard = markBtn.closest('.notif-card');
      if (markCard && isUnread(markCard)) markCardReadApi(markCard);
      return;
    }

    if (e.target.closest('a, button')) return;
    var card = e.target.closest('.notif-card');
    if (!card) return;
    if (e.target.closest('.notif-check')) return;

    var inInbox = listEl() && listEl().contains(card);
    var inArchive = archivedList() && archivedList().contains(card);
    if (!inInbox && !inArchive) return;

    if (popup() && popup().classList.contains('select-mode')) {
      e.preventDefault();
      toggleCardSelection(card);
      return;
    }

    e.preventDefault();
    navigateFromNotification(card);
  }

  function notificationText(card) {
    return {
      title: card.getAttribute('data-raw-title') || ((card.querySelector('.notif-title') || {}).textContent || ''),
      message: card.getAttribute('data-raw-message') || ((card.querySelector('.notif-body') || {}).textContent || '')
    };
  }

  function navigateFromNotification(card) {
    var text = notificationText(card);
    var combined = (text.title + ' ' + text.message).toLowerCase();
    var url;
    if (combined.indexOf('document') !== -1) {
      var docMatch = text.message.match(/your\s+(.+?)\s+request\s+(?:is|was|has been)/i) || text.message.match(/request\s+for\s+(.+?)\s+has been/i);
      var docType = docMatch ? docMatch[1].trim() : '';
      url = '/Views/Student/DocumentRequest.html?requestType=' + encodeURIComponent(docType);
    } else if (combined.indexOf('schedule') !== -1 || combined.indexOf('class') !== -1 || combined.indexOf('trainer') !== -1 || combined.indexOf('room') !== -1) {
      var dateMatch = text.message.match(/on\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})/i);
      url = '/Views/Student/ClassSchedule.html' + (dateMatch ? '?highlightDate=' + encodeURIComponent(dateMatch[1]) : '');
    } else {
      url = '/Views/Student/StudentDashboard.html?highlight=status#header-status-chip';
    }
    markCardReadApi(card).then(function () {
      window.location.href = url;
    });
  }

  function restoreSelectedFromArchive() {
    var selectedArch = selectedArchivedCards();
    if (!selectedArch.length) return;
    var ids = selectedArch.map(function (card) { return card.getAttribute('data-archived-id'); });
    var toRestore = loadArchive().filter(function (item) { return ids.indexOf(item.id) !== -1; });
    restoreArchivedItems(toRestore);
    showToast('Selected notifications restored to inbox.');
    updateArchiveButton();
  }

  async function renderInboxFromApi() {
    var session = AbecApi.getSession();
    var host = listEl();
    if (!host || !session) return;

    host.innerHTML = '<p id="inbox-empty" class="px-4 py-12 text-center text-sm" style="color:#64748b;">Loading notifications...</p>';
    var result = await AbecApi.get('/api/notifications/student/' + session.userId);
    if (!result.success) {
      host.innerHTML = '<p id="inbox-empty" class="px-4 py-12 text-center text-sm text-red-600">Unable to load notifications.</p>';
      updateBadge([]);
      return;
    }

    var archived = archivedIds();
    var items = (result.data || [])
      .filter(function (n) { return archived.indexOf(String(n.notificationId)) === -1; })
      .map(mapApiToItem);

    updateBadge((result.data || []).filter(function (n) {
      return archived.indexOf(String(n.notificationId)) === -1;
    }));
    host.innerHTML = '';
    if (!items.length) {
      host.innerHTML = '<p id="inbox-empty" class="px-3 py-10 text-center text-sm" style="color:#64748b;">No notifications yet.</p>';
      syncSelectionUi();
      return;
    }

    items.forEach(function (item) {
      host.appendChild(buildMainCard(item));
    });
    applyFilter(currentFilter);
    syncInboxEmpty();
    syncSelectionUi();
  }

  async function refreshBadgeOnly() {
    var session = AbecApi.getSession();
    if (!session) return;
    var result = await AbecApi.get('/api/notifications/student/' + session.userId);
    if (!result.success) return;
    var archived = archivedIds();
    var visible = (result.data || []).filter(function (n) {
      return archived.indexOf(String(n.notificationId)) === -1;
    });
    updateBadge(visible);
  }

  function setBellExpanded(open) {
    var bellBtn = document.getElementById('student-bell-btn');
    if (bellBtn) bellBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function positionPopup() {
    var root = popup();
    var bell = document.getElementById('student-bell-btn');
    if (!root || !bell) return;

    var rect = bell.getBoundingClientRect();
    var gap = 8;
    var margin = 12;
    var width = Math.min(416, window.innerWidth - margin * 2);
    var height = Math.min(512, window.innerHeight - margin * 2);
    var top = rect.bottom + gap;
    if (top + height > window.innerHeight - margin) {
      top = Math.max(margin, rect.top - gap - height);
    }
    var left = rect.right - width;
    if (left < margin) left = margin;
    if (left + width > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - margin - width);
    }

    root.style.width = width + 'px';
    root.style.height = height + 'px';
    root.style.top = top + 'px';
    root.style.left = left + 'px';
    root.style.right = 'auto';
  }

  function openPopup() {
    var root = popup();
    if (!root) return;
    positionPopup();
    root.classList.add('is-open');
    setBellExpanded(true);
    setSelectMode(false);
    renderInboxFromApi();
  }

  function closePopup() {
    var root = popup();
    if (!root) return;
    closeDocDetail();
    closeArchiveModal();
    setSelectMode(false);
    root.classList.remove('is-open');
    setBellExpanded(false);
  }

  function togglePopup() {
    var root = popup();
    if (!root) return;
    if (root.classList.contains('is-open')) closePopup();
    else openPopup();
  }

  function wireUi() {
    if (wired) return;
    if (!popup()) return;
    wired = true;

    document.querySelectorAll('.notif-filter').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setActiveFilter(btn);
        applyFilter(btn.getAttribute('data-filter'));
      });
    });

    if (listEl()) {
      listEl().addEventListener('change', function (e) {
        if (e.target && e.target.classList.contains('notif-checkbox')) syncSelectionUi();
      });
      listEl().addEventListener('click', onCardAreaClick);
    }
    if (archivedList()) {
      archivedList().addEventListener('change', function (e) {
        if (e.target && e.target.classList.contains('notif-checkbox')) syncSelectionUi();
      });
      archivedList().addEventListener('click', onCardAreaClick);
    }

    document.querySelectorAll('[data-close-notif-popup]').forEach(function (el) {
      el.addEventListener('click', closePopup);
    });
    document.querySelectorAll('[data-close-doc-detail]').forEach(function (el) {
      el.addEventListener('click', closeDocDetail);
    });
    document.querySelectorAll('[data-close-archive-modal]').forEach(function (el) {
      el.addEventListener('click', closeArchiveModal);
    });

    var btnBack = document.getElementById('btn-back-to-notifications');
    if (btnBack) btnBack.addEventListener('click', closeArchiveModal);

    var btnSelectMode = document.getElementById('btn-select-mode');
    if (btnSelectMode) {
      btnSelectMode.addEventListener('click', function () {
        setSelectMode(!(popup() && popup().classList.contains('select-mode')));
      });
    }

    var btnSelectAll = document.getElementById('btn-select-all');
    if (btnSelectAll) {
      btnSelectAll.addEventListener('click', function () {
        var visible = visibleCards();
        var allSelected = visible.length > 0 && visible.every(function (card) {
          var cb = card.querySelector('.notif-checkbox');
          return cb && cb.checked;
        });
        visible.forEach(function (card) {
          var cb = card.querySelector('.notif-checkbox');
          if (cb) cb.checked = !allSelected;
        });
        syncSelectionUi();
      });
    }

    var btnBulkMarkReadWrap = document.getElementById('btn-bulk-mark-read-wrap');
    if (btnBulkMarkReadWrap) {
      btnBulkMarkReadWrap.addEventListener('click', function () {
        var selected = selectedCards();
        if (!selected.length) return;
        if (!selected.every(isUnread)) showToast('Mark as Read is only available for unread notifications.');
      });
    }

    var btnBulkMarkRead = document.getElementById('btn-bulk-mark-read');
    if (btnBulkMarkRead) {
      btnBulkMarkRead.addEventListener('click', async function () {
        var selected = selectedCards();
        if (!selected.length) return;
        if (!selected.every(isUnread)) {
          showToast('Mark as Read is only available for unread notifications.');
          return;
        }
        for (var i = 0; i < selected.length; i++) {
          await markCardReadApi(selected[i]);
        }
        showToast('Selected notifications marked as read.');
      });
    }

    var btnBulkClearRead = document.getElementById('btn-bulk-clear-read');
    if (btnBulkClearRead) {
      btnBulkClearRead.addEventListener('click', function () {
        var selected = selectedCards().filter(function (card) { return !isUnread(card); });
        if (!selected.length) return;
        moveCardsToArchive(selected);
        showToast('Selected read notifications were moved to Archive.');
      });
    }

    var btnRestoreSelected = document.getElementById('btn-restore-selected');
    if (btnRestoreSelected) btnRestoreSelected.addEventListener('click', restoreSelectedFromArchive);

    var btnArchive = document.getElementById('btn-archive');
    if (btnArchive) {
      btnArchive.addEventListener('click', function () {
        if (archiveModal() && archiveModal().classList.contains('is-open')) {
          if (selectedArchivedCards().length > 0) {
            restoreSelectedFromArchive();
            return;
          }
          closeArchiveModal();
          return;
        }
        var selectedMain = selectedCards();
        if (selectedMain.length > 0) {
          moveCardsToArchive(selectedMain);
          showToast('Selected notifications moved to Archive.');
        }
        openArchiveModal();
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var docModal = document.getElementById('doc-detail-modal');
      if (docModal && docModal.classList.contains('is-open')) {
        closeDocDetail();
        return;
      }
      if (archiveModal() && archiveModal().classList.contains('is-open')) {
        closeArchiveModal();
        return;
      }
      if (popup() && popup().classList.contains('is-open')) closePopup();
    });

    var bellBtn = document.getElementById('student-bell-btn');
    if (bellBtn) {
      bellBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        togglePopup();
      });
    }

    document.addEventListener('click', function (e) {
      var root = popup();
      if (!root || !root.classList.contains('is-open')) return;
      if (root.contains(e.target)) return;
      if (e.target.closest('#student-bell-btn')) return;
      if (e.target.closest('#archive-modal') || e.target.closest('#doc-detail-modal')) return;
      closePopup();
    });

    window.addEventListener('resize', function () {
      if (popup() && popup().classList.contains('is-open')) positionPopup();
    });
  }

  window.abecOpenStudentNotifications = openPopup;
  window.abecRefreshStudentNotifBadge = refreshBadgeOnly;

  document.addEventListener('DOMContentLoaded', function () {
    if (!popup()) return;
    wireUi();
    refreshBadgeOnly();
    setInterval(refreshBadgeOnly, 30000);
    if (window.location.hash === '#notifications') {
      AbecApi.consumePageAction([], '#notifications');
      openPopup();
    }
  });
})();
