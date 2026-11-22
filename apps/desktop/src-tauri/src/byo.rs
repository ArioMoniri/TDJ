//! 2026-11 — the DJ's own credentials for the services that allow a public client (docs/CONNECTORS.md → Bring
//! your own; apps/web/src/lib/connections/*). Nothing here belongs to T-DJ or its author, and nothing goes to a TDJ
//! server:
//! - a YouTube Data API key the DJ typed in Settings → Connections, kept in the Keychain (`byo.youtube`); the page
//!   never reads it back, it asks `byo_youtube_search` and the key goes from here to Google only;
//! - the DJ's own Dropbox app (app key) and Google client (an iOS client ID): Authorization Code + PKCE without a
//!   secret. The page builds the sign-in link and hands the code here; the code exchange and every refresh run here
//!   against the provider's fixed token address, and the refresh token lives in the Keychain
//!   (`byo.dropbox.refresh`, `byo.google.refresh`). The page gets short-lived access tokens only.
//! - Google comes back through `<bundle id>:/oauth2redirect` (the iOS client's redirect; the app registers its own
//!   bundle ID as a URL scheme, tauri.conf.json → deep-link), forwarded to `/connections/callback`.

use crate::net::{self, NetError, WireResponse};
use crate::AppState;
use serde::Serialize;
use serde_json::Value;
use std::collections::{BTreeMap, HashMap};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, State};
use url::Url;

/// The Keychain item of the DJ's YouTube key (the page may write it: secrets.rs → page_may_write).
pub const YOUTUBE_KEY: &str = "byo.youtube";
pub const YOUTUBE_SEARCH: &str = "https://www.googleapis.com/youtube/v3/search";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Provider {
    Dropbox,
    Google,
}
impl Provider {
    pub fn parse(s: &str) -> Result<Provider, NetError> {
        match s {
            "dropbox" => Ok(Provider::Dropbox),
            "google" => Ok(Provider::Google),
            _ => Err(NetError::new("Unknown service.", 400)),
        }
    }
    pub fn token_url(self) -> &'static str {
        match self {
            Provider::Dropbox => "https://api.dropboxapi.com/oauth2/token",
            Provider::Google => "https://oauth2.googleapis.com/token",
        }
    }
    /// the Keychain item of the refresh token (written here only, never by the page)
    pub fn refresh_name(self) -> &'static str {
        match self {
            Provider::Dropbox => "byo.dropbox.refresh",
            Provider::Google => "byo.google.refresh",
        }
    }
}

/// The search request of the DJ's key: five embeddable videos for `q` (at most 200 characters).
pub fn youtube_search_url(q: &str, key: &str) -> Result<Url, NetError> {
    let q = q.trim();
    if q.is_empty() || q.chars().count() > 200 || q.chars().any(char::is_control) {
        return Err(NetError::new("Search for a title.", 400));
    }
    Url::parse_with_params(
        YOUTUBE_SEARCH,
        &[
            ("part", "snippet"),
            ("type", "video"),
            ("maxResults", "5"),
            ("videoEmbeddable", "true"),
            ("q", q),
            ("key", key),
        ],
    )
    .map_err(|_| NetError::new("Search for a title.", 400))
}

/// The page's code-exchange form, checked: a PKCE authorization-code grant for this client ID, a verifier, the
/// redirect each provider expects from the apps (none for Dropbox's no-redirect flow, `…:/oauth2redirect` for
/// Google), and never a client secret.
pub fn check_form(provider: Provider, form: &str, client_id: &str) -> Result<(), NetError> {
    let pairs: BTreeMap<String, String> = url::form_urlencoded::parse(form.as_bytes())
        .into_owned()
        .collect();
    let redirect_ok = match provider {
        Provider::Dropbox => !pairs.contains_key("redirect_uri"),
        Provider::Google => pairs
            .get("redirect_uri")
            .is_some_and(|r| r.ends_with(":/oauth2redirect") && !r.contains("//")),
    };
    let ok = !client_id.is_empty()
        && pairs.get("grant_type").map(String::as_str) == Some("authorization_code")
        && pairs.get("client_id").map(String::as_str) == Some(client_id)
        && pairs
            .get("code")
            .is_some_and(|c| !c.is_empty() && c.len() <= 2048)
        && pairs
            .get("code_verifier")
            .is_some_and(|v| (43..=128).contains(&v.len()))
        && redirect_ok
        && !pairs.contains_key("client_secret");
    if ok {
        Ok(())
    } else {
        Err(NetError::new("The sign-in did not finish.", 400))
    }
}

