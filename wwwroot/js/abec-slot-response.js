/* Old email/preview links use the same server-verified slot response as new links. */
(function () {
  'use strict';
  var params = new URLSearchParams(window.location.search);
  var token = params.get('token');
  if (token) {
    var action = (params.get('action') || 'confirm').toLowerCase();
    var path = action === 'decline' || action === 'reject' ? '/reject-slot' : '/confirm-slot';
    window.location.replace(AbecApi.baseUrl + path + '?token=' + encodeURIComponent(token));
    return;
  }

  document.getElementById('confirm-title').textContent = 'Unable to Process';
  document.getElementById('confirm-message').textContent =
    'This link is incomplete. Please open the Confirm Slot or Reject Slot link from your ABEC email.';
  var icon = document.getElementById('confirm-icon');
  icon.textContent = '!';
  icon.className = 'mx-auto mb-4 w-14 h-14 rounded-full bg-red-100 text-red-700 flex items-center justify-center text-2xl font-bold';
})();
