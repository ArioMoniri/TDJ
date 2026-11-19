//! The pure part of the app's MIDI (no Tauri, no CoreMIDI): the port shape the page reads, what may be sent to a
//! controller, the page event and the message queue between CoreMIDI's callbacks and the page.

use serde::Serialize;
use serde_json::{json, Value};
use std::sync::Mutex;

/// One MIDI port (apps/web/src/lib/controller/access.ts `NativePort`).
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct MidiPort {
    pub id: String,
    pub name: String,
    pub dir: &'static str,
}

/// A message T-DJ may send to a controller: one channel message (note off/on, poly pressure, CC, program, channel
/// pressure, pitch bend) with its data bytes under 0x80. No SysEx, no system messages.
pub fn valid_message(b: &[u8]) -> bool {
    let Some(&status) = b.first() else {
        return false;
    };
    let len = match status & 0xf0 {
        0x80 | 0x90 | 0xa0 | 0xb0 | 0xe0 => 3,
        0xc0 | 0xd0 => 2,
        _ => return false,
    };
    b.len() == len && b[1..].iter().all(|&d| d < 0x80)
}

/// Whether the port list changed (names or ids; the order CoreMIDI gives is kept)
pub fn ports_changed(a: &[MidiPort], b: &[MidiPort]) -> bool {
    a != b
}

/// The script that hands a MIDI event to the page.
pub fn dispatch_js(detail: &Value) -> String {
    format!("window.dispatchEvent(new CustomEvent('tdj:midi',{{detail:{detail}}}))")
}

/// One batch of messages as the page's event detail.
pub fn messages_detail(items: &[(String, Vec<u8>)]) -> Value {
    json!({
        "type": "messages",
        "items": items.iter().map(|(p, d)| json!({ "port": p, "data": d })).collect::<Vec<_>>(),
    })
}

/// The ports changed (a controller plugged in or out).
pub fn ports_detail() -> Value {
    json!({ "type": "ports" })
}

/// The longest batch handed over at once (a flood is cut, never queued without end)
pub const MAX_BATCH: usize = 512;

static QUEUE: Mutex<Vec<(String, Vec<u8>)>> = Mutex::new(Vec::new());

/// An input callback: queue the message (any thread). Past `MAX_BATCH * 4` waiting, new messages are dropped.
pub fn push(port: &str, bytes: &[u8]) {
    if let Ok(mut q) = QUEUE.lock() {
        if q.len() < MAX_BATCH * 4 {
            q.push((port.to_string(), bytes.to_vec()));
        }
    }
}

/// Take what is queued, at most `MAX_BATCH` (the oldest first)
pub fn drain() -> Vec<(String, Vec<u8>)> {
    let Ok(mut q) = QUEUE.lock() else {
        return Vec::new();
    };
    let n = q.len().min(MAX_BATCH);
    q.drain(..n).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_channel_messages_are_sent() {
        assert!(valid_message(&[0x90, 0x0b, 0x7f]));
        assert!(valid_message(&[0xb6, 0x1f, 0x00]));
        assert!(valid_message(&[0xc0, 0x05]));
        assert!(!valid_message(&[0x90, 0x0b])); // short
        assert!(!valid_message(&[0x90, 0x0b, 0x80])); // a data byte with the high bit
        assert!(!valid_message(&[0xf0, 0x7e, 0x7f, 0xf7])); // SysEx
        assert!(!valid_message(&[0xf8])); // clock
        assert!(!valid_message(&[0x0b, 0x7f, 0x00])); // no status
        assert!(!valid_message(&[]));
    }

    #[test]
    fn a_batch_is_one_event_the_page_reads() {
        let d = messages_detail(&[
            ("in-1".into(), vec![0x90, 11, 127]),
            ("in-1".into(), vec![0x80, 11, 0]),
        ]);
        assert_eq!(d["type"], "messages");
        assert_eq!(d["items"][0]["port"], "in-1");
        assert_eq!(d["items"][1]["data"], json!([128, 11, 0]));
        let js = dispatch_js(&d);
        assert!(js.starts_with("window.dispatchEvent(new CustomEvent('tdj:midi',{detail:{"));
        assert!(js.ends_with("}))"));
        assert_eq!(
            dispatch_js(&ports_detail()),
            "window.dispatchEvent(new CustomEvent('tdj:midi',{detail:{\"type\":\"ports\"}}))"
        );
    }

    #[test]
    fn a_port_name_stays_inside_its_json_string() {
        let d = messages_detail(&[("a'b\"</script>".into(), vec![0x90, 1, 1])]);
        let js = dispatch_js(&d);
        assert!(js.contains(r#""port":"a'b\"</script>""#));
    }

    #[test]
    fn the_queue_drains_in_order_and_in_bounded_batches() {
        let _ = drain();
        for i in 0..(MAX_BATCH + 10) {
            push("p", &[0xb0, 1, (i % 128) as u8]);
        }
        let first = drain();
        assert_eq!(first.len(), MAX_BATCH);
        assert_eq!(first[0].1, vec![0xb0, 1, 0]);
        assert_eq!(drain().len(), 10);
        assert!(drain().is_empty());
    }

    #[test]
    fn a_plugged_controller_changes_the_list() {
        let a = vec![MidiPort {
            id: "1".into(),
            name: "DDJ-400".into(),
            dir: "in",
        }];
        let mut b = a.clone();
        assert!(!ports_changed(&a, &b));
        b.push(MidiPort {
            id: "2".into(),
            name: "DDJ-400".into(),
            dir: "out",
        });
        assert!(ports_changed(&a, &b));
    }
}