pub fn refresh_form(client_id: &str, refresh: &str) -> String {
    url::form_urlencoded::Serializer::new(String::new())
        .append_pair("grant_type", "refresh_token")
        .append_pair("refresh_token", refresh)
        .append_pair("client_id", client_id)
        .finish()
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OwnAccess {
    pub access: String,
    /// epoch milliseconds
    pub expires: u64,
}

pub fn parse_token(j: &Value, now_ms: u64) -> Result<(OwnAccess, Option<String>), NetError> {
    let access = j
        .get("access_token")
        .and_then(Value::as_str)
        .filter(|a| !a.is_empty())
        .ok_or_else(|| NetError::new("The sign-in did not finish.", 401))?;
    let expires_in = j.get("expires_in").and_then(Value::as_u64).unwrap_or(3600);
    Ok((
        OwnAccess {
            access: access.to_string(),
            expires: now_ms + expires_in * 1000,
        },
        j.get("refresh_token")
            .and_then(Value::as_str)
            .filter(|r| !r.is_empty())
            .map(String::from),
    ))
}

/// `<bundle id>:/oauth2redirect?code=…&state=…` (Google, the DJ's own iOS client) → the page that finishes it,
/// with only `code`, `state` and `error` kept. Anything else is not ours.
pub fn callback_path(raw: &str, identifier: &str) -> Option<String> {
    let url = Url::parse(raw).ok()?;
    if !url.scheme().eq_ignore_ascii_case(identifier) || url.path() != "/oauth2redirect" {
        return None;
    }
    let keep: Vec<(String, String)> = url
        .query_pairs()
        .filter(|(k, _)| matches!(k.as_ref(), "code" | "state" | "error"))
        .map(|(k, v)| (k.into_owned(), v.into_owned()))
        .collect();
    if !keep.iter().any(|(k, _)| k == "code" || k == "error") {
        return None;
    }
    let query = url::form_urlencoded::Serializer::new(String::new())
        .extend_pairs(keep)
        .finish();
    Some(format!("/connections/callback?{query}"))
}

/// The redirect URI of the DJ's own Google iOS client: this build's bundle ID as the scheme.
pub fn google_redirect(identifier: &str) -> String {
    format!("{}:/oauth2redirect", identifier.to_ascii_lowercase())
}

/// access tokens in memory, per service (the refresh tokens are in the Keychain)
fn cache() -> &'static Mutex<HashMap<Provider, OwnAccess>> {
    static C: OnceLock<Mutex<HashMap<Provider, OwnAccess>>> = OnceLock::new();
    C.get_or_init(|| Mutex::new(HashMap::new()))
}

async fn token_request(
    client: &reqwest::Client,
    provider: Provider,
    form: String,
) -> Result<Value, NetError> {
    let r = client
        .post(provider.token_url())
        .timeout(Duration::from_secs(15))
        .header("user-agent", net::UA)
        .header("content-type", "application/x-www-form-urlencoded")
        .body(form)
        .send()
        .await
        .map_err(|_| NetError::new("No connection.", 503))?;
    let status = r.status().as_u16();
    let j: Value = serde_json::from_str(&r.text().await.unwrap_or_default()).unwrap_or(Value::Null);
    if status == 400 || status == 401 {
        return Err(NetError::new("The sign-in is no longer valid.", 401));
    }
    if status >= 300 {
        return Err(NetError::new("The service did not answer.", 502));
    }
    Ok(j)
}

// ---------------------------------------------------------------- commands

/// "Find a video" with the DJ's own YouTube key, read from the Keychain here: the key never reaches the page.
#[tauri::command]
pub async fn byo_youtube_search(
    state: State<'_, AppState>,
    q: String,
) -> Result<WireResponse, NetError> {
    let Some(key) = state.secrets.get(YOUTUBE_KEY).filter(|k| !k.is_empty()) else {
        return Err(NetError::new(
            "No YouTube key. Add one in Settings → Connections.",
            401,
        ));
    };
    let url = youtube_search_url(&q, &key)?;
    let r = state
        .http
        .get(url)
        .timeout(Duration::from_secs(10))
        .header("user-agent", net::UA)
        .send()
        .await
        .map_err(|_| NetError::new("No connection.", 503))?;
    let status = r.status().as_u16();
    let body = r.text().await.unwrap_or_default();
    Ok(WireResponse {
        status,
        headers: BTreeMap::new(),
        body,
    })
}

/// The redirect URI (and so the bundle ID) the DJ registers on their own Google iOS client.
#[tauri::command]
pub fn byo_google_redirect(app: AppHandle) -> String {
    google_redirect(&app.config().identifier)
}

#[tauri::command]
pub async fn byo_oauth_exchange(
    state: State<'_, AppState>,
    provider: String,
    client_id: String,
    form: String,
) -> Result<OwnAccess, NetError> {
    let p = Provider::parse(&provider)?;
    check_form(p, &form, &client_id)?;
    let j = token_request(&state.http, p, form).await?;
    let (access, refresh) = parse_token(&j, net::now_ms())?;
    if let Some(r) = refresh {
        state
            .secrets
            .set(p.refresh_name(), &r)
            .map_err(|m| NetError::new(m, 500))?;
    }
    cache().lock().unwrap().insert(p, access.clone());
    Ok(access)
}

