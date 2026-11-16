//! IPC commands the page may call (`window.__TAURI_INTERNALS__.invoke(name, args)`). Every one is listed in
//! build.rs (app manifest) and granted per window in capabilities/*.json; nothing else is reachable from a page.

use crate::{agents, folders, links, net, secrets, settings, system, AppState};
use serde::Serialize;
use tauri::{AppHandle, Manager, State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

type Res<T> = Result<T, String>;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeInfo {
    pub platform: &'static str,
    pub version: &'static str,
    /// the TDJ server the DJ linked (Settings → Connections), when the link is on; none by default
    pub linked_server: Option<String>,
    /// the Spotify Client ID this build ships with (public; PKCE needs no secret)
    pub spotify_client_id: Option<&'static str>,
    pub bundled: bool,
    pub app_store: bool,
    pub updater: bool,
}

pub fn platform() -> &'static str {
    if cfg!(target_os = "ios") {
        "ipados"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(windows) {
        "windows"
    } else {
        "linux"
    }
}

#[tauri::command]
pub fn get_native_info(state: State<'_, AppState>) -> NativeInfo {
    NativeInfo {
        platform: platform(),
        version: env!("CARGO_PKG_VERSION"),
        linked_server: state.bridge.server(),
        spotify_client_id: crate::SPOTIFY_CLIENT_ID.filter(|c| !c.is_empty()),
        bundled: state.bundled,
        app_store: crate::APP_STORE_BUILD,
        updater: cfg!(feature = "updater"),
    }
}

/// Settings → Connections → "Link a TDJ server" (opt-in): returns the normalised origin, or a sentence to show
/// under the field.
#[tauri::command]
pub async fn set_server(app: AppHandle, url: String) -> Res<String> {
    let origin = settings::normalize_server(&url).map_err(|e| e.to_string())?;
    crate::check_server(&origin).await?;
    crate::apply_server(&app, &origin).map_err(|e| e.to_string())?;
    Ok(origin)
}

/// Settings → Connections → "Unlink this server": the app is standalone again.
#[tauri::command]
pub fn unlink_server(app: AppHandle) -> Res<()> {
    crate::unlink_server(&app).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------- Keychain (model keys)

#[tauri::command]
pub fn secret_set(state: State<'_, AppState>, name: String, value: String) -> Res<()> {
    secrets::page_set(state.secrets.as_ref(), &name, &value)
}

/// Whether a key is saved; the page never reads one back.
#[tauri::command]
pub fn secret_has(state: State<'_, AppState>, name: String) -> bool {
    secrets::page_may_write(&name) && state.secrets.get(&name).is_some()
}

#[tauri::command]
pub fn secret_delete(state: State<'_, AppState>, name: String) -> Res<()> {
    if !secrets::page_may_write(&name) {
        return Err("Unknown key.".into());
    }
    state.secrets.delete(&name)
}

// ---------------------------------------------------------------- network (no TDJ server involved)

/// Deezer and MusicBrainz lookups for the on-device routes (api.deezer.com sends no CORS headers).
#[tauri::command]
pub async fn net_fetch(
    state: State<'_, AppState>,
    req: net::WireRequest,
) -> Result<net::WireResponse, net::NetError> {
    net::fetch(&state.http, req).await
}

/// One request of the provider layer (apps/web/src/lib/ai/providers.ts) to a model provider: the provider is the
/// request's host, and the DJ's key for that provider comes from the Keychain in place of the page's mark.
#[tauri::command]
pub async fn model_fetch(
    state: State<'_, AppState>,
    req: net::WireRequest,
) -> Result<net::WireResponse, net::NetError> {
    let method = req.method.as_deref().unwrap_or("POST").to_ascii_uppercase();
    let (_, provider) = net::model_target(&req.url, &method)?;
    let Some(key) = state
        .secrets
        .get(&net::key_name(provider))
        .filter(|k| !k.is_empty())
    else {
        return Err(net::NetError::new(
            "No API key for this provider. Add one in Settings → Models.",
            401,
        ));
    };
    net::model_fetch(&state.http, req, provider, &key).await
}

// ---------------------------------------------------------------- local ACP agents (the Mac app)

/// Starts the agent command the DJ entered (Settings → Models → Keys and agents); returns its id.
#[tauri::command]
pub fn acp_spawn(state: State<'_, AppState>, command: String, args: Vec<String>) -> Res<u32> {
    state.agents.spawn(&command, &args)
}
/// One protocol line to the agent.
#[tauri::command]
pub fn acp_write(state: State<'_, AppState>, id: u32, data: String) -> Res<()> {
    state.agents.write(id, &data)
}
/// What the agent printed since the last read, and whether it stopped.
#[tauri::command]
pub fn acp_read(state: State<'_, AppState>, id: u32) -> Res<agents::Read> {
    state.agents.read(id)
}
#[tauri::command]
pub fn acp_kill(state: State<'_, AppState>, id: u32) {
    state.agents.kill(id)
}

// ---------------------------------------------------------------- Spotify (PKCE, tokens in the Keychain)

/// The end of the PKCE sign-in: the page's checked code-exchange form → tokens; the refresh token goes to the
/// Keychain, the short-lived access token stays in memory and is handed to the page.
#[tauri::command]
pub async fn spotify_token(
    state: State<'_, AppState>,
    client_id: String,
    form: String,
) -> Result<net::SpotifyAccess, net::NetError> {
    net::check_exchange_form(&form, &client_id)?;
    let j = net::spotify_token_request(&state.http, form).await?;
    let t = net::parse_token(&j, net::now_ms())?;
    if let Some(r) = &t.refresh {
        state
            .secrets
            .set(secrets::SPOTIFY_REFRESH, r)
            .map_err(|m| net::NetError::new(m, 500))?;
    }
    *state.spotify.lock().unwrap() = Some(t.access.clone());
    Ok(t.access)
}

/// A valid access token, refreshed from the Keychain when needed; none when the DJ is not signed in.
#[tauri::command]
pub async fn spotify_access(
    state: State<'_, AppState>,
    client_id: String,
) -> Result<Option<net::SpotifyAccess>, net::NetError> {
    let cached = state.spotify.lock().unwrap().clone();
    if let Some(a) = cached.filter(|a| a.expires > net::now_ms() + 60_000) {
        return Ok(Some(a));
    }
    let Some(refresh) = state.secrets.get(secrets::SPOTIFY_REFRESH) else {
        return Ok(None);
    };
    match net::spotify_token_request(&state.http, net::refresh_form(&client_id, &refresh)).await {
        Ok(j) => {
            let t = net::parse_token(&j, net::now_ms())?;
            if let Some(r) = t.refresh.as_deref().filter(|r| *r != refresh) {
                let _ = state.secrets.set(secrets::SPOTIFY_REFRESH, r);
            }
            *state.spotify.lock().unwrap() = Some(t.access.clone());
            Ok(Some(t.access))
        }
        // the grant is gone (revoked, or another Client ID): signed out, not an error
        Err(e) if e.status == 401 => {
            let _ = state.secrets.delete(secrets::SPOTIFY_REFRESH);
            *state.spotify.lock().unwrap() = None;
            Ok(None)
        }
        Err(e) => Err(e),
    }
}

#[tauri::command]
pub fn spotify_logout(state: State<'_, AppState>) -> Res<()> {
    *state.spotify.lock().unwrap() = None;
    state.secrets.delete(secrets::SPOTIFY_REFRESH)
}

#[tauri::command]
pub fn start_login(
    app: AppHandle,
    provider: String,
    scope: Option<String>,
    next: Option<String>,
) -> Res<()> {
    if !links::PROVIDERS.contains(&provider.as_str()) {
        return Err("Unknown service.".into());
    }
    crate::login(&app, provider, scope, next);
    Ok(())
}

/// Forget this device's sessions with the server (Settings → "Sign out everywhere on this Mac").
#[tauri::command]
pub fn forget_sessions(state: State<'_, AppState>) {
    state.bridge.forget_session();
}

#[tauri::command]
pub fn open_external(app: AppHandle, url: String) -> Res<()> {
    let u = url::Url::parse(&url).map_err(|_| "Not a link.")?;
    if !links::external_ok(&u) {
        return Err("Only https links open outside the app.".into());
    }
    crate::open_outside(&app, &u)
}

/// Exports: a native save panel (macOS) / the Files app picker (iPadOS) instead of WebKit's silent no-op.
#[tauri::command]
pub async fn save_file(app: AppHandle, name: String, bytes: Vec<u8>) -> Res<Option<String>> {
    let safe: String = name
        .chars()
        .filter(|c| !matches!(c, '/' | '\\' | ':' | '\0'))
        .take(120)
        .collect();
    let (tx, rx) = std::sync::mpsc::channel();
    app.dialog()
        .file()
        .set_file_name(if safe.is_empty() {
            "TDJ export".into()
        } else {
            safe
        })
        .save_file(move |p| {
            let _ = tx.send(p);
        });
    let Some(path) = rx.recv().ok().flatten() else {
        return Ok(None);
    };
    let path = path.into_path().map_err(|e| e.to_string())?;
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(Some(path.to_string_lossy().into()))
}

#[tauri::command]
pub fn print_page(window: WebviewWindow) -> Res<()> {
    #[cfg(desktop)]
    return window.print().map_err(|e| e.to_string());
    // TODO(mac): UIPrintInteractionController in the iPad Swift plugin; until then Export → PDF/share.
    #[cfg(mobile)]
    {
        let _ = window;
        Err("Printing from iPhone and iPad arrives with the next build. Use Export → Share.".into())
    }
}

#[tauri::command]
pub fn keep_awake(app: AppHandle, state: State<'_, AppState>, on: bool) -> bool {
    let on = on && !state.settings.lock().unwrap().keep_awake_disabled;
    #[cfg(target_os = "ios")]
    {
        let _ = app.run_on_main_thread(move || crate::apple::set_idle_timer_disabled(on));
    }
    #[cfg(not(target_os = "ios"))]
    let _ = &app;
    state.keep_awake.set(on)
}

#[tauri::command]
pub fn now_playing(app: AppHandle, info: Option<system::NowPlaying>) {
    #[cfg(any(target_os = "macos", target_os = "ios"))]
    {
        let info = info.unwrap_or_default();
        let _ = app.run_on_main_thread(move || crate::apple::now_playing(&info));
    }
    #[cfg(not(any(target_os = "macos", target_os = "ios")))]
    let _ = (app, info);
}

// ---------------------------------------------------------------- folders

#[tauri::command]
pub async fn folder_add(app: AppHandle) -> Res<Option<folders::Folder>> {
    #[cfg(target_os = "ios")]
    {
        let _ = app;
        // TODO(mac): Swift document-picker plugin (folders.rs); the page keeps its file-input fallback.
        Err("Folder access on iPhone and iPad comes next; use “Choose files” for now.".into())
    }
    #[cfg(not(target_os = "ios"))]
    {
        let (tx, rx) = std::sync::mpsc::channel();
        app.dialog()
            .file()
            .set_title("Choose your music folder")
            .pick_folder(move |p| {
                let _ = tx.send(p);
            });
        let Some(picked) = rx.recv().ok().flatten() else {
            return Ok(None);
        };
        let path = picked.into_path().map_err(|e| e.to_string())?;
        let state = app.state::<AppState>();
        let bookmark = folders::platform::bookmark(&path);
        let mut store = state.folders.lock().unwrap();
        let f = store.add(&path, bookmark);
        store.save(&state.data_dir).map_err(|e| e.to_string())?;
        Ok(Some(f))
    }
}

#[tauri::command]
pub fn folder_list(state: State<'_, AppState>) -> Vec<folders::Folder> {
    state.folders.lock().unwrap().folders.clone()
}

#[tauri::command]
pub fn folder_remove(state: State<'_, AppState>, id: String) -> Res<bool> {
    let mut store = state.folders.lock().unwrap();
    let removed = store.remove(&id);
    store.save(&state.data_dir).map_err(|e| e.to_string())?;
    Ok(removed)
}

fn folder_root(state: &AppState, id: &str) -> Res<std::path::PathBuf> {
    let store = state.folders.lock().unwrap();
    let f = store.get(id).ok_or("That folder is no longer linked.")?;
    if let Some(p) = f.bookmark.as_deref().and_then(folders::platform::open) {
        return Ok(p);
    }
    Ok(std::path::PathBuf::from(&f.path))
}

#[tauri::command]
pub async fn folder_files(state: State<'_, AppState>, id: String) -> Res<Vec<folders::AudioFile>> {
    let root = folder_root(&state, &id)?;
    folders::list_audio(&root)
        .map_err(|_| "TDJ can't read that folder any more. Link it again.".to_string())
}

/// Raw bytes (binary IPC response, no JSON/base64 detour) for `decodeAudioData`.
#[tauri::command]
pub async fn folder_read(
    state: State<'_, AppState>,
    id: String,
    rel: String,
) -> Res<tauri::ipc::Response> {
    let root = folder_root(&state, &id)?;
    let path = folders::resolve_inside(&root, &rel).ok_or("Not a music file in that folder.")?;
    std::fs::read(path)
        .map(tauri::ipc::Response::new)
        .map_err(|e| e.to_string())
}

// ---------------------------------------------------------------- headphone cue

#[tauri::command]
pub fn cue_devices() -> Vec<system::OutputDevice> {
    system::output_devices()
}

/// `source` = `folder:<id>/<rel>` or an https preview URL; `device` = an id from `cue_devices`.
#[tauri::command]
pub fn cue_play(
    app: AppHandle,
    source: String,
    device: Option<String>,
    volume: Option<f32>,
) -> Res<()> {
    let state = app.state::<AppState>();
    let src = system::cue_source(&source, |id, rel| {
        folder_root(&state, id)
            .ok()
            .and_then(|root| folders::resolve_inside(&root, rel))
    })
    .ok_or("That song can't be cued.")?;
    #[cfg(any(target_os = "macos", target_os = "ios"))]
    {
        let vol = volume.unwrap_or(1.0);
        app.run_on_main_thread(move || {
            crate::apple::cue_play(&src, device.as_deref(), vol);
        })
        .map_err(|e| e.to_string())
    }
    #[cfg(not(any(target_os = "macos", target_os = "ios")))]
    {
        let _ = (src, device, volume);
        Err("Headphone cue needs the Mac, iPhone or iPad app.".into())
    }
}

#[tauri::command]
pub fn cue_stop(app: AppHandle) {
    #[cfg(any(target_os = "macos", target_os = "ios"))]
    let _ = app.run_on_main_thread(crate::apple::cue_stop);
    #[cfg(not(any(target_os = "macos", target_os = "ios")))]
    let _ = app;
}

#[tauri::command]
pub fn check_updates(app: AppHandle) {
    crate::updates::check(app, true);
}

/// 2026-11: the dancers' Floor screen in its own window (`path`: the page's own `/screen…`), full screen on a
/// monitor other than the Booth's when there is one; the Booth's window stays where it is and keeps the focus.
/// "placed" (on another monitor), "window" (one monitor: a window to drag), "focused" (already open).
#[tauri::command]
pub fn floor_window(app: AppHandle, path: String) -> Res<String> {
    #[cfg(desktop)]
    {
        use tauri::{WebviewUrl, WebviewWindowBuilder};
        const FLOOR: &str = "floor";
        if let Some(w) = app.get_webview_window(FLOOR) {
            let _ = w.show();
            return Ok("focused".into());
        }
        if !path.starts_with("/screen") {
            return Err("not the floor screen".into());
        }
        let main = app
            .get_webview_window(crate::MAIN)
            .ok_or_else(|| "no main window".to_string())?;
        let url = main.url().map_err(|e| e.to_string())?.join(&path).map_err(|e| e.to_string())?;
        let here = main.current_monitor().ok().flatten().map(|m| m.name().cloned());
        let target = main
            .available_monitors()
            .unwrap_or_default()
            .into_iter()
            .find(|m| Some(m.name().cloned()) != here);
        let mut b = WebviewWindowBuilder::new(&app, FLOOR, WebviewUrl::External(url))
            .title("T-DJ · Floor screen")
            .inner_size(1280.0, 720.0)
            .focused(false);
        if let Some(m) = &target {
            let s = m.scale_factor();
            let p = m.position();
            b = b.position(p.x as f64 / s, p.y as f64 / s).fullscreen(true);
        }
        b.build().map_err(|e| e.to_string())?;
        let _ = main.set_focus();
        return Ok(if target.is_some() { "placed" } else { "window" }.into());
    }
    #[cfg(mobile)]
    {
        let _ = (app, path);
        Err("On iPhone and iPad, show the Floor screen with AirPlay screen mirroring, or open the room's screen link on another device.".into())
    }
}
