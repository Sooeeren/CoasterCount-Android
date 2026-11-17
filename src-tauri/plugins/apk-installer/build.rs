// No commands are exposed to JavaScript: the app calls this plugin from Rust
// (see src-tauri/src/commands.rs → install_update), which validates input.
const COMMANDS: &[&str] = &[];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
