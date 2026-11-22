//! Spotify sign-in from the apps, finished on the native side (Authorization Code + PKCE, a public client).
//!
//! 1. The page makes the verifier, the challenge and the state (apps/web/src/lib/app/pkce.ts) and hands the verifier
//!    and the state to `spotify_begin` before it opens the system browser. They stay here, in memory, for 15 minutes.
//! 2. Spotify sends the browser to `tdj://spotify-callback?code=…&state=…`; the deep link reaches `lib.rs`
//!    (`handle_link`), which settles it here: the state must be the one this device sent, once.
//! 3. The code and the verifier go to accounts.spotify.com/api/token (`commands::spotify_exchange`); the refresh token
//!    goes to the Keychain, the access token stays in memory.
//! 4. The window opens `next?connected=spotify` (or `?error=spotify_…`): the page loads afresh, asks the native side
//!    for the session (`spotify_access`, lib/app/login.ts → `syncAppSpotify`) and Settings says "Logged in as …".
//!
//! Until 1.0.1 the page alone held the verifier (sessionStorage) and finished the exchange on `/callback`; macOS and
//! iOS delivered every deep link twice (the deep-link plugin and the app's own `RunEvent::Opened`), and nothing put
//! the new session into the page's store, so the Booth, Listen and the song rows read "not connected" until Settings
//! was opened, and again after every relaunch. The page's `/callback` stays as the fallback for a sign-in started
//! before the app restarted (`Outcome::Page`).

use std::time::{Duration, Instant};

pub const REDIRECT: &str = "tdj://spotify-callback";
/// How long a started sign-in waits for its deep link.
pub const PENDING_TTL: Duration = Duration::from_secs(15 * 60);

/// A sign-in this device started: what the code exchange needs, and where the DJ goes after.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Pending {
    pub client_id: String,
    pub state: String,
    pub verifier: String,
    pub next: String,
    pub at: Instant,
}

/// RFC 7636 unreserved characters (`A–Z a–z 0–9 - . _ ~`).
fn unreserved(s: &str) -> bool {
    s.bytes()
        .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'.' | b'_' | b'~'))
}

/// A Spotify Client ID: 32 hexadecimal characters today; letters and digits, at most 64.
pub fn valid_client_id(c: &str) -> bool {
    (1..=64).contains(&c.len()) && c.bytes().all(|b| b.is_ascii_alphanumeric())
}

impl Pending {
    pub fn new(
        client_id: &str,
        state: &str,
        verifier: &str,
        next: Option<&str>,
        at: Instant,
    ) -> Result<Pending, String> {
        if !valid_client_id(client_id) {
            return Err("That is not a Spotify Client ID.".into());
        }
        if !(16..=256).contains(&state.len()) || !unreserved(state) {
            return Err("The sign-in could not start.".into());
        }
        if !(43..=128).contains(&verifier.len()) || !unreserved(verifier) {
            return Err("The sign-in could not start.".into());
        }
        Ok(Pending {
            client_id: client_id.into(),
            state: state.into(),
            verifier: verifier.into(),
            next: next
                .and_then(crate::links::safe_path)
                .unwrap_or_else(|| "/settings".into()),
            at,
        })
    }
}

/// What came back on `tdj://spotify-callback` (links.rs).
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Callback {
    pub code: Option<String>,
    pub state: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, PartialEq, Eq)]
