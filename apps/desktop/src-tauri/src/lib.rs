//! TDJ for macOS and iPadOS (r22-apps-plan.md), standalone: each installed app works entirely on its own device.
//! - **bundled** (store builds, and the DMG): the UI is a static export of apps/web packaged in the app
//!   (`scripts/build-ui.mjs`, TDJ_TARGET=app) with the catalogue; the composer runs in the page (a Web Worker) and
//!   every `/api/*` request is answered on the device. Native help: HTTP without CORS and model calls (`net.rs`),
//!   the Keychain (`secrets.rs`), SQLite (tauri-plugin-sql). A TDJ server is an opt-in link, off by default
//!   (`settings.rs`, `bridge.rs`).
//! - **remote** (development only, a bundle-less build with a linked server): the window loads that server.
//!
//! Native value on top: menu bar + shortcuts, Now Playing and media keys, keep-awake for the night, linked music
//! folders (security-scoped bookmarks), a headphone cue device, native save/print, system-browser logins.

mod agents;
#[cfg(any(target_os = "macos", target_os = "ios"))]
mod apple;
#[cfg(any(target_os = "macos", target_os = "ios"))]
mod apple_audio;
mod audio;
mod bridge;
mod commands;
#[cfg_attr(mobile, allow(dead_code))] // folder picking on iPad: Swift plugin, see folders.rs
mod folders;
mod links;
#[cfg_attr(mobile, allow(dead_code))] // the menu bar is macOS-only
mod menu;
mod net;
mod secrets;
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
    /// the DJ's model keys and the Spotify session (the Keychain on Apple platforms)
    pub secrets: Box<dyn secrets::SecretStore>,
    /// the app's own HTTP client (no cookies): the lookups, model providers, Spotify accounts
    pub http: reqwest::Client,
    /// local ACP agents the Mac app started (Settings → Models)
    pub agents: agents::Agents,
    /// the Spotify access token in memory (the refresh token stays in the Keychain)
    pub spotify: Mutex<Option<net::SpotifyAccess>>,
    tickets: Mutex<Option<(String, bool)>>,
}

/// The Spotify Client ID this build ships with (public: PKCE needs no secret). Repository variable of the same name.
pub const SPOTIFY_CLIENT_ID: Option<&str> = option_env!("TDJ_SPOTIFY_CLIENT_ID");

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
        "linkedServer": state.bridge.server(),
        "spotifyClientId": SPOTIFY_CLIENT_ID.filter(|c| !c.is_empty()),
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

/// The page the main window opens: the bundled app, always (no first-launch server question). Only a development
/// build without the bundle loads a linked server's own pages.
fn start_url(state: &AppState) -> WebviewUrl {
    if state.bundled {
        return WebviewUrl::App("index.html".into());
    }
    match state.bridge.server().and_then(|s| s.parse().ok()) {
        Some(u) => WebviewUrl::External(u),
        None => WebviewUrl::App("index.html".into()),
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
    let on_server = server
        .as_deref()
        .is_some_and(|s| links::same_origin(url, s));
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
            if local {
                // the bundled UI signs in from the device (Spotify: PKCE; others: a linked server), lib/app/login.ts
                if let Some(main) = app.get_webview_window(MAIN) {
                    let next = get("next")
                        .and_then(|n| links::safe_path(&n))
                        .unwrap_or_else(|| "/settings".into());
                    let _ = main.eval(format!(
                        "window.__TDJ_APP__&&window.__TDJ_APP__.login({},{})",
                        serde_json::to_string(provider).unwrap(),
                        serde_json::to_string(&next).unwrap()
                    ));
                }
            } else {
                login(app, provider.to_string(), get("scope"), get("next"));
            }
            return false;
        }
        return true;
    }
    if !state.bundled && is_oauth_host(url) {
        return true; // remote-mode fallback: Spotify/Dropbox accept a web view
    }
    // other sites and the music apps' own schemes ("Open Spotify"): never this view, always the system
    if links::external_ok(url) {
        let _ = open_outside(app, url);
    }
    false
}

