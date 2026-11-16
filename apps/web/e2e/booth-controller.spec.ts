/**
 * 2026-11 (docs/design/controller.md; the owner: "the connected controller's settings should be inherited and shown
 * digitally, or there should be a digital controller"). A DJ controller over Web MIDI — faked here: a
 * `navigator.requestMIDIAccess` whose DDJ-400 input the test plays (`window.__midi([...])`) and whose output records
 * what T-DJ sends back (`window.__midiSent`, the LEDs) — and the on-screen controller.
 * - Controls → Controller: the port (name, maker, in + out), its mapping, the live mirror of a fader;
 * - the DDJ's PLAY starts the night, its LED follows; mid-night NEXT's PLAY, the jog seek, the crossfader and Stop
 *   each ask for a second press (BROWSE confirms), and nothing changes the room before it;
 * - MIDI Learn binds a pad; import refuses a file that is not a mapping;
 * - the controller is also the sound card: T-DJ offers the room on ch 1–2, the headphones on ch 3–4;
 * - no Web MIDI (Safari): the reason, and the on-screen controller still drives the night.
 * Screenshots go to $OUTPUT_SHOTS when it is set.
 */
import { expect, type Page, test } from "@playwright/test";

const SHOTS = process.env.OUTPUT_SHOTS;

function wav(sec = 30): Buffer {
  const rate = 22050;
  const n = rate * sec;
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++)
    data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 220 * i) / rate) * 0.3 * 32767), i * 2);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}
const WAV = wav();

/** A fake Web MIDI with a DDJ-400 (in + out); `midi: false` removes Web MIDI (Safari) */
async function fakeMidi(page: Page, o: { midi?: boolean; name?: string } = {}) {
  await page.addInitScript(
    ({ midi, name }) => {
      const w = window as unknown as {
        __midi: (d: number[]) => void;
        __midiSent: number[][];
        __plugMidi: (n: string) => void;
      };
      w.__midiSent = [];
      if (!midi) {
        // (Safari: there is no requestMIDIAccess at all)
        delete (Navigator.prototype as unknown as { requestMIDIAccess?: unknown }).requestMIDIAccess;
        return;
      }
      const input: Record<string, unknown> = {
        id: "in-1",
        name,
        manufacturer: "Pioneer DJ",
        state: "connected",
        type: "input",
        onmidimessage: null,
      };
      const output = {
        id: "out-1",
        name,
        manufacturer: "Pioneer DJ",
        state: "connected",
        type: "output",
        send: (d: number[]) => w.__midiSent.push(Array.from(d)),
      };
      const inputs = new Map<string, unknown>([["in-1", input]]);
      const outputs = new Map<string, unknown>([["out-1", output]]);
      const access: Record<string, unknown> = { inputs, outputs, onstatechange: null, sysexEnabled: false };
      Object.defineProperty(Navigator.prototype, "requestMIDIAccess", {
        configurable: true,
        value: () => Promise.resolve(access),
      });
      w.__midi = (d: number[]) => {
        const cb = input.onmidimessage as ((e: { data: Uint8Array }) => void) | null;
        cb?.({ data: new Uint8Array(d) });
      };
      w.__plugMidi = (n: string) => {
        inputs.set("in-2", {
          id: "in-2",
          name: n,
          manufacturer: "",
          state: "connected",
          onmidimessage: null,
        });
        (access.onstatechange as (() => void) | null)?.();
      };
    },
    { midi: o.midi !== false, name: o.name ?? "DDJ-400" },
  );
}

/** the DDJ is also a 4-channel sound card; the laptop's speakers are the system default */
async function fakeDesk(page: Page) {
  await page.addInitScript(() => {
    const devs = [
      { kind: "audiooutput", deviceId: "default", label: "Default - MacBook Pro Speakers", groupId: "g-mac" },
      { kind: "audiooutput", deviceId: "mac", label: "MacBook Pro Speakers", groupId: "g-mac" },
      { kind: "audiooutput", deviceId: "ddj", label: "DDJ-400", groupId: "g-ddj" },
    ];
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices: () => Promise.resolve(devs.map((d) => ({ ...d, toJSON: () => d }))),
        getUserMedia: () => Promise.reject(new Error("no")),
        addEventListener() {},
        removeEventListener() {},
      },
    });
    for (const proto of [HTMLMediaElement.prototype, AudioContext.prototype])
      Object.defineProperty(proto, "setSinkId", { configurable: true, value: () => Promise.resolve() });
  });
}

