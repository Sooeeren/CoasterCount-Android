// ─────────────────────────────────────────────────────────────────────────────
// CCW core runtime — injected at document start into every page the app loads.
//
// This file is wrapped by build.rs into an IIFE together with all styles
// (inject/styles/*.css → __CCW_CSS__) and feature files (inject/features/*.js).
// It exposes `window.CCW`, the small API that feature files build on:
//
//   CCW.feature(name, fn, { defaultEnabled })   register a feature (runs on DOM ready)
//   CCW.css(cssText, id?)                       add/replace a <style> block
//   CCW.onReady(fn)                             run fn once the DOM is parsed
//   CCW.onNavigate(fn)                          run fn on every page (incl. bfcache restores)
//   CCW.invoke(cmd, args)                       call a Rust command (Promise)
//   CCW.openExternal(url)                       open a URL in the system browser
//   CCW.isInternalUrl(url)                      true for *.coaster-count.com
//   CCW.settings.get/set(key, value)            tiny persisted key/value store
//   CCW.isFeatureEnabled(name) / setFeatureEnabled(name, bool)
//
// Everything here must stay defensive: the site can change at any time.
// ─────────────────────────────────────────────────────────────────────────────

var CCW = (window.CCW = window.CCW || {});
var SITE_HOST_RE = /(^|\.)coaster-count\.com$/i;

CCW.isApp = true;
// Android runs init scripts in every frame (maps, PayPal, …) — top frame only.
CCW.isSite = window.top === window && SITE_HOST_RE.test(location.hostname);
CCW.platform = /android/i.test(navigator.userAgent) ? 'android' : 'desktop';
if (!CCW.isSite) return;

// ── settings (localStorage, scoped per subdomain by the browser) ────────────
CCW.settings = {
  get: function (key, fallback) {
    try {
      var v = localStorage.getItem('ccw:' + key);
      return v === null ? fallback : v;
    } catch (e) {
      return fallback;
    }
  },
  set: function (key, value) {
    try {
      if (value === null || value === undefined) localStorage.removeItem('ccw:' + key);
      else localStorage.setItem('ccw:' + key, String(value));
    } catch (e) {}
  },
};

// Enable with CCW.settings.set('debug', 1) from a remote devtools console.
CCW.log = function () {
  if (CCW.settings.get('debug') === '1') {
    console.log.apply(console, ['[CCW]'].concat([].slice.call(arguments)));
  }
};

// ── URL helpers ─────────────────────────────────────────────────────────────
CCW.isInternalUrl = function (url) {
  try {
    var u = new URL(url, location.href);
    return (u.protocol === 'https:' || u.protocol === 'http:') && SITE_HOST_RE.test(u.hostname);
  } catch (e) {
    return false;
  }
};

// ── Rust bridge ─────────────────────────────────────────────────────────────
// The remote site is granted IPC access to a small, explicit set of commands
// (see src-tauri/capabilities/remote.json). Anything else is rejected by Tauri.
CCW.invoke = function (cmd, args) {
  var internals = window.__TAURI_INTERNALS__;
  if (!internals || typeof internals.invoke !== 'function') {
    return Promise.reject(new Error('Tauri IPC unavailable'));
  }
  return internals.invoke(cmd, args || {});
};

CCW.openExternal = function (url) {
  var abs = new URL(url, location.href).href;
  return CCW.invoke('open_external', { url: abs }).catch(function (err) {
    CCW.log('open_external failed', err);
    // Only when IPC itself is missing: navigate, and Rust's navigation guard
    // hands the URL to the OS. Never after Rust rejected the URL.
    if (!window.__TAURI_INTERNALS__ && /^https?:/i.test(abs)) location.href = abs;
  });
};

// ── styles ──────────────────────────────────────────────────────────────────
var styleNodes = {};
var styleCount = 0;
CCW.css = function (cssText, id) {
  id = id || 'ccw-style-' + styleCount++;
  var node = styleNodes[id];
  if (!node) {
    node = document.createElement('style');
    node.id = id;
    node.setAttribute('data-ccw', '');
    styleNodes[id] = node;
  }
  node.textContent = cssText;
  mountStyles();
  return node;
};

