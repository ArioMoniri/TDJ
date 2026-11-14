//! Native services the page asks for: keep the display awake during a night, Now Playing / media keys, and the
//! headphone **cue** output (r22-apps-plan.md §4 `tdj-system`, `tdj-cue`). Each has a portable signature; the
//! Apple implementations live in `apple.rs`, every other platform gets a harmless fallback so the app runs and
//! tests on Linux.

use serde::{Deserialize, Serialize};
use std::sync::Mutex;

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct NowPlaying {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    /// "playing" | "paused" | "none" (Media Session `playbackState`)
    pub state: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OutputDevice {
    /// CoreAudio device UID on macOS (what `AVPlayer.audioOutputDeviceUniqueID` takes).
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

/// What the cue player may play: a file inside a linked folder (already resolved) or an https preview.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CueSource {
    File(std::path::PathBuf),
    Url(String),
}

pub fn cue_source(
    raw: &str,
    resolve_file: impl Fn(&str, &str) -> Option<std::path::PathBuf>,
) -> Option<CueSource> {
    if let Some(rest) = raw.strip_prefix("folder:") {
        let (id, rel) = rest.split_once('/')?;
        return resolve_file(id, rel).map(CueSource::File);
    }
    let u = url::Url::parse(raw).ok()?;
    (u.scheme() == "https").then(|| CueSource::Url(u.into()))
}

#[derive(Default)]
pub struct KeepAwake {
    #[cfg(target_os = "macos")]
    assertion: Mutex<Option<u32>>,
    #[cfg(not(target_os = "macos"))]
    on: Mutex<bool>,
}

impl KeepAwake {
    pub fn is_on(&self) -> bool {
        #[cfg(target_os = "macos")]
        return self.assertion.lock().unwrap().is_some();
        #[cfg(not(target_os = "macos"))]
        return *self.on.lock().unwrap();
    }

    /// Returns whether the display is now held awake.
    pub fn set(&self, on: bool) -> bool {
        #[cfg(target_os = "macos")]
        {
            let mut a = self.assertion.lock().unwrap();
            match (on, *a) {
                (true, None) => {
                    *a = crate::apple::prevent_display_sleep("TDJ is playing a milonga")
                }
                (false, Some(id)) => {
                    crate::apple::release_assertion(id);
                    *a = None;
                }
                _ => {}
            }
            a.is_some()
        }
        #[cfg(not(target_os = "macos"))]
        {
            // iPadOS: `UIApplication.isIdleTimerDisabled` is set on the main thread by `commands::keep_awake`.
            *self.on.lock().unwrap() = on;
            on
        }
    }
}

pub fn output_devices() -> Vec<OutputDevice> {
    #[cfg(target_os = "macos")]
    {
        crate::apple::output_devices()
    }
    #[cfg(not(target_os = "macos"))]
    {
        // iPadOS has one output route (plus a multi-route USB interface, TODO(mac) in the Swift plugin);
        // the page falls back to split-cue (room L / cue R) there.
        vec![OutputDevice {
            id: "default".into(),
            name: "System output".into(),
            is_default: true,
        }]
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn cue_accepts_folder_files_and_https_only() {
        let resolve =
            |id: &str, rel: &str| (id == "f1").then(|| PathBuf::from(format!("/m/{rel}")));
        assert_eq!(
            cue_source("folder:f1/a/b.mp3", resolve),
            Some(CueSource::File("/m/a/b.mp3".into()))
        );
        assert_eq!(cue_source("folder:f9/a.mp3", resolve), None);
        assert_eq!(
            cue_source("https://cdn.example/p.mp3", resolve),
            Some(CueSource::Url("https://cdn.example/p.mp3".into()))
        );
        assert_eq!(cue_source("file:///etc/passwd", resolve), None);
        assert_eq!(cue_source("http://x/p.mp3", resolve), None);
    }

    #[test]
    fn keep_awake_toggles() {
        let k = KeepAwake::default();
        assert!(k.set(true));
        assert!(!k.set(false));
    }

    #[test]
    fn there_is_always_a_default_output() {
        assert!(output_devices().iter().any(|d| d.is_default));
    }
}
