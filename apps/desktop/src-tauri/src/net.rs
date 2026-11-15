//! The app's own HTTP, so the standalone UI needs no TDJ server:
//! - `net_fetch`: lookups the page cannot make itself (api.deezer.com sends no CORS headers): Deezer previews
//!   (re-signed per request, as apps/web/src/lib/api/net.ts does on the server), MusicBrainz, the Cover Art
//!   Archive and Discogs (the fill flow, with the DJ's own Discogs token). Fixed hosts only.
//! - `model_fetch`: the provider layer's own request (apps/web/src/lib/ai/providers.ts) to one of the four model
//!   providers, with the DJ's key from the Keychain put in place of the page's mark. The key never reaches the page,
//!   and goes to its own provider's host only. There is no shared key in the app.
//! - Spotify (Authorization Code + PKCE, no client secret): the code exchange and refresh, tokens in the Keychain.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
use std::time::Duration;
use url::Url;

pub const UA: &str = concat!(
    "TDJ-App/",
    env!("CARGO_PKG_VERSION"),
    " (https://github.com/ArioMoniri/TDJ)"
);

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct NetError {
    pub message: String,
    pub status: u16,
}
impl NetError {
    pub fn new(message: impl Into<String>, status: u16) -> NetError {
        NetError {
            message: message.into(),
            status,
        }
    }
}

// ---------------------------------------------------------------- net_fetch

#[derive(Debug, Deserialize)]
pub struct WireRequest {
    pub url: String,
    #[serde(default)]
    pub method: Option<String>,
    #[serde(default)]
    pub headers: BTreeMap<String, String>,
    #[serde(default)]
    pub body: Option<String>,
}
#[derive(Debug, Serialize)]
pub struct WireResponse {
    pub status: u16,
    pub headers: BTreeMap<String, String>,
    pub body: String,
}

/// Hosts the page may reach through the app: Deezer's API, MusicBrainz, the Cover Art Archive and Discogs.
/// Everything else is refused.
pub const FETCH_HOSTS: [&str; 4] = [
    "api.deezer.com",
    "musicbrainz.org",
    "coverartarchive.org",
    "api.discogs.com",
];

/// Where a lookup may be redirected: its own hosts, and the Internet Archive that serves the Cover Art Archive.
pub fn redirect_allowed(url: &Url) -> bool {
    let host = url.host_str().unwrap_or_default();
    url.scheme() == "https"
        && (FETCH_HOSTS.contains(&host) || host == "archive.org" || host.ends_with(".archive.org"))
}

pub fn allowed_fetch(raw: &str, method: &str) -> Result<Url, NetError> {
    let url = Url::parse(raw).map_err(|_| NetError::new("Not a web address.", 400))?;
    if url.scheme() != "https" || !url.username().is_empty() || url.password().is_some() {
        return Err(NetError::new("Only https lookups are allowed.", 400));
    }
    let host = url.host_str().unwrap_or_default();
    if !FETCH_HOSTS.contains(&host) || url.port().is_some() {
        return Err(NetError::new("The app does not contact that site.", 403));
    }
    if !matches!(method, "GET" | "HEAD") {
        return Err(NetError::new("Only lookups are allowed.", 405));
    }
    Ok(url)
}

const KEEP_RESPONSE: [&str; 4] = ["content-type", "cache-control", "retry-after", "date"];

pub async fn fetch(client: &reqwest::Client, req: WireRequest) -> Result<WireResponse, NetError> {
    let method = req.method.as_deref().unwrap_or("GET").to_ascii_uppercase();
    let url = allowed_fetch(&req.url, &method)?;
    let discogs = url.host_str() == Some("api.discogs.com");
    let mut b = client
        .request(
            reqwest::Method::from_bytes(method.as_bytes()).unwrap_or(reqwest::Method::GET),
            url,
        )
        .timeout(Duration::from_secs(10))
        .header("user-agent", UA);
    if let Some(a) = req.headers.get("accept") {
        b = b.header("accept", a);
    }
    // the DJ's own Discogs token (Settings → Data sources), for Discogs only
    if discogs {
        if let Some(a) = req
            .headers
            .get("authorization")
            .filter(|a| a.starts_with("Discogs token="))
        {
            b = b.header("authorization", a);
        }
    }
    let r = b
        .send()
        .await
        .map_err(|_| NetError::new("No connection.", 503))?;
    let status = r.status().as_u16();
    let mut headers = BTreeMap::new();
    for k in KEEP_RESPONSE {
        if let Some(v) = r.headers().get(k).and_then(|v| v.to_str().ok()) {
            headers.insert(k.to_string(), v.to_string());
        }
    }
    let body = r.text().await.unwrap_or_default();
    Ok(WireResponse {
        status,
        headers,
        body,
    })
}

