/* Landing page — login dropdown, mobile nav, header scroll */
(function () {
  'use strict';

  var dropdown = document.getElementById('login-dropdown');
  var mobileDrawer = document.getElementById('mobile-nav-drawer');
  var hoverCapable = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var closeTimer = null;
  var CLOSE_DELAY_MS = 280;

  function closeDropdown() {
    if (!dropdown) return;
    var wasOpen = dropdown.classList.contains('is-open');
    dropdown.classList.remove('is-open');
    var trigger = dropdown.querySelector('.abec-login-trigger');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
    if (wasOpen && !dropdown.matches(':hover') && !dropdown.matches(':focus-within')) {
      playLoginSettle(trigger);
    }
  }

  function playLoginSettle(trigger) {
    if (!trigger) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    trigger.classList.remove('is-settling');
    void trigger.offsetWidth;
    trigger.classList.add('is-settling');
    var done = function (event) {
      if (event.animationName !== 'abec-login-settle') return;
      trigger.classList.remove('is-settling');
      trigger.removeEventListener('animationend', done);
    };
    trigger.addEventListener('animationend', done);
  }

  function openDropdown() {
    if (!dropdown) return;
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
    dropdown.classList.add('is-open');
    var trigger = dropdown.querySelector('.abec-login-trigger');
    if (trigger) trigger.setAttribute('aria-expanded', 'true');
  }

  function scheduleCloseDropdown() {
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = setTimeout(function () {
      closeTimer = null;
      closeDropdown();
    }, CLOSE_DELAY_MS);
  }

  function toggleDropdown() {
    if (!dropdown) return;
    if (dropdown.classList.contains('is-open')) closeDropdown();
    else openDropdown();
  }

  if (dropdown) {
    var trigger = dropdown.querySelector('.abec-login-trigger');

    if (trigger) {
      trigger.addEventListener('click', function (e) {
        e.stopPropagation();
        if (hoverCapable) {
          if (dropdown.classList.contains('is-open')) closeDropdown();
          else openDropdown();
        } else {
          toggleDropdown();
        }
      });
    }

    if (hoverCapable) {
      dropdown.addEventListener('mouseenter', function () {
        openDropdown();
        var active = dropdown.querySelector('.abec-login-trigger');
        if (active) active.classList.remove('is-settling');
      });
      dropdown.addEventListener('mouseleave', scheduleCloseDropdown);
    }

    dropdown.querySelectorAll('.abec-login-menu a').forEach(function (link) {
      link.addEventListener('click', closeDropdown);
    });
  }

  document.addEventListener('click', function (e) {
    if (dropdown && !dropdown.contains(e.target)) closeDropdown();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (closeTimer) clearTimeout(closeTimer);
      closeDropdown();
      closeMobileNav();
    }
  });

  function closeMobileNav() {
    if (!mobileDrawer) return;
    var wasOpen = mobileDrawer.classList.contains('is-open');
    mobileDrawer.classList.remove('is-open');
    mobileDrawer.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (menuToggle) {
      menuToggle.setAttribute('aria-expanded', 'false');
      menuToggle.setAttribute('aria-label', 'Open menu');
      if (wasOpen) menuToggle.focus();
    }
  }

  function openMobileNav() {
    if (!mobileDrawer) return;
    closeDropdown();
    mobileDrawer.classList.add('is-open');
    mobileDrawer.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    if (menuToggle) { menuToggle.setAttribute('aria-expanded', 'true'); menuToggle.setAttribute('aria-label', 'Close menu'); }
    var first = mobileDrawer.querySelector('button, a[href]');
    if (first) first.focus();
  }

  var menuToggle = document.getElementById('mobile-menu-toggle');
  if (menuToggle) {
    menuToggle.addEventListener('click', function () {
      if (mobileDrawer && mobileDrawer.classList.contains('is-open')) closeMobileNav();
      else openMobileNav();
    });
  }

  var backdrop = document.getElementById('mobile-nav-backdrop');
  if (backdrop) backdrop.addEventListener('click', closeMobileNav);

  if (mobileDrawer) {
    var closeButton = document.getElementById('mobile-nav-close');
    if (closeButton) closeButton.addEventListener('click', closeMobileNav);
    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Tab' || !mobileDrawer.classList.contains('is-open')) return;
      var items = Array.prototype.filter.call(mobileDrawer.querySelectorAll('a[href], button:not([disabled])'), function (el) { return el.getClientRects().length > 0; });
      var first = items[0], last = items[items.length - 1];
      if (!first) return;
      if (event.shiftKey && (document.activeElement === first || !mobileDrawer.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !mobileDrawer.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    });
    mobileDrawer.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', closeMobileNav);
    });
  }

  var nameHover = document.querySelector('.abec-name-hover');
  var brandLockup = document.querySelector('.abec-brand-lockup');
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var cycleTimer = null;
  var hideTimer = null;
  var brandTimersOn = true;
  var holdReveal = false;
  var SLIDE_MS = 500;
  var VISIBLE_MS = 15000;
  var HIDDEN_MS = 10000;

  function isBrandInteracting() {
    if (!nameHover) return false;
    return nameHover.matches(':hover') || nameHover.matches(':focus-within') || nameHover.classList.contains('is-open');
  }

  function clearBrandTimers() {
    brandTimersOn = false;
    if (cycleTimer) clearTimeout(cycleTimer);
    if (hideTimer) clearTimeout(hideTimer);
    cycleTimer = null;
    hideTimer = null;
  }

  function scheduleBrandReveal(afterSlideOut) {
    if (!brandTimersOn || reducedMotion || !brandLockup) return;
    if (cycleTimer) clearTimeout(cycleTimer);
    var wait = HIDDEN_MS + (afterSlideOut ? SLIDE_MS : 0);
    cycleTimer = setTimeout(playBrandReveal, wait);
  }

  function playBrandReveal() {
    cycleTimer = null;
    if (!brandTimersOn || !brandLockup) return;
    if (isBrandInteracting() || brandLockup.classList.contains('is-brand-reveal')) {
      scheduleBrandReveal(false);
      return;
    }
    brandLockup.classList.add('is-brand-reveal');
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(function () {
      hideTimer = null;
      if (isBrandInteracting()) {
        holdReveal = true;
      } else if (brandLockup) {
        brandLockup.classList.remove('is-brand-reveal');
      }
      scheduleBrandReveal(true);
    }, SLIDE_MS + VISIBLE_MS);
  }

  function releaseHeldReveal() {
    if (!holdReveal || isBrandInteracting() || !brandLockup) return;
    holdReveal = false;
    brandLockup.classList.remove('is-brand-reveal');
  }

  if (nameHover && !hoverCapable) {
    var nameLabel = nameHover.querySelector('.abec-brand-name');
    if (nameLabel) {
      nameLabel.addEventListener('click', function (e) {
        e.stopPropagation();
        nameHover.classList.toggle('is-open');
      });
    }
    document.addEventListener('click', function (e) {
      if (!nameHover.contains(e.target)) nameHover.classList.remove('is-open');
    });
  }

  if (nameHover) {
    nameHover.addEventListener('mouseleave', releaseHeldReveal);
    nameHover.addEventListener('focusout', function () {
      setTimeout(releaseHeldReveal, 0);
    });
  }

  if (!reducedMotion) scheduleBrandReveal();
  window.addEventListener('pagehide', clearBrandTimers);

  var header = document.getElementById('main-header');
  if (header) {
    var lastY = window.scrollY;
    var SCROLL_THRESHOLD = 10;
    var TOP_LOCK = 16;

    var onScroll = function () {
      var y = window.scrollY;
      var delta = y - lastY;

      if (y <= TOP_LOCK) {
        header.classList.remove('header-hidden');
        header.classList.remove('header-raised');
      } else if (delta > SCROLL_THRESHOLD) {
        header.classList.add('header-hidden');
        closeDropdown();
      } else if (delta < -SCROLL_THRESHOLD) {
        header.classList.remove('header-hidden');
        header.classList.add('header-raised');
      }

      lastY = y;
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }
})();
