//! Build script.
//!
//! 1. Bundles everything in `../inject/` into a single JavaScript file
//!    (`$OUT_DIR/inject_bundle.js`) that the app injects into every page of
//!    coaster-count.com. Drop a new `.css` into `inject/styles/` or a new `.js`
//!    into `inject/features/` and it is picked up on the next build — no Rust
//!    changes needed. Files are applied in alphabetical order, so prefix them
//!    with numbers (`10-…`, `20-…`) to control ordering. Files starting with
//!    `_` are ignored (handy for disabling something without deleting it).
//! 2. Runs the regular Tauri build step, declaring the app's own commands so
//!    they get permissions that capabilities can grant to the remote site.

use std::{
    env, fs,
    path::{Path, PathBuf},
};

/// Commands defined in `src/commands.rs`. Keep this list in sync — each entry
/// generates an `allow-<name>` permission (e.g. `allow-app-info`; `_` becomes `-`).
const APP_COMMANDS: &[&str] = &["app_info", "open_external", "install_update"];

fn main() {
    bundle_inject_layer();

    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(APP_COMMANDS)),
    )
    .expect("failed to run tauri-build");
}

fn bundle_inject_layer() {
    let inject_dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../inject");
    println!("cargo:rerun-if-changed={}", inject_dir.display());

    let core = read(&inject_dir.join("core.js"));
    let styles = collect(&inject_dir.join("styles"), "css");
    let features = collect(&inject_dir.join("features"), "js");

    let mut css = String::new();
    for (name, body) in &styles {
        css.push_str(&format!("/* ── {name} ── */\n{body}\n"));
    }

    let mut feature_js = String::new();
    for (name, body) in &features {
        // Each feature file is isolated in its own function + try/catch so one
        // broken feature can never take down the others or the core.
        feature_js.push_str(&format!(
            "/* ── {name} ── */\ntry {{ (function (CCW) {{\n{body}\n}})(window.CCW); }} \
             catch (e) {{ console.error('[CCW] feature file {name} failed', e); }}\n"
        ));
    }

    let bundle = format!(
        "(function () {{\n\
         if (window.__CCW_BOOTSTRAPPED__) return;\n\
         window.__CCW_BOOTSTRAPPED__ = true;\n\
         var __CCW_CSS__ = {css};\n\
         {core}\n\
         if (!window.CCW || !window.CCW.isSite) return;\n\
         {feature_js}\n\
         window.CCW.__start();\n\
         }})();\n",
        css = json_string(&css),
    );

    let out = PathBuf::from(env::var("OUT_DIR").unwrap()).join("inject_bundle.js");
    fs::write(out, bundle).expect("failed to write inject bundle");
}

fn collect(dir: &Path, ext: &str) -> Vec<(String, String)> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut files: Vec<PathBuf> = entries
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().and_then(|e| e.to_str()) == Some(ext))
        .filter(|p| {
            !p.file_name()
                .and_then(|n| n.to_str())
                .is_some_and(|n| n.starts_with('_'))
        })
        .collect();
    files.sort();
    files
        .into_iter()
        .map(|p| {
            let name = p.file_name().unwrap().to_string_lossy().into_owned();
            (name, read(&p))
        })
        .collect()
}

fn read(path: &Path) -> String {
    println!("cargo:rerun-if-changed={}", path.display());
    fs::read_to_string(path)
        .unwrap_or_else(|e| panic!("failed to read {}: {e}", path.display()))
}

/// Minimal JSON string encoder (avoids a build-dependency on serde_json).
fn json_string(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            '<' => out.push_str("\\u003c"),
            '\u{2028}' => out.push_str("\\u2028"),
            '\u{2029}' => out.push_str("\\u2029"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}
