//! `tdj://` deep links and the system-browser login hand-off (r22-apps-plan.md §4, "Auth handoff").
//!
//! Flow, nothing stored server-side:
//! 1. The web page (or the menu) calls `start_login("spotify")`: the app opens
//!    `<server>/api/spotify/login?client=app` in the **system browser** (passkeys, password managers, Google
//!    accepts it; embedded web views are refused by Google).
//! 2. The provider redirects to the server's existing https callback (already registered at Spotify, Google and
//!    Dropbox, so no new redirect URI is needed at any provider for this path).
//! 3. The callback's `client=app` branch seals the token set as it does for the cookie, wraps it in a 60-second
//!    single-use ticket and redirects to the fixed `tdj://auth/<provider>?ticket=…`.
//! 4. The app loads `<server>/api/app/redeem?provider=…&ticket=…` in its own web view, which sets the normal
//!    first-party cookie in the app's cookie jar.
//!
//! `tdj://spotify-callback` is the redirect URI for the Spotify iOS SDK and for a DJ's own Spotify app (PKCE);
//! the app forwards its query to `<server>/callback`, the page that already finishes the PKCE exchange.

use url::Url;

pub const SCHEME: &str = "tdj";
pub const PROVIDERS: [&str; 3] = ["spotify", "google", "dropbox"];

#[derive(Debug, PartialEq, Eq, Clone)]
pub enum DeepLink {
    /// `tdj://auth/<provider>?ticket=…[&next=/path]`
    AuthTicket {
        provider: String,
        ticket: String,
        next: String,
    },
    /// `tdj://spotify-callback?code=…&state=…` (or `?error=…`): the raw query, re-validated.
    SpotifyCallback { query: String },
    /// `tdj://server?url=https://…` (QR code / link on a self-hosted server's /admin page)
    Server { url: String },
    /// `tdj://open?path=/booth`
    Open { path: String },
    /// `tdj://night#n1.…`: a shared night packed in the fragment (ROADMAP §13), opened at `/night#…`
    Night { fragment: String },
    /// `file:///…/Saturday.tdjnight`: a night file opened from Finder, Files or AirDrop
    NightFile { path: std::path::PathBuf },
    /// `tdj://room?server=https://…&code=ABC234`: a room on the server of whoever made it (§12, opt-in)
    Room { server: String, code: String },
}

/// A night link's payload: `n1.` then base64url, at most 100 000 characters.
fn valid_night_fragment(f: &str) -> bool {
    f.starts_with("n1.")
        && f.len() <= 100_000
        && f.bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.'))
}

