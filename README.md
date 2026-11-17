# Coaster-Count Android app

A [Tauri 2](https://v2.tauri.app) shell that turns https://coaster-count.com into an Android APK, with
an injection layer for custom styling and features.

## How it works

```
App start ─► src/index.html (splash, offline check, bundled)
                │ location.replace
                ▼
        https://coaster-count.com  ◄── inject bundle runs at document start on every page
                │                         (inject/core.js + styles/*.css + features/*.js)
                │ link to another site
                ▼
        system browser (opener plugin)
```

| Piece | File | What it does |
|---|---|---|
| Window + navigation guard | `src-tauri/src/lib.rs`, `src-tauri/src/nav.rs` | Creates the webview, injects the bundle, keeps `*.coaster-count.com` in the app and sends everything else to the system browser |
| Rust commands | `src-tauri/src/commands.rs` | `app_info`, `open_external` — callable from injected JS |
| Permissions | `src-tauri/capabilities/remote.json` | The **only** things the live site may call. Keep it minimal |
| Splash / offline | `src/index.html` | Probes the network, then hands over to the site |
| Injection bundle | `src-tauri/build.rs` | Bundles `inject/**` into one script at compile time |
| Runtime API | `inject/core.js` | `window.CCW` — styles, feature registry, IPC bridge, link handling, offline banner |

Android back button, session cookies and the site's own login all work out of the box.

## Custom styling

Put CSS in `inject/styles/`. Files are bundled in alphabetical order (`00-app-base.css`,
`10-theme.css`, …) and appended **after** the site's stylesheet. Scope rules under `html.ccw-app`
so they only apply inside the app. Prefix a file with `_` to disable it.

## Custom features

Add a JS file to `inject/features/`:

```js
CCW.feature('bigger-counters', function (CCW) {
  // DOM is ready here
  document.querySelectorAll('.count').forEach(el => el.classList.add('ccw-big'));
}, { defaultEnabled: true });
```

Available API (see `inject/core.js`): `CCW.feature`, `CCW.css`, `CCW.onReady`, `CCW.onNavigate`,
`CCW.invoke`, `CCW.openExternal`, `CCW.isInternalUrl`, `CCW.settings`, `CCW.isFeatureEnabled`,
`CCW.setFeatureEnabled`. Each feature file is isolated in its own try/catch.

### Native (Rust) features

1. Add a `#[tauri::command]` in `src-tauri/src/commands.rs`
2. Register it in `generate_handler!` in `lib.rs`
3. Add its name to `APP_COMMANDS` in `build.rs`
4. Grant `allow-<name>` (underscores become hyphens) in `capabilities/remote.json`
5. Call it from JS: `CCW.invoke('my_command', { … })`

Anything granted in `remote.json` can be called by **any** script on coaster-count.com, so validate
arguments in Rust.

## Building

Prerequisites on this machine: Rust (MSVC toolchain, via a `rustup override` for this folder),
the Android SDK + NDK, Android Studio's JBR as the JDK, and Windows Developer Mode (for symlinks).

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:NDK_HOME = "$env:LOCALAPPDATA\Android\Sdk\ndk\30.0.14904198"

npm install
npm run android:build:debug -- --target aarch64   # debug APK, installable as-is
npm run android:dev                               # live on a device/emulator
npm run android:build                             # release APK (needs signing, see below)
```

Install the APK with `adb install -r <apk>`. Debug builds can be inspected from desktop Chrome at
`chrome://inspect`. Turn on CCW logging there with `CCW.settings.set('debug', 1)`.

For a release build, set up signing first:
https://v2.tauri.app/distribute/sign/android/

Change the icon by replacing `assets/icon.png` (1024×1024 ideally) and running `npm run icons`.
