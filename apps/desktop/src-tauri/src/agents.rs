//! Local ACP agents (Agent Client Protocol: newline-delimited JSON-RPC on stdio) as child processes of the Mac app,
//! for Settings → Models → Keys and agents. The page speaks the protocol (apps/web/src/lib/ai/acp.ts); this module
//! only starts the command the DJ entered, passes lines in and out, and stops it. The iPad app connects to agents
//! by address only.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{Arc, Mutex};

/// At most this many agents at a time, and this much unread output each.
pub const MAX_AGENTS: usize = 4;
pub const MAX_BUFFER: usize = 4 * 1024 * 1024;

#[derive(Default)]
struct Output {
    data: String,
    /// `Some` once the agent stopped: "" for a clean exit, else why
    exited: Option<String>,
}

struct Agent {
    child: Child,
    stdin: Option<ChildStdin>,
    out: Arc<Mutex<Output>>,
}

#[derive(Default)]
pub struct Agents {
    next: Mutex<u32>,
    running: Mutex<HashMap<u32, Agent>>,
}

#[derive(Debug, serde::Serialize, PartialEq)]
pub struct Read {
    pub data: String,
    pub exited: Option<String>,
}

/// Where a GUI app finds the commands a DJ types (a Mac app starts with a minimal PATH, without Homebrew or npm).
pub fn search_path(home: Option<&Path>, inherited: &str) -> String {
    let mut dirs: Vec<String> = inherited
        .split(':')
        .filter(|d| !d.is_empty())
        .map(String::from)
        .collect();
    let mut extra = vec![
        "/opt/homebrew/bin".to_string(),
        "/usr/local/bin".to_string(),
    ];
    if let Some(h) = home {
        for d in [".volta/bin", ".bun/bin", ".local/bin", ".cargo/bin"] {
            extra.push(h.join(d).to_string_lossy().into_owned());
        }
    }
    for d in extra {
        if !dirs.contains(&d) {
            dirs.push(d);
        }
    }
    dirs.join(":")
}

/// The program a command names: a path as given, else the first match on the search path.
pub fn resolve(command: &str, path: &str) -> Option<PathBuf> {
    if command.contains('/') {
        let p = PathBuf::from(command);
        return p.is_file().then_some(p);
    }
    path.split(':')
        .map(|d| Path::new(d).join(command))
        .find(|p| p.is_file())
}

impl Agents {
    pub fn spawn(&self, command: &str, args: &[String]) -> Result<u32, String> {
        if cfg!(target_os = "ios") {
            return Err(
                "Local agents run in the Mac app. On iPad, connect with an address.".into(),
            );
        }
        let command = command.trim();
        if command.is_empty() {
            return Err("Add the command that starts the agent.".into());
        }
        let mut running = self.running.lock().unwrap();
        running.retain(|_, a| !matches!(a.child.try_wait(), Ok(Some(_))));
        if running.len() >= MAX_AGENTS {
            return Err("Too many agents are running; stop one first.".into());
        }
        let home = std::env::var_os("HOME").map(PathBuf::from);
        let path = search_path(home.as_deref(), &std::env::var("PATH").unwrap_or_default());
        let program = resolve(command, &path)
            .ok_or_else(|| format!("{command} was not found on this Mac."))?;
        let mut child = Command::new(program)
            .args(args)
            .env("PATH", &path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("The agent could not be started: {e}"))?;
        let stdin = child.stdin.take();
        let stdout = child.stdout.take().ok_or("The agent has no output.")?;
        let out = Arc::new(Mutex::new(Output::default()));
        let sink = out.clone();
        std::thread::spawn(move || {
            let mut lines = BufReader::new(stdout);
            let mut line = String::new();
            loop {
                line.clear();
                match lines.read_line(&mut line) {
                    Ok(0) | Err(_) => break,
                    Ok(_) => {
                        let mut o = sink.lock().unwrap();
                        if o.data.len() + line.len() <= MAX_BUFFER {
                            o.data.push_str(&line);
                        }
                    }
                }
            }
            let mut o = sink.lock().unwrap();
            if o.exited.is_none() {
                o.exited = Some(String::new());
            }
        });
        let mut next = self.next.lock().unwrap();
        *next += 1;
        let id = *next;
        running.insert(id, Agent { child, stdin, out });
        Ok(id)
    }

