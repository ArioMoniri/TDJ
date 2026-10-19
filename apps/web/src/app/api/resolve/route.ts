import { normTitle, type ResolvedTrack } from "@tdj/core";
import { NextResponse } from "next/server";
import { getCatalog } from "@/lib/server/catalog";
export const dynamic = "force-dynamic";

const UA = "TDJ/0.1 (https://github.com/ArioMoniri/TDJ)";
const surname = (o: string) =>
  normTitle(o)
    .split(" ")
    .filter((w) => w.length > 2)
    .pop() ?? "";

export interface ResolveCandidate extends ResolvedTrack {
  year?: number | null;
}
export interface ResolveResponse {
  candidates: ResolveCandidate[];
  suggestions: { year?: number; singer?: string; durationSec?: number };
  error?: string;
}

interface DeezerTrack {
  id: number;
  title: string;
  duration: number;
  preview: string;
  link: string;
  artist: { name: string };
  album: { title: string; cover_medium: string };
}
interface MbRecording {
  id: string;
  title: string;
  length?: number;
  "first-release-date"?: string;
  "artist-credit"?: Array<{ name: string; artist?: { name: string } }>;
}

/** Mirrors scripts/resolve_catalog.ts: exact title 0.6, prefix 0.4, first word 0.15; orchestra surname 0.35 (album 0.2); singer 0.1. */
function score(
  want: { title: string; orchestra: string; singer?: string | null },
  t: { title: string; artist: string; album?: string },
): number {
  const wt = normTitle(want.title);
  const sur = surname(want.orchestra.replace(/\(.*?\)/g, ""));
  const tt = normTitle(t.title);
  const ta = normTitle(t.artist);
  let c = 0;
  if (tt === wt) c += 0.6;
  else if (tt.startsWith(wt) || wt.startsWith(tt)) c += 0.4;
  else if (wt && tt.includes(wt.split(" ")[0]!)) c += 0.15;
  if (sur && ta.includes(sur)) c += 0.35;
  else if (sur && t.album && normTitle(t.album).includes(sur)) c += 0.2;
  if (want.singer && ta.includes(surname(want.singer))) c += 0.1;
  return Math.round(c * 100) / 100;
}

