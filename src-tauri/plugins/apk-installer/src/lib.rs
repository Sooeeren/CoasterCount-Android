//! In-app updates for Android: download an APK and open the system installer.
//!
//! Rust-only API (`app.apk_installer().install(url)`); nothing is exposed to
//! the webview directly. On other platforms `install` returns an error so the
//! caller can fall back to opening the release page.

use serde::{Deserialize, Serialize};
use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "app.coastercount.apkinstaller";

/// What happened after `install`:
/// - `installing`: the system installer is showing the update,
/// - `needs-permission`: Android's "Install unknown apps" setting was opened;
///   the user enables it and tries again.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallOutcome {
    pub status: String,
}

pub struct ApkInstaller<R: Runtime> {
    #[cfg(target_os = "android")]
    handle: tauri::plugin::PluginHandle<R>,
    _runtime: std::marker::PhantomData<fn() -> R>,
}

impl<R: Runtime> ApkInstaller<R> {
    /// Downloads `url` and launches the installer. Blocks until the download
    /// finished, so call it off the main thread (e.g. `spawn_blocking`).
    pub fn install(&self, url: &str) -> Result<InstallOutcome, String> {
        #[cfg(target_os = "android")]
        {
            self.handle
                .run_mobile_plugin("install", serde_json::json!({ "url": url }))
                .map_err(|e| e.to_string())
        }
        #[cfg(not(target_os = "android"))]
        {
            let _ = url;
            Err("in-app install is only supported on Android".into())
        }
    }
}

pub trait ApkInstallerExt<R: Runtime> {
    fn apk_installer(&self) -> &ApkInstaller<R>;
}

impl<R: Runtime, T: Manager<R>> ApkInstallerExt<R> for T {
    fn apk_installer(&self) -> &ApkInstaller<R> {
        self.state::<ApkInstaller<R>>().inner()
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("apk-installer")
        .setup(|app, api| {
            #[cfg(target_os = "android")]
            let handle = api.register_android_plugin(PLUGIN_IDENTIFIER, "ApkInstallerPlugin")?;
            #[cfg(not(target_os = "android"))]
            let _ = api;

            app.manage(ApkInstaller::<R> {
                #[cfg(target_os = "android")]
                handle,
                _runtime: std::marker::PhantomData,
            });
            Ok(())
        })
        .build()
}