/// A room code: six of `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`.
fn valid_room_code(c: &str) -> bool {
    c.len() == 6
        && c.bytes()
            .all(|b| b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789".contains(&b))
}

fn valid_ticket(t: &str) -> bool {
    (16..=4096).contains(&t.len())
        && t.bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~'))
}

/// In-app path: must start with one `/`, no scheme-relative `//host`, no backslashes or control characters.
pub fn safe_path(p: &str) -> Option<String> {
    let ok = p.starts_with('/')
        && !p.starts_with("//")
        && p.len() <= 512
        && !p.chars().any(|c| c == '\\' || c.is_control());
    ok.then(|| p.to_string())
}

pub fn parse(raw: &str) -> Option<DeepLink> {
    let url = Url::parse(raw).ok()?;
    if url.scheme() == "file" {
        let path = url.to_file_path().ok()?;
        let ext = path.extension()?.to_str()?.to_ascii_lowercase();
        return (ext == "tdjnight").then_some(DeepLink::NightFile { path });
    }
    if url.scheme() != SCHEME {
        return None;
    }
    let host = url.host_str().unwrap_or_default();
    let get = |k: &str| {
        url.query_pairs()
            .find(|(key, _)| key == k)
            .map(|(_, v)| v.into_owned())
    };
    match host {
        "auth" => {
            let provider = url.path().trim_start_matches('/').to_ascii_lowercase();
            if !PROVIDERS.contains(&provider.as_str()) {
                return None;
            }
            let ticket = get("ticket").filter(|t| valid_ticket(t))?;
            let next = get("next")
                .and_then(|n| safe_path(&n))
                .unwrap_or_else(|| "/settings".into());
            Some(DeepLink::AuthTicket {
                provider,
                ticket,
                next,
            })
        }
        "spotify-callback" => {
            let has_code_or_error = get("code").is_some() || get("error").is_some();
            let clean: Vec<(String, String)> = url
                .query_pairs()
                .filter(|(k, _)| matches!(k.as_ref(), "code" | "state" | "error"))
                .map(|(k, v)| (k.into_owned(), v.into_owned()))
                .collect();
            if !has_code_or_error {
                return None;
            }
            let query = url::form_urlencoded::Serializer::new(String::new())
                .extend_pairs(clean)
                .finish();
            Some(DeepLink::SpotifyCallback { query })
        }
        "server" => get("url").map(|url| DeepLink::Server { url }),
        "open" => get("path")
            .and_then(|p| safe_path(&p))
            .map(|path| DeepLink::Open { path }),
        "night" => url
            .fragment()
            .filter(|f| valid_night_fragment(f))
            .map(|f| DeepLink::Night {
                fragment: f.to_string(),
            }),
        "room" => {
            let code = get("code")
                .map(|c| c.to_ascii_uppercase())
                .filter(|c| valid_room_code(c))?;
            let server = get("server").filter(|s| {
                Url::parse(s)
                    .map(|u| matches!(u.scheme(), "https" | "http") && u.host().is_some())
                    .unwrap_or(false)
            })?;
            Some(DeepLink::Room { server, code })
        }
        _ => None,
    }
}

/// Where the system browser starts a login. `scope` is Google's per-feature scope (`drive` | `youtube`).
pub fn login_url(
    server: &str,
    provider: &str,
    scope: Option<&str>,
    next: Option<&str>,
) -> Option<String> {
    if !PROVIDERS.contains(&provider) {
        return None;
    }
    let mut url = Url::parse(server)
        .ok()?
        .join(&format!("/api/{provider}/login"))
        .ok()?;
    url.query_pairs_mut().append_pair("client", "app");
    if let Some(s) = scope.filter(|s| matches!(*s, "drive" | "youtube")) {
        url.query_pairs_mut().append_pair("scope", s);
    }
    if let Some(n) = next.and_then(safe_path) {
        url.query_pairs_mut().append_pair("next", &n);
    }
    Some(url.into())
}

/// The URL the web view opens with a ticket, so the server sets its first-party cookie in the app's jar.
pub fn redeem_url(server: &str, provider: &str, ticket: &str, next: &str) -> Option<String> {
    let mut url = Url::parse(server).ok()?.join("/api/app/redeem").ok()?;
    url.query_pairs_mut()
        .append_pair("provider", provider)
        .append_pair("ticket", ticket)
        .append_pair("next", next);
    Some(url.into())
}

/// Does `url` belong to `origin` (same scheme, host and port)? Used to keep the main window on the server and
/// send every other link to the system browser.
pub fn same_origin(url: &Url, origin: &str) -> bool {
    Url::parse(origin)
        .map(|o| o.origin() == url.origin())
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    const S: &str = "https://tdj.example.org";
    const T: &str = "v1.abcdefghijklmnopqrstuvwxyz_0123456789-AB";

    #[test]
    fn parses_auth_ticket_with_default_next() {
        assert_eq!(
            parse(&format!("tdj://auth/Spotify?ticket={T}")),
            Some(DeepLink::AuthTicket {
                provider: "spotify".into(),
                ticket: T.into(),
                next: "/settings".into()
            })
        );
    }

    #[test]
    fn rejects_unknown_provider_bad_ticket_and_open_redirects() {
        assert_eq!(parse(&format!("tdj://auth/evil?ticket={T}")), None);
        assert_eq!(parse("tdj://auth/spotify?ticket=short"), None);
        assert_eq!(
            parse("tdj://auth/spotify?ticket=%3Cscript%3Ealert(1)%3C%2Fscript%3Exxxxxxxx"),
            None
        );
        let link = parse(&format!("tdj://auth/google?ticket={T}&next=//evil.example")).unwrap();
        assert!(matches!(link, DeepLink::AuthTicket { next, .. } if next == "/settings"));
        assert_eq!(parse("https://auth/spotify?ticket=x"), None);
    }

    #[test]
    fn spotify_callback_keeps_only_oauth_fields() {
        let l = parse("tdj://spotify-callback?code=AQB&state=xyz&inject=1").unwrap();
        assert_eq!(
            l,
            DeepLink::SpotifyCallback {
                query: "code=AQB&state=xyz".into()
            }
        );
        assert_eq!(parse("tdj://spotify-callback?state=only"), None);
    }

    #[test]
    fn server_and_open_links() {
        assert_eq!(
            parse("tdj://server?url=https%3A%2F%2Fmy.tdj"),
            Some(DeepLink::Server {
                url: "https://my.tdj".into()
            })
        );
        assert_eq!(
            parse("tdj://open?path=/booth"),
            Some(DeepLink::Open {
                path: "/booth".into()
            })
        );
        assert_eq!(parse("tdj://open?path=https://evil"), None);
        assert_eq!(parse("tdj://open?path=/a%5Cb"), None);
    }

    #[test]
    fn night_and_room_links() {
        assert_eq!(
            parse("tdj://night#n1.abc-_DEF"),
            Some(DeepLink::Night {
                fragment: "n1.abc-_DEF".into()
            })
        );
        assert_eq!(parse("tdj://night#%3Cscript%3E"), None);
        assert_eq!(parse("tdj://night"), None);
        assert_eq!(
            parse("tdj://room?server=https%3A%2F%2Fmy.tdj&code=abc234"),
            Some(DeepLink::Room {
                server: "https://my.tdj".into(),
                code: "ABC234".into()
            })
        );
        assert_eq!(
            parse("tdj://room?server=javascript%3Aalert(1)&code=ABC234"),
            None
        );
        assert_eq!(
            parse("tdj://room?server=https%3A%2F%2Fmy.tdj&code=ABC10"),
            None
        );
        assert!(matches!(
            parse("file:///Users/dj/Saturday.tdjnight"),
            Some(DeepLink::NightFile { .. })
        ));
        assert_eq!(parse("file:///Users/dj/notes.txt"), None);
    }

    #[test]
    fn builds_login_and_redeem_urls() {
        assert_eq!(
            login_url(S, "spotify", None, Some("/booth")).unwrap(),
            format!("{S}/api/spotify/login?client=app&next=%2Fbooth")
        );
        assert_eq!(
            login_url(S, "google", Some("drive"), None).unwrap(),
            format!("{S}/api/google/login?client=app&scope=drive")
        );
        assert_eq!(
            login_url(S, "google", Some("evil"), Some("//evil")).unwrap(),
            format!("{S}/api/google/login?client=app")
        );
        assert_eq!(login_url(S, "github", None, None), None);
        assert_eq!(
            redeem_url(S, "dropbox", T, "/settings").unwrap(),
            format!("{S}/api/app/redeem?provider=dropbox&ticket={T}&next=%2Fsettings")
        );
    }

    #[test]
    fn same_origin_checks_scheme_host_port() {
        assert!(same_origin(
            &Url::parse(&format!("{S}/booth?x")).unwrap(),
            S
        ));
        assert!(!same_origin(
            &Url::parse("https://accounts.spotify.com/").unwrap(),
            S
        ));
        assert!(!same_origin(
            &Url::parse("http://tdj.example.org/").unwrap(),
            S
        ));
    }
}
