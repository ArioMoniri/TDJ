//! macOS / iOS: CoreMIDI through `midir`, on one worker thread that owns every connection (a connection never
//! crosses threads). The commands ask it over a channel and wait at most `WAIT`; LED messages are fire-and-forget.
//! Hot-plug: CoreMIDI's sources and destinations are listed again every 2 s; a change calls `on_ports`.

use super::wire::{ports_changed, push, valid_message, MidiPort};
use midir::{Ignore, MidiInput, MidiInputConnection, MidiOutput, MidiOutputConnection};
use std::collections::HashMap;
use std::sync::mpsc::{channel, RecvTimeoutError, Sender};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

enum Cmd {
    Ports(Sender<Vec<MidiPort>>),
    Open(String, Sender<bool>),
    Close(String, Sender<bool>),
    Send(String, Vec<u8>),
}

static WORKER: OnceLock<Mutex<Sender<Cmd>>> = OnceLock::new();
const CLIENT: &str = "T-DJ";
const WAIT: Duration = Duration::from_secs(3);
const POLL: Duration = Duration::from_secs(2);

pub fn start(on_ports: fn()) {
    let (tx, rx) = channel::<Cmd>();
    if WORKER.set(Mutex::new(tx)).is_err() {
        return;
    }
    let _ = std::thread::Builder::new()
        .name("tdj-midi".into())
        .spawn(move || {
            // one client lists the ports for the life of the app; each connection has its own
            let lister_in = MidiInput::new(CLIENT).ok();
            let lister_out = MidiOutput::new(CLIENT).ok();
            let list = || {
                let mut v = Vec::new();
                if let Some(mi) = &lister_in {
                    for p in mi.ports() {
                        if let Ok(name) = mi.port_name(&p) {
                            v.push(MidiPort {
                                id: p.id(),
                                name,
                                dir: "in",
                            });
                        }
                    }
                }
                if let Some(mo) = &lister_out {
                    for p in mo.ports() {
                        if let Ok(name) = mo.port_name(&p) {
                            v.push(MidiPort {
                                id: p.id(),
                                name,
                                dir: "out",
                            });
                        }
                    }
                }
                v
            };
            let mut ins: HashMap<String, MidiInputConnection<()>> = HashMap::new();
            let mut outs: HashMap<String, MidiOutputConnection> = HashMap::new();
            let mut last = list();
            loop {
                match rx.recv_timeout(POLL) {
                    Ok(Cmd::Ports(reply)) => {
                        last = list();
                        let _ = reply.send(last.clone());
                    }
                    Ok(Cmd::Open(id, reply)) => {
                        let _ = reply.send(open_in(&mut ins, &id));
                    }
                    Ok(Cmd::Close(id, reply)) => {
                        let _ = reply.send(ins.remove(&id).is_some());
                    }
                    Ok(Cmd::Send(id, bytes)) => send_out(&mut outs, &id, &bytes),
                    Err(RecvTimeoutError::Timeout) => {
                        let now = list();
                        if ports_changed(&last, &now) {
                            // a controller unplugged: its connections go
                            ins.retain(|id, _| now.iter().any(|p| p.dir == "in" && &p.id == id));
                            outs.retain(|id, _| now.iter().any(|p| p.dir == "out" && &p.id == id));
                            last = now;
                            on_ports();
                        }
                    }
                    Err(RecvTimeoutError::Disconnected) => break,
                }
            }
        });
}

fn open_in(ins: &mut HashMap<String, MidiInputConnection<()>>, id: &str) -> bool {
    if ins.contains_key(id) {
        return true;
    }
    let Ok(mut mi) = MidiInput::new(CLIENT) else {
        return false;
    };
    // clock, active sensing and SysEx never drive the Booth
    mi.ignore(Ignore::All);
    let Some(port) = mi.find_port_by_id(id.to_string()) else {
        return false;
    };
    let pid = id.to_string();
    match mi.connect(&port, "T-DJ in", move |_t, bytes, _| push(&pid, bytes), ()) {
        Ok(c) => {
            ins.insert(id.to_string(), c);
            true
        }
        Err(_) => false,
    }
}

fn send_out(outs: &mut HashMap<String, MidiOutputConnection>, id: &str, bytes: &[u8]) {
    if !valid_message(bytes) {
        return;
    }
    if !outs.contains_key(id) {
        let Ok(mo) = MidiOutput::new(CLIENT) else {
            return;
        };
        let Some(port) = mo.find_port_by_id(id.to_string()) else {
            return;
        };
        match mo.connect(&port, "T-DJ out") {
            Ok(c) => {
                outs.insert(id.to_string(), c);
            }
            Err(_) => return,
        }
    }
    if let Some(c) = outs.get_mut(id) {
        if c.send(bytes).is_err() {
            outs.remove(id);
        }
    }
}

fn ask<T>(make: impl FnOnce(Sender<T>) -> Cmd, fallback: T) -> T {
    let Some(w) = WORKER.get() else {
        return fallback;
    };
    let (tx, rx) = channel();
    let sent = w.lock().map(|s| s.send(make(tx)).is_ok()).unwrap_or(false);
    if !sent {
        return fallback;
    }
    rx.recv_timeout(WAIT).unwrap_or(fallback)
}

pub fn ports() -> Vec<MidiPort> {
    ask(Cmd::Ports, Vec::new())
}
pub fn open(id: String) -> bool {
    ask(|tx| Cmd::Open(id, tx), false)
}
pub fn close(id: String) -> bool {
    ask(|tx| Cmd::Close(id, tx), false)
}
pub fn send(id: String, data: Vec<u8>) -> bool {
    WORKER
        .get()
        .and_then(|w| w.lock().ok())
        .map(|s| s.send(Cmd::Send(id, data)).is_ok())
        .unwrap_or(false)
}
