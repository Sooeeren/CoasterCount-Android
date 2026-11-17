//! Coaster-Count app shell.
//!
//! The main window opens the bundled `src/index.html` (splash + offline
//! fallback), which immediately hands over to https://coaster-count.com.
//! Every page gets the injection bundle from `inject/` (custom CSS + JS
//! features), and navigation off the site is routed to the system browser.

mod commands;
mod nav;

use tauri::{WebviewUrl, WebviewWindowBuilder};

/// `inject/**` bundled by build.rs into one document-start script.
const INJECT_BUNDLE: &str = include_str!(concat!(env!("OUT_DIR"), "/inject_bundle.js"));

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // The opener's built-in target=_blank click handler calls
        // plugin:opener|open_url, which the remote site isn't granted, and it
        // preventDefault()s first — links would silently do nothing. Link
        // handling lives in inject/core.js (→ our open_external command).
        .plugin(
            tauri_plugin_opener::Builder::new()
                .open_js_links_on_click(false)
                .build(),
        )
        .plugin(tauri_plugin_apk_installer::init())
        .invoke_handler(tauri::generate_handler![
            commands::app_info,
            commands::open_external,
            commands::install_update,
        ])
        .setup(|app| {
            let handle = app.handle().clone();

            let builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .initialization_script(INJECT_BUNDLE)
                .on_navigation(move |url| nav::on_navigation(&handle, url));

            #[cfg(desktop)]
            let builder = builder
                .title("Coaster-Count")
                .inner_size(420.0, 860.0)
                .min_inner_size(360.0, 560.0);

            builder.build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running the Coaster-Count app");
}