    pub fn write(&self, id: u32, data: &str) -> Result<(), String> {
        let mut running = self.running.lock().unwrap();
        let a = running.get_mut(&id).ok_or("The agent stopped.")?;
        let stdin = a.stdin.as_mut().ok_or("The agent stopped.")?;
        stdin
            .write_all(data.as_bytes())
            .and_then(|_| stdin.flush())
            .map_err(|_| "The agent stopped.".to_string())
    }

    /// Everything the agent printed since the last read, and whether it stopped (then it is forgotten).
    pub fn read(&self, id: u32) -> Result<Read, String> {
        let mut running = self.running.lock().unwrap();
        let a = running.get(&id).ok_or("The agent stopped.")?;
        let mut o = a.out.lock().unwrap();
        let r = Read {
            data: std::mem::take(&mut o.data),
            exited: o.exited.clone(),
        };
        drop(o);
        if r.exited.is_some() {
            if let Some(mut a) = running.remove(&id) {
                let _ = a.child.wait();
            }
        }
        Ok(r)
    }

    pub fn kill(&self, id: u32) {
        if let Some(mut a) = self.running.lock().unwrap().remove(&id) {
            a.stdin.take();
            let _ = a.child.kill();
            let _ = a.child.wait();
        }
    }

    pub fn kill_all(&self) {
        let ids: Vec<u32> = self.running.lock().unwrap().keys().copied().collect();
        for id in ids {
            self.kill(id);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};

    #[test]
    fn a_gui_app_finds_homebrew_and_npm_commands() {
        let p = search_path(Some(Path::new("/Users/dj")), "/usr/bin:/bin");
        assert!(p.starts_with("/usr/bin:/bin:"));
        assert!(p.contains("/opt/homebrew/bin") && p.contains("/Users/dj/.volta/bin"));
        assert_eq!(
            search_path(None, "/usr/local/bin")
                .matches("/usr/local/bin")
                .count(),
            1
        );
        assert_eq!(resolve("sh", "/nope:/bin"), Some(PathBuf::from("/bin/sh")));
        assert_eq!(resolve("no-such-agent-cmd", "/bin"), None);
    }

    #[test]
    fn lines_go_in_and_come_back_out_and_a_stopped_agent_is_forgotten() {
        let agents = Agents::default();
        let id = agents.spawn("cat", &[]).unwrap();
        agents
            .write(id, "{\"jsonrpc\":\"2.0\",\"id\":1}\n")
            .unwrap();
        let start = Instant::now();
        let mut got = String::new();
        while !got.ends_with('\n') && start.elapsed() < Duration::from_secs(5) {
            got.push_str(&agents.read(id).unwrap().data);
            std::thread::sleep(Duration::from_millis(10));
        }
        assert_eq!(got, "{\"jsonrpc\":\"2.0\",\"id\":1}\n");
        agents.kill(id);
        assert!(agents.read(id).is_err());
        assert!(agents.write(id, "x\n").is_err());

        let id = agents.spawn("true", &[]).unwrap();
        let start = Instant::now();
        loop {
            let r = agents.read(id).unwrap();
            if r.exited.is_some() {
                assert_eq!(r.exited.as_deref(), Some(""));
                break;
            }
            assert!(start.elapsed() < Duration::from_secs(5));
            std::thread::sleep(Duration::from_millis(10));
        }
        assert!(agents.read(id).is_err());
        assert!(agents
            .spawn("no-such-agent-cmd", &[])
            .unwrap_err()
            .contains("not found"));
        assert!(agents.spawn("  ", &[]).is_err());
    }
}
