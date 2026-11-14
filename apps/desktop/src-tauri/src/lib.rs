//! TDJ for macOS and iPadOS (r22-apps-plan.md). Two UI modes, one binary:
//! - **bundled** (store builds, and the DMG): the UI is a static export of apps/web packaged in the app
//!   (`scripts/build-ui.mjs`); `/api/*` goes to the DJ's TDJ server through the native bridge (`bridge.rs`).
//! - **remote** (development, or a bundle-less build): the window loads the server origin itself.
//!
//! Native value on top: menu bar + shortcuts, Now Playing and media keys, keep-awake for the night, linked music
//! folders (security-scoped bookmarks), a headphone cue device, native save/print, system-browser logins.

#[cfg(any(target_os = "macos", target_os = "ios"))]
mod apple;
mod bridge;
mod commands;
#[cfg_attr(mobile, allow(dead_code))] // folder picking on iPad: Swift plugin, see folders.rs
mod folders;
mod links;
#[cfg_attr(mobile, allow(dead_code))] // the menu bar is macOS-only
mod menu;
mod settings;
mod system;
mod updates;

use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::webview::PageLoadEvent;
use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_opener::OpenerExt;

/// Set by `TDJ_APP_STORE=1` at build time (Mac App Store and iPadOS builds): no updater, sandbox-safe paths.
pub const APP_STORE_BUILD: bool = match option_env!("TDJ_APP_STORE") {
    Some(v) => v.len() == 1 && v.as_bytes()[0] == b'1',
    None => false,
};
pub const MAIN: &str = "main";
const LOGIN: &str = "login";
/// Written by scripts/build-ui.mjs next to the bundled UI.
const BUNDLE_MARKER: &str = "tdj-bundle.json";

pub struct AppState {
    pub settings: Mutex<settings::Settings>,
    pub config_dir: PathBuf,
    pub data_dir: PathBuf,
    pub bridge: Arc<bridge::Bridge>,
    pub folders: Mutex<folders::Store>,
    pub keep_awake: system::KeepAwake,
    pub bundled: bool,
    tickets: Mutex<Option<(String, bool)>>,
}

fn api_base() -> &'static str {
    if cfg!(windows) {
        "http://tdjapi.localhost"
    } else {
        "tdjapi://localhost"
    }
}

/// Runs before any page script, on every page of the main window (bundled UI or the server's pages).
fn init_script(state: &AppState) -> String {
    let native = serde_json::json!({
        "platform": commands::platform(),
        "version": env!("CARGO_PKG_VERSION"),
        "bundled": state.bundled,
        "server": state.bridge.server(),
        "apiBase": api_base(),
        "appStore": APP_STORE_BUILD,
        "updater": cfg!(feature = "updater"),
        "vibrancy": false,
        // macOS draws the page under a transparent title bar (build_main): the page reserves it (layout.tsx)
        "titleBar": if cfg!(target_os = "macos") { "overlay" } else { "native" },
    });
    format!(
        "window.__TDJ_NATIVE__=Object.freeze({native});\
         document.addEventListener('DOMContentLoaded',()=>document.documentElement.classList.add('native'));\
         addEventListener('blur',()=>document.documentElement.setAttribute('data-window-inactive',''));\
         addEventListener('focus',()=>document.documentElement.removeAttribute('data-window-inactive'));"
    )
}

/// The page the main window opens: first launch asks for a server; then the bundle or the server itself.
fn start_url(state: &AppState) -> WebviewUrl {
    let chosen = state.settings.lock().unwrap().server.is_some();
    if !chosen {
        return WebviewUrl::App("tdj-server.html".into());
    }
    if state.bundled {
        WebviewUrl::App("index.html".into())
    } else {
        WebviewUrl::External(state.bridge.server().parse().expect("valid origin"))
    }
}

fn app_origin(u: &Url) -> bool {
    matches!(u.scheme(), "tauri" | "asset") || u.host_str() == Some("tauri.localhost")
}

