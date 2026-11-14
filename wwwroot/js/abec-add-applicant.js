/* Opens the landing-page registration form inside Students & Applicants. */
(function () {
  'use strict';

  var ready = null;
  var refreshAfterClose = false;
  var refreshMessage = '';

  function pageMessage(text, kind) {
    window.AbecFeedback.inline(document.getElementById('records-message'), text, kind || 'info');
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = src;
      script.onload = function () { resolve(); };
      script.onerror = function () { reject(new Error('The registration form could not be loaded.')); };
      document.body.appendChild(script);
    });
  }

  function extractRegistrationCss(css) {
    var kept = [];
    var index = 0;
    while (index < css.length) {
      while (index < css.length && /\s/.test(css.charAt(index))) index += 1;
      if (index >= css.length) break;
      if (css.slice(index, index + 2) === '/*') {
        var commentEnd = css.indexOf('*/', index + 2);
        index = commentEnd < 0 ? css.length : commentEnd + 2;
        continue;
      }
      var brace = css.indexOf('{', index);
      if (brace < 0) break;
      var selector = css.slice(index, brace).toLowerCase();
      var depth = 0;
      var end = brace;
      for (; end < css.length; end += 1) {
        if (css.charAt(end) === '{') depth += 1;
        else if (css.charAt(end) === '}') {
          depth -= 1;
          if (depth === 0) {
            end += 1;
            break;
          }
        }
      }
      if (/enroll|modal-card|modal-pop|item-in|anim-stagger|tesda-/.test(selector)) {
        kept.push(css.slice(index, end));
      }
      index = end;
    }
    return kept.join('\n');
  }

  function registrationIsDirty() {
    var form = document.getElementById('enroll-wizard-form');
    if (!form) return false;
    var dirty = false;
    form.querySelectorAll('input, select, textarea').forEach(function (field) {
      if (field.type === 'button' || field.type === 'submit' || field.type === 'file' || field.type === 'hidden') return;
      if (field.type === 'radio' || field.type === 'checkbox') {
        if (field.checked && field.value !== 'no') dirty = true;
        return;
      }
      var value = String(field.value || '').trim();
      if (!value || value === '+63') return;
      dirty = true;
    });
    ['TOR', 'Form138', 'HonorableDismissal', 'GoodMoral', 'BirthCertificate'].forEach(function (id) {
      var slot = document.getElementById('enroll-status-' + id);
      if (slot && slot.textContent.trim()) dirty = true;
    });
    var documents = document.getElementById('enroll-credential-list');
    if (documents && /Remove/.test(documents.textContent || '')) dirty = true;
    var identity = document.getElementById('enroll-identity-file-display');
    if (identity && identity.textContent.trim()) dirty = true;
    return dirty;
  }

  function styleCloseButtons() {
    ['enroll-step-intro', 'enroll-step-form'].forEach(function (id) {
      var container = document.getElementById(id);
      if (!container) return;
      var button = container.querySelector('button[aria-label="Close"]');
      if (!button) return;
      button.type = 'button';
      button.classList.add('admin-enroll-close');
    });
  }

  async function mountRegistration() {
    var response = await fetch('../Home/LandingPage.html', { cache: 'no-store', redirect: 'error' });
    if (!response.ok) throw new Error('The registration form could not be loaded.');
    var html = await response.text();
    var parsed = new DOMParser().parseFromString(html, 'text/html');
    var sourceStyle = parsed.querySelector('style[data-purpose="custom-styling"]');
    if (sourceStyle) {
      var style = document.createElement('style');
      style.setAttribute('data-purpose', 'admin-registration-form');
      style.textContent = extractRegistrationCss(sourceStyle.textContent || '');
      document.head.appendChild(style);
    }
    var modal = parsed.getElementById('enroll-modal');
    var confirm = parsed.getElementById('enroll-close-confirm');
    if (!modal || !confirm) throw new Error('The registration form could not be loaded.');

    var host = document.createElement('div');
    host.id = 'admin-registration-host';
    host.appendChild(document.importNode(modal, true));
    host.appendChild(document.importNode(confirm, true));
    document.body.appendChild(host);

    var introTitle = document.getElementById('enroll-modal-title');
    if (introTitle) introTitle.textContent = 'Add New Applicant';
    var formTitle = document.querySelector('#enroll-step-form h3');
    if (formTitle) formTitle.textContent = 'Add New Applicant';
    styleCloseButtons();

    await loadScript('../../wwwroot/js/abec-enroll-modal.js?v=20261112security1');

    var originalRequestClose = window.requestCloseEnrollModal;
    window.requestCloseEnrollModal = function () {
      if (!registrationIsDirty()) {
        if (typeof window.confirmCloseEnrollModal === 'function') window.confirmCloseEnrollModal();
        return;
      }
      if (typeof originalRequestClose === 'function') originalRequestClose();
    };
    var originalClose = window.closeEnrollModal;
    window.closeEnrollModal = function () {
      if (typeof originalClose === 'function') originalClose();
      if (!refreshAfterClose) return;
      refreshAfterClose = false;
      var message = refreshMessage;
      refreshMessage = '';
      Promise.resolve(typeof window.abecReloadApplicants === 'function' ? window.abecReloadApplicants() : null)
        .then(function () {
          if (window.AbecRecords && typeof AbecRecords.reload === 'function') return AbecRecords.reload();
        })
        .then(function () { pageMessage(message, 'ok'); });
    };

    await loadScript('../../wwwroot/js/abec-landing.js?v=20261114registration2');
    await loadScript('../../wwwroot/js/abec-enroll-wizard.js?v=20261114registration2');
    if (window.AbecEnrollWizard) {
      window.AbecEnrollWizard.onSubmitted = function (result) {
        refreshAfterClose = true;
        refreshMessage = (result && result.message) || 'Application submitted. The new applicant is pending review.';
      };
    }
  }

  function ensureRegistration() {
    if (document.getElementById('enroll-wizard-form') && window.AbecEnrollWizard) return Promise.resolve();
    if (!ready) {
      ready = mountRegistration().catch(function (error) {
        ready = null;
        throw error;
      });
    }
    return ready;
  }

  function openRegistration() {
    var button = document.getElementById('add-applicant-btn');
    if (button) button.disabled = true;
    ensureRegistration().then(function () {
      if (typeof window.showEnrollStep === 'function') window.showEnrollStep('wizard');
      var modal = document.getElementById('enroll-modal');
      if (modal) {
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
      }
    }).catch(function (error) {
      pageMessage(error && error.message ? error.message : 'The registration form could not be opened.', 'error');
    }).finally(function () {
      if (button) button.disabled = false;
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var button = document.getElementById('add-applicant-btn');
    if (button) button.addEventListener('click', openRegistration);
  });
})();
