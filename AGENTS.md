# AGENTS.md

Notes for coding agents working on this repo. Read [README.md](README.md) first for what the app
is and how it's built; this file covers what isn't obvious from the code.

## What this app is

A Tauri 2 Android shell around the **live** site https://coaster-count.com. There is no app UI of
our own beyond a splash/offline page (`src/index.html`) and an About sheet: everything else is the
real website, restyled and extended by an injection bundle that runs at document start on every
page.

- `inject/core.js` – runtime (`window.CCW`): styles, feature registry, IPC, external-link routing,
  offline banner.
- `inject/styles/*.css` – bundled in filename order, applied after the site's CSS. Scope every rule
  under `html.ccw-app`.
- `inject/features/*.js` – each file is wrapped in its own `try/catch` and runs at document start.
  Code inside `CCW.feature(name, fn)` runs on DOMContentLoaded; top-level code runs immediately
  (use that only when something must be in place before the site's scripts, e.g.
  `70-geolocation.js`).
- `src-tauri/build.rs` bundles `inject/**` at compile time: **any change under `inject/` needs a
  rebuild** of the app to show up. Prefix a file with `_` to disable it.
- Native bits: `src-tauri/src/*.rs` (commands, navigation guard) and
  `src-tauri/gen/android/app/src/main/java/.../MainActivity.kt` + `AndroidManifest.xml`.

## Working with the live site

The site is not ours and changes without notice. Code against it defensively:

- **Its menus:** the header icons are `body > header > nav:not(:first-of-type) > p` (plus an
  `a.image` for Search/Nearby). On DOMContentLoaded the site's jQuery adds `class="menu"` and
  `data-menu=N` to each `p` and **moves** the next sibling `div.menu` into `#submenu_container` as
  `[data-submenu=N]`. Before that runs (slow pages, offline) neither exists, so never depend on
  `p.menu` or `data-menu` for styling; `40-bottom-nav.js` (`menuOf`) handles both states.
- **Menus open on `touchstart`/`mouseenter`**, not `click`. Synthetic `.click()` won't open them;
  `jQuery(p).trigger('touchstart')` does.
- **Signed in vs out:** `body.anonymous` is **not** reliable. The site serves cached public pages
  (News, About, …) with `anonymous` to signed-in users, and `USER_ID` is `0` on them. The reliable
  signal is the profile tab icon: `body > header use[*|href$="#menu_user"]` exists only when signed
  in (`[*|href]` matches `xlink:href`).
- **Popups** (`#popup`): login, coaster info, RCDB (an iframe), pictures. Open state is
  `window.popup.is_open`; closing empties the element but can leave `display:block`.
  The site hides popup tabs (`#popup > header > nav`) with `opacity`/`transform`, not `display`.
- **Don't rely on `:has()` reacting to class changes on SVG elements** – Android WebView doesn't
  reliably restyle. Mirror such state onto plain classes from JS (see `syncOpen` in
  `40-bottom-nav.js`).
- **Specificity:** the site uses lots of `!important`. When two of our rules both use
  `!important`, specificity decides; count classes *and* type selectors when an override doesn't
  apply.
- Navigation leaving `*.coaster-count.com` goes to the system browser (`core.js` + `nav.rs`).
  Embeds the site frames (RCDB, Google Maps, PayPal) are allowed in `nav.rs` `EMBED_HOSTS`.

## Android specifics

- `src-tauri/gen/android/**/generated/` is regenerated on every build (gitignored). Put native
  changes in `MainActivity.kt` (hooks: `onWebViewCreate`, lifecycle overrides) or the manifest,
  never in `generated/`.
- The activity handles `uiMode` itself (no restart on dark-mode switch); anything theme-dependent
  on the native side must be re-applied in `onConfigurationChanged`.
- Android WebView does **not** update `navigator.onLine` by itself; `MainActivity` reports
  connectivity via `WebView.setNetworkAvailable`. Keep that if you touch it.
- Location: permissions are in the manifest; wry's chrome client shows Android's prompt. The site
  calls `getCurrentPosition` without options, which can hang forever – `70-geolocation.js` adds
  timeouts and a GPS fallback.

## Running and testing

Environment (Windows, PowerShell):

```powershell
$env:JAVA_HOME    = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:NDK_HOME     = "$env:LOCALAPPDATA\Android\Sdk\ndk\<version>"
npm run android:dev            # live build on a connected device or running emulator
```

- **Emulator disk:** a debug APK is ~300 MB because of Rust debug info, and the emulator can run out
  of space (`INSTALL_FAILED_INSUFFICIENT_STORAGE`). Build without it:
  `$env:CARGO_PROFILE_DEV_DEBUG = "0"; $env:CARGO_PROFILE_DEV_STRIP = "debuginfo"`. Don't uninstall
  the app to make room unless the user agrees: it wipes their login.
- **Inspecting the running app:** debug builds expose WebView DevTools. Forward the socket and use
  the Chrome DevTools Protocol (or `chrome://inspect`):
  `adb forward tcp:9223 localabstract:webview_devtools_remote_$(adb shell pidof app.coastercount.wrapper)`
  then `http://127.0.0.1:9223/json/list`. Useful for evaluating JS, reading the DOM signed in, and
  `adb exec-out screencap -p > shot.png` for screenshots.
- **Without a device:** the injection can be tested against the site in a desktop browser through a
  small local proxy that forwards to coaster-count.com and inserts the bundle into HTML (patch
  `SITE_HOST_RE` in `core.js` to accept `localhost`). Signed-in features can't be tested that way
  (cookies are scoped to coaster-count.com) – use the app.
- **Git Bash on Windows** rewrites arguments that look like paths (`/page/news` →
  `C:/Program Files/Git/page/news`). Set `MSYS_NO_PATHCONV=1` for `adb shell` calls and scripts
  that take URL paths.
- After a change, check light **and** dark mode, signed in **and** out, and at least one slow page
  (e.g. `/ranking/visited/parks`, which streams thousands of rows).

## Icons

`npm run icons` regenerates `assets/icon.png` and every launcher size from
`assets/brand-mark.svg` (`MARK_FRACTION` in `assets/make-icon.cjs` sets the mark size). It also
rewrites some files with only line-ending changes (`mipmap-anydpi-v26/ic_launcher.xml`,
`values/ic_launcher_background.xml`); revert those instead of committing them. Copy
`src-tauri/icons/128x128.png` to `docs/icon-128.png` for the README.

## Git and releases

- Commit straight to `master` (the default branch; there is no `main`). Push only when asked.
- Builds can touch `gradlew` and `src-tauri/permissions/autogenerated/*.toml` with line-ending or
  mode changes only; check `git diff` and revert them if there's no content change.
- `npm run release -- X.Y.Z` bumps versions, builds a signed APK, tags and publishes a GitHub
  release that installed apps offer as an update. It needs a **clean working tree** and the
  release keystore (`src-tauri/gen/android/keystore.properties`, never committed). Every release
  must be signed with the same key.
- The project is unofficial: don't use the site's name, logo or wording in ways that suggest
  affiliation beyond what README.md already says.
