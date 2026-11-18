// Floating bottom nav: the small bits CSS can't do.
//
// The bar itself is the site's header icon row, restyled in
// inject/styles/20-chrome.css. This feature:
//  - gives every tab a text label (shown when the tab is active, where it
//    expands into a tinted pill) and an accent colour index;
//  - highlights the tab for the section you're in (/catalogue/…, /ranking/…),
//    judged by the links in each tab's menu, so it follows the site's own
//    menus without a hard-coded URL list;
//  - sets html.ccw-keyboard while the on-screen keyboard is open.
//
// It runs twice: once as soon as the header has been parsed (huge pages such
// as rankings keep loading for many seconds, and the bar should look right
// meanwhile), and again when the page is ready.

(function () {
  // Short labels for the site's known tab icons (the menu headings can be
  // long, e.g. "Roller coasters"). Other languages use the menu heading.
  var SHORT = {
    en: {
      menu_catalogue: 'Coasters', menu_nearby: 'Nearby', menu_ranking: 'Ranking',
      menu_page: 'Info', menu_guest: 'Account', menu_account: 'Account',
      menu_more: 'More', menu_search: 'Search',
    },
    de: {
      menu_catalogue: 'Achterbahnen', menu_nearby: 'In der Nähe', menu_ranking: 'Ranking',
      menu_page: 'Info', menu_guest: 'Konto', menu_account: 'Konto',
      menu_more: 'Mehr', menu_search: 'Suche',
    },
  };
  // (menu_user has no short label: its menu heading is your user name, like
  // the profile tab in the iOS app.)

  // Signed in, the bar follows the official iOS app: Catalogue · Nearby ·
  // Profile · Search · More. Ranking gets folded into More's sheet.
  var ORDER = ['menu_catalogue', 'menu_nearby', 'menu_user', 'menu_account', 'menu_search', 'menu_more'];
  var FOLD_INTO_MORE = ['menu_ranking'];
  var lang = (document.documentElement.getAttribute('lang') || 'en').slice(0, 2).toLowerCase();

  function segments(pathname) {
    return pathname.split('/').filter(Boolean);
  }

  // How many leading path segments `href` shares with the current page.
  function score(href, here) {
    var u;
    try {
      u = new URL(href, location.href);
    } catch (e) {
      return 0;
    }
    if (!CCW.isInternalUrl(u.href)) return 0;
    var there = segments(u.pathname);
    var n = 0;
    while (n < there.length && n < here.length && there[n] === here[n]) n++;
    // A direct link to exactly this page beats sharing a section with it.
    return n && n === there.length && n === here.length ? n + 1 : n;
  }

  // The menu a tab opens: still its next sibling before the site's script
  // moves it, afterwards linked by data-menu / data-submenu.
  function menuOf(tab) {
    var next = tab.nextElementSibling;
    if (next && next.matches('div.menu')) return next;
    var n = tab.getAttribute('data-menu');
    return n ? document.querySelector('#submenu_container [data-submenu="' + n + '"]') : null;
  }

  function iconId(tab) {
    var use = tab.querySelector('svg:not(.show_desktop) use');
    var href = use && (use.getAttribute('href') || use.getAttribute('xlink:href'));
    var m = href && /#([\w-]+)$/.exec(href);
    return m ? m[1] : '';
  }

  function labelFor(tab, menu) {
    var short = (SHORT[lang] || {})[iconId(tab)];
    if (short) return short;
    if (menu) {
      var heading = menu.querySelector('span.hide_desktop, span:not(.new):not(.show_desktop)');
      if (heading && heading.textContent.trim()) return heading.textContent.trim();
    }
    var svg = tab.querySelector('svg[aria-label]');
    return svg ? svg.getAttribute('aria-label') : tab.getAttribute('title') || '';
  }

  // Copy a folded tab's menu (heading + links) to the top of More's sheet
  // and hide the tab. Only when signed in, where a More tab exists.
  function foldIntoMore(tabs) {
    var more = tabs.filter(function (t) { return iconId(t) === 'menu_more'; })[0];
    var moreMenu = more && menuOf(more);
    if (!moreMenu) return;
    FOLD_INTO_MORE.slice().reverse().forEach(function (id) {
      var tab = tabs.filter(function (t) { return iconId(t) === id; })[0];
      var menu = tab && menuOf(tab);
      if (!menu) return;
      tab.classList.add('ccw-tab-merged');
      if (moreMenu.querySelector('[data-ccw-folded="' + id + '"]')) return;
      var section = document.createElement('div');
      section.setAttribute('data-ccw-folded', id);
      var heading = menu.querySelector('span.hide_desktop, span:not(.new):not(.show_desktop)');
      if (heading) {
        var h = document.createElement('span');
        h.textContent = heading.textContent.trim();
        section.appendChild(h);
      }
      [].forEach.call(menu.querySelectorAll('a[href]'), function (a) {
        section.appendChild(a.cloneNode(true));
      });
      moreMenu.insertBefore(section, moreMenu.firstChild);
    });
  }

  function update() {
    var bar = document.querySelector('body > header > nav:not(:first-of-type):not(.hide_mobile)');
    if (!bar) return;
    var here = segments(location.pathname);
    var best = null;
    var bestScore = 0;
    var index = 0;

    var tabs = [].filter.call(bar.querySelectorAll(':scope > p, :scope > a.image'), function (t) {
      return !t.matches('.hide_mobile');
    });
    foldIntoMore(tabs);
    tabs = tabs.filter(function (t) { return !t.classList.contains('ccw-tab-merged'); });
    tabs.forEach(function (t) {
      var i = ORDER.indexOf(iconId(t));
      t.style.order = String(i < 0 ? 50 : i); // known tabs in iOS order, others after
    });
    tabs.sort(function (a, b) { return a.style.order - b.style.order; });

    tabs.forEach(function (tab) {
      tab.classList.remove('ccw-tab-current');
      tab.removeAttribute('aria-current');
      var menu = tab.tagName === 'P' ? menuOf(tab) : null;

      tab.setAttribute('data-ccw-accent', String(index++ % 6));
      if (!tab.querySelector('.ccw-tab-label')) {
        var label = labelFor(tab, menu);
        if (label) {
          var span = document.createElement('span');
          span.className = 'ccw-tab-label';
          span.setAttribute('aria-hidden', 'true'); // aria-label carries it
          span.textContent = label;
          tab.appendChild(span);
          if (!tab.hasAttribute('aria-label')) tab.setAttribute('aria-label', label);
        }
      }
      if (tab.tagName === 'P') tab.setAttribute('role', 'button');

      if (!here.length) return; // home: no section
      var links = menu ? menu.querySelectorAll('a[href]') : [tab];
      [].forEach.call(links, function (a) {
        var s = score(a.getAttribute('href'), here);
        if (s > bestScore) {
          bestScore = s;
          best = tab;
        }
      });
    });

    if (best) {
      best.classList.add('ccw-tab-current');
      best.setAttribute('aria-current', 'page');
    }
  }

  // Mirror the site's "menu open" marker (it adds fill_grey_mobile to the
  // tab's icon) onto plain classes: browsers don't reliably restyle a
  // `:has()` selector when a class changes on an SVG inside it.
  function syncOpen(bar) {
    var any = false;
    [].forEach.call(bar.querySelectorAll(':scope > p'), function (tab) {
      var svg = tab.querySelector('svg.fill_grey_mobile');
      tab.classList.toggle('ccw-tab-open', !!svg);
      if (svg) any = true;
    });
    bar.classList.toggle('ccw-menu-open', any);
  }

  function watchOpen() {
    var bar = document.querySelector('body > header > nav:not(:first-of-type):not(.hide_mobile)');
    if (!bar || bar.__ccwWatched) return;
    bar.__ccwWatched = true;
    syncOpen(bar);
    new MutationObserver(function () { syncOpen(bar); }).observe(bar, {
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    });
  }

  // The keyboard shrinks the viewport (the app resizes for it). Compare with
  // the tallest height seen in this orientation; focus alone isn't enough,
  // since Search focuses its field on load without opening the keyboard.
  function watchKeyboard() {
    var tallest = {};
    function check() {
      var key = innerWidth > innerHeight ? 'land' : 'port';
      var h = (window.visualViewport && visualViewport.height) || innerHeight;
      tallest[key] = Math.max(tallest[key] || 0, h);
      document.documentElement.classList.toggle('ccw-keyboard', h < tallest[key] * 0.75);
    }
    check();
    (window.visualViewport || window).addEventListener('resize', check);
    window.addEventListener('resize', check);
  }

  CCW.feature('bottom-nav', function (CCW) {
    CCW.onNavigate(function () { // runs now, and again on back/forward-cache restores
      update();
      watchOpen();
    });
    watchKeyboard();
  });

  // Early run: as soon as the header is complete (#submenu_container
  // directly follows it), before the rest of a long page has arrived.
  // (After CCW.feature above, so isFeatureEnabled knows the default.)
  if (CCW.isFeatureEnabled('bottom-nav')) {
    var early = new MutationObserver(function () {
      if (!document.getElementById('submenu_container')) return;
      early.disconnect();
      try { update(); } catch (e) { CCW.log('early nav update failed', e); }
    });
    early.observe(document.documentElement, { childList: true, subtree: true });
    CCW.onReady(function () { early.disconnect(); });
  }
})();
