/**
 * QA fix 2026-11 (the owner: "the Analyse song in browser button doesn't always work") — where "Measure from your
 * file" reads a side's audio, and why it cannot, in one line with the action. Pure (the fetch and the DJ's file are
 * passed in), for the vitest.
 *
 * Before: one path only — `/api/preview?json=1` for the provider's signed link, then a cross-origin fetch of it: the
 * browser refused it whenever the CDN sent no CORS header (Deezer's, Spotify's clips), a missing clip read as
 * "Preview request failed (403)", a Spotify-only side or a side with no clip had the item greyed out with no reason,
 * a slow host spun forever, and the Mac / iPhone app (its own origin) had the same CORS wall.
 *
 * The ladder: (1) the DJ's own matched file (the music folder), (2) the 30 s clip's bytes through this app
 * (`/api/preview?…&bytes=1`, same origin: no CORS), (3) the clip's direct link when the app's route is missing (an
 * older device copy), else a reason: no clip ("Find it on a service"), Spotify only ("Link your music folder"), the clip
 * gone, the host unreachable, a clip that does not decode, too slow.
 */
export type MeasureFrom = "file" | "clip";
export type MeasureFailure =
  | "no-source"
  | "spotify-only"
  | "gone"
  | "network"
  | "decode"
  | "timeout"
  | "no-audio"
  | "busy";

export class MeasureError extends Error {
  constructor(
    readonly reason: MeasureFailure,
    message?: string,
  ) {
    super(message ?? reason);
  }
}

export interface MeasureSide {
  id: string;
  resolved?: { provider: string; id: string; previewUrl?: string | null } | null;
  spotify?: { uri?: string } | null;
}
export interface LadderDeps {
  /** the DJ's matched file for the side (null: none) */
  localFile: (id: string) => Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  /** progress 0..1 while the bytes arrive */
  onProgress?: (p: number) => void;
}

export const clipEndpoint = (r: NonNullable<MeasureSide["resolved"]>) =>
  `/api/preview?provider=${encodeURIComponent(r.provider)}&id=${encodeURIComponent(r.id)}`;

/** reads a response body, reporting progress when its length is known */
async function readBody(r: Response, onProgress?: (p: number) => void): Promise<ArrayBuffer> {
  const total = Number(r.headers.get("content-length")) || 0;
  if (!r.body || !total || !onProgress) return r.arrayBuffer();
  const reader = r.body.getReader();
  const parts: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    got += value.length;
    onProgress(Math.min(1, got / total));
  }
  const out = new Uint8Array(got);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out.buffer;
}

/** the side's audio bytes, from the first source on the ladder that has them; throws MeasureError with the reason */
export async function measureBytes(
  side: MeasureSide,
  d: LadderDeps,
): Promise<{ bytes: ArrayBuffer; from: MeasureFrom }> {
  const file = await d.localFile(side.id).catch(() => null);
  if (file) return { bytes: await file.arrayBuffer(), from: "file" };
  const r = side.resolved;
  if (!r?.id || !r.provider) throw new MeasureError(side.spotify?.uri ? "spotify-only" : "no-source");
  const base = clipEndpoint(r);
  let res: Response | null = null;
  try {
    res = await d.fetch(`${base}&bytes=1`);
  } catch {
    res = null;
  }
  if (res?.ok) return { bytes: await readBody(res, d.onProgress), from: "clip" };
  if (res && (res.status === 404 || res.status === 410)) throw new MeasureError("gone");
  // the app's route did not stream (an older device copy, a 5xx): the provider's direct link, if it allows CORS
  let link: string | null = null;
  try {
    const j = await d.fetch(`${base}&json=1`);
    if (j.status === 404) throw new MeasureError("gone");
    link = j.ok ? (((await j.json()) as { url?: string }).url ?? null) : null;
  } catch (e) {
    if (e instanceof MeasureError) throw e;
    link = null;
  }
  if (!link && r.previewUrl) link = r.previewUrl;
  if (!link) throw new MeasureError("network");
  try {
    const x = await d.fetch(link, { mode: "cors" });
    if (x.status === 404 || x.status === 410 || x.status === 403) throw new MeasureError("gone");
    if (!x.ok) throw new MeasureError("network");
    return { bytes: await readBody(x, d.onProgress), from: "clip" };
  } catch (e) {
    if (e instanceof MeasureError) throw e;
    throw new MeasureError("network");
  }
}

/** an error of any kind as the reason the DJ reads */
export function measureFailure(e: unknown): MeasureFailure {
  if (e instanceof MeasureError) return e.reason;
  const m = e instanceof Error ? `${e.name} ${e.message}` : String(e);
  if (/timeout|timed out/i.test(m)) return "timeout";
  if (/EncodingError|decode|Unable to decode|NotSupportedError/i.test(m)) return "decode";
  return "network";
}

/** the action the reason offers */
export const measureAction = (r: MeasureFailure): "find" | "folder" | "retry" | null =>
  r === "no-source" || r === "gone"
    ? "find"
    : r === "spotify-only"
      ? "folder"
      : r === "network" || r === "timeout"
        ? "retry"
        : null;

/** resolves, or rejects with a "timeout" MeasureError after `ms` */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((ok, fail) => {
    const id = setTimeout(() => fail(new MeasureError("timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(id);
        ok(v);
      },
      (e) => {
        clearTimeout(id);
        fail(e);
      },
    );
  });
}
