//! 2026-11 — Battery saver's native side (apps/web/src/lib/power.ts).
//!
//! - `power_state`: what the page cannot read in WebKit — macOS / iOS Low Power Mode, the thermal state, and the
//!   battery (macOS: IOKit power sources; iOS: `UIDevice`). Safari has no Battery Status API, so Auto would be blind
//!   in the apps without it. Everything is optional: unknown stays `null` and the page's Auto ignores it.
//! - `power_saver(on)`: the page says the saver is on. On the Mac a night then lets the display dim and sleep on the
//!   system's own schedule (the IOKit display assertion is let go); the night's `NSProcessInfo` activity stays, so
//!   App Nap and idle *system* sleep still never touch the audio. Outside a night the app holds no activity and no
//!   assertion at all, so App Nap applies as for any app (apple_audio.rs `night`). iPhone / iPad keep the idle timer
//!   off during a night whatever the saver says: a locked screen would suspend the page that drives Spotify.
//!
//! The decisions are plain functions (tested on Linux); the Apple readings are `cfg`'d and type-check with
//! `cargo check --target aarch64-apple-darwin` / `aarch64-apple-ios`.

use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, State};

use crate::AppState;

/// What the page's `fromNative` reads (lib/power.ts `NativePower`).
#[derive(Debug, Clone, Default, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PowerState {
    pub low_power_mode: Option<bool>,
    /// "nominal" | "fair" | "serious" | "critical"
    pub thermal: Option<String>,
    /// 0…1
    pub battery_level: Option<f64>,
    /// plugged in (charging or full on the charger)
    pub charging: Option<bool>,
}

static SAVER: AtomicBool = AtomicBool::new(false);
static NIGHT: AtomicBool = AtomicBool::new(false);

pub fn saver_on() -> bool {
    SAVER.load(Ordering::Relaxed)
}
pub fn set_night(on: bool) {
    NIGHT.store(on, Ordering::Relaxed);
}

/// `NSProcessInfoThermalState` (0 nominal … 3 critical) as the page's names.
pub fn thermal_name(raw: i64) -> Option<&'static str> {
    match raw {
        0 => Some("nominal"),
        1 => Some("fair"),
        2 => Some("serious"),
        3 => Some("critical"),
        _ => None,
    }
}

/// iOS `UIDevice`: `batteryLevel` (−1 unknown) and `batteryState` (0 unknown, 1 unplugged, 2 charging, 3 full).
pub fn ios_battery(level: f32, state: i64) -> (Option<f64>, Option<bool>) {
    let level = (0.0..=1.0)
        .contains(&level)
        .then(|| (f64::from(level) * 100.0).round() / 100.0);
    let charging = match state {
        1 => Some(false),
        2 | 3 => Some(true),
        _ => None,
    };
    (level, charging)
}

/// macOS IOKit power source: "Current Capacity" / "Max Capacity", "Is Charging", "Power Source State" ("AC Power").
/// A Mac without a battery (a desktop) reports no source: everything stays unknown.
pub fn mac_battery(
    current: Option<i64>,
    max: Option<i64>,
    is_charging: Option<bool>,
    on_ac: Option<bool>,
) -> (Option<f64>, Option<bool>) {
    let level = match (current, max) {
        (Some(c), Some(m)) if m > 0 && c >= 0 => {
            Some(((c as f64 / m as f64).min(1.0) * 100.0).round() / 100.0)
        }
        _ => None,
    };
    let charging = match (is_charging, on_ac) {
        (Some(true), _) | (_, Some(true)) => Some(true),
        (Some(false), Some(false)) | (None, Some(false)) => Some(false),
        (Some(false), None) => Some(false),
        (None, None) => None,
    };
    (level, charging)
}

/// Whether the display is held awake: during a night, unless Settings turned keep-awake off — or, on the Mac, the
/// saver is on (the display dims on the system's schedule; the night's activity keeps the audio and the system up).
pub fn hold_display(night: bool, keep_awake_disabled: bool, saver: bool, mac: bool) -> bool {
    night && !keep_awake_disabled && !(mac && saver)
}

