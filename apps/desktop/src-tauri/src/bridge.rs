//! The native API bridge of the bundled UI (r22-apps-plan.md §3.1 phase 2, without any server change).
//!
//! The UI ships inside the app (`tauri://localhost`), so a browser `fetch("/api/…")` would be cross-site and
//! WebKit would drop the server's session cookies. Instead the shim (ui/bridge-shim.js) sends `/api/*` to the
//! `tdjapi://` scheme handled here: the request is replayed against the DJ's TDJ server **as a first-party
//! request** (`Origin` = the server, so `guard.ts` accepts it) with the app's own cookie jar. The jar holds only
//! what a browser would hold for that site (the server's sealed, encrypted session cookies), lives in the app's
//! data folder with owner-only permissions, and is never sent anywhere but that server.

use reqwest_cookie_store::CookieStoreMutex;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};
use tauri::http::{self, HeaderMap, HeaderName, HeaderValue};
use url::Url;

/// Request headers the page may set; everything else (Host, Cookie, Origin, Referer, sec-*) is the bridge's job.
const FORWARD: [&str; 5] = [
    "accept",
    "accept-language",
    "content-type",
    "range",
    "if-none-match",
];
/// Plus the app's own per-request headers (BYOK model keys travel exactly as on the web, never stored).
const FORWARD_PREFIXES: [&str; 3] = ["x-ai-", "x-anthropic-", "x-tdj-"];
/// Response headers never handed to the page (cookies stay in the jar; reqwest already decoded the body).
const DROP_RESPONSE: [&str; 5] = [
    "set-cookie",
    "content-encoding",
    "content-length",
    "transfer-encoding",
    "connection",
];

pub fn forward_headers(incoming: &HeaderMap, server: &str) -> HeaderMap {
    let mut out = HeaderMap::new();
    for (k, v) in incoming {
        let name = k.as_str();
        if FORWARD.contains(&name) || FORWARD_PREFIXES.iter().any(|p| name.starts_with(p)) {
            out.append(k.clone(), v.clone());
        }
    }
    if let Ok(v) = HeaderValue::from_str(server) {
        out.insert(http::header::ORIGIN, v);
    }
    if let Ok(v) = HeaderValue::from_str(&format!("{server}/")) {
        out.insert(http::header::REFERER, v);
    }
    out.insert(
        HeaderName::from_static("x-tdj-client"),
        HeaderValue::from_static("app"),
    );
    out
}

pub fn response_headers(upstream: &HeaderMap, page_origin: Option<&HeaderValue>) -> HeaderMap {
    let mut out = HeaderMap::new();
    for (k, v) in upstream {
        if !DROP_RESPONSE.contains(&k.as_str()) {
            out.append(k.clone(), v.clone());
        }
    }
    cors(&mut out, page_origin);
    out
}

fn cors(h: &mut HeaderMap, page_origin: Option<&HeaderValue>) {
    let origin = page_origin
        .cloned()
        .unwrap_or(HeaderValue::from_static("*"));
    h.insert("access-control-allow-origin", origin);
    h.insert(
        "access-control-allow-headers",
        HeaderValue::from_static("*"),
    );
    h.insert(
        "access-control-allow-methods",
        HeaderValue::from_static("GET, POST, PUT, PATCH, DELETE, OPTIONS"),
    );
    h.insert(
        "access-control-expose-headers",
        HeaderValue::from_static("*"),
    );
}

/// `tdjapi://localhost/api/x?y` (or `http://tdjapi.localhost/api/x?y`) → `<server>/api/x?y`. Only `/api/*`.
pub fn target_url(server: &str, request_uri: &str) -> Option<Url> {
    let req = Url::parse(request_uri).ok()?;
    let path = req.path();
    if !path.starts_with("/api/") || path.contains("..") {
        return None;
    }
    let mut url = Url::parse(server).ok()?.join(path).ok()?;
    url.set_query(req.query());
    Some(url)
}

pub struct Bridge {
    server: RwLock<String>,
    jar: Arc<CookieStoreMutex>,
    jar_path: PathBuf,
    client: reqwest::Client,
}

