//! Apple audio for `audio.rs` (macOS + iOS / iPadOS): public frameworks only (CoreAudio, AVFoundation, AVKit,
//! Foundation, UIKit), all allowed in the App Sandbox and on the App Store. It type-checks on Linux with
//! `cargo check --target aarch64-apple-darwin` / `aarch64-apple-ios`; what it does needs a real Mac / iPhone / iPad
//! with a jack, a USB-C interface or DJ controller and a Bluetooth speaker (the real-device checklist in the PR).
#![allow(unused_unsafe, dead_code)]

use crate::audio::AudioRoute;

// ======================================================================== iOS / iPadOS: AVAudioSession

#[cfg(target_os = "ios")]
mod ios {
    use crate::audio::{emit, interruption_detail, route_detail, AudioOutput, AudioRoute};
    use block2::RcBlock;
    use objc2::rc::Retained;
    use objc2::runtime::{AnyClass, AnyObject};
    use objc2::{class, msg_send};
    use objc2_foundation::NSString;
    use serde_json::json;
    use std::ptr::NonNull;

    #[link(name = "AVFoundation", kind = "framework")]
    extern "C" {
        static AVAudioSessionCategoryPlayback: &'static NSString;
        static AVAudioSessionModeDefault: &'static NSString;
        static AVAudioSessionInterruptionNotification: &'static NSString;
        static AVAudioSessionInterruptionTypeKey: &'static NSString;
        static AVAudioSessionInterruptionOptionKey: &'static NSString;
        static AVAudioSessionRouteChangeNotification: &'static NSString;
        static AVAudioSessionRouteChangeReasonKey: &'static NSString;
        static AVAudioSessionRouteChangePreviousRouteKey: &'static NSString;
        static AVAudioSessionMediaServicesWereResetNotification: &'static NSString;
    }
    #[link(name = "AVKit", kind = "framework")]
    extern "C" {}

    /// `AVAudioSessionCategoryOptions.mixWithOthers`
    const MIX_WITH_OTHERS: usize = 1;

    fn session() -> Retained<AnyObject> {
        unsafe { msg_send![class!(AVAudioSession), sharedInstance] }
    }

    /// `.playback`, mode default, no options: the ring / silent switch doesn't mute the night, it plays with the
    /// screen locked (UIBackgroundModes audio), and other apps' sounds never duck it (no `mixWithOthers` /
    /// `duckOthers`). System alerts, alarms and calls can still sound — that is iOS's, not an app's, to stop.
    pub fn configure() {
        unsafe {
            let s = session();
            let null: *mut *mut AnyObject = std::ptr::null_mut();
            let _: bool = msg_send![
                &*s,
                setCategory: AVAudioSessionCategoryPlayback,
                mode: AVAudioSessionModeDefault,
                options: 0usize,
                error: null
            ];
            let _: bool = msg_send![&*s, setActive: true, error: null];
        }
    }

    fn number(dict: &AnyObject, key: &NSString) -> Option<u64> {
        unsafe {
            let v: Option<Retained<AnyObject>> = msg_send![dict, objectForKey: key];
            v.map(|n| {
                let u: usize = msg_send![&*n, unsignedIntegerValue];
                u as u64
            })
        }
    }

    /// `AVAudioSessionPortDescription`'s strings
    fn port_name(p: &AnyObject) -> Option<String> {
        let s: Option<Retained<NSString>> = unsafe { msg_send![p, portName] };
        s.map(|s| s.to_string())
    }
    fn port_type(p: &AnyObject) -> Option<String> {
        let s: Option<Retained<NSString>> = unsafe { msg_send![p, portType] };
        s.map(|s| s.to_string())
    }
    fn port_uid(p: &AnyObject) -> Option<String> {
        let s: Option<Retained<NSString>> = unsafe { msg_send![p, UID] };
        s.map(|s| s.to_string())
    }

    /// The names of a route description's outputs.
    fn output_names(route: &AnyObject) -> Vec<String> {
        unsafe {
            let outs: Option<Retained<AnyObject>> = msg_send![route, outputs];
            let Some(outs) = outs else { return vec![] };
            let n: usize = msg_send![&*outs, count];
            (0..n)
                .filter_map(|i| {
                    let p: Retained<AnyObject> = msg_send![&*outs, objectAtIndex: i];
                    port_name(&p)
                })
                .collect()
        }
    }

    fn observe(name: &'static NSString, f: impl Fn(&AnyObject) + 'static) {
        unsafe {
            let center: Retained<AnyObject> =
                msg_send![class!(NSNotificationCenter), defaultCenter];
            let queue: Retained<AnyObject> = msg_send![class!(NSOperationQueue), mainQueue];
            let s = session();
            let block = RcBlock::new(move |note: NonNull<AnyObject>| f(note.as_ref()));
            let token: Retained<AnyObject> = msg_send![
                &*center,
                addObserverForName: name,
                object: &*s,
                queue: &*queue,
                usingBlock: &*block
            ];
            // observers live as long as the app
            std::mem::forget(token);
            std::mem::forget(block);
        }
    }

