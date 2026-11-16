// TDJ app bridge shim — loaded as the first script of every page of the bundled UI (scripts/build-ui.mjs).
// The UI runs from the app bundle (tauri://localhost) and is standalone: every `/api/*` request is answered on the
// device by the page's own adapter (apps/web/src/lib/app/adapter.ts, built with TDJ_TARGET=app). This shim only
// connects the page to the native shell: logins in the system browser, native save and print, Now Playing and the
// menu bar. Nothing here stores a key or a token.
(() => {
  if (window.__TDJ_SHIM__) return;
  window.__TDJ_SHIM__ = true;
  const invoke = (cmd, args) => window.__TAURI_INTERNALS__.invoke(cmd, args || {});
  const origFetch = window.fetch.bind(window);
  // a custom scheme's `origin` reads "null": compare scheme and host instead
  const same = (u) => u.protocol === location.protocol && u.host === location.host;

  // Logins: `<a href="/api/spotify/login">` → the system browser (location.assign(...) is caught natively).
  const LOGIN = /^\/api\/(spotify|google|dropbox)\/login$/;
  document.addEventListener(
    "click",
    (e) => {
      const a = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!a) return;
      const u = new URL(a.getAttribute("href"), location.href);
      const m = same(u) && u.pathname.match(LOGIN);
      if (m) {
        e.preventDefault();
        const next = u.searchParams.get("next") || "/settings";
        // Spotify: PKCE from the device; Google and Dropbox: through a linked TDJ server (lib/app/login.ts)
        if (window.__TDJ_APP__) window.__TDJ_APP__.login(m[1], next);
        else invoke("start_login", { provider: m[1], scope: u.searchParams.get("scope"), next });
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
      // links to other sites open in the system browser (or the service's app); music apps' schemes too
      if (!same(u) && (/^https?:$/.test(u.protocol) || OUT.test(u.protocol))) {
        e.preventDefault();
        invoke("open_external", { url: u.href }).catch(() => {});
      }
    },
    true,
  );

  // window.open(url) of another site (an export's "Open in YouTube", a transfer service's import page): the web
  // view opens no second window, so it goes out like a link. `window.open("")` followed by `tab.location = url`
  // (a sign-in page known only later) gets a stand-in whose location sends the URL out the same way.
  const OUT = /^(spotify|music|musics|youtube|youtubemusic|mailto):$/;
  const origOpen = window.open ? window.open.bind(window) : null;
  const goOut = (href) => {
    try {
      const u = new URL(String(href), location.href);
      if (!same(u) && (u.protocol === "https:" || OUT.test(u.protocol))) {
        invoke("open_external", { url: u.href }).catch(() => {});
        return true;
      }
    } catch {}
    return false;
  };
  window.open = (url, target, features) => {
    if (url === undefined || url === null || url === "" || url === "about:blank") {
      const loc = {};
      Object.defineProperty(loc, "href", { set: goOut, get: () => "about:blank" });
      return { location: loc, close() {}, closed: false, focus() {} };
    }
    if (goOut(url)) return null;
    return origOpen ? origOpen(url, target, features) : null;
  };

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
          // a paused / held night (a break, an interruption) keeps the screen on too (lib/booth/nativeAudio.ts)
          invoke("keep_awake", { on: v === "playing" || !!window.__TDJ_NIGHT_RUNS__ }).catch(() => {});
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