/// Main-window navigation policy: stay on the app (or the server in remote mode); logins go to the system
/// browser; every other site opens in the default browser.
fn on_navigate(app: &AppHandle, url: &Url) -> bool {
    let state = app.state::<AppState>();
    let server = state.bridge.server();
    let local = app_origin(url);
    let on_server = links::same_origin(url, &server);
    if local || on_server {
        if let Some(provider) = url
            .path()
            .strip_prefix("/api/")
            .and_then(|p| p.strip_suffix("/login"))
            .filter(|p| links::PROVIDERS.contains(p))
        {
            let get = |k: &str| {
                url.query_pairs()
                    .find(|(q, _)| q == k)
                    .map(|(_, v)| v.into_owned())
            };
            login(app, provider.to_string(), get("scope"), get("next"));
            return false;
        }
        return true;
    }
    if !state.bundled && is_oauth_host(url) {
        return true; // remote-mode fallback: Spotify/Dropbox accept a web view
    }
    if matches!(url.scheme(), "https" | "mailto") {
        let _ = app.opener().open_url(url.as_str(), None::<&str>);
    }
    false
}

fn is_oauth_host(url: &Url) -> bool {
    matches!(
        url.host_str(),
        Some("accounts.spotify.com" | "www.dropbox.com" | "dropbox.com")
    )
}

fn build_main(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let state = app.state::<AppState>();
    let handle = app.clone();
    let b = WebviewWindowBuilder::new(app, MAIN, start_url(&state))
        .initialization_script(init_script(&state))
        .on_navigation(move |u| on_navigate(&handle, u));
    #[cfg(desktop)]
    let b = b
        .title("T-DJ")
        .inner_size(1280.0, 820.0)
        .min_inner_size(900.0, 600.0);
    // Content to the window edge under a transparent title bar (r22-motion.md §4.5), with the traffic lights at
    // their standard place: the page reserves a 28 pt title-bar strip and a 78 pt leading inset for them
    // (`html.titlebar-overlay`, set by the page from `titleBar` below) and marks its bars `data-tauri-drag-region`. Round 23: the
    // lights used to sit at (20, 20), inside the sidebar's logo and over the header, with nothing reserved.
    #[cfg(target_os = "macos")]
    let b = b
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true)
        .on_page_load(|w, p| {
            if p.event() == PageLoadEvent::Finished {
                mark_fullscreen(&w);
            }
        });
    let w = b.build()?;
    // full screen hides the title bar and the lights: the page drops the reserved strip
    #[cfg(target_os = "macos")]
    {
        let wc = w.clone();
        w.on_window_event(move |e| {
            if let tauri::WindowEvent::Resized(_) = e {
                mark_fullscreen(&wc);
            }
        });
    }
    #[cfg(target_os = "ios")]
    let _ = w.with_webview(|v| apple::tune_ios_webview(v.inner()));
    Ok(w)
}

/// `html[data-fullscreen]` while the window is full screen (macOS): the title-bar strip goes away with the bar.
#[cfg(target_os = "macos")]
fn mark_fullscreen(w: &WebviewWindow) {
    let fs = w.is_fullscreen().unwrap_or(false);
    let _ = w.eval(format!(
        "document.documentElement.toggleAttribute('data-fullscreen',{fs})"
    ));
}

/// Can this server finish a login in the system browser (the `client=app` ticket branch)? Cached per server.
async fn server_has_tickets(app: &AppHandle, server: &str) -> bool {
    let state = app.state::<AppState>();
    if let Some((s, ok)) = state.tickets.lock().unwrap().clone() {
        if s == server {
            return ok;
        }
    }
    let ok = match reqwest::Client::new()
        .get(format!("{server}/api/app/redeem"))
        .send()
        .await
    {
        Ok(r) => r.status().as_u16() != 404,
        Err(_) => false,
    };
    *state.tickets.lock().unwrap() = Some((server.to_string(), ok));
    ok
}

