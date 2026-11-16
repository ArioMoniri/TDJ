import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

/** The bridge shim run against a minimal window: what leaves the app, and how. */
function load() {
  const calls: Array<{ cmd: string; args: Record<string, unknown> }> = [];
  const listeners: Record<string, Array<(e: unknown) => void>> = {};
  const opened: string[] = [];
  const window: Record<string, unknown> = {
    __TAURI_INTERNALS__: {
      invoke: (cmd: string, args: Record<string, unknown>) => {
        calls.push({ cmd, args });
        return Promise.resolve(null);
      },
    },
    fetch: () => Promise.resolve(),
    open: (u: string) => {
      opened.push(u);
      return null;
    },
    addEventListener: () => {},
  };
  const document = {
    addEventListener: (ev: string, f: (e: unknown) => void) => {
      listeners[ev] = [...(listeners[ev] ?? []), f];
    },
  };
  const location = new URL("tauri://localhost/booth");
  runInNewContext(readFileSync(new URL("../ui/bridge-shim.js", import.meta.url), "utf8"), {
    window,
    document,
    location,
    navigator: { platform: "MacIntel" },
    URL,
    Element: class {},
    KeyboardEvent: class {},
    setTimeout,
    console,
  });
  return { window: window as { open: (u?: string) => unknown }, calls, opened };
}

describe("bridge shim: links that leave the app", () => {
  it("window.open of another site goes to the native opener, never a second web view", () => {
    const s = load();
    expect(s.window.open("https://www.youtube.com/playlist?list=PL1")).toBeNull();
    expect(s.window.open("spotify:")).toBeNull();
    expect(s.calls.map((c) => c.args.url)).toEqual(["https://www.youtube.com/playlist?list=PL1", "spotify:"]);
    expect(s.opened).toEqual([]);
  });

  it("window.open('') then tab.location.href = url (a sign-in page known later) still goes out", () => {
    const s = load();
    const tab = s.window.open("") as { location: { href: string } };
    tab.location.href = "https://pipedream.com/_static/connect.html?token=x";
    expect(s.calls).toEqual([
      { cmd: "open_external", args: { url: "https://pipedream.com/_static/connect.html?token=x" } },
    ]);
  });

  it("the app's own pages and javascript: links never go to the opener", () => {
    const s = load();
    s.window.open("javascript:alert(1)");
    s.window.open("/settings");
    expect(s.calls).toEqual([]);
    expect(s.opened).toEqual(["javascript:alert(1)", "/settings"]);
  });
});
