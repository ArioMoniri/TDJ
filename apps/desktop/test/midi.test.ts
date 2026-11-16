import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 2026-11 (docs/design/controller.md): DJ controllers over CoreMIDI in the Mac / iPad / iPhone app — the commands are
 * wired end to end (manifest, capability, handler), `midir` is an Apple-only dependency, the page's event name and
 * port shape match apps/web/src/lib/controller/access.ts, and the app never sends SysEx.
 */
const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const COMMANDS = ["midi_ports", "midi_open", "midi_close", "midi_send"];

describe("native MIDI (src-tauri/src/midi/)", () => {
  it("every MIDI command is in the manifest, the capability and the invoke handler", () => {
    const build = read("../src-tauri/build.rs");
    const cap = JSON.parse(read("../src-tauri/capabilities/default.json")) as { permissions: string[] };
    const lib = read("../src-tauri/src/lib.rs");
    for (const c of COMMANDS) {
      expect(build, c).toContain(`"${c}"`);
      expect(cap.permissions, c).toContain(`allow-${c.replaceAll("_", "-")}`);
      expect(lib, c).toContain(`midi::${c}`);
    }
    expect(lib).toContain("midi::install(app.handle())");
  });

  it("midir is an Apple-only dependency (CoreMIDI on macOS and iOS)", () => {
    const toml = read("../src-tauri/Cargo.toml");
    const apple = toml.indexOf(`[target.'cfg(any(target_os = "macos", target_os = "ios"))'.dependencies]`);
    const next = toml.indexOf("[target.", apple + 10);
    const dep = toml.indexOf('midir = "0.10"');
    expect(apple).toBeGreaterThan(-1);
    expect(dep).toBeGreaterThan(apple);
    expect(dep).toBeLessThan(next);
  });

  it("the page and the app agree on the event and the port", () => {
    const rs = ["mod.rs", "wire.rs", "coremidi.rs"].map((f) => read(`../src-tauri/src/midi/${f}`)).join("\n");
    const ts = read("../../web/src/lib/controller/access.ts");
    expect(rs).toContain("CustomEvent('tdj:midi'");
    expect(ts).toContain('NATIVE_MIDI_EVENT = "tdj:midi"');
    for (const f of ["id: String", "name: String", "dir: &'static str"]) expect(rs).toContain(f);
    for (const c of COMMANDS) expect(ts).toContain(`"${c}"`);
    // input never takes clock / SysEx; output is channel messages only
    expect(rs).toContain("Ignore::All");
    expect(rs).toMatch(/fn valid_message/);
  });
});
