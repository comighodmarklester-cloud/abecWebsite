(function () {
  'use strict';

  var PAGES = [
    { href: 'StudentDashboard.html', label: 'Dashboard', key: 'studentdashboard' },
    { href: 'ClassSchedule.html', label: 'Training Schedule', key: 'classschedule' },
    { href: 'DocumentRequest.html', label: 'Documents', key: 'documentrequest' }
  ];

  window.AbecStudentBatch = {
    apply: function (profile) {
      var completed = profile.batchStatus === 'Completed' || profile.batchStatus === 'Closed';
      document.body.classList.toggle('batch-completed', completed);
      document.querySelectorAll('a[href*="ClassSchedule.html"]').forEach(function (a) { a.hidden = completed; });
      var main = document.querySelector('main.abec-main');
      if (!main) return;
      var status = document.getElementById('student-batch-status');
      if (document.body.hasAttribute('data-abec-hide-batch-banner')) {
        if (status) status.remove();
      } else {
        if (!status) { status = document.createElement('section'); status.id = 'student-batch-status'; status.setAttribute('role','status'); main.prepend(status); }
        status.textContent = 'Batch: ' + (profile.batchName || 'Unassigned') + (completed ? ' — Your batch has completed its training and assessment period. You can view and download your available documents on the Documents page.' : '');
      }
      if (completed && location.pathname.toLowerCase().indexOf('classschedule') >= 0) location.replace('/Views/Student/StudentDashboard.html');
    }
  };

  function currentKey() {
    var path = (window.location.pathname || '').toLowerCase();
    if (path.indexOf('classschedule') !== -1) return 'classschedule';
    if (path.indexOf('documentrequest') !== -1) return 'documentrequest';
    if (path.indexOf('usersettings') !== -1) return 'usersettings';
    return 'studentdashboard';
  }

  function currentLabel(key) {
    var match = PAGES.filter(function (page) { return page.key === key; })[0];
    if (match) return match.label;
    if (key === 'usersettings') return 'User Settings';
    return 'Dashboard';
  }

  function closeNav() {
    var menu = document.getElementById('student-nav-menu');
    var button = document.getElementById('student-nav-trigger');
    if (menu) menu.hidden = true;
    if (button) button.setAttribute('aria-expanded', 'false');
  }

  function mount() {
    document.querySelectorAll('aside.abec-sidebar, aside[data-purpose="main-sidebar"]').forEach(function (el) {
      el.remove();
    });
    document.body.classList.add('student-module');
    if (document.getElementById('student-shell')) return;
    var main = document.querySelector('main.abec-main');
    if (!main || !main.parentNode) return;

    var key = currentKey();
    var session = window.AbecApi && AbecApi.getSession();
    if (session && session.role === 'Student') AbecApi.get('/api/student/' + session.userId + '/profile').then(function (result) {
      if (result.success) window.AbecStudentBatch.apply(result.data);
    });

    var items = PAGES.map(function (page) {
      var active = page.key === key;
      return '<a class="student-nav-item' + (active ? ' is-active' : '') + '" role="menuitem" href="' + page.href + '"' +
        (active ? ' aria-current="page"' : '') + '>' + page.label + '</a>';
    }).join('');

    var shell = document.createElement('header');
    shell.id = 'student-shell';
    shell.className = 'student-shell';
    shell.innerHTML =
      '<a class="student-shell-brand" href="StudentDashboard.html">' + "<div class=\"abec-brand-lockup abec-sidebar-brand\">\r\n<div class=\"abec-brand-mark\">\r\n<div class=\"abec-brand-logo-spin\">\r\n<svg class=\"abec-brand-logo\" viewBox=\"0 0 128 128\" fill=\"none\" role=\"img\" aria-label=\"ABEC logo\">\r\n<defs>\r\n<linearGradient id=\"stushellCapLeft\" x1=\"16\" y1=\"22\" x2=\"64\" y2=\"74\" gradientUnits=\"userSpaceOnUse\">\r\n<stop stop-color=\"#1A3F6B\"/><stop offset=\"1\" stop-color=\"#0A2342\"/>\r\n</linearGradient>\r\n<linearGradient id=\"stushellCapRight\" x1=\"64\" y1=\"18\" x2=\"112\" y2=\"70\" gradientUnits=\"userSpaceOnUse\">\r\n<stop stop-color=\"#24507F\"/><stop offset=\"1\" stop-color=\"#16375F\"/>\r\n</linearGradient>\r\n<linearGradient id=\"stushellRibbonLeft\" x1=\"28\" y1=\"58\" x2=\"64\" y2=\"112\" gradientUnits=\"userSpaceOnUse\">\r\n<stop stop-color=\"#A32040\"/><stop offset=\"1\" stop-color=\"#6E1830\"/>\r\n</linearGradient>\r\n<linearGradient id=\"stushellRibbonRight\" x1=\"64\" y1=\"58\" x2=\"100\" y2=\"112\" gradientUnits=\"userSpaceOnUse\">\r\n<stop stop-color=\"#D4526A\"/><stop offset=\"1\" stop-color=\"#9B2744\"/>\r\n</linearGradient>\r\n<linearGradient id=\"stushellShine\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"0\">\r\n<stop offset=\"0\" stop-color=\"#FFFFFF\" stop-opacity=\"0\"/>\r\n<stop offset=\"0.45\" stop-color=\"#E8F4FF\" stop-opacity=\"0.15\"/>\r\n<stop offset=\"0.5\" stop-color=\"#FFFFFF\" stop-opacity=\"0.72\"/>\r\n<stop offset=\"0.55\" stop-color=\"#D6E8F7\" stop-opacity=\"0.15\"/>\r\n<stop offset=\"1\" stop-color=\"#FFFFFF\" stop-opacity=\"0\"/>\r\n</linearGradient>\r\n<clipPath id=\"stushellIconClip\">\r\n<path d=\"M64 20 L108 46 L64 70 L20 46 Z\"/>\r\n<circle cx=\"116\" cy=\"70\" r=\"8\"/>\r\n<path d=\"M108 44 L118 66 L114 66 L106 48 Z\"/>\r\n<path d=\"M30 62 L64 108 L64 88 L40 58 Z\"/>\r\n<path d=\"M98 62 L64 108 L64 88 L88 58 Z\"/>\r\n</clipPath>\r\n</defs>\r\n<g>\r\n<path d=\"M64 20 L64 70 L20 46 Z\" fill=\"url(#stushellCapLeft)\"/>\r\n<path d=\"M64 20 L108 46 L64 70 Z\" fill=\"url(#stushellCapRight)\"/>\r\n<path d=\"M64 20 L96 38 L64 34 Z\" fill=\"#2E5A88\" opacity=\"0.35\"/>\r\n<path d=\"M108 46 C110 52 114 58 116 62\" stroke=\"#8E2340\" stroke-width=\"3.2\" stroke-linecap=\"round\"/>\r\n<circle cx=\"116\" cy=\"70\" r=\"7\" fill=\"#B02A45\"/>\r\n<circle cx=\"114\" cy=\"68\" r=\"2.2\" fill=\"#F4C9D2\" opacity=\"0.7\"/>\r\n<path d=\"M30 62 L64 108 L64 88 L40 58 Z\" fill=\"url(#stushellRibbonLeft)\"/>\r\n<path d=\"M98 62 L64 108 L64 88 L88 58 Z\" fill=\"url(#stushellRibbonRight)\"/>\r\n</g>\r\n<g clip-path=\"url(#stushellIconClip)\">\r\n<rect class=\"abec-icon-shine\" x=\"-48\" y=\"8\" width=\"36\" height=\"112\" fill=\"url(#stushellShine)\"/>\r\n</g>\r\n</svg>\r\n</div>\r\n</div>\r\n<h1 class=\"abec-brand-name\">ABEC</h1>\r\n</div>" + '</a>' +
      '<div class="student-nav">' +
        '<button type="button" id="student-nav-trigger" class="student-nav-trigger" aria-expanded="false" aria-controls="student-nav-menu" aria-haspopup="menu">' +
          '<span id="student-nav-label">' + currentLabel(key) + '</span>' +
          '<svg class="student-nav-chevron" viewBox="0 0 20 20" aria-hidden="true"><path d="M4.5 7.5 L10 13 L15.5 7.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path></svg>' +
        '</button>' +
        '<div id="student-nav-menu" class="student-nav-menu" role="menu" hidden>' + items + '</div>' +
      '</div>' +
      '<div class="student-shell-actions" id="student-shell-actions">' +
        '<div class="abec-header-actions" id="student-header-actions"></div>' +
      '</div>';
    main.parentNode.insertBefore(shell, main);

    var bell = document.getElementById('student-notif-bell');
    var actions = document.getElementById('student-shell-actions');
    var account = document.getElementById('student-header-actions');
    if (bell && actions && account) actions.insertBefore(bell, account);

    var trigger = document.getElementById('student-nav-trigger');
    var menu = document.getElementById('student-nav-menu');
    trigger.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      var willOpen = menu.hidden;
      menu.hidden = !willOpen;
      trigger.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    });
    document.addEventListener('click', function (event) {
      if (!shell.contains(event.target)) closeNav();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeNav();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
