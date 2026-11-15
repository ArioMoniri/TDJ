"use client";
import {
  mergeScraped,
  missingFields,
  needsRefresh,
  type ScrapedRecord,
  type Song,
  songData,
} from "@tdj/core";
import { djDataOf } from "../artwork";
import { useStore } from "../store";
import type { UserSettings } from "../types";
import { type FillResult, type FillWant, lookup, SOURCES, type SourceId } from "./sources";

/** the sources this DJ has on: keyless ones unless turned off; Discogs with a token; Spotify when logged in */
export function enabledSources(settings: UserSettings, spotifyConnected: boolean): SourceId[] {
  const on = settings.dataSources?.enabled ?? {};
  return SOURCES.filter((s) => {
    const want = on[s.id] ?? s.defaultOn;
    if (!want) return false;
    if (s.needs === "token") return !!settings.dataSources?.discogsToken;
    if (s.needs === "spotify") return spotifyConnected;
    return true;
  }).map((s) => s.id);
}

const wantOf = (s: Song): FillWant => ({
  id: s.id,
  title: s.title,
  orchestra: s.orchestra,
  singer: s.singer,
  year: s.year ?? null,
  deezerId: s.deezer?.id ?? (s.resolved?.provider === "deezer" ? s.resolved.id : null),
  spotifyUri: s.spotify?.uri ?? null,
});

/** a source answered (through the server, or straight from the browser for Spotify with the DJ's own login) */
async function ask(source: SourceId, want: FillWant, settings: UserSettings, spotifyToken?: string) {
  if (source === "spotify") return lookup(source, want, { fetch: fetch as never, spotifyToken });
  const r = await fetch("/api/fill", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(source === "discogs" && settings.dataSources?.discogsToken
        ? { "x-discogs-token": settings.dataSources.discogsToken }
        : {}),
    },
    body: JSON.stringify({ source, song: want }),
  });
  if (!r.ok) return { source, values: {}, error: `fill ${r.status}` } as FillResult;
  return (await r.json()) as FillResult;
}

export interface FillReport {
  filled: string[];
  stillMissing: string[];
  asked: SourceId[];
  errors: string[];
}

/**
 * Fill one song's missing fields from every enabled source that is due, store what came back in the DJ's scraped
 * records (overrides.scraped), and report what was filled. `force` refetches even fresh records (the "Refresh" action).
 */
export async function fillMissing(s: Song, opts: { force?: boolean } = {}): Promise<FillReport> {
  const st = useStore.getState();
  const connected = !!st.spotifyToken && st.spotifyToken.expires > Date.now();
  const sources = enabledSources(st.settings, connected);
  const dj = djDataOf(st.overrides.songs?.[s.id]);
  let rec: ScrapedRecord | null = st.overrides.scraped?.[s.id] ?? null;
  const before = missingFields(songData(s, rec, dj));
  const want = wantOf(s);
  const asked: SourceId[] = [];
  const errors: string[] = [];
  for (const source of sources) {
    const missing = missingFields(songData(s, rec, dj));
    if (!opts.force && !missing.length) break;
    const ref = source === "deezer" && want.deezerId ? `deezer:${want.deezerId}` : undefined;
    if (!opts.force && !needsRefresh(rec, source, ref)) continue;
    asked.push(source);
    const r = await ask(source, want, st.settings, st.spotifyToken?.access).catch(
      (e: Error) => ({ source, values: {}, error: e.message }) as FillResult,
    );
    if (r.error && !Object.keys(r.values).length) {
      errors.push(`${SOURCES.find((x) => x.id === source)?.name ?? source}: ${r.error}`);
      // a "no match" is still an answer: record the fetch so the source is not asked again until it is due
      rec = mergeScraped(rec, {}, source, r.ref);
      continue;
    }
    rec = mergeScraped(rec, r.values, source, r.ref);
    if (!want.deezerId && r.values.deezerId) want.deezerId = r.values.deezerId;
  }
  if (rec) {
    const saved = rec;
    st.updateOverrides((o) => ({ ...o, scraped: { ...(o.scraped ?? {}), [s.id]: saved } }));
  }
  const after = missingFields(songData(s, rec, dj));
  return { filled: before.filter((f) => !after.includes(f)), stillMissing: after, asked, errors };
}