async function routes(page: Page) {
  await page.route(/dzcdn\.net|p\.scdn\.co|preview\.test|\/api\/preview\?/, (route) =>
    route.request().url().includes("json=1")
      ? route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ url: "https://preview.test/clip.wav" }),
        })
      : route.fulfill({
          status: 200,
          contentType: "audio/wav",
          body: WAV,
          headers: { "access-control-allow-origin": "*" },
        }),
  );
  await page.route(/open\.spotify\.com\/oembed/, (r) => r.fulfill({ status: 404, body: "" }));
}

async function openBooth(page: Page) {
  await routes(page);
  await page.goto("/?featured=golden-double-peak");
  await expect(page.locator("#result")).toBeVisible({ timeout: 90000 });
  await page.getByTestId("play-the-night").first().click();
  await expect(page).toHaveURL(/\/booth/, { timeout: 60000 });
  await expect(page.getByTestId("booth-now-title")).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId("booth-ttc")).not.toHaveAttribute("data-resolving", "1", { timeout: 30000 });
}

async function openController(page: Page) {
  const panel = page.getByTestId("booth-controls");
  if (!(await panel.isVisible())) await page.getByTestId("booth-controls-toggle").click();
  await panel.getByTestId("ctl-controller").click();
  const sheet = page.getByTestId("controller-sheet");
  await expect(sheet).toBeVisible();
  return sheet;
}

const midi = (page: Page, d: number[]) =>
  page.evaluate((x) => (window as unknown as { __midi: (d: number[]) => void }).__midi(x), d);
const booth = (page: Page) =>
  page.evaluate(() => {
    const s = (
      window as unknown as {
        __tdjBooth: {
          getState: () => {
            state: string;
            planIndex: number;
            position: number;
            ducked: boolean;
            outputs: { room: string; cue: string | null };
          };
        };
      }
    ).__tdjBooth.getState();
    return {
      state: s.state,
      planIndex: s.planIndex,
      position: s.position,
      ducked: s.ducked,
      room: s.outputs.room,
      cue: s.outputs.cue,
    };
  });