    pub fn install() {
        configure();
        unsafe {
            observe(AVAudioSessionInterruptionNotification, |note| unsafe {
                let info: Option<Retained<AnyObject>> = msg_send![note, userInfo];
                let Some(info) = info else { return };
                let kind = number(&info, AVAudioSessionInterruptionTypeKey).unwrap_or(0);
                let options = number(&info, AVAudioSessionInterruptionOptionKey).unwrap_or(0);
                if kind == 0 {
                    // the session is ours again: active, so a resume (by the page) is heard
                    configure();
                }
                emit(interruption_detail(kind, options));
            });
            observe(AVAudioSessionRouteChangeNotification, |note| unsafe {
                let info: Option<Retained<AnyObject>> = msg_send![note, userInfo];
                let Some(info) = info else { return };
                let reason = number(&info, AVAudioSessionRouteChangeReasonKey).unwrap_or(0);
                let prev: Option<Retained<AnyObject>> =
                    msg_send![&*info, objectForKey: AVAudioSessionRouteChangePreviousRouteKey];
                let names = prev.map(|p| output_names(&p)).unwrap_or_default();
                emit(route_detail(reason, &names));
            });
            observe(AVAudioSessionMediaServicesWereResetNotification, |_| {
                configure();
                emit(json!({ "type": "reset" }));
            });
        }
    }

    pub fn route() -> AudioRoute {
        unsafe {
            let s = session();
            let rate: f64 = msg_send![&*s, sampleRate];
            let latency: f64 = msg_send![&*s, outputLatency];
            let io: f64 = msg_send![&*s, IOBufferDuration];
            let now: isize = msg_send![&*s, outputNumberOfChannels];
            let max: isize = msg_send![&*s, maximumOutputNumberOfChannels];
            let options: usize = msg_send![&*s, categoryOptions];
            let category: Option<Retained<NSString>> = msg_send![&*s, category];
            let route: Retained<AnyObject> = msg_send![&*s, currentRoute];
            let outs: Retained<AnyObject> = msg_send![&*route, outputs];
            let n: usize = msg_send![&*outs, count];
            let outputs = (0..n)
                .map(|i| {
                    let p: Retained<AnyObject> = msg_send![&*outs, objectAtIndex: i];
                    let ch: Option<Retained<AnyObject>> = msg_send![&*p, channels];
                    let channels = ch.map(|c| {
                        let k: usize = msg_send![&*c, count];
                        k as u32
                    });
                    AudioOutput {
                        id: port_uid(&p).unwrap_or_else(|| format!("route-{i}")),
                        name: port_name(&p).unwrap_or_default(),
                        port_type: port_type(&p),
                        channels,
                        sample_rate: (rate > 0.0).then_some(rate),
                        latency_ms: ((latency + io) > 0.0)
                            .then(|| ((latency + io) * 10_000.0).round() / 10.0),
                        // the current route: the first output is where the night plays
                        is_default: i == 0,
                        ..Default::default()
                    }
                })
                .collect();
            AudioRoute {
                platform: "ipados",
                outputs,
                output_channels: Some(now.max(0) as u32),
                max_output_channels: Some(max.max(0) as u32),
                category: category.map(|c| c.to_string()),
                mixes_with_others: Some(options & MIX_WITH_OTHERS != 0),
            }
        }
    }

    /// The system's AirPlay / Bluetooth picker: an `AVRoutePickerView` in the window, its button tapped.
    pub fn show_route_picker() {
        unsafe {
            let Some(cls) = AnyClass::get(c"AVRoutePickerView") else {
                return;
            };
            let picker: Retained<AnyObject> = msg_send![cls, new];
            let app: Retained<AnyObject> = msg_send![class!(UIApplication), sharedApplication];
            let window: Option<Retained<AnyObject>> = msg_send![&*app, keyWindow];
            let Some(window) = window else { return };
            let _: () = msg_send![&*window, addSubview: &*picker];
            let subs: Retained<AnyObject> = msg_send![&*picker, subviews];
            let n: usize = msg_send![&*subs, count];
            for i in 0..n {
                let v: Retained<AnyObject> = msg_send![&*subs, objectAtIndex: i];
                let is_button: bool = msg_send![&*v, isKindOfClass: class!(UIButton)];
                if is_button {
                    // UIControlEventTouchUpInside
                    let _: () = msg_send![&*v, sendActionsForControlEvents: 1usize << 6];
                    break;
                }
            }
            // (the picker stays in the window, zero-sized, for the next tap)
            std::mem::forget(picker);
        }
    }