#[tauri::command]
pub fn power_state() -> PowerState {
    read()
}

#[tauri::command]
pub fn power_saver(app: AppHandle, state: State<'_, AppState>, on: bool) -> bool {
    SAVER.store(on, Ordering::Relaxed);
    let night = NIGHT.load(Ordering::Relaxed);
    if night {
        let disabled = state.settings.lock().unwrap().keep_awake_disabled;
        let display = hold_display(night, disabled, on, cfg!(target_os = "macos"));
        state.keep_awake.set(display);
    }
    let _ = &app;
    on
}

#[cfg(target_os = "macos")]
fn read() -> PowerState {
    let (low, thermal) = apple::process_info();
    let (battery_level, charging) = apple::mac_power_source();
    PowerState {
        low_power_mode: low,
        thermal: thermal.map(Into::into),
        battery_level,
        charging,
    }
}
#[cfg(target_os = "ios")]
fn read() -> PowerState {
    let (low, thermal) = apple::process_info();
    let (battery_level, charging) = apple::ios_device_battery();
    PowerState {
        low_power_mode: low,
        thermal: thermal.map(Into::into),
        battery_level,
        charging,
    }
}
#[cfg(not(any(target_os = "macos", target_os = "ios")))]
fn read() -> PowerState {
    PowerState::default()
}

#[cfg(any(target_os = "macos", target_os = "ios"))]
mod apple {
    use objc2::rc::Retained;
    use objc2::runtime::AnyObject;
    use objc2::{class, msg_send, sel};

    /// Low Power Mode (macOS 12+, iOS 9+) and the thermal state, from `NSProcessInfo`.
    pub fn process_info() -> (Option<bool>, Option<&'static str>) {
        unsafe {
            let info: Retained<AnyObject> = msg_send![class!(NSProcessInfo), processInfo];
            let has_low: bool = msg_send![&*info, respondsToSelector: sel!(isLowPowerModeEnabled)];
            let low = if has_low {
                let v: bool = msg_send![&*info, isLowPowerModeEnabled];
                Some(v)
            } else {
                None
            };
            let raw: isize = msg_send![&*info, thermalState];
            (low, super::thermal_name(raw as i64))
        }
    }

    #[cfg(target_os = "ios")]
    pub fn ios_device_battery() -> (Option<f64>, Option<bool>) {
        unsafe {
            let dev: Retained<AnyObject> = msg_send![class!(UIDevice), currentDevice];
            let _: () = msg_send![&*dev, setBatteryMonitoringEnabled: true];
            let level: f32 = msg_send![&*dev, batteryLevel];
            let state: isize = msg_send![&*dev, batteryState];
            super::ios_battery(level, state as i64)
        }
    }

