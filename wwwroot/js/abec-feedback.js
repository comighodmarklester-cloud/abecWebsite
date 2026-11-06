/* Shared ABEC loading indicator, toasts, and confirmation dialogs. */
(function (window) {
  'use strict';
  if (window.AbecFeedback) return;

  var STYLE = ''
    + '.abec-toast-stack{position:fixed;top:16px;right:16px;z-index:10050;display:flex;flex-direction:column;gap:10px;width:min(380px,calc(100vw - 32px));pointer-events:none}'
    + '.abec-toast{pointer-events:auto;display:flex;gap:12px;align-items:flex-start;background:#fff;border:1px solid #DCE6F1;border-left:4px solid #2563EB;border-radius:14px;box-shadow:0 10px 30px rgba(11,31,58,.16);padding:14px 14px 14px 12px;font-family:inherit;color:#172B4D;animation:abec-toast-in .28s ease}'
    + '.abec-toast.is-leaving{animation:abec-toast-out .22s ease forwards}'
    + '.abec-toast.is-success{border-left-color:#059669}.abec-toast.is-error{border-left-color:#DC2626}.abec-toast.is-warning{border-left-color:#D97706}.abec-toast.is-info{border-left-color:#2563EB}'
    + '.abec-toast-icon{width:28px;height:28px;border-radius:999px;display:flex;align-items:center;justify-content:center;flex:0 0 auto}'
    + '.abec-toast.is-success .abec-toast-icon{background:#ECFDF5;color:#059669}.abec-toast.is-error .abec-toast-icon{background:#FEF2F2;color:#DC2626}'
    + '.abec-toast.is-warning .abec-toast-icon{background:#FFFBEB;color:#D97706}.abec-toast.is-info .abec-toast-icon{background:#EFF6FF;color:#2563EB}'
    + '.abec-toast-copy{min-width:0;flex:1}.abec-toast-title{font-size:14px;font-weight:700;line-height:1.3}.abec-toast-text{margin-top:3px;font-size:13px;line-height:1.45;color:#475569}'
    + '.abec-toast-close{border:0;background:transparent;color:#64748B;font-size:18px;line-height:1;cursor:pointer;padding:0 2px}'
    + '.abec-load-pill{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:10040;display:none;align-items:center;gap:8px;background:#0B1F3A;color:#fff;border-radius:999px;padding:8px 14px;font-size:13px;font-weight:600;box-shadow:0 8px 24px rgba(11,31,58,.25)}'
    + '.abec-load-pill.is-on{display:inline-flex}'
    + '.abec-dots{display:inline-flex;gap:4px;align-items:center}'
    + '.abec-dots i{width:7px;height:7px;border-radius:999px;background:#059669;display:block;animation:abec-dot 1.05s ease-in-out infinite}'
    + '.abec-dots i:nth-child(2){animation-delay:.15s}.abec-dots i:nth-child(3){animation-delay:.3s}'
    + '@keyframes abec-dot{0%,100%{background:#059669;transform:translateY(0);opacity:.55}50%{background:#2563EB;transform:translateY(-3px);opacity:1}}'
    + '@keyframes abec-toast-in{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}'
    + '@keyframes abec-toast-out{to{opacity:0;transform:translateY(-6px)}}'
    + '.abec-confirm-back{position:fixed;inset:0;z-index:10060;background:rgba(11,31,58,.45);display:flex;align-items:center;justify-content:center;padding:16px}'
    + '.abec-confirm-card{width:min(440px,100%);background:#fff;border-radius:16px;border:1px solid #DCE6F1;box-shadow:0 18px 50px rgba(11,31,58,.25);padding:22px;font-family:inherit;color:#172B4D}'
    + '.abec-confirm-card h3{margin:0 0 8px;font-size:18px;font-weight:700}.abec-confirm-card p{margin:0;white-space:pre-wrap;font-size:14px;line-height:1.5;color:#334155}'
    + '.abec-confirm-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:18px}'
    + '.abec-confirm-actions button{border-radius:10px;padding:10px 14px;font-size:13px;font-weight:700;cursor:pointer}'
    + '.abec-confirm-cancel{background:#fff;color:#0B1F3A;border:1px solid #0B1F3A}.abec-confirm-ok{background:#0B1F3A;color:#fff;border:1px solid #0B1F3A}'
    + '.abec-inline-load{display:inline-flex;align-items:center;gap:8px}'
    + '@media (max-width:640px){.abec-toast-stack{top:10px;right:10px;left:10px;width:auto}}';

  var style = document.createElement('style');
  style.setAttribute('data-abec-feedback', '1');
  style.textContent = STYLE;
  document.head.appendChild(style);

  var stack = document.createElement('div');
  stack.className = 'abec-toast-stack';
  stack.setAttribute('aria-live', 'polite');
  var pill = document.createElement('div');
  pill.className = 'abec-load-pill';
  pill.innerHTML = '<span class="abec-load-label">Loading...</span><span class="abec-dots" aria-hidden="true"><i></i><i></i><i></i></span>';
  function mount() {
    if (!document.body) return;
    if (!stack.parentNode) document.body.appendChild(stack);
    if (!pill.parentNode) document.body.appendChild(pill);
  }
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);

  var icons = {
    success: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/></svg>',
    error: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5h.01"/></svg>',
    warning: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 4l8 14H4L12 4z"/><path d="M12 10v4M12 16.5h.01"/></svg>',
    info: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>'
  };

  function cleanText(value) {
    return String(value || '')
      .replace(/https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\S*/gi, '')
      .replace(/\b(?:localhost|127\.0\.0\.1)(?::\d+)?\b/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  function present(raw) {
    var text = cleanText(raw);
    if (/another record already uses this email/i.test(text)) {
      return { type: 'error', title: 'Email Already in Use', message: 'Another record already uses this email address.' };
    }
    if (/approved successfully/i.test(text) && /email/i.test(text) && /sent/i.test(text)) {
      return { type: 'success', title: 'Applicant Approved Successfully', message: 'The applicant has been approved. An approval email notification has been sent successfully.' };
    }
    if (/approved successfully/i.test(text)) {
      return { type: 'success', title: 'Applicant Approved Successfully', message: text };
    }
    if (/rejected/i.test(text) && /success/i.test(text)) {
      return { type: 'success', title: 'Applicant Updated', message: text };
    }
    var type = 'info';
    var title = 'Notice';
    if (/unable|failed|invalid|error|cannot|could not|already uses|not found|required|please /i.test(text)) {
      type = 'error';
      title = 'Unable to Complete';
    } else if (/warning|expire|careful/i.test(text)) {
      type = 'warning';
      title = 'Please Review';
    } else if (/success|saved|submitted|updated|confirmed|restored|archived|sent|completed/i.test(text)) {
      type = 'success';
      title = 'Completed';
    }
    return { type: type, title: title, message: text || 'The request finished.' };
  }

  function notify(options) {
    mount();
    options = options || {};
    var shaped = options.message && options.title ? options : present(options.message || options.title || '');
    var type = options.type || shaped.type || 'info';
    if (['success', 'error', 'warning', 'info'].indexOf(type) < 0) type = 'info';
    var title = options.title || shaped.title || 'Notice';
    var message = cleanText(options.message || shaped.message || '');
    if (!message && !title) return;
    while (stack.children.length >= 3) dismiss(stack.firstChild);
    var toast = document.createElement('div');
    toast.className = 'abec-toast is-' + type;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
    toast.innerHTML = '<div class="abec-toast-icon">' + (icons[type] || icons.info) + '</div>'
      + '<div class="abec-toast-copy"><div class="abec-toast-title"></div><div class="abec-toast-text"></div></div>'
      + '<button type="button" class="abec-toast-close" aria-label="Dismiss">&times;</button>';
    toast.querySelector('.abec-toast-title').textContent = title;
    toast.querySelector('.abec-toast-text').textContent = message;
    toast.querySelector('.abec-toast-close').addEventListener('click', function () { dismiss(toast); });
    stack.appendChild(toast);
    var life = typeof options.duration === 'number' ? options.duration : 5000;
    var timer = setTimeout(function () { dismiss(toast); }, life);
    toast._timer = timer;
  }

  function dismiss(toast) {
    if (!toast || toast._closing) return;
    toast._closing = true;
    clearTimeout(toast._timer);
    toast.classList.add('is-leaving');
    setTimeout(function () { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 220);
  }

  var loads = 0;
  function showLoader(label) {
    mount();
    loads += 1;
    pill.querySelector('.abec-load-label').textContent = (label || 'Loading') + '...';
    pill.classList.add('is-on');
  }
  function hideLoader() {
    loads = Math.max(0, loads - 1);
    if (loads === 0) pill.classList.remove('is-on');
  }

  function dotsHtml() {
    return '<span class="abec-dots" aria-hidden="true"><i></i><i></i><i></i></span>';
  }

  function buttonBusy(button, on, label) {
    if (!button) return;
    if (on) {
      if (!button.dataset.abecLabel) button.dataset.abecLabel = button.innerHTML;
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.innerHTML = '<span class="abec-inline-load">' + (label || 'Loading') + '... ' + dotsHtml() + '</span>';
      return;
    }
    button.disabled = false;
    button.removeAttribute('aria-busy');
    if (button.dataset.abecLabel) {
      button.innerHTML = button.dataset.abecLabel;
      delete button.dataset.abecLabel;
    }
  }

  function confirmDialog(options) {
    options = options || {};
    var title = options.title || 'Please confirm';
    var message = options.message || '';
    var confirmLabel = options.confirmLabel || 'Continue';
    var cancelLabel = options.cancelLabel || 'Cancel';
    return new Promise(function (resolve) {
      mount();
      var back = document.createElement('div');
      back.className = 'abec-confirm-back';
      back.innerHTML = '<div class="abec-confirm-card" role="dialog" aria-modal="true"><h3></h3><p></p><div class="abec-confirm-actions"><button type="button" class="abec-confirm-cancel"></button><button type="button" class="abec-confirm-ok"></button></div></div>';
      back.querySelector('h3').textContent = title;
      back.querySelector('p').textContent = message;
      back.querySelector('.abec-confirm-cancel').textContent = cancelLabel;
      back.querySelector('.abec-confirm-ok').textContent = confirmLabel;
      function finish(value) {
        if (back.parentNode) back.parentNode.removeChild(back);
        document.removeEventListener('keydown', onKey);
        resolve(value);
      }
      function onKey(event) {
        if (event.key === 'Escape') finish(false);
      }
      back.querySelector('.abec-confirm-cancel').addEventListener('click', function () { finish(false); });
      back.querySelector('.abec-confirm-ok').addEventListener('click', function () { finish(true); });
      back.addEventListener('click', function (event) { if (event.target === back) finish(false); });
      document.addEventListener('keydown', onKey);
      document.body.appendChild(back);
      back.querySelector('.abec-confirm-ok').focus();
    });
  }

  window.AbecFeedback = {
    notify: notify,
    confirm: confirmDialog,
    showLoader: showLoader,
    hideLoader: hideLoader,
    buttonBusy: buttonBusy,
    dotsHtml: dotsHtml
  };

  window.alert = function (message) {
    notify(present(message));
  };
})(window);
