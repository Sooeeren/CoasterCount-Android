// Stay signed in.
//
// The site's login form has a "remember me" checkbox (#login_remember_me)
// that is off by default. Without it the site only sets a session cookie,
// which the server expires after a short idle time and which Android drops
// whenever it kills the app, so you'd be signed out after a few minutes.
// In the app it starts ticked, so the site issues its long-lived login
// cookie and you stay signed in until you log out or the site ends it.
// You can still untick it before logging in.
//
// The login popup is loaded on demand, so watch for the checkbox appearing.
// (MainActivity.kt flushes cookies to disk when the app goes to the
// background, so the login survives the app being closed.)

CCW.feature('stay-signed-in', function () {
  function tick(root) {
    var boxes = (root.querySelectorAll ? root : document).querySelectorAll('#login_remember_me');
    [].forEach.call(boxes, function (box) {
      if (box.__ccwTicked) return; // only once per form, so unticking sticks
      box.__ccwTicked = true;
      if (!box.checked) {
        box.checked = true;
        box.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  }

  tick(document);
  new MutationObserver(function (records) {
    for (var i = 0; i < records.length; i++) {
      if (records[i].addedNodes.length) {
        tick(document);
        return;
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
});