    #[cfg(target_os = "macos")]
    pub fn mac_power_source() -> (Option<f64>, Option<bool>) {
        use core_foundation::array::{CFArray, CFArrayRef};
        use core_foundation::base::{CFType, CFTypeRef, TCFType};
        use core_foundation::boolean::CFBoolean;
        use core_foundation::dictionary::{CFDictionary, CFDictionaryRef};
        use core_foundation::number::CFNumber;
        use core_foundation::string::CFString;

        #[link(name = "IOKit", kind = "framework")]
        extern "C" {
            fn IOPSCopyPowerSourcesInfo() -> CFTypeRef;
            fn IOPSCopyPowerSourcesList(blob: CFTypeRef) -> CFArrayRef;
            fn IOPSGetPowerSourceDescription(blob: CFTypeRef, ps: CFTypeRef) -> CFDictionaryRef;
        }
        unsafe {
            let blob = IOPSCopyPowerSourcesInfo();
            if blob.is_null() {
                return (None, None);
            }
            let blob = CFType::wrap_under_create_rule(blob);
            let list = IOPSCopyPowerSourcesList(blob.as_CFTypeRef());
            if list.is_null() {
                return (None, None);
            }
            let list: CFArray<CFType> = CFArray::wrap_under_create_rule(list);
            for ps in list.iter() {
                let d = IOPSGetPowerSourceDescription(blob.as_CFTypeRef(), ps.as_CFTypeRef());
                if d.is_null() {
                    continue;
                }
                let d: CFDictionary<CFString, CFType> = CFDictionary::wrap_under_get_rule(d);
                let num = |k: &'static str| {
                    d.find(CFString::from_static_string(k))
                        .and_then(|v| v.downcast::<CFNumber>())
                        .and_then(|n| n.to_i64())
                };
                let flag = |k: &'static str| {
                    d.find(CFString::from_static_string(k))
                        .and_then(|v| v.downcast::<CFBoolean>())
                        .map(bool::from)
                };
                let on_ac = d
                    .find(CFString::from_static_string("Power Source State"))
                    .and_then(|v| v.downcast::<CFString>())
                    .map(|s| s.to_string() == "AC Power");
                let (level, charging) = super::mac_battery(
                    num("Current Capacity"),
                    num("Max Capacity"),
                    flag("Is Charging"),
                    on_ac,
                );
                if level.is_some() {
                    return (level, charging);
                }
            }
            (None, None)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn thermal_states_by_name() {
        assert_eq!(thermal_name(0), Some("nominal"));
        assert_eq!(thermal_name(2), Some("serious"));
        assert_eq!(thermal_name(3), Some("critical"));
        assert_eq!(thermal_name(7), None);
        assert_eq!(thermal_name(-1), None);
    }

    #[test]
    fn ios_battery_reading() {
        assert_eq!(ios_battery(0.25, 1), (Some(0.25), Some(false)));
        assert_eq!(ios_battery(0.8, 2), (Some(0.8), Some(true)));
        assert_eq!(ios_battery(1.0, 3), (Some(1.0), Some(true)));
        // the simulator / monitoring off: −1 and unknown
        assert_eq!(ios_battery(-1.0, 0), (None, None));
    }

    #[test]
    fn mac_battery_reading() {
        assert_eq!(
            mac_battery(Some(24), Some(100), Some(false), Some(false)),
            (Some(0.24), Some(false))
        );
        // full on the charger: not charging, but plugged in
        assert_eq!(
            mac_battery(Some(100), Some(100), Some(false), Some(true)),
            (Some(1.0), Some(true))
        );
        // older Macs report mAh
        assert_eq!(
            mac_battery(Some(2900), Some(5800), Some(true), None),
            (Some(0.5), Some(true))
        );
        assert_eq!(mac_battery(None, None, None, None), (None, None));
        assert_eq!(mac_battery(Some(10), Some(0), None, None).0, None);
    }

    #[test]
    fn the_display_follows_the_night_the_switch_and_the_mac_saver() {
        // a night holds the display; Settings' switch lets it go
        assert!(hold_display(true, false, false, true));
        assert!(!hold_display(true, true, false, true));
        assert!(!hold_display(false, false, false, true));
        // the Mac with the saver: the display may dim (the activity keeps the audio up)
        assert!(!hold_display(true, false, true, true));
        // iPhone / iPad: the screen stays on during a night whatever the saver says
        assert!(hold_display(true, false, true, false));
    }

    #[test]
    fn the_state_serialises_as_the_page_reads_it() {
        let s = PowerState {
            low_power_mode: Some(true),
            thermal: Some("fair".into()),
            battery_level: Some(0.42),
            charging: Some(false),
        };
        assert_eq!(
            serde_json::to_value(&s).unwrap(),
            serde_json::json!({ "lowPowerMode": true, "thermal": "fair", "batteryLevel": 0.42, "charging": false })
        );
        assert_eq!(
            serde_json::to_value(PowerState::default()).unwrap(),
            serde_json::json!({ "lowPowerMode": null, "thermal": null, "batteryLevel": null, "charging": null })
        );
    }
}
