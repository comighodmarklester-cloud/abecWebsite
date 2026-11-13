/* Login page → auth API */
(function () {
  'use strict';
  if (!window.AbecApi) return;

  var USERNAME_PATTERN = /^[A-Za-z0-9._-]+$/;

  function setFieldError(inputId, errorId, message) {
    var input = document.getElementById(inputId);
    var error = document.getElementById(errorId);
    window.AbecFeedback.inline(error, message, 'error');
    if (input) {
      input.classList.toggle('is-invalid', !!message);
      input.setAttribute('aria-invalid', message ? 'true' : 'false');
    }
  }

  function setFormError(message) {
    window.AbecFeedback.inline(document.getElementById('admin-login-error'), message, 'error');
  }

  function clearAdminLoginErrors() {
    setFieldError('admin-username', 'admin-username-error', '');
    setFieldError('password', 'admin-password-error', '');
    setFormError('');
  }

  function validateAdminUsername(value) {
    var username = String(value || '').trim();
    if (!username) return 'Please enter your username.';
    if (username.length < 3 || username.length > 50) {
      return 'Please enter a valid username (3–50 characters).';
    }
    if (!USERNAME_PATTERN.test(username)) {
      return 'Please enter a valid username. Use only letters, numbers, dots, underscores, or hyphens.';
    }
    return '';
  }

  function validateAdminPassword(value) {
    if (!String(value || '')) return 'Please enter your password.';
    return '';
  }

  document.addEventListener('DOMContentLoaded', function () {
    var adminForm = document.querySelector('[data-purpose="admin-login-form"] form, #panel-admin form');
    var studentForm = document.querySelector('#panel-student form');
    var usernameInput = document.getElementById('admin-username');
    var passwordInput = document.getElementById('password');

    if (usernameInput) {
      usernameInput.addEventListener('input', function () {
        setFormError('');
        setFieldError('admin-username', 'admin-username-error', '');
      });
      usernameInput.addEventListener('blur', function () {
        var err = validateAdminUsername(usernameInput.value);
        if (usernameInput.classList.contains('is-invalid') || usernameInput.value.trim()) {
          setFieldError('admin-username', 'admin-username-error', err);
        }
      });
    }

    if (passwordInput) {
      passwordInput.addEventListener('input', function () {
        setFormError('');
        setFieldError('password', 'admin-password-error', '');
      });
    }

    if (adminForm) {
      adminForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        clearAdminLoginErrors();

        var username = (usernameInput && usernameInput.value) || '';
        var password = (passwordInput && passwordInput.value) || '';
        var usernameErr = validateAdminUsername(username);
        var passwordErr = validateAdminPassword(password);

        setFieldError('admin-username', 'admin-username-error', usernameErr);
        setFieldError('password', 'admin-password-error', passwordErr);

        if (usernameErr || passwordErr) {
          if (usernameErr && usernameInput) usernameInput.focus();
          else if (passwordErr && passwordInput) passwordInput.focus();
          return;
        }

        var submitBtn = document.getElementById('admin-login-submit');
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.classList.add('opacity-70');
        }

        var result = await AbecApi.post('/api/auth/admin-login', {
          username: username.trim(),
          password: password,
          rememberDevice: !!(document.getElementById('remember') || {}).checked
        });

        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.classList.remove('opacity-70');
        }

        if (!result.success || !result.data) {
          var msg = result.message || 'Incorrect username or password. Please try again.';
          if (/invalid username or password/i.test(msg) || /incorrect/i.test(msg)) {
            msg = 'Incorrect username or password. Please try again.';
          }
          setFormError(msg);
          if (usernameInput) {
            usernameInput.classList.add('is-invalid');
            usernameInput.setAttribute('aria-invalid', 'true');
          }
          if (passwordInput) {
            passwordInput.classList.add('is-invalid');
            passwordInput.setAttribute('aria-invalid', 'true');
            passwordInput.focus();
          }
          return;
        }

        AbecApi.setSession({
          userId: result.data.userId,
          role: result.data.role,
          displayName: result.data.displayName,
          emailOrUsername: result.data.emailOrUsername
        });
        try { sessionStorage.setItem('abec-admin-welcome', 'pending'); } catch (err) { /* ignore */ }
        window.location.href = AbecApi.page('/Views/Admin/AdminDashboard.html');
      });
    }

    if (studentForm) {
      var passwordMode = false;
      function setStudentLoginMode(mode) {
        passwordMode = mode === 'password';
        document.getElementById('student-password-fields').hidden = !passwordMode;
        document.getElementById('student-pin-fields').hidden = passwordMode;
        ['student-username', 'student-password'].forEach(function (id) {
          document.getElementById(id).disabled = !passwordMode;
          document.getElementById(id).required = passwordMode;
        });
        document.getElementById('student-pin').disabled = passwordMode;
        document.getElementById('student-pin').required = !passwordMode;
        document.getElementById('student-email').disabled = passwordMode;
        document.getElementById('student-email').required = !passwordMode;
        document.getElementById('student-login-method-label').textContent = passwordMode ? 'Username and password login' : 'Security PIN login';
        document.getElementById('student-login-method').textContent = passwordMode ? 'Use security PIN' : 'Use username & password';
      }
      var preferred = 'pin';
      try { preferred = localStorage.getItem('abec-student-login-mode') || 'pin'; } catch (err) { /* optional preference */ }
      setStudentLoginMode(preferred);
      document.getElementById('student-login-method').addEventListener('click', function () {
        setStudentLoginMode(passwordMode ? 'pin' : 'password');
        document.getElementById(passwordMode ? 'student-username' : 'student-pin').focus();
      });
      studentForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        var email = (document.getElementById('student-email') || {}).value || '';
        var pin = (document.getElementById('student-pin') || {}).value || '';
        var payload = passwordMode ? {
          username: document.getElementById('student-username').value.trim(),
          password: document.getElementById('student-password').value
        } : { email: email.trim() || null, securityPin: pin.trim() };
        payload.rememberDevice = !!(document.getElementById('student-remember') || {}).checked;
        var submit = studentForm.querySelector('button[type="submit"]');
        if (submit.disabled) return;
        submit.disabled = true;
        var result;
        try { result = await AbecApi.post('/api/auth/student-login', payload); }
        finally { submit.disabled = false; }
        if (!result.success || !result.data) {
          if (/Username and password login is enabled/i.test(result.message || '')) setStudentLoginMode('password');
          alert(result.message || 'Invalid login details.');
          return;
        }
        AbecApi.setSession({
          userId: result.data.userId,
          role: result.data.role,
          displayName: result.data.displayName,
          emailOrUsername: result.data.emailOrUsername
        });
        try { localStorage.setItem('abec-student-login-mode', passwordMode ? 'password' : 'pin'); } catch (err) { /* optional preference */ }
        window.location.href = AbecApi.page('/Views/Student/StudentDashboard.html');
      });
    }
  });
})();
