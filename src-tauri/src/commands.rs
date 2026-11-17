//! Rust commands callable from the injected JS via `CCW.invoke(name, args)`.
//!
//! Adding a command:
//!   1. write the `#[tauri::command]` fn here,
//!   2. add it to `generate_handler!` in lib.rs,
//!   3. add its name to `APP_COMMANDS` in build.rs,
//!   4. grant `allow-<name>` in capabilities/remote.json (and default.json).
//!
//! The remote website can call these, so treat every argument as untrusted.

use serde::Serialize;
use tauri::{AppHandle, Runtime};

use crate::nav;

#[derive(Serialize)]
pub struct AppInfo {
    name: String,
    version: String,
    platform: &'static str,
}

#[tauri::command]
pub fn app_info<R: Runtime>(app: AppHandle<R>) -> AppInfo {
    let pkg = app.package_info();
    AppInfo {
        name: pkg.name.clone(),
        version: pkg.version.to_string(),
        platform: std::env::consts::OS,
    }
}

/// Opens a URL in the system browser / matching app. Only web, mail and phone
/// links are accepted so the site can't launch arbitrary intents or files.
#[tauri::command]
pub fn open_external<R: Runtime>(app: AppHandle<R>, url: String) -> Result<(), String> {
    let parsed = url::Url::parse(&url).map_err(|e| e.to_string())?;
    if !nav::is_openable_externally(&parsed) {
        return Err(format!("scheme not allowed: {}", parsed.scheme()));
    }
    nav::open_external(&app, &parsed);
    Ok(())
}