test("a DDJ-400 over Web MIDI: port, mapping, mirror, LEDs, and every room action asks twice mid-night", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 1000 });
  await fakeMidi(page);
  await fakeDesk(page);
  await openBooth(page);
  const sheet = await openController(page);
  await expect(sheet.getByTestId("controller-status")).toHaveAttribute("data-status", "off");
  await sheet.getByTestId("controller-connect").click();
  await expect(sheet.getByTestId("controller-status")).toHaveAttribute("data-status", "on");
  const port = sheet.getByTestId("controller-port");
  await expect(port).toHaveAttribute("data-name", "DDJ-400");
  await expect(port).toContainText("Pioneer DJ");
  await expect(port).toContainText("out");
  await expect(sheet.getByTestId("controller-mapping")).toHaveAttribute("data-id", "ddj-400");

  // the controller is the sound card too: the room on its ch 1–2, the headphones on ch 3–4 (before the night: at once)
  const offer = sheet.getByTestId("controller-audio-offer");
  await expect(offer).toContainText("DDJ-400");
  await expect(offer).toContainText("ch 3–4");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/controller-connected.png` });
  await offer.getByTestId("controller-audio-use").click();
  await expect(offer).toHaveCount(0);
  await expect.poll(async () => (await booth(page)).room).toBe("ddj");
  await expect.poll(async () => (await booth(page)).cue).toBe("tdj:room-pair");

  // the mirror: deck 2's channel fader (14-bit) and the tempo fader, which says why it is not used
  await midi(page, [0xb1, 0x13, 0x60]);
  await midi(page, [0xb1, 0x33, 0x00]);
  await expect(sheet.getByTestId("vc-B-level").locator("input")).toHaveValue(/^0\.7/);
  await midi(page, [0xb0, 0x00, 0x10]);
  await expect(sheet.getByTestId("vc-A-tempo")).toContainText("original tempo");
  await expect(sheet.getByTestId("vc-monitor")).toContainText("CC 0 · ch 1");

  // deck 1 PLAY starts the night; its LED lights
  await midi(page, [0x90, 0x0b, 0x7f]);
  await midi(page, [0x90, 0x0b, 0x00]);
  await expect(page.getByTestId("booth")).toHaveAttribute("data-state", "playing", { timeout: 20000 });
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __midiSent: number[][] }).__midiSent))
    .toContainEqual([0x90, 0x0b, 0x7f]);
  await expect(sheet.getByTestId("vc-A-play")).toHaveAttribute("data-lit", "true");
  await page.waitForTimeout(1200);

  // NEXT's PLAY mid-night: the first press only asks
  const at = (await booth(page)).planIndex;
  await midi(page, [0x91, 0x0b, 0x7f]);
  await expect(page.getByText("Press again to confirm: Next now").first()).toBeVisible();
  await page.waitForTimeout(400);
  expect((await booth(page)).planIndex).toBe(at);
  // (the crossfader: seen on A, moved across arms, back cancels — the room untouched)
  await midi(page, [0xb6, 0x1f, 0x00]);
  await midi(page, [0xb6, 0x1f, 0x7f]);
  await expect(sheet.getByTestId("vc-xf-state")).toContainText("Crossfade armed");
  await midi(page, [0xb6, 0x1f, 0x00]);
  await expect(sheet.getByTestId("vc-did")).toContainText("Crossfade cancelled");
  expect((await booth(page)).planIndex).toBe(at);

  // the jog: the target waits for BROWSE while the song plays on
  const before = (await booth(page)).position;
  for (let k = 0; k < 10; k++) await midi(page, [0xb0, 0x22, 0x40 + 30]);
  await expect(sheet.getByTestId("vc-seek-pending")).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/controller-seek-pending.png` });
  expect((await booth(page)).position).toBeLessThan(before + 4);
  await midi(page, [0x96, 0x41, 0x7f]);
  await expect.poll(async () => (await booth(page)).position, { timeout: 5000 }).toBeGreaterThan(before + 6);

  // a pad: Talk (deck 1, pad 1 in HOT CUE mode) — its LED follows
  await midi(page, [0x97, 0x00, 0x7f]);
  await expect.poll(async () => (await booth(page)).ducked).toBe(true);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __midiSent: number[][] }).__midiSent))
    .toContainEqual([0x97, 0x00, 0x7f]);
  await midi(page, [0x97, 0x00, 0x7f]);
  await expect.poll(async () => (await booth(page)).ducked).toBe(false);

  // Stop (deck 2, pad 3) always asks twice
  await midi(page, [0x99, 0x02, 0x7f]);
  await page.waitForTimeout(300);
  expect((await booth(page)).state).not.toBe("stopped");
  await midi(page, [0x99, 0x02, 0x7f]);
  await expect(page.getByTestId("booth")).toHaveAttribute("data-state", "stopped", { timeout: 10000 });
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __midiSent: number[][] }).__midiSent.at(-1)))
    .toBeTruthy();
});

