// Work around quirks of the live site.
//
// About us bounces signed-in users to the home page: the page (served from
// a cache built for visitors) always runs
//   setTimeout(() => popup.open('account', 'login'), 1000)
// and for someone already signed in the login popup redirects to "/". In the
// app, opening the login popup is skipped when you're signed in.

CCW.feature('site-quirks', function () {
  function signedIn() {
    // The profile tab (menu_user) only exists in a signed-in header.
    return !!document.querySelector('body > header use[*|href$="#menu_user"]');
  }

  var p = window.popup;
  if (!p || typeof p.open !== 'function' || p.__ccwGuarded) return;
  var open = p.open;
  p.open = function (type, what) {
    if (type === 'account' && what === 'login' && signedIn()) {
      CCW.log('skipped login popup: already signed in');
      return;
    }
    return open.apply(this, arguments);
  };
  p.__ccwGuarded = true;
});
