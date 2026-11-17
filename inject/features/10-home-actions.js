// Home screen actions for signed-out visitors: "Log in" and "Join" buttons
// under the welcome logo, so the first screen has an obvious next step.
// Both reuse the site's own links, so the site keeps owning the behaviour
// (the login popup, the join page). Styles: inject/styles/30-home.css.

CCW.feature('home-actions', function () {
  if (!document.querySelector('#stage .center')) return;
  if (!document.body.classList.contains('anonymous')) return;

  // The site's script fills the menus after DOMContentLoaded, so wait for the
  // links (give up after 10s).
  if (build()) return;
  var mo = new MutationObserver(function () {
    if (build()) mo.disconnect();
  });
  mo.observe(document.body, { childList: true, subtree: true });
  setTimeout(function () { mo.disconnect(); }, 10000);
});

function build() {
  var stage = document.querySelector('#stage .center');
  if (!stage) return true; // nothing to do
  if (document.querySelector('.ccw-home-actions')) return true;

  var siteLogin = document.querySelector('#submenu_container a.login');
  var siteJoin = document.querySelector('#submenu_container a[href$="/account/join"]');
  if (!siteLogin && !siteJoin) return false;

  var row = document.createElement('div');
  row.className = 'ccw-home-actions';

  function action(label, cls, target) {
    if (!target) return;
    var a = document.createElement('a');
    a.className = cls;
    a.textContent = label;
    a.href = target.getAttribute('href') || '#';
    a.addEventListener('click', function (ev) {
      ev.preventDefault();
      target.click(); // the site's handler opens its popup or navigates
    });
    row.appendChild(a);
  }

  // Use the site's own (translated) link text when it has it.
  action((siteLogin && siteLogin.textContent.trim()) || 'Log in', 'ccw-primary', siteLogin);
  action((siteJoin && siteJoin.textContent.trim()) || 'Join', 'ccw-secondary', siteJoin);
  stage.appendChild(row);
  return true;
}
