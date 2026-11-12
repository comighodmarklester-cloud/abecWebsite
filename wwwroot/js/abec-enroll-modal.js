/* Shared registration modal controls for public and admin pages. */
function openEnrollModal() {
    // Re-open without wiping fields — data is only cleared after confirmed X close (or successful submit).
    var formStep = document.getElementById('enroll-step-form');
    var hasFormProgress = formStep && !formStep.classList.contains('hidden');
    if (!hasFormProgress) showEnrollStep('intro');
    document.getElementById('enroll-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  /** Backdrop / Escape: hide modal but keep entered registration data. */
  function dismissEnrollModal() {
    cancelCloseEnrollModal();
    document.getElementById('enroll-modal').classList.add('hidden');
    document.body.style.overflow = '';
  }

  function isEnrollCloseConfirmOpen() {
    var el = document.getElementById('enroll-close-confirm');
    return el && !el.classList.contains('hidden');
  }

  /** Intentional close via X: show designed confirmation dialog. */
  function requestCloseEnrollModal() {
    var confirmEl = document.getElementById('enroll-close-confirm');
    if (!confirmEl) return;
    confirmEl.classList.remove('hidden');
  }

  function cancelCloseEnrollModal() {
    var confirmEl = document.getElementById('enroll-close-confirm');
    if (confirmEl) confirmEl.classList.add('hidden');
  }

  function confirmCloseEnrollModal() {
    cancelCloseEnrollModal();
    if (typeof window.resetEnrollRegistrationForm === 'function') {
      window.resetEnrollRegistrationForm();
    }
    showEnrollStep('intro');
    document.getElementById('enroll-modal').classList.add('hidden');
    document.body.style.overflow = '';
  }

  // Kept for successful submit and any legacy callers that should fully close.
  function closeEnrollModal() {
    dismissEnrollModal();
  }

  function showEnrollStep(step) {
    var showForm = step === 'form' || step === 'wizard';
    document.getElementById('enroll-step-intro').classList.toggle('hidden', step !== 'intro');
    document.getElementById('enroll-step-form').classList.toggle('hidden', !showForm);
    if (showForm) {
      var contact = document.getElementById('enroll-contact');
      if (contact) {
        if (!contact.value) contact.value = '+63';
        var value = String(contact.value || '').trim();
        contact.classList.toggle('is-prefix-only', !value || value === '+63');
      }
    }
    if (step === 'wizard' && window.AbecEnrollWizard && typeof window.AbecEnrollWizard.goToStep === 'function') {
      var stepNum = typeof window.AbecEnrollWizard.getCurrentStep === 'function'
        ? window.AbecEnrollWizard.getCurrentStep() : 1;
      if (!stepNum || stepNum < 1) window.AbecEnrollWizard.goToStep(1);
      else window.AbecEnrollWizard.goToStep(stepNum);
    }
  }

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var privacy = document.getElementById('enroll-privacy-modal');
    if (privacy && !privacy.classList.contains('hidden')) {
      var privacyClose = document.getElementById('enroll-privacy-close');
      if (privacyClose) privacyClose.click();
      else {
        privacy.classList.add('hidden');
        privacy.setAttribute('aria-hidden', 'true');
      }
      return;
    }
    if (isEnrollCloseConfirmOpen()) {
      cancelCloseEnrollModal();
      return;
    }
    var modal = document.getElementById('enroll-modal');
    if (modal && !modal.classList.contains('hidden')) {
      dismissEnrollModal();
    }
  });