pub(crate) fn login(
    app: &AppHandle,
    provider: String,
    scope: Option<String>,
    next: Option<String>,
) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let server = app.state::<AppState>().bridge.server();
        if server_has_tickets(&app, &server).await {
            if let Some(u) = links::login_url(&server, &provider, scope.as_deref(), next.as_deref())
            {
                let _ = app.opener().open_url(u, None::<&str>);
            }
            return;
        }
        if provider == "google" {
            app.dialog()
                .message("Google sign-in needs your TDJ server to be updated for the app. Until then, connect Google from the website.")
                .title("Connect Google")
                .show(|_| {});
            return;
        }
        // Fallback with no server change: a sign-in window on the server's own origin; its cookies join the jar.
        let next = next
            .as_deref()
            .and_then(links::safe_path)
            .unwrap_or_else(|| "/settings".into());
        let Ok(mut url) =
            Url::parse(&server).and_then(|s| s.join(&format!("/api/{provider}/login")))
        else {
            return;
        };
        url.query_pairs_mut().append_pair("next", "/settings");
        if let Some(s) = scope
            .as_deref()
            .filter(|s| matches!(*s, "drive" | "youtube"))
        {
            url.query_pairs_mut().append_pair("scope", s);
        }
        let handle = app.clone();
        let server_c = server.clone();
        let b = WebviewWindowBuilder::new(&app, LOGIN, WebviewUrl::External(url)).on_page_load(
            move |w, p| {
                let u = p.url();
                if p.event() != PageLoadEvent::Finished
                    || !links::same_origin(u, &server_c)
                    || u.path().starts_with("/api/")
                {
                    return;
                }
                let state = handle.state::<AppState>();
                if let Ok(cookies) = w.cookies_for_url(Url::parse(&server_c).expect("origin")) {
                    state.bridge.import_cookies(cookies);
                }
                let _ = w.close();
                if let Some(main) = handle.get_webview_window(MAIN) {
                    let target = if state.bundled {
                        next.clone()
                    } else {
                        format!("{server_c}{next}")
                    };
                    let js = format!(
                        "location.assign({})",
                        serde_json::to_string(&target).unwrap()
                    );
                    let _ = main.eval(js);
                }
            },
        );
        #[cfg(desktop)]
        let b = b.title("Sign in").inner_size(520.0, 720.0);
        let _ = b.build();
    });
}

/// Rejects addresses that are not a TDJ server (so a typo does not become a blank window).
pub(crate) async fn check_server(origin: &str) -> Result<(), String> {
    let r = reqwest::Client::new()
        .get(format!("{origin}/api/admin/public"))
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|_| {
            "TDJ can't reach that server. Check the address and your connection.".to_string()
        })?;
    if r.status().is_success() {
        Ok(())
    } else {
        Err("That address answers, but it is not a TDJ server.".into())
    }
}

pub(crate) fn apply_server(app: &AppHandle, origin: &str) -> std::io::Result<()> {
    let state = app.state::<AppState>();
    {
        let mut s = state.settings.lock().unwrap();
        s.server = Some(origin.to_string());
        s.trust(origin);
        s.save(&state.config_dir)?;
    }
    state.bridge.set_server(origin.to_string());
    if origin != settings::DEFAULT_SERVER {
        grant_remote(app, origin);
    }
    if let Some(main) = app.get_webview_window(MAIN) {
        let target = if state.bundled {
            main.url().ok().and_then(|u| u.join("/index.html").ok())
        } else {
            Url::parse(origin).ok()
        };
        if let Some(t) = target {
            let _ = main.navigate(t);
        }
    }
    Ok(())
}

/// A self-hosted server the DJ trusted gets the same IPC rights the TDJ cloud has (capabilities/remote.json).
fn grant_remote(app: &AppHandle, origin: &str) {
    let mut cap = tauri::ipc::CapabilityBuilder::new(format!(
        "remote-{}",
        origin.replace([':', '/', '.'], "-")
    ))
    .remote(format!("{origin}/*"))
    .window(MAIN);
    for c in REMOTE_COMMANDS {
        cap = cap.permission(format!("allow-{}", c.replace('_', "-")));
    }
    let _ = app.add_capability(cap);
}