// ---------------------------------------------------------------- model_fetch

/// The model providers' hosts, the provider each one is, and the request path the provider layer uses.
pub const MODEL_HOSTS: [(&str, &str); 4] = [
    ("api.anthropic.com", "anthropic"),
    ("api.openai.com", "openai"),
    ("openrouter.ai", "openrouter"),
    ("generativelanguage.googleapis.com", "gemini"),
];
pub const MODEL_TIMEOUT: Duration = Duration::from_secs(60);

/// The provider a model request goes to (from its host, never from the page), or why it may not go.
pub fn model_target(raw: &str, method: &str) -> Result<(Url, &'static str), NetError> {
    let url = Url::parse(raw).map_err(|_| NetError::new("Not a web address.", 400))?;
    if url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
    {
        return Err(NetError::new(
            "Only https requests to a model provider.",
            400,
        ));
    }
    let host = url.host_str().unwrap_or_default();
    let Some(&(_, provider)) = MODEL_HOSTS.iter().find(|(h, _)| *h == host) else {
        return Err(NetError::new("The app does not contact that site.", 403));
    };
    let path = url.path();
    let ok = match provider {
        "anthropic" => path == "/v1/messages",
        "openai" => path == "/v1/chat/completions",
        "openrouter" => path == "/api/v1/chat/completions",
        _ => path.starts_with("/v1beta/models/") && path.ends_with(":generateContent"),
    };
    if !ok || method != "POST" {
        return Err(NetError::new("Only a model completion is allowed.", 405));
    }
    Ok((url, provider))
}

/// The Keychain entry of a provider's key (lib/app/boot.ts → saveAiKey).
pub fn key_name(provider: &str) -> String {
    format!("ai.{provider}")
}

/// Headers that never pass from the page: any key it holds, cookies and the browser's own.
const DROP_HEADERS: [&str; 9] = [
    "authorization",
    "x-api-key",
    "x-goog-api-key",
    "cookie",
    "host",
    "content-length",
    "origin",
    "referer",
    "user-agent",
];

/// The request's headers with the DJ's key where the provider reads it (and only there).
pub fn model_headers(
    provider: &str,
    incoming: &BTreeMap<String, String>,
    key: &str,
) -> Vec<(String, String)> {
    let mut out: Vec<(String, String)> = incoming
        .iter()
        .map(|(k, v)| (k.to_ascii_lowercase(), v.clone()))
        .filter(|(k, _)| !DROP_HEADERS.contains(&k.as_str()))
        .collect();
    out.push(match provider {
        "anthropic" => ("x-api-key".into(), key.to_string()),
        "gemini" => ("x-goog-api-key".into(), key.to_string()),
        _ => ("authorization".into(), format!("Bearer {key}")),
    });
    out
}

const KEEP_MODEL_RESPONSE: [&str; 4] =
    ["content-type", "retry-after", "request-id", "x-request-id"];

pub async fn model_fetch(
    client: &reqwest::Client,
    req: WireRequest,
    provider: &str,
    key: &str,
) -> Result<WireResponse, NetError> {
    let method = req.method.as_deref().unwrap_or("POST").to_ascii_uppercase();
    let (url, _) = model_target(&req.url, &method)?;
    let mut b = client
        .post(url)
        .timeout(MODEL_TIMEOUT)
        .header("user-agent", UA);
    for (k, v) in model_headers(provider, &req.headers, key) {
        b = b.header(k, v);
    }
    let r = b
        .body(req.body.unwrap_or_default())
        .send()
        .await
        .map_err(|e| {
            if e.is_timeout() {
                NetError::new(
                    "The model took too long; try again or ask a shorter question.",
                    504,
                )
            } else {
                NetError::new(
                    "Can't reach the model provider. Check your connection.",
                    502,
                )
            }
        })?;
    let status = r.status().as_u16();
    let mut headers = BTreeMap::new();
    for k in KEEP_MODEL_RESPONSE {
        if let Some(v) = r.headers().get(k).and_then(|v| v.to_str().ok()) {
            headers.insert(k.to_string(), v.to_string());
        }
    }
    let body = r.text().await.unwrap_or_default();
    Ok(WireResponse {
        status,
        headers,
        body,
    })
}

// ---------------------------------------------------------------- Spotify (PKCE, public client)

pub const SPOTIFY_TOKEN_URL: &str = "https://accounts.spotify.com/api/token";

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SpotifyAccess {
    pub access: String,
    /// epoch milliseconds
    pub expires: u64,
    pub scopes: Vec<String>,
}

