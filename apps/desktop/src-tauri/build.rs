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
    "model_fetch",
    "acp_spawn",
    "acp_write",
    "acp_read",
    "acp_kill",
    "spotify_begin",
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
    // 2026-11: the dancers' Floor screen window (commands.rs floor_window)
    "floor_window",
    "check_updates",
    // 2026-11: outputs and the night's continuity (src/audio.rs)
    "audio_route",
    "audio_route_picker",
    "audio_set_output",
    "audio_night",
    // 2026-11: Battery saver (src/power.rs)
    "power_state",
    "power_saver",
    // 2026-11: DJ controllers over CoreMIDI (src/midi.rs)
    "midi_ports",
    "midi_open",
    "midi_close",
    "midi_send",
    // 2026-11: the DJ's own YouTube key, Dropbox app and Google client (src/byo.rs)
    "byo_youtube_search",
    "byo_google_redirect",
    "byo_oauth_exchange",
    "byo_oauth_access",
    "byo_oauth_logout",
    // docs/SYNC.md: the sync log mirrored into iCloud Documents (src/icloud.rs)
    "icloud_status",
    "icloud_list",
    "icloud_read",
    "icloud_write",
    "icloud_remove",
];

/// `"spotifyClientId": "<letters and digits>"` from tdj-bundle.json (no JSON crate in the build script).
fn bundle_client_id(text: &str) -> Option<String> {
    let rest = &text[text.find("\"spotifyClientId\"")? + "\"spotifyClientId\"".len()..];
    let rest = rest
        .trim_start()
        .strip_prefix(':')?
        .trim_start()
        .strip_prefix('"')?;
    let id: String = rest.chars().take_while(|c| *c != '"').collect();
    (!id.is_empty() && id.len() <= 64 && id.chars().all(|c| c.is_ascii_alphanumeric()))
        .then_some(id)
}

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
    // The Spotify Client ID (public, PKCE): from the environment, else from the bundle marker that
    // scripts/build-ui.mjs wrote from the same variable: `tauri ios build` runs the Rust build from Xcode's build
    // phase, which need not see the release shell's own variables. The page reads the same value from the bundle.
    let from_env = std::env::var("TDJ_SPOTIFY_CLIENT_ID").unwrap_or_default();
    if from_env.trim().is_empty() {
        if let Some(id) = std::fs::read_to_string(dist.join("tdj-bundle.json"))
            .ok()
            .and_then(|t| bundle_client_id(&t))
        {
            println!("cargo:rustc-env=TDJ_SPOTIFY_CLIENT_ID={id}");
        }
    }
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    .expect("tauri build");
}
