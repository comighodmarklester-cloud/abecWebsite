/* Sign-out confirmation uses the existing logout API for either role. */
(function () {
  'use strict';
  var session = AbecApi.getSession();
  var role = session && session.role;
  if (role !== 'Admin' && role !== 'Student') role = sessionStorage.getItem('abec-signout-role') === 'Admin' ? 'Admin' : 'Student';
  var login = role === 'Admin' ? 'AdminLoginPage.html' : 'LoginPage.html';
  var dashboard = role === 'Admin' ? '../Admin/AdminDashboard.html' : '../Student/StudentDashboard.html';
  var busy = false;
  var confirm = document.getElementById('return-login');
  var cancel = document.getElementById('cancel-signout');
  var message = document.getElementById('signout-message');
  window.cancelSignOut = function () {
    if (!busy) window.location.href = dashboard;
  };
  confirm.addEventListener('click', async function () {
    if (busy) return;
    busy = true;
    confirm.disabled = true;
    cancel.disabled = true;
    confirm.setAttribute('aria-busy', 'true');
    message.hidden = true;
    try {
      var result = await AbecApi.request('/api/auth/student-logout', { method: 'POST', body: {}, attempts: 1 });
      if (!result.success) throw new Error(result.message || 'Unable to sign out. Please try again.');
      sessionStorage.setItem('abec-signout-role', role);
      sessionStorage.removeItem('abec-session');
      window.location.replace(login);
    } catch (error) {
      message.textContent = error.message || 'Unable to sign out. Please try again.';
      message.hidden = false;
      busy = false;
      confirm.disabled = false;
      cancel.disabled = false;
      confirm.removeAttribute('aria-busy');
    }
  });
})();