pub enum Outcome {
    /// No sign-in is pending here (the app restarted since it began, or an older page started it): the page's
    /// `/callback` finishes it with what it kept.
    Page,
    /// The state is not the one this device sent, or the sign-in is older than `PENDING_TTL`: nothing is exchanged.
    Rejected,
    /// Spotify answered with an error or without a code; `why` is the `error=spotify_<why>` Settings explains.
    Failed { next: String, why: &'static str },
    /// The code of the pending sign-in: `form` goes to accounts.spotify.com/api/token.
    Exchange {
        client_id: String,
        form: String,
        next: String,
    },
}

/// Matches a callback with the pending sign-in. A matching callback uses it up (a code is exchanged once); a link
/// with another state leaves it waiting for the real one.
pub fn settle(pending: &mut Option<Pending>, cb: &Callback, now: Instant) -> Outcome {
    let Some(p) = pending.as_ref() else {
        return Outcome::Page;
    };
    if now.saturating_duration_since(p.at) > PENDING_TTL {
        *pending = None;
        return Outcome::Rejected;
    }
    if cb.state.as_deref() != Some(p.state.as_str()) {
        return Outcome::Rejected;
    }
    let Some(p) = pending.take() else {
        return Outcome::Page;
    };
    if let Some(e) = cb.error.as_deref() {
        return Outcome::Failed {
            next: p.next,
            why: callback_reason(e),
        };
    }
    match cb.code.as_deref().filter(|c| !c.is_empty()) {
        Some(code) => Outcome::Exchange {
            form: exchange_form(&p.client_id, code, &p.verifier),
            client_id: p.client_id,
            next: p.next,
        },
        None => Outcome::Failed {
            next: p.next,
            why: "failed",
        },
    }
}

/// Spotify's `error=` on the redirect, as Settings words it. `invalid_client` is what an app in Development Mode
/// answers a DJ it has not listed (or a Client ID that does not exist): "use your own Spotify app" is the way out.
pub fn callback_reason(error: &str) -> &'static str {
    match error {
        "access_denied" => "denied",
        "invalid_client" | "unauthorized_client" => "not_listed",
        _ => "failed",
    }
}

/// A failed code exchange, as Settings words it: Spotify's 403 "User not registered in the Developer Dashboard" (a
/// Development Mode app admits 5 listed users since February 2026) is `not_listed`, anything else `failed`.
pub fn exchange_reason(status: u16, message: &str) -> &'static str {
    let m = message.to_ascii_lowercase();
    if status == 403
        || m.contains("not registered")
        || m.contains("not be registered")
        || m.contains("developer dashboard")
        || m.contains("user not allowed")
    {
        "not_listed"
    } else {
        "failed"
    }
}

/// The token request of a public client, as lib/app/pkce.ts → `tokenBody` writes it (net.rs checks it again).
pub fn exchange_form(client_id: &str, code: &str, verifier: &str) -> String {
    url::form_urlencoded::Serializer::new(String::new())
        .append_pair("grant_type", "authorization_code")
        .append_pair("client_id", client_id)
        .append_pair("code", code)
        .append_pair("redirect_uri", REDIRECT)
        .append_pair("code_verifier", verifier)
        .finish()
}

