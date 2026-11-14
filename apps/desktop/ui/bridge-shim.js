// TDJ app bridge shim — loaded as the first script of every page of the bundled UI (scripts/build-ui.mjs).
// The UI runs from the app bundle (tauri://localhost); every `/api/*` request goes to the DJ's TDJ server through
// the native API bridge (src-tauri/src/bridge.rs, `tdjapi://` scheme), which keeps the server's sealed session
// cookies in the app's own cookie jar. Nothing here stores a key or a token.
(() => {
  if (window.__TDJ_SHIM__) return;
  window.__TDJ_SHIM__ = true;
  const native = window.__TDJ_NATIVE__ || {};
  const invoke = (cmd, args) => window.__TAURI_INTERNALS__.invoke(cmd, args || {});
  // Apple and Linux WebKit: `tdjapi://localhost/…`; Windows/Android WebView2-style: `http://tdjapi.localhost/…`
  const API = native.apiBase || "tdjapi://localhost";
  const SERVER = native.server || "";

  /** `/api/x` (relative or on this origin) → the bridge; anything else untouched. */
  function toBridge(input) {
    try {
      const u = new URL(String(input), location.href);
      if (u.origin === location.origin && u.pathname.startsWith("/api/")) return API + u.pathname + u.search;
    } catch {}
    return null;
  }
  /** media elements cannot use the custom scheme reliably (range requests): send them to the server itself. */
  function toServer(input) {
    try {
      const u = new URL(String(input), location.href);
      if (SERVER && u.origin === location.origin && u.pathname.startsWith("/api/"))
        return SERVER + u.pathname + u.search;
    } catch {}
    return null;
  }
  window.__TDJ_BRIDGE__ = { toBridge, toServer };

  const origFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const raw = input instanceof Request ? input.url : input;
    const target = toBridge(raw);
    if (!target) return origFetch(input, init);
    if (input instanceof Request) return origFetch(new Request(target, input), init);
    return origFetch(target, init);
  };

  if (window.EventSource) {
    const ES = window.EventSource;
    window.EventSource = (url, cfg) => new ES(toBridge(url) || url, cfg);
    window.EventSource.prototype = ES.prototype;
  }

  for (const proto of [HTMLMediaElement.prototype, HTMLSourceElement.prototype]) {
    const desc = Object.getOwnPropertyDescriptor(proto, "src");
    if (!desc?.set) continue;
    Object.defineProperty(proto, "src", {
      ...desc,
      set(v) {
        desc.set.call(this, toServer(v) || v);
      },
    });
  }
  const origSetAttr = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, value) {
    if (name === "src" && (this instanceof HTMLMediaElement || this instanceof HTMLSourceElement)) {
      return origSetAttr.call(this, name, toServer(value) || value);
    }
    return origSetAttr.call(this, name, value);
  };

  // Logins: `<a href="/api/spotify/login">` → the system browser (location.assign(...) is caught natively).
  const LOGIN = /^\/api\/(spotify|google|dropbox)\/login$/;
  document.addEventListener(
    "click",
    (e) => {
      const a = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!a) return;
      const u = new URL(a.getAttribute("href"), location.href);
      const m = u.origin === location.origin && u.pathname.match(LOGIN);
      if (m) {
        e.preventDefault();
        invoke("start_login", {
          provider: m[1],
          scope: u.searchParams.get("scope"),
          next: u.searchParams.get("next"),
        });
        return;
      }
      // downloads (exports): a native save panel instead of WebKit's silent no-op on blob links
      if (a.hasAttribute("download") && /^(blob|data):/.test(u.href)) {
        e.preventDefault();
        const name = a.getAttribute("download") || "TDJ export";
        origFetch(u.href)
          .then((r) => r.arrayBuffer())
          .then((buf) => invoke("save_file", { name, bytes: Array.from(new Uint8Array(buf)) }))
          .catch((err) => console.error("save failed", err));
        return;
      }
      // links to other sites open in the system browser
      if (u.origin !== location.origin && /^https?:$/.test(u.protocol)) {
        e.preventDefault();
        invoke("open_external", { url: u.href });
      }
    },
    true,
  );

  window.print = () => invoke("print_page");

  // Now Playing / media keys: mirror the page's Media Session to the system (macOS Control Center, iPad lock screen).
  if (navigator.mediaSession) {
    const ms = navigator.mediaSession;
    const send = () =>
      invoke("now_playing", {
        info: ms.metadata
          ? {
              title: ms.metadata.title,
              artist: ms.metadata.artist,
              album: ms.metadata.album,
              state: ms.playbackState,
            }
          : null,
      }).catch(() => {});
    const md = Object.getOwnPropertyDescriptor(MediaSession.prototype, "metadata");
    const ps = Object.getOwnPropertyDescriptor(MediaSession.prototype, "playbackState");
    if (md?.set)
      Object.defineProperty(ms, "metadata", {
        get: () => md.get.call(ms),
        set: (v) => {
          md.set.call(ms, v);
          send();
        },
      });
    if (ps?.set)
      Object.defineProperty(ms, "playbackState", {
        get: () => ps.get.call(ms),
        set: (v) => {
          ps.set.call(ms, v);
          send();
          invoke("keep_awake", { on: v === "playing" }).catch(() => {});
        },
      });
  }

  // Menu bar → page: the web's command registry (lib/commands.ts, r22-motion §7.3) listens for `tdj:command`.
  // Until it exists, the shim maps the navigation commands itself.
  const NAV = {
    "go.compose": "/",
    "go.booth": "/booth",
    "go.library": "/library",
    "go.database": "/database",
    "go.history": "/history",
    "go.guide": "/guide",
    "go.settings": "/settings",
  };
  // A menu accelerator consumes its key press before the page sees it, so commands the page already binds to
  // keys (Composer ⌘↩ ⌘E ⌘K, Booth Space → Esc ?) are replayed as the key the page listens for.
  const mac = /Mac/.test(navigator.platform);
  const cmd = (key) => ({ key, metaKey: mac, ctrlKey: !mac });
  const KEYS = {
    "compose.run": cmd("Enter"),
    "export.open": cmd("e"),
    "edit.palette": cmd("k"),
    "booth.toggle": { key: " " },
    "booth.next": { key: "ArrowRight" },
    "booth.stop": { key: "Escape" },
    "help.shortcuts": { key: "?" },
  };
  window.addEventListener("tdj:command", (e) => {
    const id = e.detail?.id;
    setTimeout(() => {
      if (e.defaultPrevented) return; // the page's command registry handled it
      if (NAV[id] && location.pathname !== NAV[id]) location.assign(NAV[id]);
      else if (KEYS[id]) {
        const target =
          document.activeElement && document.activeElement !== document.body
            ? document.activeElement
            : document;
        target.dispatchEvent(new KeyboardEvent("keydown", { ...KEYS[id], bubbles: true, cancelable: true }));
      }
    }, 0);
  });
})();