    pub fn night(on: bool, display: bool) {
        crate::apple::set_idle_timer_disabled(display);
        if on {
            configure();
        }
    }
}

// ======================================================================== macOS: CoreAudio + NSProcessInfo

#[cfg(target_os = "macos")]
mod mac {
    use crate::audio::{emit, fourcc, latency_ms, AudioOutput, AudioRoute};
    use block2::RcBlock;
    use core_foundation::base::TCFType;
    use core_foundation::string::{CFString, CFStringRef};
    use objc2::rc::Retained;
    use objc2::runtime::AnyObject;
    use objc2::{class, msg_send};
    use objc2_foundation::NSString;
    use serde_json::json;
    use std::ffi::c_void;

    #[repr(C)]
    #[derive(Clone, Copy)]
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
        fn AudioObjectSetPropertyData(
            id: u32,
            a: *const Address,
            qs: u32,
            q: *const c_void,
            size: u32,
            data: *const c_void,
        ) -> i32;
        fn AudioObjectAddPropertyListenerBlock(
            id: u32,
            a: *const Address,
            queue: *mut c_void,
            block: &block2::Block<dyn Fn(u32, *const c_void)>,
        ) -> i32;
    }
    const fn cc(s: &[u8; 4]) -> u32 {
        u32::from_be_bytes(*s)
    }
    const SYSTEM: u32 = 1;
    const GLOBAL: u32 = cc(b"glob");
    const OUTPUT: u32 = cc(b"outp");
    const MAIN: u32 = 0;

    fn addr(sel: &[u8; 4], scope: u32) -> Address {
        Address {
            selector: cc(sel),
            scope,
            element: MAIN,
        }
    }
    fn size_of(id: u32, a: &Address) -> u32 {
        let mut size = 0u32;
        unsafe { AudioObjectGetPropertyDataSize(id, a, 0, std::ptr::null(), &mut size) };
        size
    }
    fn get<T: Copy + Default>(id: u32, a: &Address) -> Option<T> {
        let mut v = T::default();
        let mut size = std::mem::size_of::<T>() as u32;
        let rc = unsafe {
            AudioObjectGetPropertyData(
                id,
                a,
                0,
                std::ptr::null(),
                &mut size,
                &mut v as *mut T as *mut c_void,
            )
        };
        (rc == 0).then_some(v)
    }
    fn string(id: u32, sel: &[u8; 4]) -> Option<String> {
        let a = addr(sel, GLOBAL);
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
    fn device_ids() -> Vec<u32> {
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
        ids
    }
    /// Output channels: the sum over the output stream configuration's buffers (`AudioBufferList`).
    fn output_channels(id: u32) -> Option<u32> {
        let a = addr(b"slay", OUTPUT);
        let size = size_of(id, &a);
        if size < 4 {
            return None;
        }
        // AudioBufferList { UInt32 mNumberBuffers; AudioBuffer mBuffers[] } with
        // AudioBuffer { UInt32 mNumberChannels; UInt32 mDataByteSize; void *mData } (16 bytes, 8-aligned)
        let mut buf = vec![0u64; (size as usize).div_ceil(8)];
        let mut got = size;
        let rc = unsafe {
            AudioObjectGetPropertyData(
                id,
                &a,
                0,
                std::ptr::null(),
                &mut got,
                buf.as_mut_ptr() as *mut c_void,
            )
        };
        if rc != 0 {
            return None;
        }
        let bytes = unsafe { std::slice::from_raw_parts(buf.as_ptr() as *const u8, got as usize) };
        let n = u32::from_ne_bytes(bytes[0..4].try_into().ok()?) as usize;
        let mut total = 0u32;
        for i in 0..n {
            let at = 8 + i * 16;
            if at + 4 > bytes.len() {
                break;
            }
            total += u32::from_ne_bytes(bytes[at..at + 4].try_into().ok()?);
        }
        Some(total)
    }
    fn latency_frames(id: u32) -> u32 {
        let dev: u32 = get(id, &addr(b"ltnc", OUTPUT)).unwrap_or(0);
        let safety: u32 = get(id, &addr(b"saft", OUTPUT)).unwrap_or(0);
        let buffer: u32 = get(id, &addr(b"fsiz", GLOBAL)).unwrap_or(0);
        // the first output stream's own latency
        let streams = addr(b"stm#", OUTPUT);
        let n = size_of(id, &streams) as usize / 4;
        let mut stream = 0u32;
        if n > 0 {
            let mut ids = vec![0u32; n];
            let mut size = (n * 4) as u32;
            let rc = unsafe {
                AudioObjectGetPropertyData(
                    id,
                    &streams,
                    0,
                    std::ptr::null(),
                    &mut size,
                    ids.as_mut_ptr() as *mut c_void,
                )
            };
            if rc == 0 {
                stream = get(ids[0], &addr(b"ltnc", GLOBAL)).unwrap_or(0);
            }
        }
        dev + safety + buffer + stream
    }
    fn default_output() -> u32 {
        get(SYSTEM, &addr(b"dOut", GLOBAL)).unwrap_or(0)
    }

    pub fn route() -> AudioRoute {
        let default_id = default_output();
        let outputs = device_ids()
            .into_iter()
            .filter(|&id| size_of(id, &addr(b"stm#", OUTPUT)) > 0)
            .filter_map(|id| {
                let transport: Option<u32> = get(id, &addr(b"tran", GLOBAL));
                let rate: Option<f64> = get(id, &addr(b"nsrt", GLOBAL));
                let source: Option<u32> = get(id, &addr(b"ssrc", OUTPUT));
                let stacked: Option<u32> = get(id, &addr(b"astk", GLOBAL));
                Some(AudioOutput {
                    id: string(id, b"uid ")?,
                    name: string(id, b"lnam").unwrap_or_default(),
                    transport: transport.and_then(fourcc),
                    data_source: source.and_then(fourcc),
                    stacked: stacked.map(|s| s != 0),
                    channels: output_channels(id),
                    sample_rate: rate,
                    latency_ms: rate.and_then(|r| latency_ms(latency_frames(id), r)),
                    is_default: id == default_id,
                    port_type: None,
                })
            })
            .collect();
        AudioRoute {
            platform: "macos",
            outputs,
            ..Default::default()
        }
    }

    /// The room: make the device with `uid` the system's default output (WebKit's audio follows it).
    pub fn set_default_output(uid: &str) -> bool {
        let Some(id) = device_ids()
            .into_iter()
            .find(|&id| string(id, b"uid ").as_deref() == Some(uid))
        else {
            return false;
        };
        let a = addr(b"dOut", GLOBAL);
        let rc = unsafe {
            AudioObjectSetPropertyData(
                SYSTEM,
                &a,
                0,
                std::ptr::null(),
                4,
                &id as *const u32 as *const c_void,
            )
        };
        rc == 0
    }

    /// The device list and the default output changed (a cable, an interface, Bluetooth): tell the page.
    pub fn install() {
        for sel in [b"dev#", b"dOut"] {
            let a = addr(sel, GLOBAL);
            let block =
                RcBlock::new(|_n: u32, _a: *const c_void| emit(json!({ "type": "devices" })));
            unsafe {
                AudioObjectAddPropertyListenerBlock(SYSTEM, &a, std::ptr::null_mut(), &block)
            };
            // listeners live as long as the app
            std::mem::forget(block);
        }
    }

    thread_local! {
        // main thread only: the NSProcessInfo activity token while a night runs
        static ACTIVITY: std::cell::RefCell<Option<Retained<AnyObject>>> = const { std::cell::RefCell::new(None) };
    }
    /// NSActivityUserInitiated (0x00FFFFFF | IdleSystemSleepDisabled 1 << 20) | NSActivityLatencyCritical (0xFF << 32)
    const ACTIVITY_OPTIONS: u64 = 0x00FF_FFFF | (1 << 20) | 0xFF_0000_0000;

    /// No App Nap and no idle system sleep while a night runs (the display assertion is `system.rs`'s).
    pub fn night(on: bool, _display: bool) {
        ACTIVITY.with(|a| {
            let mut a = a.borrow_mut();
            unsafe {
                let info: Retained<AnyObject> = msg_send![class!(NSProcessInfo), processInfo];
                match (on, a.take()) {
                    (true, None) => {
                        let reason = NSString::from_str("T-DJ is playing a milonga");
                        let token: Retained<AnyObject> =
                            msg_send![&*info, beginActivityWithOptions: ACTIVITY_OPTIONS, reason: &*reason];
                        *a = Some(token);
                    }
                    (true, Some(t)) => *a = Some(t),
                    (false, Some(t)) => {
                        let _: () = msg_send![&*info, endActivity: &*t];
                    }
                    (false, None) => {}
                }
            }
        });
    }
}

// ======================================================================== the portable face

pub fn install() {
    #[cfg(target_os = "ios")]
    ios::install();
    #[cfg(target_os = "macos")]
    mac::install();
}

pub fn route() -> AudioRoute {
    #[cfg(target_os = "ios")]
    return ios::route();
    #[cfg(target_os = "macos")]
    return mac::route();
}

pub fn night(on: bool, display: bool) {
    #[cfg(target_os = "ios")]
    ios::night(on, display);
    #[cfg(target_os = "macos")]
    mac::night(on, display);
}

#[cfg(target_os = "ios")]
pub fn show_route_picker() {
    ios::show_route_picker();
}

#[cfg(target_os = "macos")]
pub fn set_default_output(uid: &str) -> bool {
    mac::set_default_output(uid)
}
