//! 2026-11 — DJ controllers over MIDI in the Mac, iPad and iPhone apps (docs/design/controller.md). WebKit has no
//! Web MIDI, so the app lists and opens CoreMIDI ports itself (the `midir` crate, MIT) and hands the page:
//! - `midi_ports` → every source and destination (`MidiPort`: midir's stable port id, name, "in" / "out");
//! - `midi_open` / `midi_close` an input: its messages reach the page in batches (≈ every 8 ms, so a spinning jog
//!   is one script call per frame, not hundreds) as the `window` CustomEvent `tdj:midi`
//!   `{ type: "messages", items: [{ port, data }] }`;
//! - `midi_send` to an output: the controller's LEDs (channel messages only, never SysEx);
//! - `{ type: "ports" }` when a controller is plugged in or out (CoreMIDI is listed again every 2 s).
//!
//! An iPad or iPhone takes a class-compliant USB-C controller (DDJ-FLX4, DDJ-400…) directly: CoreMIDI sees it as on
//! the Mac. `wire.rs` is the pure part, `coremidi.rs` the worker that owns the connections; the page's side is
//! apps/web/src/lib/controller/access.ts. Elsewhere (Linux checks) the commands answer "no ports".
#![cfg_attr(not(any(target_os = "macos", target_os = "ios")), allow(dead_code))]

#[cfg(any(target_os = "macos", target_os = "ios"))]
mod coremidi;
pub mod wire;

use self::wire::{dispatch_js, drain, messages_detail, valid_message, MidiPort};
use serde_json::Value;
use std::sync::OnceLock;
use tauri::{AppHandle, Manager};

static APP: OnceLock<AppHandle> = OnceLock::new();

fn emit(detail: Value) {
    if let Some(app) = APP.get() {
        if let Some(main) = app.get_webview_window(crate::MAIN) {
            let _ = main.eval(dispatch_js(&detail));
        }
    }
}

/// At start-up: the worker that owns CoreMIDI, and the flush of queued messages to the page
pub fn install(app: &AppHandle) {
    let _ = APP.set(app.clone());
    #[cfg(any(target_os = "macos", target_os = "ios"))]
    coremidi::start(|| emit(self::wire::ports_detail()));
    let _ = std::thread::Builder::new()
        .name("tdj-midi-flush".into())
        .spawn(|| loop {
            std::thread::sleep(std::time::Duration::from_millis(8));
            let items = drain();
            if !items.is_empty() {
                emit(messages_detail(&items));
            }
        });
}

#[tauri::command(async)]
pub fn midi_ports() -> Vec<MidiPort> {
    #[cfg(any(target_os = "macos", target_os = "ios"))]
    {
        coremidi::ports()
    }
    #[cfg(not(any(target_os = "macos", target_os = "ios")))]
    {
        Vec::new()
    }
}

#[tauri::command(async)]
pub fn midi_open(id: String) -> bool {
    #[cfg(any(target_os = "macos", target_os = "ios"))]
    {
        coremidi::open(id)
    }
    #[cfg(not(any(target_os = "macos", target_os = "ios")))]
    {
        let _ = id;
        false
    }
}

#[tauri::command(async)]
pub fn midi_close(id: String) -> bool {
    #[cfg(any(target_os = "macos", target_os = "ios"))]
    {
        coremidi::close(id)
    }
    #[cfg(not(any(target_os = "macos", target_os = "ios")))]
    {
        let _ = id;
        false
    }
}

/// LEDs: queued to the worker (never waits for the controller); SysEx and system messages are refused
#[tauri::command]
pub fn midi_send(id: String, data: Vec<u8>) -> bool {
    if !valid_message(&data) {
        return false;
    }
    #[cfg(any(target_os = "macos", target_os = "ios"))]
    {
        coremidi::send(id, data)
    }
    #[cfg(not(any(target_os = "macos", target_os = "ios")))]
    {
        let _ = id;
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn without_coremidi_there_are_no_ports_and_sysex_is_refused_everywhere() {
        assert!(!midi_send("x".into(), vec![0xf0, 0x7e, 0xf7]));
        #[cfg(not(any(target_os = "macos", target_os = "ios")))]
        {
            assert!(midi_ports().is_empty());
            assert!(!midi_open("x".into()));
            assert!(!midi_close("x".into()));
            assert!(!midi_send("x".into(), vec![0x90, 1, 1]));
        }
    }
}
