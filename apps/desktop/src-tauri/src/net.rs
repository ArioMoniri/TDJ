//! The app's own HTTP, so the standalone UI needs no TDJ server:
//! - `net_fetch`: keyless lookups the page cannot make itself (api.deezer.com sends no CORS headers): Deezer previews
//!   (re-signed per request, as apps/web/src/lib/api/net.ts does on the server) and MusicBrainz. Fixed hosts only.
//! - `ai_complete`: one model completion with the DJ's own key from the Keychain, straight to the provider. There is
//!   no shared key in the app.
//! - Spotify (Authorization Code + PKCE, no client secret): the code exchange and refresh, tokens in the Keychain.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
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
}
#[derive(Debug, Serialize)]
pub struct WireResponse {
    pub status: u16,
    pub headers: BTreeMap<String, String>,
    pub body: String,
}

/// Hosts the page may reach through the app: Deezer's API and MusicBrainz. Everything else is refused.
pub const FETCH_HOSTS: [&str; 2] = ["api.deezer.com", "musicbrainz.org"];

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

// ---------------------------------------------------------------- ai_complete

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiArgs {
    pub provider: String,
    #[serde(default)]
    pub model: String,
    #[serde(default)]
    pub workspace: Option<String>,
    pub system: String,
    pub user: String,
    #[serde(default)]
    pub json: Option<bool>,
    #[serde(default)]
    pub max_tokens: Option<u32>,
}

/// The same defaults as the web (apps/web/src/lib/api/llm.ts → DEFAULT_MODEL).
pub fn default_model(provider: &str) -> &'static str {
    match provider {
        "openai" => "gpt-5.2",
        "gemini" => "gemini-4-argon",
        "openrouter" => "openrouter/auto",
        _ => "claude-sonnet-5-5",
    }
}
const MIN_OUTPUT_TOKENS: u32 = 4000;
pub const MODEL_TIMEOUT: Duration = Duration::from_secs(25);

