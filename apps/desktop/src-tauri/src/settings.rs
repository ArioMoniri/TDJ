//! The app's own settings, and the TDJ server the DJ may link (opt-in, off by default).
//!
//! T-DJ is standalone: the catalogue, the composer and the DJ's database live in the app (the bundled UI and its
//! on-device SQLite). A server is only an opt-in link under Settings → Connections, for rooms and for keeping a
//! self-deployed instance in sync; nothing is linked on first launch, and no address is built into the app.
//!
//! Stored as JSON in the app's config directory (`~/Library/Application Support/com.ariomoniri.tdj/settings.json`
//! on macOS, the app container on iPadOS). Nothing secret lives here: keys and tokens are in the Keychain.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use url::Url;

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    /// The last TDJ server address the DJ entered (kept when the link is turned off, so it is not typed again).
    pub server: Option<String>,
    /// The link is on: the server gets this device's database writes and serves Google, Dropbox and rooms.
    /// Off by default; settings files from before the standalone app (which named a server) start unlinked.
    #[serde(default)]
    pub link: bool,
    /// Self-hosted origins the DJ confirmed with "Trust this server?".
    #[serde(default)]
    pub trusted: Vec<String>,
    /// Keep the display awake while the Booth plays (default on; the web asks through `keepAwake`).
    #[serde(default)]
    pub keep_awake_disabled: bool,
}

#[derive(Debug, PartialEq, Eq)]
pub enum ServerError {
    Invalid,
    /// Plain http is only accepted for this machine (a server started with `pnpm dev`).
    InsecureRemote,
    /// Only bare origins are accepted (no credentials, query or fragment).
    NotAnOrigin,
}

impl std::fmt::Display for ServerError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            ServerError::Invalid => "That is not a web address.",
            ServerError::InsecureRemote => {
                "The server must use https:// (http:// works only for 127.0.0.1)."
            }
            ServerError::NotAnOrigin => {
                "Use the server's address only, for example https://tdj.example.org"
            }
        })
    }
}

/// Normalises what the DJ typed (or what a `tdj://server?url=` link carried) to an origin like
/// `https://host[:port]`. Adds `https://` when the scheme is missing.
pub fn normalize_server(input: &str) -> Result<String, ServerError> {
    let trimmed = input.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err(ServerError::Invalid);
    }
    let with_scheme = if trimmed.contains("://") {
        trimmed.to_string()
    } else {
        format!("https://{trimmed}")
    };
    let url = Url::parse(&with_scheme).map_err(|_| ServerError::Invalid)?;
    let host = url.host_str().ok_or(ServerError::Invalid)?;
    if !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(ServerError::NotAnOrigin);
    }
    if url.path() != "/" && !url.path().is_empty() {
        return Err(ServerError::NotAnOrigin);
    }
    match url.scheme() {
        "https" => {}
        "http" if host == "127.0.0.1" || host == "localhost" || host == "[::1]" => {}
        "http" => return Err(ServerError::InsecureRemote),
        _ => return Err(ServerError::Invalid),
    }
    Ok(url.origin().ascii_serialization())
}

impl Settings {
    pub fn path(config_dir: &Path) -> PathBuf {
        config_dir.join("settings.json")
    }

    /// Missing or unreadable file → defaults (first launch).
    pub fn load(config_dir: &Path) -> Settings {
        std::fs::read_to_string(Self::path(config_dir))
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }

    pub fn save(&self, config_dir: &Path) -> std::io::Result<()> {
        std::fs::create_dir_all(config_dir)?;
        let tmp = config_dir.join("settings.json.tmp");
        std::fs::write(
            &tmp,
            serde_json::to_vec_pretty(self).expect("settings serialise"),
        )?;
        std::fs::rename(tmp, Self::path(config_dir))
    }

    /// The linked server, when the link is on.
    pub fn linked(&self) -> Option<String> {
        if self.link {
            self.server.clone()
        } else {
            None
        }
    }

    pub fn is_trusted(&self, origin: &str) -> bool {
        self.trusted.iter().any(|t| t == origin)
    }

    pub fn trust(&mut self, origin: &str) {
        if !self.is_trusted(origin) {
            self.trusted.push(origin.to_string());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adds_https_and_strips_trailing_slash() {
        assert_eq!(
            normalize_server("tdj.example.org/").unwrap(),
            "https://tdj.example.org"
        );
        assert_eq!(
            normalize_server(" https://TDJ.example.org:8443 ").unwrap(),
            "https://tdj.example.org:8443"
        );
    }

    #[test]
    fn http_only_for_this_machine() {
        assert_eq!(
            normalize_server("http://127.0.0.1:3000").unwrap(),
            "http://127.0.0.1:3000"
        );
        assert_eq!(
            normalize_server("http://example.org"),
            Err(ServerError::InsecureRemote)
        );
    }

    #[test]
    fn rejects_non_origins_and_other_schemes() {
        assert_eq!(
            normalize_server("https://a.org/admin"),
            Err(ServerError::NotAnOrigin)
        );
        assert_eq!(
            normalize_server("https://u:p@a.org"),
            Err(ServerError::NotAnOrigin)
        );
        assert_eq!(
            normalize_server("https://a.org?x=1"),
            Err(ServerError::NotAnOrigin)
        );
        assert_eq!(
            normalize_server("javascript:alert(1)"),
            Err(ServerError::Invalid)
        );
        assert_eq!(
            normalize_server("file:///etc/passwd"),
            Err(ServerError::Invalid)
        );
        assert_eq!(normalize_server(""), Err(ServerError::Invalid));
    }

    #[test]
    fn standalone_by_default_and_old_files_start_unlinked() {
        assert_eq!(Settings::default().linked(), None);
        // a settings.json written by the server-shell builds (first-launch screen) named a server, without `link`
        let old: Settings =
            serde_json::from_str(r#"{"server":"https://tdj.example.org","trusted":[]}"#).unwrap();
        assert!(!old.link);
        assert_eq!(old.linked(), None);
        let on = Settings {
            server: Some("https://my.tdj".into()),
            link: true,
            ..Default::default()
        };
        assert_eq!(on.linked().as_deref(), Some("https://my.tdj"));
    }

    #[test]
    fn round_trips_on_disk_and_trusts_once() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(Settings::load(dir.path()), Settings::default());
        let mut s = Settings {
            server: Some("https://my.tdj".into()),
            ..Default::default()
        };
        s.trust("https://my.tdj");
        s.trust("https://my.tdj");
        assert_eq!(s.trusted, vec!["https://my.tdj".to_string()]);
        s.save(dir.path()).unwrap();
        assert_eq!(Settings::load(dir.path()), s);
    }
}