// Our styles must come *after* the site's stylesheets so equal-specificity
// rules win. At document start <head> may not exist yet, so we mount on
// <html> first and move to the end of <head> once the DOM is ready.
function mountStyles() {
  var parent = document.head || document.documentElement;
  if (!parent) return false;
  Object.keys(styleNodes).forEach(function (id) {
    parent.appendChild(styleNodes[id]); // appendChild moves existing nodes to the end
  });
  return true;
}

function markDocument() {
  var root = document.documentElement;
  if (!root) return false;
  root.classList.add('ccw-app', 'ccw-' + CCW.platform);
  return true;
}

// ── lifecycle ───────────────────────────────────────────────────────────────
var domReady = false;
var readyQueue = [];
var navQueue = [];
CCW.onReady = function (fn) {
  if (domReady) safe(fn, 'onReady');
  else readyQueue.push(fn);
};
CCW.onNavigate = function (fn) {
  navQueue.push(fn);
  if (domReady) safe(fn, 'onNavigate');
};

function safe(fn, label) {
  try {
    fn(CCW);
  } catch (e) {
    console.error('[CCW] ' + label + ' failed', e);
  }
}

// ── features ────────────────────────────────────────────────────────────────
var features = [];
CCW.features = features;
CCW.feature = function (name, fn, opts) {
  features.push({ name: name, fn: fn, defaultEnabled: !opts || opts.defaultEnabled !== false });
};
CCW.isFeatureEnabled = function (name) {
  var stored = CCW.settings.get('feature:' + name);
  if (stored === '1') return true;
  if (stored === '0') return false;
  var f = features.filter(function (x) { return x.name === name; })[0];
  return f ? f.defaultEnabled : false;
};
CCW.setFeatureEnabled = function (name, enabled) {
  CCW.settings.set('feature:' + name, enabled ? '1' : '0');
};

// ── external links ──────────────────────────────────────────────────────────
// Links leaving coaster-count.com open in the system browser instead of
// replacing the app. Rust's on_navigation guard is the safety net for
// anything this misses (JS-initiated navigations, forms, redirects…).
//
// Listeners sit on window in the bubble phase so the site's own handlers
// (incl. jQuery delegation on document) run first and can opt out via
// preventDefault().
var EXTERNAL_SCHEME_RE = /^(https?|mailto|tel|geo|sms):$/;

function interceptExternalLinks() {
  window.addEventListener(
    'click',
    function (ev) {
      if (ev.defaultPrevented || ev.button !== 0) return;
      var a = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
      if (!a) return;
      var href = a.getAttribute('href');
      if (!href || href.charAt(0) === '#' || /^javascript:/i.test(href)) return;
      var url;
      try {
        url = new URL(href, location.href);
      } catch (e) {
        return;
      }
      if (!EXTERNAL_SCHEME_RE.test(url.protocol) || CCW.isInternalUrl(url.href)) return;
      ev.preventDefault();
      CCW.openExternal(url.href);
    },
    false
  );

  // Forms submitting off-site. The navigation guard can't forward a POST body,
  // so: GET forms keep their query; PayPal donate (public hidden fields only)
  // is converted to GET; anything else opens the bare action URL — form data
  // that might be secret never ends up in a URL.
  window.addEventListener(
    'submit',
    function (ev) {
      var form = ev.target;
      if (!form || ev.defaultPrevented) return;
      var submitter = ev.submitter || null;
      var actionAttr =
        submitter && submitter.hasAttribute('formaction') ? submitter.formAction : form.action;
      var method = (
        (submitter && submitter.getAttribute('formmethod')) ||
        form.getAttribute('method') ||
        'get'
      ).toLowerCase();
      var action;
      try {
        action = new URL(actionAttr || location.href, location.href);
      } catch (e) {
        return;
      }
      if (CCW.isInternalUrl(action.href) || !/^https?:$/.test(action.protocol)) return;
      ev.preventDefault();

      var sensitive = form.querySelector('input[type=password], input[type=file]');
      var isPaypal = /(^|\.)paypal\.com$/i.test(action.hostname);
      if (sensitive || (method !== 'get' && !isPaypal)) {
        CCW.openExternal(action.origin + action.pathname);
        return;
      }
      var data;
      try {
        data = new FormData(form, submitter || undefined);
      } catch (e) {
        data = new FormData(form); // WebView < 112 has no submitter argument
      }
      action.search = new URLSearchParams(data).toString();
      CCW.openExternal(action.href);
    },
    false
  );

  // window.open(...) to a foreign site → system browser. Everything else
  // (about:blank print helpers, blob:, same-site) keeps native behaviour.
  var nativeOpen = window.open;
  window.open = function (url) {
    var u = null;
    try {
      if (url) u = new URL(url, location.href);
    } catch (e) {}
    if (u && EXTERNAL_SCHEME_RE.test(u.protocol) && !CCW.isInternalUrl(u.href)) {
      CCW.openExternal(u.href);
      return null;
    }
    return nativeOpen.apply(window, arguments);
  };
}