test("MIDI Learn: tap a function, press a control — bound, saved, and a bad import is refused", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 1000 });
  await fakeMidi(page, { name: "Arturia BeatStep" });
  await openBooth(page);
  const sheet = await openController(page);
  await sheet.getByTestId("controller-connect").click();
  await expect(sheet.getByTestId("controller-mapping")).toHaveAttribute("data-id", "generic-2deck");
  await sheet.getByTestId("controller-learn").locator("summary").click();
  const row = sheet.locator('[data-testid="controller-learn-row"][data-fn="talk"]');
  await row.getByTestId("controller-learn-btn").click();
  await expect(sheet.getByTestId("controller-learn-waiting")).toContainText("Arturia BeatStep");
  // a note-off is not a choice; the press is
  await midi(page, [0x84, 60, 0]);
  await midi(page, [0x94, 60, 100]);
  await expect(page.getByText("Talk is bound").first()).toBeVisible();
  await expect(row.getByTestId("controller-learn-keys")).toContainText("Note 60 · ch 5");
  await expect(sheet.getByTestId("controller-mapping")).toHaveAttribute("data-id", "generic-2deck-custom");
  if (SHOTS) {
    await row.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/controller-learn.png` });
  }
  // it drives the Booth now
  await midi(page, [0x94, 60, 100]);
  await expect.poll(async () => (await booth(page)).ducked).toBe(true);
  // saved on this device, per controller
  const saved = await page.evaluate(() => localStorage.getItem("tdj-controller-maps") ?? "");
  expect(saved).toContain("Arturia BeatStep");
  expect(saved).toContain("note:4:60");
  // a file that is not a mapping
  await sheet.getByTestId("controller-import-file").setInputFiles({
    name: "x.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"hello":1}'),
  });
  await expect(page.getByText("That file is not a T-DJ controller mapping").first()).toBeVisible();
  // back to the built-in mapping
  await sheet.getByTestId("controller-reset").click();
  await expect(sheet.getByTestId("controller-mapping")).toHaveAttribute("data-id", "generic-2deck");
});

test("no Web MIDI (Safari, iPad browsers): the reason, and the on-screen controller still drives the night", async ({
  page,
}) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await fakeMidi(page, { midi: false });
  await openBooth(page);
  const sheet = await openController(page);
  await expect(sheet.getByTestId("controller-status")).toContainText("no Web MIDI");
  await expect(sheet.getByTestId("controller-connect")).toHaveCount(0);
  // tempo is shown, never used
  await expect(sheet.getByTestId("vc-A-tempo").locator("input")).toBeDisabled();
  // the on-screen PLAY starts the night
  await sheet.getByTestId("vc-A-play").click();
  await expect(page.getByTestId("booth")).toHaveAttribute("data-state", "playing", { timeout: 20000 });
  await page.waitForTimeout(1000);
  // NEXT's PLAY asks first (the button says so), the second tap goes on
  const at = (await booth(page)).planIndex;
  await sheet.getByTestId("vc-B-play").click();
  await expect(sheet.getByTestId("vc-B-play")).toHaveAttribute("data-armed", "true");
  expect((await booth(page)).planIndex).toBe(at);
  await sheet.getByTestId("vc-B-play").click();
  await expect.poll(async () => (await booth(page)).planIndex, { timeout: 10000 }).toBeGreaterThan(at);
  // NEXT's CUE: the next song in the headphones (no headphone output here: the reason is said)
  await sheet.getByTestId("vc-B-cue").click();
  // the jog wheel, by keyboard: the target waits for Confirm
  const jog = sheet.getByTestId("vc-A-jog");
  await jog.focus();
  for (let k = 0; k < 5; k++) await page.keyboard.press("Shift+ArrowRight");
  await expect(sheet.getByTestId("vc-seek-pending")).toBeVisible();
  await sheet.getByTestId("vc-seek-confirm").click();
  await expect(sheet.getByTestId("vc-seek-pending")).toHaveCount(0);
  // the room's level from the A channel fader
  await sheet.getByTestId("vc-A-level").locator("input").fill("0.5");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __tdjBooth: { getState: () => { master: number } } }).__tdjBooth.getState()
            .master,
      ),
    )
    .toBe(-12);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/virtual-controller-ipad.png` });
  // touch targets: every control ≥ 44 px
  const small = await sheet.locator(".vc button, .vc [role=slider]").evaluateAll((els) =>
    els
      .map((e) => e.getBoundingClientRect())
      .filter((r) => r.width > 0 && (r.width < 43.5 || r.height < 43.5))
      .map((r) => `${r.width}x${r.height}`),
  );
  expect(small).toEqual([]);
});

test("Settings → Booth → Controller: connect, the controller and its mapping", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await fakeMidi(page, { name: "DDJ-FLX4" });
  await page.goto("/settings");
  const g = page.getByTestId("settings-booth-controller");
  await g.scrollIntoViewIfNeeded();
  await g.getByTestId("controller-connect").click();
  await expect(g.getByTestId("controller-port")).toHaveAttribute("data-name", "DDJ-FLX4");
  await expect(g.getByTestId("controller-mapping")).toContainText("Pioneer DJ DDJ-FLX4");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/settings-controller.png` });
});