/// What a page served by a remote origin may call (no server switching, no session wiping).
const REMOTE_COMMANDS: &[&str] = &[
    "get_native_info",
    "start_login",
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

fn handle_link(app: &AppHandle, raw: &str) {
    let Some(link) = links::parse(raw) else {
        log::warn!("ignored deep link");
        return;
    };
    let state = app.state::<AppState>();
    let server = state.bridge.server();
    let bundled = state.bundled;
    let Some(main) = app.get_webview_window(MAIN) else {
        return;
    };
    let _ = main.set_focus();
    let go = |path: &str| {
        if bundled {
            let _ = main.eval(format!(
                "location.assign({})",
                serde_json::to_string(path).unwrap()
            ));
        } else if let Ok(u) = Url::parse(&format!("{server}{path}")) {
            let _ = main.navigate(u);
        }
    };
    match link {
        links::DeepLink::AuthTicket {
            provider,
            ticket,
            next,
        } => {
            let Some(redeem) = links::redeem_url(&server, &provider, &ticket, &next) else {
                return;
            };
            if bundled {
                let bridge = state.bridge.clone();
                let main = main.clone();
                tauri::async_runtime::spawn(async move {
                    let req = tauri::http::Request::builder()
                        .uri(redeem.replacen(&bridge.server(), api_base(), 1))
                        .body(Vec::new())
                        .unwrap();
                    let _ = bridge.handle(req).await;
                    let _ = main.eval(format!(
                        "location.assign({})",
                        serde_json::to_string(&next).unwrap()
                    ));
                });
            } else if let Ok(u) = Url::parse(&redeem) {
                let _ = main.navigate(u);
            }
        }
        links::DeepLink::SpotifyCallback { query } => go(&format!("/callback?{query}")),
        links::DeepLink::Open { path } => go(&path),
        links::DeepLink::Server { url } => {
            let Ok(origin) = settings::normalize_server(&url) else {
                return;
            };
            let app = app.clone();
            app.dialog()
                .message(format!("Use this TDJ server?\n\n{origin}\n\nOnly continue if you trust the person who runs it."))
                .title("Change server")
                .buttons(MessageDialogButtons::OkCancelCustom("Use This Server".into(), "Cancel".into()))
                .show(move |yes| {
                    if yes {
                        let _ = apply_server(&app, &origin);
                    }
                });
        }
    }
}

#[cfg(desktop)]
fn on_menu(app: &AppHandle, id: &str) {
    match id {
        "app.server" => {
            if let Some(main) = app.get_webview_window(MAIN) {
                let page = if cfg!(windows) {
                    "http://tauri.localhost/tdj-server.html"
                } else {
                    "tauri://localhost/tdj-server.html"
                };
                let _ = main.navigate(Url::parse(page).expect("static url"));
            }
            return;
        }
        "app.updates" => return updates::check(app.clone(), true),
        "help.issue" => {
            let _ = app
                .opener()
                .open_url("https://github.com/ArioMoniri/TDJ/issues/new", None::<&str>);
            return;
        }
        "help.privacy" => {
            let _ = app.opener().open_url(
                "https://github.com/ArioMoniri/TDJ/blob/HEAD/docs/PRIVACY.md",
                None::<&str>,
            );
            return;
        }
        "export.print" => {
            if let Some(main) = app.get_webview_window(MAIN) {
                let _ = main.print();
            }
            return;
        }
        _ => {}
    }
    if let Some(main) = app.get_webview_window(MAIN) {
        let _ = main.eval(menu::dispatch_js(id));
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_deep_link::init());
    #[cfg(feature = "updater")]
    let builder = builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init());

    builder
        .register_asynchronous_uri_scheme_protocol("tdjapi", |ctx, request, responder| {
            let bridge = ctx.app_handle().state::<AppState>().bridge.clone();
            tauri::async_runtime::spawn(async move {
                responder.respond(bridge.handle(request).await);
            });
        })
        .setup(|app| {
            let config_dir = app.path().app_config_dir()?;
            let data_dir = app.path().app_data_dir()?;
            let mut s = settings::Settings::load(&config_dir);
            // a server that is no longer valid (edited file) falls back to the first-launch question
            if let Some(cur) = s.server.clone() {
                if settings::normalize_server(&cur).is_err() {
                    s.server = None;
                }
            }
            let server = s.server_or_default();
            let bundled = app.asset_resolver().get(BUNDLE_MARKER.into()).is_some();
            let trusted: Vec<String> = s.trusted.clone();
            app.manage(AppState {
                bridge: Arc::new(bridge::Bridge::new(server, &data_dir)),
                folders: Mutex::new(folders::Store::load(&data_dir)),
                settings: Mutex::new(s),
                keep_awake: system::KeepAwake::default(),
                config_dir,
                data_dir,
                bundled,
                tickets: Mutex::new(None),
            });
            for origin in trusted
                .iter()
                .filter(|o| o.as_str() != settings::DEFAULT_SERVER)
            {
                grant_remote(app.handle(), origin);
            }

            #[cfg(desktop)]
            {
                let m = menu::build(app.handle(), cfg!(feature = "updater"))?;
                app.set_menu(m)?;
                app.on_menu_event(|app, e| on_menu(app, e.id().as_ref()));
            }
            #[cfg(target_os = "ios")]
            apple::audio_session_playback();
            #[cfg(any(target_os = "macos", target_os = "ios"))]
            {
                let h = app.handle().clone();
                apple::register_remote_commands(move |id| {
                    if let Some(main) = h.get_webview_window(MAIN) {
                        let _ = main.eval(menu::dispatch_js(id));
                    }
                });
            }

            build_main(app.handle())?;

            let h = app.handle().clone();
            app.deep_link().on_open_url(move |e| {
                for u in e.urls() {
                    handle_link(&h, u.as_str());
                }
            });
            if let Ok(Some(urls)) = app.deep_link().get_current() {
                for u in urls {
                    handle_link(app.handle(), u.as_str());
                }
            }
            #[cfg(feature = "updater")]
            updates::check(app.handle().clone(), false);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_native_info,
            commands::set_server,
            commands::start_login,
            commands::forget_sessions,
            commands::open_external,
            commands::save_file,
            commands::print_page,
            commands::keep_awake,
            commands::now_playing,
            commands::folder_add,
            commands::folder_list,
            commands::folder_remove,
            commands::folder_files,
            commands::folder_read,
            commands::cue_devices,
            commands::cue_play,
            commands::cue_stop,
            commands::check_updates,
        ])
        .build(tauri::generate_context!())
        .expect("error while building TDJ")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                let state = app.state::<AppState>();
                state.keep_awake.set(false);
                state.bridge.persist();
            }
        });
}

#[cfg(test)]
mod tests {
    #[test]
    fn remote_commands_are_a_subset_of_the_manifest() {
        let manifest = include_str!("../build.rs");
        for c in super::REMOTE_COMMANDS {
            assert!(
                manifest.contains(&format!("\"{c}\"")),
                "{c} missing from build.rs"
            );
        }
        for forbidden in ["set_server", "forget_sessions"] {
            assert!(!super::REMOTE_COMMANDS.contains(&forbidden));
        }
    }

    #[test]
    fn capability_files_match_the_commands() {
        let remote = include_str!("../capabilities/remote.json");
        for c in super::REMOTE_COMMANDS {
            assert!(
                remote.contains(&format!("\"allow-{}\"", c.replace('_', "-"))),
                "{c} missing in remote.json"
            );
        }
        assert!(!remote.contains("allow-set-server"));
        assert!(remote.contains(super::settings::DEFAULT_SERVER));
    }
}
