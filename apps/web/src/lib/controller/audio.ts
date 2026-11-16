import type { OutputInfo } from "@/lib/booth/outputs";

/**
 * 2026-11 (docs/design/controller.md, Audio routing): a DJ controller is a MIDI device and a USB sound card under one
 * name. When its MIDI port appears, the output that is the same device (its name in the output's, or the output's in
 * its) is offered: the room on ch 1–2, the headphones on ch 3–4 when it has two stereo pairs.
 */
const core = (s: string) =>
  s
    .replace(/^Default\s*-\s*/i, "")
    .replace(/^\d+-\s*/, "")
    .replace(/\b(midi|in|out|port|usb|audio|\d+:\d+)\b/gi, " ")
    .replace(/(^|\s)\d+(?=\s|$)/g, " ")
    .replace(/[()[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

export function audioOfController(name: string, outputs: ReadonlyArray<OutputInfo>): OutputInfo | null {
  const c = core(name);
  if (c.length < 3) return null;
  const same = outputs.filter((o) => {
    const l = core(o.label);
    return l.length >= 3 && (l.includes(c) || c.includes(l));
  });
  // a named device over the "Default - …" alias; more channels first
  same.sort(
    (a, b) =>
      Number(a.id === "default") - Number(b.id === "default") || (b.channels ?? 0) - (a.channels ?? 0),
  );
  return same[0] ?? null;
}