/// Where the window goes once the sign-in is settled: `next` with `connected=spotify`, or `error=spotify_<why>`
/// (Settings → Connectors says which, components/Connectors.tsx → `arrivalToast`).
pub fn arrival(next: &str, ok: bool, why: &str) -> String {
    let next = crate::links::safe_path(next).unwrap_or_else(|| "/settings".into());
    let (path, fragment) = match next.split_once('#') {
        Some((p, f)) => (p.to_string(), Some(f.to_string())),
        None => (next, None),
    };
    let pair = if ok {
        "connected=spotify".to_string()
    } else {
        format!("error=spotify_{why}")
    };
    let sep = if path.contains('?') { '&' } else { '?' };
    match fragment {
        Some(f) => format!("{path}{sep}{pair}#{f}"),
        None => format!("{path}{sep}{pair}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const CLIENT: &str = "0123456789abcdef0123456789abcdef";
    const STATE: &str = "q7Z-_k3P9wXyLmN0aB1cDe";

    fn pending(at: Instant) -> Option<Pending> {
        Some(Pending::new(CLIENT, STATE, &"v".repeat(86), Some("/booth"), at).unwrap())
    }
    fn cb(code: Option<&str>, state: Option<&str>, error: Option<&str>) -> Callback {
        Callback {
            code: code.map(String::from),
            state: state.map(String::from),
            error: error.map(String::from),
        }
    }

    #[test]
    fn a_matching_callback_exchanges_its_code_once() {
        let now = Instant::now();
        let mut p = pending(now);
        let out = settle(&mut p, &cb(Some("AQB"), Some(STATE), None), now);
        let Outcome::Exchange {
            client_id,
            form,
            next,
        } = out
        else {
            panic!("expected an exchange, got {out:?}");
        };
        assert_eq!(client_id, CLIENT);
        assert_eq!(next, "/booth");
        // the form net.rs accepts: a public PKCE client, the app's own redirect, never a secret
        assert!(crate::net::check_exchange_form(&form, CLIENT).is_ok());
        assert!(form.contains("code=AQB"));
        assert!(!form.contains("secret"));
        // used up: the same link again (a second delivery) is the page's, which has nothing to finish either
        assert!(p.is_none());
        assert_eq!(
            settle(&mut p, &cb(Some("AQB"), Some(STATE), None), now),
            Outcome::Page
        );
    }

    #[test]
    fn a_state_mismatch_is_rejected_and_the_real_sign_in_still_waits() {
        let now = Instant::now();
        let mut p = pending(now);
        for bad in [
            cb(Some("AQB"), Some("someone-elses-state-000"), None),
            cb(Some("AQB"), None, None),
            cb(Some("AQB"), Some(""), None),
            cb(None, Some("x"), Some("access_denied")),
        ] {
            assert_eq!(settle(&mut p, &bad, now), Outcome::Rejected, "{bad:?}");
            assert!(
                p.is_some(),
                "a forged link must not cancel the DJ's sign-in"
            );
        }
        assert!(matches!(
            settle(&mut p, &cb(Some("AQB"), Some(STATE), None), now),
            Outcome::Exchange { .. }
        ));
    }

    #[test]
    fn an_old_sign_in_expires() {
        let then = Instant::now();
        let mut p = pending(then);
        let later = then + PENDING_TTL + Duration::from_secs(1);
        assert_eq!(
            settle(&mut p, &cb(Some("AQB"), Some(STATE), None), later),
            Outcome::Rejected
        );
        assert!(p.is_none());
    }

    #[test]
    fn spotify_errors_are_told_apart() {
        let now = Instant::now();
        let mut p = pending(now);
        assert_eq!(
            settle(&mut p, &cb(None, Some(STATE), Some("access_denied")), now),
            Outcome::Failed {
                next: "/booth".into(),
                why: "denied"
            }
        );
        let mut p = pending(now);
        assert_eq!(
            settle(&mut p, &cb(None, Some(STATE), Some("invalid_client")), now),
            Outcome::Failed {
                next: "/booth".into(),
                why: "not_listed"
            }
        );
        let mut p = pending(now);
        assert_eq!(
            settle(&mut p, &cb(None, Some(STATE), None), now),
            Outcome::Failed {
                next: "/booth".into(),
                why: "failed"
            }
        );
    }

    #[test]
    fn a_dj_the_app_does_not_list_is_told_so() {
        assert_eq!(
            exchange_reason(403, "User not registered in the Developer Dashboard"),
            "not_listed"
        );
        assert_eq!(
            exchange_reason(401, "Check settings on developer.spotify.com/dashboard, the user may not be registered."),
            "not_listed"
        );
        assert_eq!(exchange_reason(401, "Invalid authorization code"), "failed");
        assert_eq!(exchange_reason(503, "Can't reach Spotify."), "failed");
    }

    #[test]
    fn begin_checks_what_the_page_sends() {
        let now = Instant::now();
        let v = "v".repeat(43);
        assert!(Pending::new(CLIENT, STATE, &v, None, now).is_ok());
        assert_eq!(
            Pending::new(CLIENT, STATE, &v, Some("//evil.example"), now)
                .unwrap()
                .next,
            "/settings"
        );
        assert!(Pending::new("", STATE, &v, None, now).is_err());
        assert!(Pending::new("abc def", STATE, &v, None, now).is_err());
        assert!(Pending::new(CLIENT, "short", &v, None, now).is_err());
        assert!(Pending::new(CLIENT, "a b c d e f g h i j k", &v, None, now).is_err());
        assert!(Pending::new(CLIENT, STATE, "short", None, now).is_err());
        assert!(Pending::new(CLIENT, STATE, &"v".repeat(129), None, now).is_err());
    }

    #[test]
    fn the_window_lands_where_the_dj_started() {
        assert_eq!(
            arrival("/settings", true, ""),
            "/settings?connected=spotify"
        );
        assert_eq!(
            arrival("/booth?tab=now", true, ""),
            "/booth?tab=now&connected=spotify"
        );
        assert_eq!(
            arrival("/settings#connectors", false, "denied"),
            "/settings?error=spotify_denied#connectors"
        );
        assert_eq!(
            arrival("https://evil.example", false, "state"),
            "/settings?error=spotify_state"
        );
    }
}