/// A valid access token, refreshed from the Keychain when needed; none when the DJ is not signed in.
#[tauri::command]
pub async fn byo_oauth_access(
    state: State<'_, AppState>,
    provider: String,
    client_id: String,
) -> Result<Option<OwnAccess>, NetError> {
    let p = Provider::parse(&provider)?;
    let cached = cache().lock().unwrap().get(&p).cloned();
    if let Some(a) = cached.filter(|a| a.expires > net::now_ms() + 60_000) {
        return Ok(Some(a));
    }
    let Some(refresh) = state.secrets.get(p.refresh_name()) else {
        return Ok(None);
    };
    match token_request(&state.http, p, refresh_form(&client_id, &refresh)).await {
        Ok(j) => {
            let (access, rotated) = parse_token(&j, net::now_ms())?;
            if let Some(r) = rotated.filter(|r| *r != refresh) {
                let _ = state.secrets.set(p.refresh_name(), &r);
            }
            cache().lock().unwrap().insert(p, access.clone());
            Ok(Some(access))
        }
        // revoked, or another app key: signed out, not an error
        Err(e) if e.status == 401 => {
            let _ = state.secrets.delete(p.refresh_name());
            cache().lock().unwrap().remove(&p);
            Ok(None)
        }
        Err(e) => Err(e),
    }
}

#[tauri::command]
pub fn byo_oauth_logout(state: State<'_, AppState>, provider: String) -> Result<(), String> {
    let p = Provider::parse(&provider).map_err(|e| e.message)?;
    cache().lock().unwrap().remove(&p);
    state.secrets.delete(p.refresh_name())
}

#[cfg(test)]
mod tests {
    use super::*;

    const VERIFIER: &str = "abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz";

    fn form(pairs: &[(&str, &str)]) -> String {
        url::form_urlencoded::Serializer::new(String::new())
            .extend_pairs(pairs)
            .finish()
    }

    #[test]
    fn the_search_carries_the_key_to_google_only() {
        let u = youtube_search_url("Poema Canaro tango", "fake-key").unwrap();
        assert_eq!(u.host_str(), Some("www.googleapis.com"));
        assert!(u.query().unwrap().contains("key=fake-key"));
        assert!(u.query().unwrap().contains("videoEmbeddable=true"));
        assert!(youtube_search_url("  ", "k").is_err());
        assert!(youtube_search_url(&"x".repeat(201), "k").is_err());
    }

    #[test]
    fn a_code_exchange_is_a_public_client_with_pkce() {
        let ok = form(&[
            ("grant_type", "authorization_code"),
            ("code", "c0de"),
            ("client_id", "appkeyfake12345"),
            ("code_verifier", VERIFIER),
        ]);
        assert!(check_form(Provider::Dropbox, &ok, "appkeyfake12345").is_ok());
        assert!(check_form(Provider::Dropbox, &ok, "another").is_err());
        let secret = format!("{ok}&client_secret=nope");
        assert!(check_form(Provider::Dropbox, &secret, "appkeyfake12345").is_err());
        // Google needs the app's own redirect; Dropbox's no-redirect flow has none
        assert!(check_form(Provider::Google, &ok, "appkeyfake12345").is_err());
        let g = format!("{ok}&redirect_uri=com.example.tdj%3A%2Foauth2redirect");
        assert!(check_form(Provider::Google, &g, "appkeyfake12345").is_ok());
        assert!(check_form(Provider::Dropbox, &g, "appkeyfake12345").is_err());
        let evil = format!("{ok}&redirect_uri=https%3A%2F%2Fevil.example%2F%3A%2Foauth2redirect");
        assert!(check_form(Provider::Google, &evil, "appkeyfake12345").is_err());
    }

    #[test]
    fn tokens_parse_and_refresh_forms_have_no_secret() {
        let (a, r) = parse_token(
            &serde_json::json!({ "access_token": "at", "expires_in": 100, "refresh_token": "rt" }),
            1_000,
        )
        .unwrap();
        assert_eq!(a.expires, 101_000);
        assert_eq!(r.as_deref(), Some("rt"));
        assert!(parse_token(&serde_json::json!({ "error": "invalid_grant" }), 0).is_err());
        let f = refresh_form("id", "rt");
        assert!(f.contains("grant_type=refresh_token") && !f.contains("secret"));
    }

    #[test]
    fn the_google_redirect_comes_back_to_the_callback_page() {
        let id = "com.example.tdj";
        assert_eq!(google_redirect(id), "com.example.tdj:/oauth2redirect");
        assert_eq!(
            callback_path(
                "com.example.tdj:/oauth2redirect?code=4%2F0A&state=xyz&scope=x",
                id
            )
            .as_deref(),
            Some("/connections/callback?code=4%2F0A&state=xyz")
        );
        assert_eq!(
            callback_path(
                "com.example.tdj:/oauth2redirect?error=access_denied&state=s",
                id
            )
            .as_deref(),
            Some("/connections/callback?error=access_denied&state=s")
        );
        assert_eq!(
            callback_path("com.example.tdj:/oauth2redirect?state=s", id),
            None
        );
        assert_eq!(
            callback_path("com.other.app:/oauth2redirect?code=c", id),
            None
        );
        assert_eq!(callback_path("tdj://open?path=/", id), None);
    }
}
