// Don't leave a working page for Android's raw "Webpage not available"
// screen while offline.
//
// Tapping a link on coaster-count.com without a connection would replace the
// page with the WebView's error page (the app can't restyle that one). While
// the phone is offline, in-app links and forms stay on the current page and
// the offline banner (core.js) pulses instead. Once back online they work as
// usual.
//
// Limit: if the phone says it's online but the connection is dead or the
// site is down, the WebView's error page can still appear; Android back
// returns from it.

CCW.feature('offline-links', function (CCW) {
  function blocked() {
    if (navigator.onLine !== false) return false;
    var bar = document.getElementById('ccw-offline');
    if (bar) {
      bar.classList.remove('ccw-pulse');
      void bar.offsetWidth; // restart the animation
      bar.classList.add('ccw-pulse');
    }
    return true;
  }

  window.addEventListener('click', function (ev) {
    if (ev.defaultPrevented || ev.button !== 0) return;
    var a = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
    if (!a) return;
    var href = a.getAttribute('href');
    if (!href || href.charAt(0) === '#' || /^javascript:/i.test(href)) return;
    if (!CCW.isInternalUrl(new URL(href, location.href).href)) return;
    if (blocked()) ev.preventDefault();
  });

  window.addEventListener('submit', function (ev) {
    if (!ev.defaultPrevented && blocked()) ev.preventDefault();
  });
});
