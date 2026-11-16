//! 2026-11 — the night never stops by accident, and the DJ sees where the sound goes (the owner: "notifications and
//! plug-outs and opening other apps and notification sounds should not disrupt playing … should be able to see those
//! settings, also if traceable, the connection and chain, and set them").
//!
//! Portable types and commands here; the Apple code is in `apple_audio.rs`:
//! - **iPhone / iPad**: the `AVAudioSession` is `.playback`, mode default, *without* `mixWithOthers` (other apps'
//!   sounds don't duck the night; system alerts, alarms and calls still can), `UIBackgroundModes = audio`
//!   (Info.ios.plist); interruption began / ended and route changes are sent to the page (`tdj:audio`, decided in
//!   apps/web/src/lib/booth/continuity.ts); the idle timer is off while a night runs; the route picker
//!   (`AVRoutePickerView`) for AirPlay / Bluetooth.
//! - **Mac**: an `NSProcessInfo` activity while a night runs (no App Nap, no idle system sleep; the display assertion
//!   stays `system.rs`'s), CoreAudio's outputs with their transport type, channels, sample rate and latency, a
//!   listener on the device list and the default output, and choosing the system output (the room).
//! - everywhere else (Linux checks): one default output and no events.
// (the event helpers are called from the Apple code only)
#![cfg_attr(not(target_os = "ios"), allow(dead_code))]

use serde::Serialize;
use serde_json::{json, Value};
use std::sync::OnceLock;
use tauri::{AppHandle, Manager, State};

use crate::AppState;

/// One output (apps/web/src/lib/booth/outputs.ts `NativeOutput`).
#[derive(Debug, Clone, Default, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AudioOutput {
    /// CoreAudio device UID (macOS) or the port UID (iOS)
    pub id: String,
    pub name: String,
    /// macOS: `kAudioDevicePropertyTransportType` as its four-char code ("usb ", "blue", "bltn"…)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transport: Option<String>,
    /// macOS built-in device: the output data source ("ispk", "hdpn")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data_source: Option<String>,
    /// macOS aggregate: a Multi-Output Device
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stacked: Option<bool>,
    /// iOS: `AVAudioSessionPortDescription.portType` ("Speaker", "Headphones", "USBAudio"…)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub port_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channels: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sample_rate: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latency_ms: Option<f64>,
    pub is_default: bool,
}

/// The outputs and the session (apps/web/src/lib/booth/nativeAudio.ts `NativeRoute`).
#[derive(Debug, Clone, Default, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AudioRoute {
    pub platform: &'static str,
    pub outputs: Vec<AudioOutput>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_channels: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_output_channels: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mixes_with_others: Option<bool>,
}

/// A CoreAudio four-char code as text ('usb ' → "usb "). (macOS)
#[cfg_attr(target_os = "ios", allow(dead_code))]
pub fn fourcc(v: u32) -> Option<String> {
    let b = v.to_be_bytes();
    b.iter()
        .all(|c| (0x20..0x7f).contains(c))
        .then(|| b.iter().map(|&c| c as char).collect())
}

/// Device latency in ms from CoreAudio frames (device + safety offset + buffer + stream) at `rate`. (macOS)
#[cfg_attr(target_os = "ios", allow(dead_code))]
pub fn latency_ms(frames: u32, rate: f64) -> Option<f64> {
    (rate > 0.0 && frames > 0).then(|| (frames as f64 / rate * 1000.0 * 10.0).round() / 10.0)
}

/// `AVAudioSessionInterruptionType` (1 began, 0 ended) and its options (1 = shouldResume) → the page's event.
pub fn interruption_detail(kind: u64, options: u64) -> Value {
    if kind == 1 {
        json!({ "type": "interruption", "phase": "began" })
    } else {
        json!({ "type": "interruption", "phase": "ended", "shouldResume": options & 1 == 1 })
    }
}

/// `AVAudioSessionRouteChangeReason` and the outputs of the route before → the page's event.
pub fn route_detail(reason: u64, previous: &[String]) -> Value {
    json!({ "type": "route", "reason": reason, "previous": previous })
}

/// The script that hands a native audio event to the page (`window` CustomEvent `tdj:audio`).
pub fn dispatch_js(detail: &Value) -> String {
    format!("window.dispatchEvent(new CustomEvent('tdj:audio',{{detail:{detail}}}))")
}

static APP: OnceLock<AppHandle> = OnceLock::new();

/// Send an event to the main window's page (any thread).
pub fn emit(detail: Value) {
    if let Some(app) = APP.get() {
        if let Some(main) = app.get_webview_window(crate::MAIN) {
            let _ = main.eval(dispatch_js(&detail));
        }
    }
}