/// A link outside the app: on macOS a Spotify / Apple Music link opens their app when it is installed, else the
/// browser; iOS and iPadOS hand universal links to the installed app themselves (links.rs `mac_app_url`).
pub(crate) fn open_outside(app: &AppHandle, url: &Url) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    if let Some(native) = links::mac_app_url(url) {
        if app.opener().open_url(&native, None::<&str>).is_ok() {
            return Ok(());
        }
    }
    app.opener()
        .open_url(url.as_str(), None::<&str>)
        .map_err(|e| e.to_string())
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
        let Some(server) = app.state::<AppState>().bridge.server() else {
            app.dialog()
                .message("Link your TDJ server under Settings → Connections to use this.")
                .title("No server linked")
                .show(|_| {});
            return;
        };
        if server_has_tickets(&app, &server).await {
            if let Some(u) = links::login_url(&server, &provider, scope.as_deref(), next.as_deref())
            {
                let _ = app.opener().open_url(u, None::<&str>);
            }
            return;
        }
        if provider == "google" {
            app.dialog()
                .message("Google sign-in needs a newer version of your TDJ server. Until then, connect Google on its website.")
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

/// Turns the opt-in link on (Settings → Connections, or a confirmed `tdj://server` link).
pub(crate) fn apply_server(app: &AppHandle, origin: &str) -> std::io::Result<()> {
    let state = app.state::<AppState>();
    {
        let mut s = state.settings.lock().unwrap();
        s.server = Some(origin.to_string());
        s.link = true;
        s.trust(origin);
        s.save(&state.config_dir)?;
    }
    state.bridge.set_server(Some(origin.to_string()));
    if !state.bundled {
        // development: the window shows the linked server's own pages
        grant_remote(app, origin);
        if let (Some(main), Ok(u)) = (app.get_webview_window(MAIN), Url::parse(origin)) {
            let _ = main.navigate(u);
        }
    }
    Ok(())
}

/// Turns the link off: the app is standalone again and the server's session cookies are forgotten.
pub(crate) fn unlink_server(app: &AppHandle) -> std::io::Result<()> {
    let state = app.state::<AppState>();
    {
        let mut s = state.settings.lock().unwrap();
        s.link = false;
        s.save(&state.config_dir)?;
    }
    state.bridge.set_server(None);
    Ok(())
}

/// Development only (remote mode): the linked server's own pages get the native commands a page may use.
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
    let server = state.bridge.server().unwrap_or_default();
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
            if server.is_empty() {
                return;
            }
            let Some(redeem) = links::redeem_url(&server, &provider, &ticket, &next) else {
                return;
            };
            if bundled {
                let bridge = state.bridge.clone();
                let main = main.clone();
                tauri::async_runtime::spawn(async move {
                    let req = tauri::http::Request::builder()
                        .uri(redeem.replacen(&bridge.server().unwrap_or_default(), api_base(), 1))
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
        links::DeepLink::Night { fragment } => go(&format!("/night#{fragment}")),
        // the Rooms page asks before it talks to that server (the one opt-in case where the app reaches a server)
        links::DeepLink::Room { server, code } => go(&format!(
            "/rooms?join={code}&server={}",
            url::form_urlencoded::byte_serialize(server.as_bytes()).collect::<String>()
        )),
        links::DeepLink::NightFile { path } => {
            // the page reads it from sessionStorage (apps/web/src/app/night/page.tsx); 2 MB is far past any night
            let Ok(meta) = std::fs::metadata(&path) else {
                return;
            };
            if meta.len() > 2_000_000 {
                return;
            }
            let Ok(text) = std::fs::read_to_string(&path) else {
                return;
            };
            let _ = main.eval(format!(
                "try{{sessionStorage.setItem('tdj-night-file',{})}}catch(_){{}};location.assign('/night?from=file')",
                serde_json::to_string(&text).unwrap()
            ));
        }
        links::DeepLink::Server { url } => {
            let Ok(origin) = settings::normalize_server(&url) else {
                return;
            };
            let app = app.clone();
            app.dialog()
                .message(format!("Link this TDJ server?\n\n{origin}\n\nT-DJ keeps working on this device; the server gets your database changes and serves Google, Dropbox and rooms. Only continue if you trust the person who runs it."))
                .title("Link a server")
                .buttons(MessageDialogButtons::OkCancelCustom("Link This Server".into(), "Cancel".into()))
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
            // Settings → Connections (the opt-in server link)
            if let Some(main) = app.get_webview_window(MAIN) {
                let _ = main.eval("location.assign('/settings#app-connections')");
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
        // the on-device database (sqlite:tdj.db in the app's data folder); migrations: apps/web/src/lib/app/store.ts
        .plugin(tauri_plugin_sql::Builder::default().build())
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
            // a server address that is no longer valid (edited file) is dropped: the app stays standalone
            if let Some(cur) = s.server.clone() {
                if settings::normalize_server(&cur).is_err() {
                    s.server = None;
                    s.link = false;
                }
            }
            let linked = s.linked();
            let bundled = app.asset_resolver().get(BUNDLE_MARKER.into()).is_some();
            app.manage(AppState {
                bridge: Arc::new(bridge::Bridge::new(linked.clone(), &data_dir)),
                folders: Mutex::new(folders::Store::load(&data_dir)),
                settings: Mutex::new(s),
                keep_awake: system::KeepAwake::default(),
                config_dir,
                data_dir,
                bundled,
                secrets: secrets::platform_store(),
                http: reqwest::Client::builder()
                    .user_agent(net::UA)
                    // a lookup may only be redirected to its own hosts (the Cover Art Archive → archive.org)
                    .redirect(reqwest::redirect::Policy::custom(|a| {
                        if a.previous().len() >= 3 || !net::redirect_allowed(a.url()) {
                            a.stop()
                        } else {
                            a.follow()
                        }
                    }))
                    .build()
                    .expect("http client"),
                spotify: Mutex::new(None),
                agents: agents::Agents::default(),
                tickets: Mutex::new(None),
            });
            if let (false, Some(origin)) = (bundled, linked.as_deref()) {
                grant_remote(app.handle(), origin);
            }

            #[cfg(desktop)]
            {
                let m = menu::build(app.handle(), cfg!(feature = "updater"))?;
                app.set_menu(m)?;
                app.on_menu_event(|app, e| on_menu(app, e.id().as_ref()));
            }
            // the audio session (iOS: .playback, interruptions, route changes) and the Mac's device listeners
            audio::install(app.handle());
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
            commands::unlink_server,
            commands::secret_set,
            commands::secret_has,
            commands::secret_delete,
            commands::net_fetch,
            commands::model_fetch,
            commands::acp_spawn,
            commands::acp_write,
            commands::acp_read,
            commands::acp_kill,
            commands::spotify_token,
            commands::spotify_access,
            commands::spotify_logout,
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
            audio::audio_route,
            audio::audio_route_picker,
            audio::audio_set_output,
            audio::audio_night,
        ])
        .build(tauri::generate_context!())
        .expect("error while building TDJ")
        .run(|app, event| {
            // a .tdjnight opened from Finder, Files or AirDrop (bundle.fileAssociations)
            #[cfg(any(target_os = "macos", target_os = "ios"))]
            if let tauri::RunEvent::Opened { urls } = &event {
                for u in urls {
                    handle_link(app, u.as_str());
                }
            }
            if let tauri::RunEvent::Exit = event {
                let state = app.state::<AppState>();
                state.keep_awake.set(false);
                state.agents.kill_all();
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
    fn the_app_names_no_server() {
        let default = include_str!("../capabilities/default.json");
        let conf = include_str!("../tauri.conf.json");
        for text in [default, conf] {
            assert!(!text.contains(".cloudfront."));
            assert!(!text.contains("\"remote\""));
        }
        for c in super::REMOTE_COMMANDS {
            assert!(
                default.contains(&format!("\"allow-{}\"", c.replace('_', "-"))),
                "{c} missing in default.json"
            );
        }
        for c in [
            "unlink-server",
            "secret-set",
            "net-fetch",
            "model-fetch",
            "acp-spawn",
            "spotify-token",
        ] {
            assert!(
                default.contains(&format!("\"allow-{c}\"")),
                "{c} missing in default.json"
            );
        }
        assert!(default.contains("\"sql:allow-execute\""));
    }

    #[test]
    fn a_remote_page_never_reads_secrets_or_switches_server() {
        for c in [
            "secret_set",
            "secret_has",
            "secret_delete",
            "model_fetch",
            "acp_spawn",
            "acp_write",
            "acp_read",
            "acp_kill",
            "net_fetch",
            "spotify_token",
            "spotify_access",
            "unlink_server",
        ] {
            assert!(
                !super::REMOTE_COMMANDS.contains(&c),
                "{c} must stay app-only"
            );
        }
    }
}