/// The page's code-exchange form (lib/app/pkce.ts → tokenBody), checked: a PKCE authorization-code grant for this
/// client, with a verifier, and never a client secret.
pub fn check_exchange_form(form: &str, client_id: &str) -> Result<(), NetError> {
    let pairs: BTreeMap<String, String> = url::form_urlencoded::parse(form.as_bytes())
        .into_owned()
        .collect();
    let ok = pairs.get("grant_type").map(String::as_str) == Some("authorization_code")
        && pairs.get("client_id").map(String::as_str) == Some(client_id)
        && pairs.get("code").is_some_and(|c| !c.is_empty())
        && pairs
            .get("code_verifier")
            .is_some_and(|v| (43..=128).contains(&v.len()))
        && pairs.get("redirect_uri").map(String::as_str) == Some("tdj://spotify-callback")
        && !pairs.contains_key("client_secret");
    if ok {
        Ok(())
    } else {
        Err(NetError::new("Spotify did not finish the sign-in.", 400))
    }
}

pub fn refresh_form(client_id: &str, refresh: &str) -> String {
    url::form_urlencoded::Serializer::new(String::new())
        .append_pair("grant_type", "refresh_token")
        .append_pair("client_id", client_id)
        .append_pair("refresh_token", refresh)
        .finish()
}

pub struct TokenAnswer {
    pub access: SpotifyAccess,
    pub refresh: Option<String>,
}

pub fn parse_token(j: &Value, now_ms: u64) -> Result<TokenAnswer, NetError> {
    let access = j
        .get("access_token")
        .and_then(Value::as_str)
        .ok_or_else(|| {
            NetError::new(
                j.get("error_description")
                    .and_then(Value::as_str)
                    .unwrap_or("Spotify did not finish the sign-in."),
                401,
            )
        })?;
    let expires_in = j.get("expires_in").and_then(Value::as_u64).unwrap_or(3600);
    Ok(TokenAnswer {
        access: SpotifyAccess {
            access: access.to_string(),
            expires: now_ms + expires_in * 1000,
            scopes: j
                .get("scope")
                .and_then(Value::as_str)
                .map(|s| s.split_whitespace().map(String::from).collect())
                .unwrap_or_default(),
        },
        refresh: j
            .get("refresh_token")
            .and_then(Value::as_str)
            .map(String::from),
    })
}

pub async fn spotify_token_request(
    client: &reqwest::Client,
    form: String,
) -> Result<Value, NetError> {
    let r = client
        .post(SPOTIFY_TOKEN_URL)
        .timeout(Duration::from_secs(15))
        .header("content-type", "application/x-www-form-urlencoded")
        .header("user-agent", UA)
        .body(form)
        .send()
        .await
        .map_err(|_| NetError::new("Can't reach Spotify. Check your connection.", 503))?;
    let status = r.status().as_u16();
    let j: Value = serde_json::from_str(&r.text().await.unwrap_or_default()).unwrap_or(Value::Null);
    if !(200..300).contains(&status) {
        let m = j
            .get("error_description")
            .and_then(Value::as_str)
            .unwrap_or("Spotify did not accept the sign-in.");
        return Err(NetError::new(m, if status == 400 { 401 } else { status }));
    }
    Ok(j)
}