impl Bridge {
    pub fn new(server: String, data_dir: &Path) -> Bridge {
        let jar_path = data_dir.join("cookies.json");
        let store = std::fs::File::open(&jar_path)
            .ok()
            .and_then(|f| cookie_store::serde::json::load(std::io::BufReader::new(f)).ok())
            .unwrap_or_default();
        let jar = Arc::new(CookieStoreMutex::new(store));
        let client = reqwest::Client::builder()
            .cookie_provider(jar.clone())
            .user_agent(concat!("TDJ-App/", env!("CARGO_PKG_VERSION")))
            .redirect(reqwest::redirect::Policy::limited(5))
            .timeout(std::time::Duration::from_secs(75))
            .build()
            .expect("http client");
        Bridge {
            server: RwLock::new(server),
            jar,
            jar_path,
            client,
        }
    }

    pub fn server(&self) -> String {
        self.server.read().unwrap().clone()
    }

    /// A different server means a different site: its cookies never mix with the previous one's.
    pub fn set_server(&self, server: String) {
        let mut cur = self.server.write().unwrap();
        if *cur != server {
            self.jar.lock().unwrap().clear();
            *cur = server;
            self.persist();
        }
    }

    pub fn persist(&self) {
        let Some(dir) = self.jar_path.parent() else {
            return;
        };
        let _ = std::fs::create_dir_all(dir);
        let tmp = self.jar_path.with_extension("tmp");
        if let Ok(mut f) = std::fs::File::create(&tmp) {
            restrict(&tmp);
            if cookie_store::serde::json::save(&self.jar.lock().unwrap(), &mut f).is_ok() {
                let _ = std::fs::rename(&tmp, &self.jar_path);
            }
        }
    }

    /// Cookies a login window received from the server (fallback login, see `auth.rs`) join the jar.
    pub fn import_cookies(&self, cookies: Vec<tauri::webview::Cookie<'static>>) {
        let server = self.server();
        let Ok(url) = Url::parse(&server) else { return };
        {
            let mut jar = self.jar.lock().unwrap();
            for c in cookies {
                let _ = jar.insert_raw(&c, &url);
            }
        }
        self.persist();
    }

    pub fn forget_session(&self) {
        self.jar.lock().unwrap().clear();
        self.persist();
    }

    /// Replays one request from the page. Never panics: failures become JSON errors the UI already shows.
    pub async fn handle(&self, req: http::Request<Vec<u8>>) -> http::Response<Vec<u8>> {
        let page_origin = req.headers().get(http::header::ORIGIN).cloned();
        if req.method() == http::Method::OPTIONS {
            let mut res = http::Response::builder()
                .status(204)
                .body(Vec::new())
                .unwrap();
            cors(res.headers_mut(), page_origin.as_ref());
            return res;
        }
        let server = self.server();
        let Some(url) = target_url(&server, &req.uri().to_string()) else {
            return error(404, "Not an API path.", page_origin.as_ref());
        };
        let method = reqwest::Method::from_bytes(req.method().as_str().as_bytes())
            .unwrap_or(reqwest::Method::GET);
        let headers = forward_headers(req.headers(), &server);
        let mut builder = self.client.request(method, url);
        for (k, v) in &headers {
            builder = builder.header(k.as_str(), v.as_bytes());
        }
        let body = req.into_body();
        if !body.is_empty() {
            builder = builder.body(body);
        }
        match builder.send().await {
            Ok(up) => {
                let status = up.status().as_u16();
                let mut up_headers = HeaderMap::new();
                for (k, v) in up.headers() {
                    if let (Ok(k), Ok(v)) = (
                        HeaderName::from_bytes(k.as_ref()),
                        HeaderValue::from_bytes(v.as_bytes()),
                    ) {
                        up_headers.append(k, v);
                    }
                }
                let had_cookie = up_headers.contains_key(http::header::SET_COOKIE);
                let bytes = up.bytes().await.map(|b| b.to_vec()).unwrap_or_default();
                if had_cookie {
                    self.persist();
                }
                let mut res = http::Response::builder()
                    .status(status)
                    .body(bytes)
                    .unwrap();
                *res.headers_mut() = response_headers(&up_headers, page_origin.as_ref());
                res
            }
            Err(e) => {
                log::warn!("bridge: {e}");
                error(503, "Can't reach your TDJ server. The night you already composed still plays from this device.", page_origin.as_ref())
            }
        }
    }
}

