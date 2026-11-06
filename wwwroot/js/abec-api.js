/* ABEC shared API client — preserves existing UI, wires backend calls. */
(function () {
  if (window.AbecFeedback) return;
  var feedbackSrc = '/wwwroot/js/abec-feedback.js?v=20261031ux1';
  var current = document.currentScript;
  if (current && current.src) feedbackSrc = current.src.replace(/abec-api\.js[^#]*/, 'abec-feedback.js?v=20261031ux1');
  document.write('<script src="' + feedbackSrc + '"><\/script>');
})();
(function (window) {
  'use strict';

  var APP_ORIGIN = 'http://localhost:5188';

  function resolveBaseUrl() {
    var protocol = window.location.protocol;
    var host = (window.location.hostname || '').toLowerCase();
    var port = String(window.location.port || '');

    // A saved HTML file has no server. API calls go to the ABEC app.
    if (protocol !== 'http:' && protocol !== 'https:') return APP_ORIGIN;

    // Live Server only previews files. It does not host the API.
    if ((host === 'localhost' || host === '127.0.0.1') && (port === '5500' || port === '5501')) {
      return APP_ORIGIN;
    }

    // The page was loaded from a web server. Call that same server.
    return window.location.origin;
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function unreachableMessage() {
    return 'The ABEC server could not be reached. Check your connection and try again.';
  }

  var pendingLoads = 0;
  var loadTimer = null;
  function trackLoadStart() {
    pendingLoads += 1;
    if (pendingLoads === 1) {
      clearTimeout(loadTimer);
      loadTimer = setTimeout(function () {
        if (pendingLoads > 0 && window.AbecFeedback) window.AbecFeedback.showLoader('Loading');
      }, 300);
    }
  }
  function trackLoadEnd() {
    pendingLoads = Math.max(0, pendingLoads - 1);
    if (pendingLoads === 0) {
      clearTimeout(loadTimer);
      if (window.AbecFeedback) window.AbecFeedback.hideLoader();
    }
  }
  var AbecApi = {
    baseUrl: resolveBaseUrl(),

    sessionKey: 'abec-session',

    getSession: function () {
      try { return JSON.parse(sessionStorage.getItem(this.sessionKey) || 'null'); }
      catch (e) { return null; }
    },

    setSession: function (session) {
      sessionStorage.setItem(this.sessionKey, JSON.stringify(session));
    },

    clearSession: function () {
      sessionStorage.removeItem(this.sessionKey);
      fetch(this.baseUrl + '/api/auth/student-logout', { method: 'POST', credentials: 'include', keepalive: true }).catch(function () {});
    },

    page: function (path) {
      if (window.location.protocol === 'file:') return APP_ORIGIN + path;
      return path;
    },

    requireRole: function (role, redirectUrl) {
      var session = this.getSession();
      if (!session || session.role !== role) {
        var fallback = role === 'Admin'
          ? '/Views/Home/AdminLoginPage.html'
          : '/Views/Home/LoginPage.html';
        window.location.href = this.page(redirectUrl || fallback);
        return null;
      }
      return session;
    },

    normalize: function (payload) {
      if (!payload || typeof payload !== 'object') {
        return { success: false, message: 'Unexpected server response.', data: null };
      }
      var success = payload.success;
      if (typeof success === 'undefined') success = payload.Success;
      var message = payload.message || payload.Message || '';
      var data = typeof payload.data !== 'undefined' ? payload.data : payload.Data;
      return {
        success: !!success,
        message: message,
        data: data
      };
    },

    request: async function (path, options) {
      options = options || {};
      // Keep transient retry support, but avoid making a page appear stuck when
      // the API is unavailable. Callers can still opt into a different count.
      var attempts = options.attempts || 3;
      var delay = 250;
      var lastError = null;
      for (var attempt = 1; attempt <= attempts; attempt++) {
        trackLoadStart();
        try {
          var session = this.getSession();
        var headers = Object.assign({ 'Content-Type': 'application/json', 'Accept': 'application/json' }, options.headers || {});
        if (session && session.role === 'Admin' && session.userId) {
          headers['X-Abec-Admin-Id'] = String(session.userId);
        }
        var response = await fetch(this.baseUrl + path, {
            method: options.method || 'GET',
            headers: headers,
            body: options.body ? JSON.stringify(options.body) : undefined,
            credentials: 'include',
            redirect: 'follow'
          });
          var payload = await response.json().catch(function () { return null; });
          if (!payload) {
            return {
              success: false,
              message: response.ok
                ? 'Unexpected server response.'
                : (response.status === 405
                  ? 'The request could not be saved from this page. Open the ABEC site and try again.'
                  : ('Request failed (' + response.status + ').')),
              data: null
            };
          }
          return this.normalize(payload);
        } catch (err) {
          lastError = err;
          if (attempt === attempts) break;
          await sleep(delay);
           delay = Math.min(delay * 2, 1000);
        } finally {
          trackLoadEnd();
        }
      }
      return {
        success: false,
        message: unreachableMessage(),
        data: null,
        cause: lastError ? String(lastError.message || lastError) : ''
      };
    },

    get: function (path) { return this.request(path); },
    post: function (path, body) { return this.request(path, { method: 'POST', body: body }); },

    postForm: async function (path, formData) {
      var attempts = 4;
      var delay = 400;
      for (var attempt = 1; attempt <= attempts; attempt++) {
        trackLoadStart();
        try {
          var response = await fetch(this.baseUrl + path, {
            method: 'POST',
            body: formData,
            credentials: 'include',
            redirect: 'follow'
          });
          var payload = await response.json().catch(function () { return null; });
          if (!payload) {
            var failMsg = 'The registration server did not return a result. Please try again.';
            if (response.status === 413) {
              failMsg = String(path).indexOf('/api/applicants/enroll') >= 0
                ? 'One or more uploaded files exceed the server size limit. Each file must be 100 MB or smaller.'
                : 'One or more uploaded files exceed the server size limit. Each file must be 20 MB or smaller.';
            } else if (response.status === 415) {
              failMsg = 'The server could not accept the registration upload. Restart the ABEC application and try again.';
            } else if (!response.ok) {
              failMsg = 'Registration request failed (HTTP ' + response.status + '). Please try again.';
            } else {
              failMsg = 'Unexpected server response.';
            }
            return { success: false, message: failMsg, data: null };
          }
          return this.normalize(payload);
        } catch (err) {
          if (attempt === attempts) {
            return { success: false, message: unreachableMessage(), data: null };
          }
          await sleep(delay);
          delay = Math.min(delay + 500, 2000);
        } finally {
          trackLoadEnd();
        }
      }
    },
    put: function (path, body) { return this.request(path, { method: 'PUT', body: body }); },

    initials: function (name) {
      return (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(function (p) {
        return p.charAt(0).toUpperCase();
      }).join('') || '?';
    },

    formatDate: function (value) {
      if (!value) return '—';
      var d = new Date(value);
      if (isNaN(d.getTime())) return String(value);
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    },

    displayCourseName: function (name) {
      var text = String(name == null ? '' : name).replace(/\s*NC\s*II\b/gi, ' ').replace(/\s{2,}/g, ' ').trim();
      return text;
    }
  };

  window.AbecApi = AbecApi;
})(window);