async function deezer(q: string, signal: AbortSignal): Promise<DeezerTrack[]> {
  const r = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=8`, {
    headers: { "user-agent": UA },
    signal,
  });
  if (!r.ok) throw new Error(`Deezer ${r.status}`);
  const j = (await r.json()) as { data?: DeezerTrack[] };
  return j.data ?? [];
}
async function musicbrainz(q: string, signal: AbortSignal): Promise<MbRecording[]> {
  const r = await fetch(
    `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(q)}&fmt=json&limit=5`,
    { headers: { "user-agent": UA, accept: "application/json" }, signal },
  );
  if (!r.ok) throw new Error(`MusicBrainz ${r.status}`);
  const j = (await r.json()) as { recordings?: MbRecording[] };
  return j.recordings ?? [];
}

/**
 * POST { id | title, orchestra, singer? } → up to 5 scored candidates (Deezer previews + MusicBrainz recordings) and
 * suggestions. The year suggestion comes from MusicBrainz `first-release-date` only: streaming album dates are reissues.
 * Never fails loudly: an upstream error returns 200 with empty candidates and an `error` string.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  let title = typeof body.title === "string" ? body.title.trim() : "";
  let orchestra = typeof body.orchestra === "string" ? body.orchestra.trim() : "";
  let singer = typeof body.singer === "string" ? body.singer.trim() : "";
  if (typeof body.id === "string" && (!title || !orchestra)) {
    const s = getCatalog().catalog.songs.find((x) => x.id === body.id);
    if (s) {
      title ||= s.title;
      orchestra ||= s.orchestra;
      singer ||= s.singer ?? "";
    }
  }
  if (!title || !orchestra)
    return NextResponse.json({ error: "title and orchestra required" }, { status: 400 });
  const want = { title, orchestra, singer: singer || null };
  const q = `${title} ${orchestra.replace(/\(.*?\)/g, "")}`.trim();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8000);
  const out: ResolveResponse = { candidates: [], suggestions: {} };
  const errors: string[] = [];
  try {
    const [dz, mb] = await Promise.allSettled([
      deezer(q, ac.signal),
      musicbrainz(`${title} AND artist:${orchestra}`, ac.signal),
    ]);
    const now = new Date().toISOString();
    if (dz.status === "fulfilled") {
      for (const t of dz.value) {
        const c = score(want, { title: t.title, artist: t.artist.name, album: t.album.title });
        out.candidates.push({
          provider: "deezer",
          id: String(t.id),
          title: t.title,
          artist: t.artist.name,
          album: t.album.title,
          durationMs: t.duration * 1000,
          previewUrl: t.preview || null,
          url: t.link,
          artwork: t.album.cover_medium,
          matchedAt: now,
          confidence: c,
        });
      }
    } else errors.push(dz.reason instanceof Error ? dz.reason.message : "Deezer failed");
    if (mb.status === "fulfilled") {
      const recs = mb.value
        .map((r) => {
          const artist = (r["artist-credit"] ?? []).map((a) => a.name ?? a.artist?.name ?? "").join(" ");
          const date = r["first-release-date"];
          const year = date && /^\d{4}/.test(date) ? Number(date.slice(0, 4)) : null;
          return {
            provider: "musicbrainz" as const,
            id: r.id,
            title: r.title,
            artist,
            year,
            durationMs: r.length,
            previewUrl: null,
            url: `https://musicbrainz.org/recording/${r.id}`,
            matchedAt: now,
            confidence: score(want, { title: r.title, artist }),
          };
        })
        .sort((a, b) => b.confidence - a.confidence);
      out.candidates.push(...recs);
      const best = recs.find((r) => r.confidence >= 0.6 && r.year && r.year >= 1900 && r.year <= 2030);
      if (best?.year) out.suggestions.year = best.year;
      const dur = recs.find((r) => r.confidence >= 0.6 && r.durationMs && r.durationMs > 90_000);
      if (dur?.durationMs) out.suggestions.durationSec = Math.round(dur.durationMs / 1000);
      // a singer named in the artist credit ("Juan D'Arienzo feat. Alberto Echagüe") that the catalogue lacks
      const credit = best?.artist ?? "";
      const m = /(?:feat\.?|con|canta|with)\s+([^,;()]+)/i.exec(credit);
      if (m && !want.singer) out.suggestions.singer = m[1]!.trim();
    } else errors.push(mb.reason instanceof Error ? mb.reason.message : "MusicBrainz failed");
  } catch (e) {
    errors.push(e instanceof Error ? e.message : "lookup failed");
  } finally {
    clearTimeout(timer);
  }
  out.candidates = out.candidates
    .sort((a, b) => b.confidence - a.confidence || (a.provider === "deezer" ? -1 : 1))
    .slice(0, 5);
  if (errors.length) out.error = errors.join("; ");
  return NextResponse.json(out);
}

/** GET: keyless connector status for Settings (Deezer and MusicBrainz reachability from the server). */
export async function GET() {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 5000);
  const ping = async (url: string) => {
    try {
      const r = await fetch(url, {
        headers: { "user-agent": UA, accept: "application/json" },
        signal: ac.signal,
      });
      return r.ok;
    } catch {
      return false;
    }
  };
  const [deezerOk, mbOk] = await Promise.all([
    ping("https://api.deezer.com/infos"),
    ping("https://musicbrainz.org/ws/2/recording/?query=cumparsita&fmt=json&limit=1"),
  ]);
  clearTimeout(timer);
  return NextResponse.json({ deezer: deezerOk, musicbrainz: mbOk });
}
