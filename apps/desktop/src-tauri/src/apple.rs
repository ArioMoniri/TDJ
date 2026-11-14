//! Apple-only native code (macOS + iPadOS), called through `system.rs`, `folders.rs` and `commands.rs`.
//! Everything here uses public frameworks only (IOKit power assertions, CoreAudio, AVFoundation, MediaPlayer,
//! Foundation bookmarks, UIKit), all allowed in the App Sandbox. It type-checks on Linux with
//! `cargo check --target aarch64-apple-darwin` / `aarch64-apple-ios`; behaviour needs a Mac/iPad to verify
//! (docs/RELEASING.md → "Mac checks").
#![allow(unused_unsafe, dead_code)]

use objc2::rc::Retained;
use objc2::runtime::AnyObject;
use objc2::{class, msg_send};
use objc2_foundation::{NSString, NSURL};

#[link(name = "AVFoundation", kind = "framework")]
extern "C" {}
#[link(name = "MediaPlayer", kind = "framework")]
extern "C" {}

fn ns(s: &str) -> Retained<NSString> {
    NSString::from_str(s)
}

// ---------------------------------------------------------------- keep awake (macOS: IOKit power assertion)

#[cfg(target_os = "macos")]
mod power {
    use core_foundation::base::TCFType;
    use core_foundation::string::{CFString, CFStringRef};

    #[link(name = "IOKit", kind = "framework")]
    extern "C" {
        fn IOPMAssertionCreateWithName(
            kind: CFStringRef,
            level: u32,
            name: CFStringRef,
            id: *mut u32,
        ) -> i32;
        fn IOPMAssertionRelease(id: u32) -> i32;
    }
    const LEVEL_ON: u32 = 255;

    pub fn prevent_display_sleep(reason: &str) -> Option<u32> {
        let kind = CFString::from_static_string("PreventUserIdleDisplaySleep");
        let name = CFString::new(reason);
        let mut id = 0u32;
        let rc = unsafe {
            IOPMAssertionCreateWithName(
                kind.as_concrete_TypeRef(),
                LEVEL_ON,
                name.as_concrete_TypeRef(),
                &mut id,
            )
        };
        (rc == 0).then_some(id)
    }
    pub fn release_assertion(id: u32) {
        unsafe { IOPMAssertionRelease(id) };
    }
}
#[cfg(target_os = "macos")]
pub use power::{prevent_display_sleep, release_assertion};

/// iPadOS: keep the screen on while the Booth plays (must run on the main thread).
#[cfg(target_os = "ios")]
pub fn set_idle_timer_disabled(on: bool) {
    unsafe {
        let app: Retained<AnyObject> = msg_send![class!(UIApplication), sharedApplication];
        let _: () = msg_send![&*app, setIdleTimerDisabled: on];
    }
}

/// iPadOS: the `.playback` audio session, so the ringer switch does not mute the night and audio continues
/// with the screen locked (with `UIBackgroundModes = audio` in Info.ios.plist).
#[cfg(target_os = "ios")]
pub fn audio_session_playback() {
    unsafe {
        let session: Retained<AnyObject> = msg_send![class!(AVAudioSession), sharedInstance];
        let cat = ns("AVAudioSessionCategoryPlayback");
        let null: *mut *mut AnyObject = std::ptr::null_mut();
        let _: bool = msg_send![&*session, setCategory: &*cat, error: null];
        let _: bool = msg_send![&*session, setActive: true, error: null];
    }
}

// ---------------------------------------------------------------- output devices (macOS CoreAudio)

#[cfg(target_os = "macos")]
mod audio {
    use crate::system::OutputDevice;
    use core_foundation::base::TCFType;
    use core_foundation::string::{CFString, CFStringRef};
    use std::ffi::c_void;

    #[repr(C)]
    struct Address {
        selector: u32,
        scope: u32,
        element: u32,
    }
    #[link(name = "CoreAudio", kind = "framework")]
    extern "C" {
        fn AudioObjectGetPropertyDataSize(
            id: u32,
            a: *const Address,
            qs: u32,
            q: *const c_void,
            size: *mut u32,
        ) -> i32;
        fn AudioObjectGetPropertyData(
            id: u32,
            a: *const Address,
            qs: u32,
            q: *const c_void,
            size: *mut u32,
            out: *mut c_void,
        ) -> i32;
    }
    const fn cc(s: &[u8; 4]) -> u32 {
        u32::from_be_bytes(*s)
    }
    const SYSTEM: u32 = 1;
    const GLOBAL: u32 = cc(b"glob");
    const OUTPUT: u32 = cc(b"outp");

