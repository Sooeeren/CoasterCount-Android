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
use tauri_plugin_apk_installer::ApkInstallerExt;

use crate::nav;

/// GitHub repository whose releases carry the app's APKs. Each release has an
/// asset named `UPDATE_ASSET` and a tag like `v1.2.3` (see scripts/release.mjs).
pub const UPDATE_REPO: &str = "Sooeeren/CoasterCount-Android";
pub const UPDATE_ASSET: &str = "CoasterCount.apk";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    name: String,
    version: String,
    platform: &'static str,
    update_repo: &'static str,
    update_asset: &'static str,
}

#[tauri::command]
pub fn app_info<R: Runtime>(app: AppHandle<R>) -> AppInfo {
    let pkg = app.package_info();
    AppInfo {
        name: pkg.name.clone(),
        version: pkg.version.to_string(),
        platform: std::env::consts::OS,
        update_repo: UPDATE_REPO,
        update_asset: UPDATE_ASSET,
    }
}

/// Downloads the given release's APK and opens Android's installer.
///
/// Only a version tag is accepted, never a URL, so scripts on the website
/// can't make the app download anything except this repo's own releases.
/// Returns `installing`, `needs-permission` or (off Android) `opened-browser`.
#[tauri::command]
pub async fn install_update<R: Runtime>(app: AppHandle<R>, tag: String) -> Result<String, String> {
    if !is_version_tag(&tag) {
        return Err(format!("invalid release tag: {tag}"));
    }
    let url = format!("https://github.com/{UPDATE_REPO}/releases/download/{tag}/{UPDATE_ASSET}");

    if cfg!(target_os = "android") {
        let handle = app.clone();
        let outcome = tauri::async_runtime::spawn_blocking(move || handle.apk_installer().install(&url))
            .await
            .map_err(|e| e.to_string())??;
        Ok(outcome.status)
    } else {
        let page = url::Url::parse(&format!("https://github.com/{UPDATE_REPO}/releases/tag/{tag}"))
            .map_err(|e| e.to_string())?;
        nav::open_external(&app, &page);
        Ok("opened-browser".into())
    }
}

/// `v` + three dot-separated numbers, e.g. `v0.2.0`.
fn is_version_tag(tag: &str) -> bool {
    let Some(rest) = tag.strip_prefix('v') else { return false };
    let parts: Vec<&str> = rest.split('.').collect();
    parts.len() == 3
        && parts
            .iter()
            .all(|p| !p.is_empty() && p.len() <= 4 && p.chars().all(|c| c.is_ascii_digit()))
}

#[cfg(test)]
mod tests {
    use super::is_version_tag;

    #[test]
    fn version_tags() {
        assert!(is_version_tag("v0.2.0"));
        assert!(is_version_tag("v10.20.300"));
        assert!(!is_version_tag("0.2.0"));
        assert!(!is_version_tag("v0.2"));
        assert!(!is_version_tag("v0.2.0/../../evil"));
        assert!(!is_version_tag("v0.2.x"));
        assert!(!is_version_tag("v.."));
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