fn error(status: u16, message: &str, page_origin: Option<&HeaderValue>) -> http::Response<Vec<u8>> {
    let body = serde_json::json!({ "error": message, "offline": status == 503 })
        .to_string()
        .into_bytes();
    let mut res = http::Response::builder()
        .status(status)
        .header("content-type", "application/json")
        .header("cache-control", "no-store")
        .body(body)
        .unwrap();
    cors(res.headers_mut(), page_origin);
    res
}

#[cfg(unix)]
fn restrict(p: &Path) {
    use std::os::unix::fs::PermissionsExt;
    let _ = std::fs::set_permissions(p, std::fs::Permissions::from_mode(0o600));
}
#[cfg(not(unix))]
fn restrict(_: &Path) {}

#[cfg(test)]
mod tests {
    use super::*;
    const S: &str = "https://d3k5k2c1l0s5ri.cloudfront.net";

    #[test]
    fn maps_only_api_paths_both_scheme_styles() {
        assert_eq!(
            target_url(S, "tdjapi://localhost/api/compose?h=4")
                .unwrap()
                .as_str(),
            format!("{S}/api/compose?h=4")
        );
        assert_eq!(
            target_url(S, "http://tdjapi.localhost/api/me")
                .unwrap()
                .as_str(),
            format!("{S}/api/me")
        );
        assert!(target_url(S, "tdjapi://localhost/admin").is_none());
        assert!(target_url(S, "tdjapi://localhost/api/../admin").is_none());
        assert!(target_url(S, "tdjapi://localhost/apix").is_none());
    }

    #[test]
    fn forwards_page_headers_but_sets_origin_itself() {
        let mut h = HeaderMap::new();
        h.insert("content-type", HeaderValue::from_static("application/json"));
        h.insert("x-ai-key", HeaderValue::from_static("sk-test"));
        h.insert("cookie", HeaderValue::from_static("tdj_sp=stolen"));
        h.insert("origin", HeaderValue::from_static("tauri://localhost"));
        h.insert("sec-fetch-site", HeaderValue::from_static("cross-site"));
        let out = forward_headers(&h, S);
        assert_eq!(out.get("origin").unwrap(), S);
        assert_eq!(out.get("referer").unwrap(), &format!("{S}/"));
        assert_eq!(out.get("x-ai-key").unwrap(), "sk-test");
        assert_eq!(out.get("x-tdj-client").unwrap(), "app");
        assert!(out.get("cookie").is_none());
        assert!(out.get("sec-fetch-site").is_none());
    }

    #[test]
    fn response_never_exposes_set_cookie_and_allows_the_page() {
        let mut up = HeaderMap::new();
        up.append(
            "set-cookie",
            HeaderValue::from_static("tdj_sp=sealed; HttpOnly"),
        );
        up.append("content-type", HeaderValue::from_static("application/json"));
        up.append("content-encoding", HeaderValue::from_static("gzip"));
        let page = HeaderValue::from_static("tauri://localhost");
        let out = response_headers(&up, Some(&page));
        assert!(out.get("set-cookie").is_none());
        assert!(out.get("content-encoding").is_none());
        assert_eq!(
            out.get("access-control-allow-origin").unwrap(),
            "tauri://localhost"
        );
        assert_eq!(out.get("content-type").unwrap(), "application/json");
    }

    #[test]
    fn switching_server_clears_cookies_and_jar_is_private() {
        let dir = tempfile::tempdir().unwrap();
        let b = Bridge::new(S.into(), dir.path());
        let url = Url::parse(S).unwrap();
        b.jar
            .lock()
            .unwrap()
            .parse("tdj_uid=abc; Max-Age=3600; Path=/", &url)
            .unwrap();
        b.persist();
        let reloaded = Bridge::new(S.into(), dir.path());
        assert_eq!(reloaded.jar.lock().unwrap().iter_unexpired().count(), 1);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(dir.path().join("cookies.json"))
                .unwrap()
                .permissions()
                .mode();
            assert_eq!(mode & 0o077, 0);
        }
        reloaded.set_server("https://my.tdj".into());
        assert_eq!(reloaded.jar.lock().unwrap().iter_unexpired().count(), 0);
    }
}