    fn addr(selector: &[u8; 4], scope: u32) -> Address {
        Address {
            selector: cc(selector),
            scope,
            element: 0,
        }
    }
    fn size_of(id: u32, a: &Address) -> u32 {
        let mut size = 0u32;
        unsafe { AudioObjectGetPropertyDataSize(id, a, 0, std::ptr::null(), &mut size) };
        size
    }
    fn string(id: u32, selector: &[u8; 4]) -> Option<String> {
        let a = addr(selector, GLOBAL);
        let mut s: CFStringRef = std::ptr::null();
        let mut size = std::mem::size_of::<CFStringRef>() as u32;
        let rc = unsafe {
            AudioObjectGetPropertyData(
                id,
                &a,
                0,
                std::ptr::null(),
                &mut size,
                &mut s as *mut _ as *mut c_void,
            )
        };
        (rc == 0 && !s.is_null())
            .then(|| unsafe { CFString::wrap_under_create_rule(s) }.to_string())
    }

    pub fn output_devices() -> Vec<OutputDevice> {
        let all = addr(b"dev#", GLOBAL);
        let n = size_of(SYSTEM, &all) as usize / 4;
        let mut ids = vec![0u32; n];
        let mut size = (n * 4) as u32;
        unsafe {
            AudioObjectGetPropertyData(
                SYSTEM,
                &all,
                0,
                std::ptr::null(),
                &mut size,
                ids.as_mut_ptr() as *mut c_void,
            )
        };
        let def = addr(b"dOut", GLOBAL);
        let mut default_id = 0u32;
        let mut dsize = 4u32;
        unsafe {
            AudioObjectGetPropertyData(
                SYSTEM,
                &def,
                0,
                std::ptr::null(),
                &mut dsize,
                &mut default_id as *mut _ as *mut c_void,
            )
        };
        ids.into_iter()
            .filter(|&id| size_of(id, &addr(b"stm#", OUTPUT)) > 0)
            .filter_map(|id| {
                Some(OutputDevice {
                    id: string(id, b"uid ")?,
                    name: string(id, b"lnam").unwrap_or_default(),
                    is_default: id == default_id,
                })
            })
            .collect()
    }
}
#[cfg(target_os = "macos")]
pub use audio::output_devices;

// ---------------------------------------------------------------- cue player (AVPlayer on a chosen device)

thread_local! {
    // main thread only (every call is scheduled with `run_on_main_thread`)
    static CUE: std::cell::RefCell<Option<Retained<AnyObject>>> = const { std::cell::RefCell::new(None) };
}

fn url_for(src: &crate::system::CueSource) -> Option<Retained<NSURL>> {
    unsafe {
        match src {
            crate::system::CueSource::File(p) => {
                Some(NSURL::fileURLWithPath(&ns(&p.to_string_lossy())))
            }
            crate::system::CueSource::Url(u) => NSURL::URLWithString(&ns(u)),
        }
    }
}

/// Plays the cue on `device_uid` (macOS; iPadOS ignores the device: TODO(mac) multi-route in Swift).
pub fn cue_play(src: &crate::system::CueSource, device_uid: Option<&str>, volume: f32) -> bool {
    let Some(url) = url_for(src) else {
        return false;
    };
    unsafe {
        let player: Retained<AnyObject> = msg_send![class!(AVPlayer), playerWithURL: &*url];
        #[cfg(target_os = "macos")]
        if let Some(uid) = device_uid {
            let uid = ns(uid);
            let _: () = msg_send![&*player, setAudioOutputDeviceUniqueID: &*uid];
        }
        #[cfg(not(target_os = "macos"))]
        let _ = device_uid;
        let _: () = msg_send![&*player, setVolume: volume.clamp(0.0, 1.0)];
        let _: () = msg_send![&*player, play];
        CUE.with(|c| *c.borrow_mut() = Some(player));
    }
    true
}

pub fn cue_stop() {
    CUE.with(|c| {
        if let Some(p) = c.borrow_mut().take() {
            unsafe {
                let _: () = msg_send![&*p, pause];
            }
        }
    });
}

// ---------------------------------------------------------------- Now Playing + media keys