/// At start-up (main thread): the iOS session and its observers, the Mac device listeners.
pub fn install(app: &AppHandle) {
    let _ = APP.set(app.clone());
    #[cfg(any(target_os = "macos", target_os = "ios"))]
    crate::apple_audio::install();
}

pub fn route() -> AudioRoute {
    #[cfg(any(target_os = "macos", target_os = "ios"))]
    {
        crate::apple_audio::route()
    }
    #[cfg(not(any(target_os = "macos", target_os = "ios")))]
    {
        AudioRoute {
            platform: crate::commands::platform(),
            outputs: vec![AudioOutput {
                id: "default".into(),
                name: "System output".into(),
                channels: Some(2),
                is_default: true,
                ..Default::default()
            }],
            ..Default::default()
        }
    }
}

#[tauri::command]
pub fn audio_route() -> AudioRoute {
    route()
}

/// iOS: show the system's AirPlay / Bluetooth picker. false where there is none (macOS: System Settings → Sound).
#[tauri::command]
pub fn audio_route_picker(app: AppHandle) -> bool {
    #[cfg(target_os = "ios")]
    {
        let _ = app.run_on_main_thread(crate::apple_audio::show_route_picker);
        true
    }
    #[cfg(not(target_os = "ios"))]
    {
        let _ = app;
        false
    }
}

/// macOS: make the device with this UID the system output (the room plays there).
#[tauri::command]
pub fn audio_set_output(id: String) -> bool {
    #[cfg(target_os = "macos")]
    {
        crate::apple_audio::set_default_output(&id)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = id;
        false
    }
}

/// A night runs (`on`) or is over: no App Nap / idle sleep and the display awake (Mac), the idle timer off and the
/// session active (iOS). The display part follows Settings' keep-awake switch; the audio part always holds.
#[tauri::command]
pub fn audio_night(app: AppHandle, state: State<'_, AppState>, on: bool) -> bool {
    let display = on && !state.settings.lock().unwrap().keep_awake_disabled;
    #[cfg(any(target_os = "macos", target_os = "ios"))]
    {
        let _ = app.run_on_main_thread(move || crate::apple_audio::night(on, display));
    }
    #[cfg(not(any(target_os = "macos", target_os = "ios")))]
    let _ = &app;
    state.keep_awake.set(display);
    on
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn four_char_codes_read_as_text() {
        assert_eq!(
            fourcc(u32::from_be_bytes(*b"usb ")).as_deref(),
            Some("usb ")
        );
        assert_eq!(
            fourcc(u32::from_be_bytes(*b"blue")).as_deref(),
            Some("blue")
        );
        assert_eq!(fourcc(0), None);
    }

    #[test]
    fn latency_from_frames() {
        assert_eq!(latency_ms(480, 48_000.0), Some(10.0));
        assert_eq!(latency_ms(0, 48_000.0), None);
        assert_eq!(latency_ms(512, 0.0), None);
    }

    #[test]
    fn interruption_and_route_events_for_the_page() {
        assert_eq!(
            interruption_detail(1, 0),
            json!({"type": "interruption", "phase": "began"})
        );
        assert_eq!(
            interruption_detail(0, 1),
            json!({"type": "interruption", "phase": "ended", "shouldResume": true})
        );
        assert_eq!(interruption_detail(0, 0)["shouldResume"], json!(false));
        assert_eq!(
            route_detail(2, &["DDJ-400".into()]),
            json!({"type": "route", "reason": 2, "previous": ["DDJ-400"]})
        );
        let js = dispatch_js(&json!({"type": "devices"}));
        assert_eq!(
            js,
            "window.dispatchEvent(new CustomEvent('tdj:audio',{detail:{\"type\":\"devices\"}}))"
        );
    }

    #[test]
    fn outputs_serialize_as_the_page_reads_them() {
        let o = AudioOutput {
            id: "DDJ".into(),
            name: "DDJ-400".into(),
            transport: Some("usb ".into()),
            channels: Some(4),
            sample_rate: Some(44_100.0),
            latency_ms: Some(9.5),
            is_default: false,
            ..Default::default()
        };
        let v = serde_json::to_value(&o).unwrap();
        assert_eq!(
            v,
            json!({"id": "DDJ", "name": "DDJ-400", "transport": "usb ", "channels": 4, "sampleRate": 44100.0, "latencyMs": 9.5, "isDefault": false})
        );
    }

    #[test]
    fn there_is_always_a_route() {
        let r = route();
        assert!(r.outputs.iter().any(|o| o.is_default));
    }
}
