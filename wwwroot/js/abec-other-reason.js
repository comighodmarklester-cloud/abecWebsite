/* Shared "Other" → Specify Reason behavior for ABEC selects */
(function () {
  'use strict';

  function isOtherValue(value) {
    return String(value == null ? '' : value).trim().toLowerCase() === 'other';
  }

  function formatDisplay(reason, specificReason) {
    var base = String(reason == null ? '' : reason).trim();
    var detail = String(specificReason == null ? '' : specificReason).trim();
    if (isOtherValue(base) && detail) return 'Other — ' + detail;
    return base || '—';
  }

  /**
   * Wire a select that includes Other to a specify-reason field.
   * @param {HTMLSelectElement|string} selectEl
   * @param {HTMLElement|string} wrapEl - container to show/hide
   * @param {HTMLTextAreaElement|HTMLInputElement|string} inputEl
   */
  function bindOtherReason(selectEl, wrapEl, inputEl) {
    var select = typeof selectEl === 'string' ? document.querySelector(selectEl) : selectEl;
    var wrap = typeof wrapEl === 'string' ? document.querySelector(wrapEl) : wrapEl;
    var input = typeof inputEl === 'string' ? document.querySelector(inputEl) : inputEl;
    if (!select || !wrap || !input) return;

    function sync() {
      var show = isOtherValue(select.value);
      wrap.classList.toggle('hidden', !show);
      input.required = show;
      if (!show) input.value = '';
    }

    select.addEventListener('change', sync);
    sync();
  }

  function requireIfOther(selectValue, specificValue, label) {
    if (!isOtherValue(selectValue)) {
      return { ok: true, specificReason: null };
    }
    var detail = String(specificValue == null ? '' : specificValue).trim();
    if (!detail) {
      return {
        ok: false,
        message: 'Please enter a ' + (label || 'specific reason') + ' when Other is selected.'
      };
    }
    return { ok: true, specificReason: detail };
  }

  window.AbecOtherReason = {
    isOtherValue: isOtherValue,
    formatDisplay: formatDisplay,
    bindOtherReason: bindOtherReason,
    requireIfOther: requireIfOther
  };
})();