// ── connectivity banner ─────────────────────────────────────────────────────
function watchConnectivity() {
  function show() {
    CCW.onReady(function () {
      if (navigator.onLine !== false) return; // came back before the DOM was ready
      if (document.getElementById('ccw-offline')) return;
      var bar = document.createElement('div');
      bar.id = 'ccw-offline';
      bar.setAttribute('role', 'status');
      bar.textContent = 'Offline. Waiting for connection…';
      document.body.appendChild(bar);
    });
  }
  function hide() {
    var bar = document.getElementById('ccw-offline');
    if (bar) bar.remove();
  }
  window.addEventListener('offline', show);
  window.addEventListener('online', hide);
  window.addEventListener('pageshow', function (ev) {
    if (ev.persisted) (navigator.onLine === false ? show : hide)();
  });
  if (navigator.onLine === false) show();
}

// ── start (called by the bundle after all feature files registered) ────────
CCW.__start = function () {
  if (__CCW_CSS__) CCW.css(__CCW_CSS__, 'ccw-styles');
  markDocument();

  // Until the DOM is parsed, keep our <style> after every stylesheet the site
  // adds, so overrides apply from the first paint (no flash of old styles).
  // Our own nodes carry data-ccw, so moving them doesn't retrigger this.
  var mo = new MutationObserver(function (records) {
    markDocument();
    var first = styleNodes[Object.keys(styleNodes)[0]];
    var needsMove =
      (document.head && first && first.parentNode !== document.head) ||
      records.some(function (r) {
        return [].some.call(r.addedNodes, function (n) {
          return (
            (n.nodeName === 'LINK' || n.nodeName === 'STYLE') &&
            !(n.hasAttribute && n.hasAttribute('data-ccw'))
          );
        });
      });
    if (needsMove) mountStyles();
  });
  mo.observe(document, { childList: true, subtree: true });

  interceptExternalLinks();
  watchConnectivity();

  function onDomReady() {
    mo.disconnect();
    // Callbacks registered with onNavigate from here on run immediately (via
    // CCW.onNavigate itself), so only replay the ones registered before.
    var initialNav = navQueue.slice();
    domReady = true;
    markDocument();
    mountStyles(); // re-append so we come after the site's own <link>/<style>
    features.forEach(function (f) {
      if (CCW.isFeatureEnabled(f.name)) {
        CCW.log('feature', f.name);
        safe(f.fn, 'feature "' + f.name + '"');
      }
    });
    readyQueue.splice(0).forEach(function (fn) { safe(fn, 'onReady'); });
    initialNav.forEach(function (fn) { safe(fn, 'onNavigate'); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onDomReady, { once: true });
  } else {
    onDomReady();
  }

  // Back/forward-cache restores don't re-run scripts; let features refresh.
  window.addEventListener('pageshow', function (ev) {
    if (ev.persisted) navQueue.forEach(function (fn) { safe(fn, 'onNavigate'); });
  });
};