pub fn now_playing(info: &crate::system::NowPlaying) {
    unsafe {
        let center: Retained<AnyObject> = msg_send![class!(MPNowPlayingInfoCenter), defaultCenter];
        if info.title.is_none() {
            let nil: *const AnyObject = std::ptr::null();
            let _: () = msg_send![&*center, setNowPlayingInfo: nil];
            return;
        }
        let dict: Retained<AnyObject> = msg_send![class!(NSMutableDictionary), dictionary];
        let put = |key: &str, val: &Option<String>| {
            if let Some(v) = val {
                let (k, v) = (ns(key), ns(v));
                let _: () = msg_send![&*dict, setObject: &*v, forKey: &*k];
            }
        };
        put("title", &info.title); // MPMediaItemPropertyTitle
        put("artist", &info.artist); // MPMediaItemPropertyArtist
        put("albumTitle", &info.album); // MPMediaItemPropertyAlbumTitle
        let playing = info.state.as_deref() == Some("playing");
        let rate: Retained<AnyObject> =
            msg_send![class!(NSNumber), numberWithDouble: if playing { 1.0f64 } else { 0.0f64 }];
        let rate_key = ns("MPNowPlayingInfoPropertyPlaybackRate");
        let _: () = msg_send![&*dict, setObject: &*rate, forKey: &*rate_key];
        let _: () = msg_send![&*center, setNowPlayingInfo: &*dict];
        #[cfg(target_os = "macos")]
        {
            // MPNowPlayingPlaybackState: 1 playing, 2 paused, 3 stopped
            let state: usize = match info.state.as_deref() {
                Some("playing") => 1,
                Some("paused") => 2,
                _ => 3,
            };
            let _: () = msg_send![&*center, setPlaybackState: state];
        }
    }
}

/// Media keys, AirPods, Control Center and the lock screen → page commands (`booth.toggle`, `booth.next`,
/// `booth.restart`). Registered once at start-up on the main thread.
pub fn register_remote_commands(send: impl Fn(&'static str) + Clone + 'static) {
    use block2::RcBlock;
    use std::ptr::NonNull;
    unsafe {
        let center: Retained<AnyObject> =
            msg_send![class!(MPRemoteCommandCenter), sharedCommandCenter];
        let pairs: [(&str, &'static str); 5] = [
            ("togglePlayPauseCommand", "booth.toggle"),
            ("playCommand", "booth.toggle"),
            ("pauseCommand", "booth.toggle"),
            ("nextTrackCommand", "booth.next"),
            ("previousTrackCommand", "booth.restart"),
        ];
        for (getter, id) in pairs {
            let sel = objc2::runtime::Sel::register(&std::ffi::CString::new(getter).unwrap());
            let cmd: Option<Retained<AnyObject>> = msg_send![&*center, performSelector: sel];
            let Some(cmd) = cmd else { continue };
            let s = send.clone();
            let block = RcBlock::new(move |_event: NonNull<AnyObject>| -> isize {
                s(id);
                0 // MPRemoteCommandHandlerStatusSuccess
            });
            let _: Retained<AnyObject> = msg_send![&*cmd, addTargetWithHandler: &*block];
        }
    }
}

// ---------------------------------------------------------------- security-scoped folder bookmarks (macOS)

#[cfg(target_os = "macos")]
pub fn create_bookmark(path: &std::path::Path) -> Option<String> {
    use base64::Engine;
    use objc2_foundation::NSURLBookmarkCreationOptions;
    unsafe {
        let url = NSURL::fileURLWithPath_isDirectory(&ns(&path.to_string_lossy()), true);
        let data = url
            .bookmarkDataWithOptions_includingResourceValuesForKeys_relativeToURL_error(
                NSURLBookmarkCreationOptions::WithSecurityScope,
                None,
                None,
            )
            .ok()?;
        Some(base64::engine::general_purpose::STANDARD.encode(data.to_vec()))
    }
}

/// Resolves a bookmark and starts security-scoped access (kept for the app's lifetime: the Booth reads files
/// all night). Returns the folder's current path.
#[cfg(target_os = "macos")]
pub fn resolve_bookmark(b64: &str) -> Option<std::path::PathBuf> {
    use base64::Engine;
    use objc2::runtime::Bool;
    use objc2_foundation::{NSData, NSURLBookmarkResolutionOptions};
    let bytes = base64::engine::general_purpose::STANDARD.decode(b64).ok()?;
    unsafe {
        let data = NSData::with_bytes(&bytes);
        let mut stale = Bool::NO;
        let url =
            NSURL::URLByResolvingBookmarkData_options_relativeToURL_bookmarkDataIsStale_error(
                &data,
                NSURLBookmarkResolutionOptions::WithSecurityScope,
                None,
                &mut stale,
            )
            .ok()?;
        let _ = url.startAccessingSecurityScopedResource();
        url.path().map(|p| std::path::PathBuf::from(p.to_string()))
    }
}