pub struct ProviderRequest {
    pub url: String,
    pub headers: Vec<(&'static str, String)>,
    pub body: Value,
}

/// The provider request, as lib/server/llm.ts → `complete` builds it (keys in headers, never in the URL).
pub fn provider_request(a: &AiArgs, key: &str) -> Result<ProviderRequest, NetError> {
    let model = if a.model.trim().is_empty() {
        default_model(&a.provider).to_string()
    } else {
        a.model.trim().to_string()
    };
    let max = a.max_tokens.unwrap_or(1200);
    let json_mode = a.json.unwrap_or(false);
    match a.provider.as_str() {
        "anthropic" => {
            let mut headers = vec![
                ("x-api-key", key.to_string()),
                ("anthropic-version", "2023-06-01".to_string()),
                (
                    "anthropic-beta",
                    "server-side-fallback-2026-07-01".to_string(),
                ),
            ];
            if let Some(w) = a
                .workspace
                .as_deref()
                .map(str::trim)
                .filter(|w| !w.is_empty())
            {
                headers.push(("anthropic-workspace-id", w.to_string()));
            }
            let system = if json_mode {
                format!(
                    "{}\nRespond with a single JSON object and nothing else.",
                    a.system
                )
            } else {
                a.system.clone()
            };
            Ok(ProviderRequest {
                url: "https://api.anthropic.com/v1/messages".into(),
                headers,
                body: json!({
                    "model": model,
                    "max_tokens": max.max(16000),
                    "output_config": { "effort": "low" },
                    "fallbacks": "default",
                    "system": system,
                    "messages": [{ "role": "user", "content": a.user }],
                }),
            })
        }
        "openai" | "openrouter" => {
            let openai = a.provider == "openai";
            let mut body = json!({
                "model": model,
                "messages": [
                    { "role": "system", "content": a.system },
                    { "role": "user", "content": a.user },
                ],
            });
            if openai {
                body["max_completion_tokens"] = json!(max.max(MIN_OUTPUT_TOKENS));
            } else {
                body["max_tokens"] = json!(max);
            }
            if json_mode {
                body["response_format"] = json!({ "type": "json_object" });
            }
            let mut headers = vec![("authorization", format!("Bearer {key}"))];
            if !openai {
                headers.push(("x-title", "TDJ".into()));
            }
            Ok(ProviderRequest {
                url: if openai {
                    "https://api.openai.com/v1/chat/completions".into()
                } else {
                    "https://openrouter.ai/api/v1/chat/completions".into()
                },
                headers,
                body,
            })
        }
        "gemini" => {
            let mut config = json!({ "maxOutputTokens": max.max(MIN_OUTPUT_TOKENS) });
            if json_mode {
                config["responseMimeType"] = json!("application/json");
            }
            let mut url =
                Url::parse("https://generativelanguage.googleapis.com/v1beta/models/").unwrap();
            url.path_segments_mut()
                .map_err(|_| NetError::new("Unknown model.", 400))?
                .pop_if_empty()
                .push(&format!("{model}:generateContent"));
            Ok(ProviderRequest {
                url: url.into(),
                headers: vec![("x-goog-api-key", key.to_string())],
                body: json!({
                    "systemInstruction": { "parts": [{ "text": a.system }] },
                    "contents": [{ "role": "user", "parts": [{ "text": a.user }] }],
                    "generationConfig": config,
                }),
            })
        }
        _ => Err(NetError::new("Unknown provider.", 400)),
    }
}

/// The assistant text out of a provider answer, or the provider's own message with its status.
pub fn provider_text(provider: &str, status: u16, j: &Value) -> Result<String, NetError> {
    let msg = j
        .pointer("/error/message")
        .and_then(Value::as_str)
        .map(|m| m.chars().take(300).collect::<String>());
    if !(200..300).contains(&status) {
        let kind = j.pointer("/error/type").and_then(Value::as_str);
        let m = msg.unwrap_or_else(|| format!("{provider} returned {status}"));
        let m = if kind == Some("not_found_error") {
            format!("Unknown model: {m}")
        } else {
            m
        };
        return Err(NetError::new(m, status));
    }
    match provider {
        "anthropic" => {
            let stop = j.get("stop_reason").and_then(Value::as_str);
            if stop == Some("refusal") {
                let why = j
                    .pointer("/stop_details/explanation")
                    .and_then(Value::as_str)
                    .map(|e| format!(": {e}"))
                    .unwrap_or_else(|| ".".into());
                return Err(NetError::new(
                    format!("The model declined this request{why}"),
                    422,
                ));
            }
            let text = j
                .get("content")
                .and_then(Value::as_array)
                .map(|parts| {
                    parts
                        .iter()
                        .filter(|p| p.get("type").and_then(Value::as_str) == Some("text"))
                        .filter_map(|p| p.get("text").and_then(Value::as_str))
                        .collect::<Vec<_>>()
                        .join("\n")
                })
                .unwrap_or_default();
            if text.is_empty() && stop == Some("max_tokens") {
                return Err(NetError::new(
                    "The model ran out of room before answering. Try again or pick a smaller model.",
                    502,
                ));
            }
            Ok(text)
        }
        "gemini" => Ok(j
            .pointer("/candidates/0/content/parts")
            .and_then(Value::as_array)
            .map(|p| {
                p.iter()
                    .filter_map(|x| x.get("text").and_then(Value::as_str))
                    .collect::<String>()
            })
            .unwrap_or_default()),
        _ => Ok(j
            .pointer("/choices/0/message/content")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string()),
    }
}

pub async fn complete(
    client: &reqwest::Client,
    a: &AiArgs,
    key: Option<String>,
) -> Result<String, NetError> {
    let Some(key) = key.filter(|k| !k.is_empty()) else {
        return Err(NetError::new(
            "No API key for this provider. Add one in Settings → Written reviews.",
            401,
        ));
    };
    let p = provider_request(a, &key)?;
    let mut b = client
        .post(&p.url)
        .timeout(MODEL_TIMEOUT)
        .header("content-type", "application/json")
        .header("user-agent", UA);
    for (k, v) in &p.headers {
        b = b.header(*k, v);
    }
    let r = b
        .body(serde_json::to_vec(&p.body).unwrap_or_default())
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
    let j: Value = serde_json::from_str(&r.text().await.unwrap_or_default()).unwrap_or(Value::Null);
    provider_text(&a.provider, status, &j)
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

    fn args(provider: &str) -> AiArgs {
        AiArgs {
            provider: provider.into(),
            model: String::new(),
            workspace: Some("wrkspc_1".into()),
            system: "sys".into(),
            user: "hi".into(),
            json: Some(true),
            max_tokens: Some(200),
        }
    }

    #[test]
    fn provider_requests_carry_the_key_in_a_header_only() {
        let a = provider_request(&args("anthropic"), "sk-ant").unwrap();
        assert_eq!(a.url, "https://api.anthropic.com/v1/messages");
        assert!(a.headers.contains(&("x-api-key", "sk-ant".into())));
        assert!(a
            .headers
            .contains(&("anthropic-workspace-id", "wrkspc_1".into())));
        assert_eq!(a.body["model"], "claude-sonnet-5-5");
        assert_eq!(a.body["max_tokens"], 16000);
        assert!(a.body["system"]
            .as_str()
            .unwrap()
            .ends_with("nothing else."));
        let o = provider_request(&args("openai"), "sk-o").unwrap();
        assert_eq!(o.body["max_completion_tokens"], 4000);
        assert_eq!(o.body["response_format"]["type"], "json_object");
        let g = provider_request(&args("gemini"), "g-key").unwrap();
        assert_eq!(
            g.url,
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-4-argon:generateContent"
        );
        assert!(!g.url.contains("g-key"));
        assert!(provider_request(&args("other"), "k").is_err());
    }

    #[test]
    fn provider_answers_and_errors() {
        let ok = json!({ "content": [{ "type": "thinking" }, { "type": "text", "text": "OK" }], "stop_reason": "end_turn" });
        assert_eq!(provider_text("anthropic", 200, &ok).unwrap(), "OK");
        let refused = json!({ "content": [], "stop_reason": "refusal" });
        assert_eq!(
            provider_text("anthropic", 200, &refused)
                .unwrap_err()
                .status,
            422
        );
        let missing = json!({ "error": { "type": "not_found_error", "message": "model: x" } });
        assert_eq!(
            provider_text("anthropic", 404, &missing)
                .unwrap_err()
                .message,
            "Unknown model: model: x"
        );
        let chat = json!({ "choices": [{ "message": { "content": "{\"a\":1}" } }] });
        assert_eq!(provider_text("openai", 200, &chat).unwrap(), "{\"a\":1}");
        let gem = json!({ "candidates": [{ "content": { "parts": [{ "text": "a" }, { "text": "b" }] } }] });
        assert_eq!(provider_text("gemini", 200, &gem).unwrap(), "ab");
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