pub fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn fetch_reaches_deezer_and_musicbrainz_only() {
        assert!(allowed_fetch("https://api.deezer.com/track/3135556", "GET").is_ok());
        assert!(allowed_fetch("https://musicbrainz.org/ws/2/recording/?query=x", "GET").is_ok());
        assert_eq!(
            allowed_fetch("https://d3k5k2c1l0s5ri.cloudfront.net/api/compose", "GET")
                .unwrap_err()
                .status,
            403
        );
        assert!(allowed_fetch("http://api.deezer.com/track/1", "GET").is_err());
        assert!(allowed_fetch("https://u:p@api.deezer.com/", "GET").is_err());
        assert!(allowed_fetch("https://api.deezer.com:8443/", "GET").is_err());
        assert!(allowed_fetch("https://api.deezer.com.evil.org/", "GET").is_err());
        assert_eq!(
            allowed_fetch("https://api.deezer.com/x", "POST")
                .unwrap_err()
                .status,
            405
        );
    }

    #[test]
    fn fill_lookups_reach_the_cover_art_archive_and_discogs() {
        assert!(allowed_fetch("https://coverartarchive.org/release/abc", "GET").is_ok());
        assert!(allowed_fetch("https://api.discogs.com/database/search?q=x", "GET").is_ok());
        let ok = |u: &str| redirect_allowed(&Url::parse(u).unwrap());
        assert!(ok("https://archive.org/download/mbid-abc/index.json"));
        assert!(ok(
            "https://ia800.us.archive.org/1/items/mbid-abc/index.json"
        ));
        assert!(!ok("https://evilarchive.org/x"));
        assert!(!ok("http://archive.org/x"));
        assert!(!ok("https://example.com/"));
    }

    #[test]
    fn model_requests_reach_the_four_providers_only() {
        let t = |u: &str| model_target(u, "POST").map(|(_, p)| p);
        assert_eq!(t("https://api.anthropic.com/v1/messages"), Ok("anthropic"));
        assert_eq!(
            t("https://api.openai.com/v1/chat/completions"),
            Ok("openai")
        );
        assert_eq!(
            t("https://openrouter.ai/api/v1/chat/completions"),
            Ok("openrouter")
        );
        assert_eq!(
            t("https://generativelanguage.googleapis.com/v1beta/models/gemini-4-argon:generateContent"),
            Ok("gemini")
        );
        assert_eq!(
            t("https://api.anthropic.com/v1/files").unwrap_err().status,
            405
        );
        assert_eq!(
            t("https://api.deezer.com/v1/messages").unwrap_err().status,
            403
        );
        assert_eq!(
            t("https://api.anthropic.com.evil.org/v1/messages")
                .unwrap_err()
                .status,
            403
        );
        assert!(t("http://api.anthropic.com/v1/messages").is_err());
        assert!(t("https://api.anthropic.com:444/v1/messages").is_err());
        assert!(t("https://u:p@api.anthropic.com/v1/messages").is_err());
        assert_eq!(
            model_target("https://api.anthropic.com/v1/messages", "GET")
                .unwrap_err()
                .status,
            405
        );
    }

    #[test]
    fn the_key_replaces_the_pages_mark_where_its_provider_reads_it() {
        let page: BTreeMap<String, String> = [
            ("X-Api-Key", "keychain:"),
            ("authorization", "Bearer keychain:"),
            ("x-goog-api-key", "keychain:"),
            ("cookie", "a=b"),
            ("anthropic-version", "2023-06-01"),
            ("anthropic-workspace-id", "wrkspc_1"),
            ("content-type", "application/json"),
        ]
        .into_iter()
        .map(|(k, v)| (k.to_string(), v.to_string()))
        .collect();
        let get = |h: &[(String, String)], k: &str| {
            h.iter()
                .filter(|(n, _)| n == k)
                .map(|(_, v)| v.clone())
                .collect::<Vec<_>>()
        };
        let a = model_headers("anthropic", &page, "sk-ant");
        assert_eq!(get(&a, "x-api-key"), vec!["sk-ant"]);
        assert!(get(&a, "authorization").is_empty() && get(&a, "x-goog-api-key").is_empty());
        assert!(get(&a, "cookie").is_empty());
        assert_eq!(get(&a, "anthropic-workspace-id"), vec!["wrkspc_1"]);
        let o = model_headers("openai", &page, "sk-o");
        assert_eq!(get(&o, "authorization"), vec!["Bearer sk-o"]);
        assert!(get(&o, "x-api-key").is_empty());
        let g = model_headers("gemini", &page, "g-key");
        assert_eq!(get(&g, "x-goog-api-key"), vec!["g-key"]);
        assert!(!g.iter().any(|(_, v)| v.contains("keychain:")));
        assert_eq!(key_name("openrouter"), "ai.openrouter");
    }

    #[test]
    fn spotify_exchange_is_a_public_pkce_client() {
        let v = "v".repeat(43);
        let good = format!(
            "grant_type=authorization_code&client_id=abc&code=AQB&redirect_uri=tdj%3A%2F%2Fspotify-callback&code_verifier={v}"
        );
        assert!(check_exchange_form(&good, "abc").is_ok());
        assert!(check_exchange_form(&good, "other").is_err());
        assert!(check_exchange_form(&format!("{good}&client_secret=s"), "abc").is_err());
        assert!(check_exchange_form(&good.replace(&v, "short"), "abc").is_err());
        assert!(check_exchange_form(
            &good.replace("tdj%3A%2F%2Fspotify-callback", "https%3A%2F%2Fx"),
            "abc"
        )
        .is_err());
        assert_eq!(
            refresh_form("abc", "RT"),
            "grant_type=refresh_token&client_id=abc&refresh_token=RT"
        );
        let t = parse_token(
            &json!({ "access_token": "AT", "refresh_token": "RT2", "expires_in": 3600, "scope": "streaming user-read-email" }),
            1_000,
        )
        .unwrap();
        assert_eq!(t.access.expires, 3_601_000);
        assert_eq!(t.access.scopes, vec!["streaming", "user-read-email"]);
        assert_eq!(t.refresh.as_deref(), Some("RT2"));
        assert!(parse_token(&json!({ "error": "invalid_grant" }), 0).is_err());
    }
}
