// "About this app" + in-app updates.
//
//  - Adds an "About this app" entry under the site's "About us" in its menus
//    (the ⋯ menu when signed in, the ⓘ menu when signed out).
//  - The entry opens a full-screen About sheet: app icon, version, an
//    update button and links.
//  - On launch, checks GitHub Releases (at most every 6 hours) and, if a newer
//    version exists, shows a small banner with an Update button.
//
// Updates are GitHub releases of the repo named by `app_info().updateRepo`,
// tagged vX.Y.Z with an APK asset named `app_info().updateAsset`. Installing
// goes through the Rust command `install_update`, which only accepts a tag.
// Styles: inject/styles/60-app.css.

CCW.feature('app-about', function (CCW) {
  var CHECK_EVERY_MS = 6 * 60 * 60 * 1000;
  var info = null;

  // ── version helpers ────────────────────────────────────────────────────
  function parse(v) {
    var m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(v || ''));
    return m ? [+m[1], +m[2], +m[3]] : null;
  }
  function newer(a, b) { // a > b ?
    var x = parse(a), y = parse(b);
    if (!x || !y) return false;
    for (var i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
    return false;
  }

  function appInfo() {
    if (info) return Promise.resolve(info);
    return CCW.invoke('app_info').then(function (i) { info = i; return i; });
  }

  // ── update check ───────────────────────────────────────────────────────
  // Resolves to { current, latest: {tag, version, notesUrl} | null, available }.
  function check(force) {
    return appInfo().then(function (i) {
      var cached = null;
      try { cached = JSON.parse(CCW.settings.get('update:latest', 'null')); } catch (e) {}
      var fresh = cached && Date.now() - cached.checkedAt < CHECK_EVERY_MS;
      var latestP = !force && fresh
        ? Promise.resolve(cached.latest)
        : fetch('https://api.github.com/repos/' + i.updateRepo + '/releases/latest', {
            headers: { Accept: 'application/vnd.github+json' },
            cache: 'no-store',
          })
            .then(function (r) {
              if (r.status === 404) return null; // no release published yet
              if (!r.ok) throw new Error('GitHub answered ' + r.status + '.');
              return r.json();
            })
            .then(function (rel) {
              var hasApk = rel && (rel.assets || []).some(function (a) { return a.name === i.updateAsset; });
              var latest = hasApk && parse(rel.tag_name)
                ? { tag: rel.tag_name, version: rel.tag_name.replace(/^v/, ''), notesUrl: rel.html_url }
                : null;
              CCW.settings.set('update:latest', JSON.stringify({ checkedAt: Date.now(), latest: latest }));
              return latest;
            });
      return latestP.then(function (latest) {
        return { current: i.version, latest: latest, available: !!latest && newer(latest.version, i.version) };
      });
    });
  }

  function install(tag) {
    return CCW.invoke('install_update', { tag: tag });
  }

  CCW.updates = { check: check, install: install };

  // ── small DOM helper ───────────────────────────────────────────────────
  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k === 'html') n.innerHTML = attrs[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }

  var MARK = '<svg viewBox="381 0 78 78" aria-hidden="true"><use href="/static/svg/ui.svg#coaster_count_logo"/></svg>';
  var CLOSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/></svg>';
  var CHEVRON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>';

  // ── About sheet ────────────────────────────────────────────────────────
  var sheet = null;

  function openAbout(autoInstallTag) {
    if (sheet) return;
    hideBanner();
    closeSiteMenus();

    var status = el('p', { class: 'ccw-update-status', role: 'status', 'aria-live': 'polite' });
    var button = el('button', { type: 'button', class: 'ccw-btn ccw-btn-primary' });
    var version = el('p', { class: 'ccw-about-version', text: 'Version …' });

    function setState(state, latest, message) {
      button.disabled = false;
      button.onclick = null;
      if (state === 'checking') {
        status.textContent = 'Checking for updates…';
        button.textContent = 'Checking…';
        button.disabled = true;
      } else if (state === 'latest') {
        status.textContent = message || 'You have the latest version.';
        button.textContent = 'Check for updates';
        button.onclick = function () { run(true); };
      } else if (state === 'available') {
        status.textContent = 'Version ' + latest.version + ' is available.';
        button.textContent = 'Update to ' + latest.version;
        button.onclick = function () { doInstall(latest); };
      } else if (state === 'installing') {
        status.textContent = 'Downloading the update. Android will ask you to confirm the install.';
        button.textContent = 'Downloading…';
        button.disabled = true;
      } else if (state === 'permission') {
        status.textContent = 'Turn on "Allow from this source" for Coaster-Count in the settings that just opened, then come back and tap Update again.';
        button.textContent = 'Update to ' + latest.version;
        button.onclick = function () { doInstall(latest); };
      } else if (state === 'error') {
        status.textContent = message;
        button.textContent = 'Try again';
        button.onclick = function () { run(true); };
      }
    }

    function run(force) {
      setState('checking');
      return check(force)
        .then(function (r) {
          if (r.available) setState('available', r.latest);
          else setState('latest', null, r.latest ? null : 'No releases have been published yet.');
          return r;
        })
        .catch(function (e) {
          setState('error', null, "Couldn't check for updates. Check your connection and try again.");
          CCW.log('update check failed', e);
        });
    }

    function doInstall(latest) {
      setState('installing', latest);
      install(latest.tag)
        .then(function (result) {
          if (result === 'needs-permission') setState('permission', latest);
          else if (result === 'opened-browser') setState('latest', null, 'Opened the release page in your browser.');
          else setState('installing', latest);
        })
        .catch(function (e) {
          setState('error', null, "The update couldn't be downloaded. Check your connection and try again.");
          CCW.log('install failed', e);
        });
    }

    var close = el('button', {
      type: 'button',
      class: 'ccw-sheet-close',
      'aria-label': 'Close',
      html: CLOSE,
      onclick: function () { history.back(); },
    });
    function row(label, sub, href) {
      return el('a', { class: 'ccw-row', href: href }, [
        el('span', {}, [el('span', { class: 'ccw-row-label', text: label }), el('span', { class: 'ccw-row-sub', text: sub })]),
        el('span', { class: 'ccw-row-chevron', html: CHEVRON }),
      ]);
    }
    var links = el('div', { class: 'ccw-card ccw-links' }, [
      row('About Coaster-Count', 'The website and its team', '/page/about'),
    ]);

    sheet = el('div', { class: 'ccw-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ccw-about-title' }, [
      el('div', { class: 'ccw-sheet-bar' }, [el('h2', { id: 'ccw-about-title', text: 'About this app' }), close]),
      el('div', { class: 'ccw-sheet-body' }, [
        el('div', { class: 'ccw-about-hero' }, [
          el('div', { class: 'ccw-app-icon', html: MARK }),
          el('h3', { text: 'Coaster-Count' }),
          version,
        ]),
        el('div', { class: 'ccw-card ccw-update' }, [el('h4', { text: 'Updates' }), status, button]),
        links,
        el('p', { class: 'ccw-fine', text: 'Android app built with Tauri. All content comes from coaster-count.com.' }),
      ]),
    ]);
    document.body.appendChild(sheet);
    document.documentElement.classList.add('ccw-sheet-open');

    // Android back closes the sheet: it lives on its own history entry.
    history.pushState({ ccwSheet: true }, '');
    window.addEventListener('popstate', onPop);

    appInfo().then(function (i) {
      version.textContent = 'Version ' + i.version;
      var repo = 'https://github.com/' + i.updateRepo;
      links.insertBefore(row('Release notes', 'What changed in each version', repo + '/releases'), links.firstChild);
      links.insertBefore(row('Source code', 'On GitHub', repo), links.children[1]);
    });

    close.focus();
    run(false).then(function (r) {
      if (autoInstallTag && r && r.available && r.latest.tag === autoInstallTag) doInstall(r.latest);
    });
  }

  function onPop() {
    window.removeEventListener('popstate', onPop);
    if (!sheet) return;
    sheet.remove();
    sheet = null;
    document.documentElement.classList.remove('ccw-sheet-open');
  }

  function closeSiteMenus() {
    document.querySelectorAll('#submenu_container > div.menu').forEach(function (m) {
      if (getComputedStyle(m).display !== 'none') m.style.display = 'none';
    });
  }

  // ── menu entry ─────────────────────────────────────────────────────────
  function addMenuEntries() {
    var anchors = document.querySelectorAll('#submenu_container div.menu a[href$="/page/about"]');
    if (!anchors.length) return false;
    anchors.forEach(function (about) {
      var menu = about.closest('div.menu');
      if (!menu || menu.querySelector('.ccw-menu-about')) return;
      var entry = el('a', {
        href: '#about-this-app',
        class: 'ccw-menu-about',
        onclick: function (ev) { ev.preventDefault(); ev.stopPropagation(); openAbout(); },
      }, [document.createTextNode('About this app')]);
      about.parentNode.insertBefore(entry, about.nextSibling); // right under "About us"
    });
    return true;
  }

  function markMenuUpdate() {
    document.querySelectorAll('.ccw-menu-about').forEach(function (a) {
      if (!a.querySelector('.new')) a.appendChild(el('span', { class: 'new', text: 'Update' }));
    });
  }

  if (!addMenuEntries()) {
    var mo = new MutationObserver(function () { if (addMenuEntries()) mo.disconnect(); });
    mo.observe(document.body, { childList: true, subtree: true });
    setTimeout(function () { mo.disconnect(); }, 10000);
  }

  // ── launch check + banner ──────────────────────────────────────────────
  var banner = null;
  function hideBanner() {
    if (banner) { banner.remove(); banner = null; }
  }
  function showBanner(latest) {
    if (banner || sheet) return;
    banner = el('div', { class: 'ccw-update-banner', role: 'status' }, [
      el('span', { class: 'ccw-update-banner-text', text: 'Version ' + latest.version + ' is available' }),
      el('button', { type: 'button', class: 'ccw-btn ccw-btn-quiet', text: 'Later', onclick: function () {
        CCW.settings.set('update:dismissed', latest.tag);
        hideBanner();
      } }),
      el('button', { type: 'button', class: 'ccw-btn ccw-btn-primary', text: 'Update', onclick: function () {
        openAbout(latest.tag);
      } }),
    ]);
    document.body.appendChild(banner);
  }

  setTimeout(function () {
    check(false)
      .then(function (r) {
        if (!r.available) return;
        markMenuUpdate();
        if (CCW.settings.get('update:dismissed') !== r.latest.tag) showBanner(r.latest);
      })
      .catch(function (e) { CCW.log('update check failed', e); });
  }, 1500);
});
