//! Which TDJ server the window loads, and the servers the DJ has explicitly trusted.
//!
//! Stored as JSON in the app's config directory (`~/Library/Application Support/com.ariomoniri.tdj/settings.json`
//! on macOS, the app container on iPadOS). Nothing secret lives here: provider tokens stay in the server's sealed
//! first-party cookies and model keys stay in the web view (later: the Keychain).

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use url::Url;

/// The TDJ cloud. Overridden at build time with `TDJ_APP_BACKEND_URL` (repository variable of the same name).
pub const DEFAULT_SERVER: &str = match option_env!("TDJ_APP_BACKEND_URL") {
    Some(url) => url,
    None => "https://d3k5k2c1l0s5ri.cloudfront.net",
};

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    /// Origin the main window loads. `None` until the first-launch screen has been answered.
    pub server: Option<String>,
    /// Self-hosted origins the DJ confirmed with "Trust this server?" (the TDJ cloud is always trusted).
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

    /// The origin to load: the chosen server, else the TDJ cloud.
    pub fn server_or_default(&self) -> String {
        self.server
            .clone()
            .unwrap_or_else(|| DEFAULT_SERVER.to_string())
    }

    pub fn is_trusted(&self, origin: &str) -> bool {
        origin == DEFAULT_SERVER || self.trusted.iter().any(|t| t == origin)
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
    fn default_server_is_a_valid_origin() {
        assert_eq!(normalize_server(DEFAULT_SERVER).unwrap(), DEFAULT_SERVER);
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
        s.trust(DEFAULT_SERVER);
        assert_eq!(s.trusted, vec!["https://my.tdj".to_string()]);
        s.save(dir.path()).unwrap();
        assert_eq!(Settings::load(dir.path()), s);
    }
}
