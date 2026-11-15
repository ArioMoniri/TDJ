"use client";
import { useEffect } from "react";
import { useStore } from "@/lib/store";
import type { UserSettings } from "@/lib/types";
import { invoke } from "./native";
import { APP, KEYCHAIN_KEY } from "./target";

/** same scheme and host as the page, under /api/ (a custom scheme's `origin` reads "null", so it is not compared) */
export const isApi = (url: string) => {
  try {
    const u = new URL(url, location.href);
    return u.protocol === location.protocol && u.host === location.host && u.pathname.startsWith("/api/");
  } catch {
    return false;
  }
};

// The app's own modules (the adapter with the engine, the provider layer, the sign-ins) load only in the app
// build, as chunks of their own: every web page has this file (components/Boot.tsx) and must not carry them.
// Before any component mounts, /api/* calls already wait for the adapter, which answers them on the device.
if (APP && typeof window !== "undefined") {
  const base = window.fetch.bind(window);
  const adapter = import("./adapter").then((m) => m.installAppAdapter(base));
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) =>
    isApi(input instanceof Request ? input.url : String(input))
      ? adapter.then((a) => a.request(input, init))
      : base(input, init);
  void import("./login");
  // the Mac app starts local ACP agents (Settings → Models → Keys and agents)
  void import("./ai").then((m) => m.registerDeviceAgents()).catch(() => {});
  // the animation player's WebAssembly ships in the app (apps/desktop/scripts/build-ui.mjs), not from a CDN
  void import("@lottiefiles/dotlottie-react").then((m) => m.setWasmUrl("/dotlottie-player.wasm"));
}

const mark = (key: string | undefined) => (key ? KEYCHAIN_KEY : "");
/** settings as the device database keeps them: never a key (that is the Keychain's), for any provider */
const storable = (s: UserSettings): UserSettings => ({
  ...s,
  ai: { ...s.ai, key: mark(s.ai.key) },
  ...(s.aiKeys
    ? {
        aiKeys: Object.fromEntries(
          Object.entries(s.aiKeys).map(([p, k]) => [p, k ? { ...k, key: mark(k.key) } : k]),
        ) as UserSettings["aiKeys"],
      }
    : {}),
});

/** A key typed in Settings goes to the Keychain; the page keeps only the mark that one is saved. */
export async function saveAiKey(provider: string, value: string): Promise<void> {
  const name = `ai.${provider}`;
  if (value) await invoke("secret_set", { name, value });
  else await invoke("secret_delete", { name });
}

/**
 * The apps' settings live in the on-device database too (lib/app/store.ts → settings): restored when the web view's
 * own storage was cleared, written back on every change. A key from an older build that sat in the page's storage
 * moves to the Keychain on first launch.
 */
export function useAppBoot(): void {
  useEffect(() => {
    if (!APP) return;
    const hadLocal = (() => {
      try {
        return !!localStorage.getItem("tdj-v1");
      } catch {
        return false;
      }
    })();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let unsub: (() => void) | null = null;
    void (async () => {
      // keys from an older build (or typed before the Keychain answered) move to the Keychain, per provider
      const st = useStore.getState();
      const { ai, aiKeys } = st.settings;
      const loose: Array<[string, string]> = [];
      if (ai.provider !== "acp" && ai.key && ai.key !== KEYCHAIN_KEY) loose.push([ai.provider, ai.key]);
      for (const [p, k] of Object.entries(aiKeys ?? {}))
        if (k?.key && k.key !== KEYCHAIN_KEY && !loose.some(([q]) => q === p)) loose.push([p, k.key]);
      if (loose.length) {
        try {
          for (const [p, k] of loose) await saveAiKey(p, k);
          const marked = storable(useStore.getState().settings);
          st.setSettings({ ai: marked.ai, aiKeys: marked.aiKeys });
        } catch {}
      }
      if (!hadLocal) {
        const r = await fetch("/api/app/settings").catch(() => null);
        const saved = r?.ok ? ((await r.json()) as { settings?: UserSettings | null }).settings : null;
        if (saved) useStore.getState().setSettings(saved);
      }
      let last = JSON.stringify(storable(useStore.getState().settings));
      unsub = useStore.subscribe((s) => {
        const next = JSON.stringify(storable(s.settings));
        if (next === last) return;
        last = next;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          void fetch("/api/app/settings", {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: next,
          }).catch(() => {});
        }, 400);
      });
    })();
    return () => {
      unsub?.();
      if (timer) clearTimeout(timer);
    };
  }, []);
}
