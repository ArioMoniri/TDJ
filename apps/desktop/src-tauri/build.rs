use std::path::Path;

/// Every command a page may call. Capabilities grant them per window/origin (capabilities/*.json).
const COMMANDS: &[&str] = &[
    "get_native_info",
    "set_server",
    "unlink_server",
    "secret_set",
    "secret_has",
    "secret_delete",
    "net_fetch",
    "ai_complete",
    "spotify_token",
    "spotify_access",
    "spotify_logout",
    "start_login",
    "forget_sessions",
    "open_external",
    "save_file",
    "print_page",
    "keep_awake",
    "now_playing",
    "folder_add",
    "folder_list",
    "folder_remove",
    "folder_files",
    "folder_read",
    "cue_devices",
    "cue_play",
    "cue_stop",
    "check_updates",
];

fn main() {
    // `ui/dist` is the frontendDist. `node scripts/build-ui.mjs` fills it with the bundled UI; without it
    // (Rust-only checks, `cargo test`) the app's own pages are enough to compile and run in remote mode.
    let dist = Path::new("../ui/dist");
    let pages = Path::new("../ui/static");
    std::fs::create_dir_all(dist).expect("ui/dist");
    let is_bundle = dist.join("tdj-bundle.json").exists();
    for entry in std::fs::read_dir(pages).expect("ui/static").flatten() {
        let target = dist.join(entry.file_name());
        // the bundle owns index.html; the static fallback index is used only without a bundle
        if entry.file_name() != "index.html" || !is_bundle {
            std::fs::copy(entry.path(), target).expect("copy static page");
        }
    }
    println!("cargo:rerun-if-changed=../ui/static");
    println!("cargo:rerun-if-changed=../ui/dist/tdj-bundle.json");
    println!("cargo:rerun-if-env-changed=TDJ_APP_STORE");
    println!("cargo:rerun-if-env-changed=TDJ_SPOTIFY_CLIENT_ID");
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    .expect("tauri build");
}
