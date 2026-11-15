"use client";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import { EXPORT_META, type ExportFormat } from "@tdj/core";
import { ArrowRightLeft, Check, Cloud, FileDown, HardDrive, ListVideo, Radio, Webhook } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { coverAfterExport } from "@/lib/cover/spotify";
import { downloadBlob } from "@/lib/download";
import { type CheckView, checkView, fileCheckLine, uploadCheckLine } from "@/lib/exportCheckView";
import { withoutCortinas } from "@/lib/exportPaths";
import { verifyFile } from "@/lib/fileVerify";
import { haptic } from "@/lib/haptics";
import { lazy, t as tx } from "@/lib/i18n";
import type { Match, MatchItem } from "@/lib/match";
import { DUR, SPRING } from "@/lib/motion";
import {
  beginAuth,
  byoWritePlaylist,
  type ConnectApp,
  connectExport,
  directPost,
  dropboxLoginUrl,
  type FileResult,
  googleLoginUrl,
  hostedCreatePlaylist,
  hostedLoginUrl,
  hostedMatch,
  refresh,
  resolveTrack,
  SpotifyRateLimit,
  type SpotifyWriteResult,
  useConnectors,
  type YoutubeResult,
} from "@/lib/spotify";
import {
  batches,
  orderedRows,
  type PlanRow,
  playlistIdFrom,
  type StandInCue,
  spotifyPlanFor,
  standInCortinas,
} from "@/lib/spotifyPlan";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { TRANSFER_SERVICES, type TransferService, transferCsv, transferRows } from "@/lib/transferCsv";
import { CORTINA_STOP_RANGE, cortinaStopSec, DJ_APPS, type DjApp, type Playlist } from "@/lib/types";
import { youtubeBatches, youtubeQueries } from "@/lib/youtubePlan";
import type { YoutubeCheck } from "@/lib/youtubeVerify";
import { CountUp } from "./CountUp";
import { ExportCheck } from "./ExportCheck";
import { ActionRow, Group, PickerRow, Row, SegmentedRow, StepperRow, SwitchRow, Tile } from "./Form";
import { ShareNightEntry } from "./ShareSheet";
import { Sheet } from "./Sheet";

/** one row of the playlist the Spotify export writes, with its URI */
type SpotifyRow = PlanRow & { uri: string };
/** a video the YouTube export added: the search that found it and its row of the running order */
type YtWant = { videoId: string; query: string; row: number };

const FORMAT_ITEMS = (Object.keys(EXPORT_META) as ExportFormat[]).map(
  (f) => [f, EXPORT_META[f].label] as [ExportFormat, string],
);

/**
 * POST an export to the DJ's own automation (Pipedream, Make, Zapier, n8n…). The body is the file; the format and
 * set name travel as headers and query parameters. A webhook without CORS headers still receives the body
 * (the retry is `no-cors`, so the response is opaque and we only know it was sent).
 */
export async function sendToWebhook(
  url: string,
  text: string,
  f: ExportFormat,
  name: string,
): Promise<"ok" | "sent"> {
  const m = EXPORT_META[f];
  const u = new URL(url);
  u.searchParams.set("format", f);
  u.searchParams.set("filename", `${name.replace(/[^a-z0-9-]+/gi, "_")}.${m.ext}`);
  const init = {
    method: "POST",
    headers: { "content-type": `${m.mime}; charset=utf-8`, "x-tdj-format": f, "x-tdj-set": name },
    body: text,
  };
  try {
    const r = await fetch(u.toString(), init);
    if (!r.ok) throw new Error(tx("exportSheet.webhook_answered", { status: r.status }));
    return "ok";
  } catch (e) {
    if (e instanceof Error && /answered \d+/.test(e.message)) throw e;
    await fetch(u.toString(), { ...init, mode: "no-cors", headers: { "content-type": "text/plain" } });
    return "sent";
  }
}

const GROUPS: Array<[string, ExportFormat[]]> = lazy(() => [
  [tx("exportSheet.dj_software"), ["rekordbox", "traktor", "serato"]],
  [tx("exportSheet.playlist_files"), ["m3u8", "xspf", "csv"]],
  [tx("exportSheet.other"), ["json", "setlist"]],
]);
/** Which DJ-app folder a format uses for real file paths. */
const APP_FOR: Partial<Record<ExportFormat, DjApp[]>> = {
  rekordbox: ["rekordbox"],
  traktor: ["traktor"],
  serato: ["serato"],
  m3u8: ["virtualdj", "enginedj"],
};
const TILE_COLOR: Record<ExportFormat, string> = {
  rekordbox: "#111",
  traktor: "#1d6fd6",
  serato: "#111",
  m3u8: "#ff9500",
  xspf: "#ff9500",
  csv: "#34c759",
  json: "#636366",
  setlist: "#636366",
};

/** "https://open.spotify.com/pl…/37i9dQZF1DX" : the start and the end of a long value, the middle elided */
export function middleTruncate(v: string, max: number): string {
  if (v.length <= max) return v;
  const tail = Math.floor((max - 1) * 0.4);
  return `${v.slice(0, max - 1 - tail)}…${v.slice(v.length - tail)}`;
}

export function ExportSheet({
  open,
  onClose,
  playlist: given,
}: {
  open: boolean;
  onClose: () => void;
  /** History re-export: a snapshot's playlist instead of the store's */
  playlist?: Playlist | null;
}) {
  const {
    playlist: current,
    settings,
    setSettings,
    options,
    spotifyToken,
    setSpotifyToken,
    overrides,
    updateOverrides,
  } = useStore();
  const playlist = given ?? current;
  /** where cortinas stop: Settings → Playback, else the composer's cortina length */
  const cortinaStop = cortinaStopSec(settings, options.cortinaLengthSec);
  const { spotify, google, dropbox, connect } = useConnectors();
  const hosted = spotify?.hosted ?? false;
  const hostedUser = spotify?.user ?? null;
  const accounts = connect?.accounts ?? [];
  const fileAccounts = accounts.filter((a) => a.app === "dropbox" || a.app === "google_drive");
  const listAccounts = accounts.filter((a) => a.app === "youtube_data_api" || a.app === "spotify");
  // direct connections (the deployment's own Google and Dropbox apps) come before the Pipedream accounts
  const googleOn = google?.hosted ?? false;
  const dropboxOn = dropbox?.hosted ?? false;
  const hasFileTarget = googleOn || dropboxOn || fileAccounts.length > 0;
  const [cloudBusy, setCloudBusy] = useState<string | null>(null);
  /** "Adding 20 of 83…" while the YouTube playlist fills batch by batch */
  const [ytProgress, setYtProgress] = useState<string | null>(null);
  const webhookUrl = overrides.connectors?.webhookUrl ?? "";
  const [hookFormat, setHookFormat] = useState<ExportFormat>("m3u8");
  const [hookBusy, setHookBusy] = useState(false);
  const [hookOpen, setHookOpen] = useState(false);
  const [hookDraft, setHookDraft] = useState("");
  /** "Spotify via a transfer service": the CSV any Spotify account can import through TuneMyMusic or Soundiiz */
  const [transferOpen, setTransferOpen] = useState(false);
  const [transfer, setTransfer] = useState<TransferService["id"]>("tunemymusic");
  const [log, setLog] = useState<string[]>([]);
  /** round 15: every side the matcher could not place confidently, listed (never a silent skip) */
  const [notMatched, setNotMatched] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [dlBusy, setDlBusy] = useState<ExportFormat | null>(null);
  /** the row whose download just finished shows a check for 1.2 s (motion-composer.md §2.7) */
  const [justDone, setJustDone] = useState<ExportFormat | null>(null);
  const [result, setResult] = useState<{ label: string; url: string } | null>(null);
  const [includeCortinas, setIncludeCortinas] = useState(true);
  const [done, setDone] = useState(false);
  /** "Matching 23 of 83…" while the server searches batch by batch */
  const [progress, setProgress] = useState<string | null>(null);
  /** Spotify asked for a pause: the playlist exists with what was found; "Try again" matches the rest into it */
  const [pending, setPending] = useState<{ playlistId: string; url: string; remaining: MatchItem[] } | null>(
    null,
  );
  /** every match of this export by row id, kept across "Try again" so the whole playlist can be rewritten in order */
  const found = useRef(new Map<string, string>());
  /** a playlist made before (its Spotify link): the export rewrites it in place instead of making a new one */
  const [target, setTarget] = useState("");
  const [targetFocused, setTargetFocused] = useState(false);
  /** what the last Spotify action did, for the button's done label */
  const [madeNew, setMadeNew] = useState(true);
  const targetKey = playlist ? `tdj-sp-target:${playlist.name}` : "";
  const targetId = playlistIdFrom(target);
  const rememberTarget = (url: string) => {
    setTarget(url);
    try {
      if (targetKey) localStorage.setItem(targetKey, url);
    } catch {}
  };
  const check = useRef<{ play: () => void } | null>(null);
  const reduced = useReducedMotion();
  /** what Spotify holds after the last write or check, read back (lib/spotifyWrite.ts) */
  const [spCheck, setSpCheck] = useState<{ view: CheckView; rows: SpotifyRow[]; id: string } | null>(null);
  /** "Check playlist" or "Fix in Spotify" running */
  const [checking, setChecking] = useState(false);
  /** what YouTube holds after the export, read back */
  const [ytCheck, setYtCheck] = useState<{ view: CheckView; playlistId: string; want: YtWant[] } | null>(
    null,
  );

  // a fresh open starts clean: no stale "Playlist created" state
  useEffect(() => {
    if (open) {
      setDone(false);
      setResult(null);
      setLog([]);
      setPending(null);
      setProgress(null);
      setSpCheck(null);
      setYtCheck(null);
      try {
        setTarget((targetKey && localStorage.getItem(targetKey)) || "");
      } catch {
        setTarget("");
      }
    }
  }, [open, targetKey]);

  const tracks = playlist
    ? playlist.tandas.reduce((a, t) => a + t.songs.length, 0) +
      (playlist.closing ? 1 : 0) +
      (playlist.opening ? 1 : 0)
    : 0;
  const cortinas = playlist ? playlist.tandas.filter((t) => t.cortina).length : 0;
  const count = tracks + (includeCortinas ? cortinas : 0);
  const folderFor = (f: ExportFormat) =>
    (APP_FOR[f] ?? []).map((a) => settings.djApps[a]?.folder?.trim()).find(Boolean) ?? "";
  const noFolders = DJ_APPS.every((a) => !settings.djApps[a.id]?.folder);

  const dl = async (f: ExportFormat) => {
    if (!playlist) return;
    const m = EXPORT_META[f];
    setDlBusy(f);
    try {
      const r = await fetch("/api/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          playlist,
          format: f,
          includeCortinas,
          cortinaStopSec: cortinaStop,
          folder: folderFor(f),
          naming: settings.fileNaming,
        }),
      });
      if (!r.ok) throw new Error(tx("exportSheet.export_failed", { status: r.status }));
      const text = await r.text();
      downloadBlob(`${playlist.name.replace(/[^a-z0-9-]+/gi, "_")}.${m.ext}`, text, m.mime);
      haptic(6);
      // the file read back as the DJ app will read it: count, order, names, letters, paths
      const fc = verifyFile(f, text, includeCortinas ? playlist : withoutCortinas(playlist), {
        includeCortinas,
        folder: folderFor(f),
      });
      toast(
        `${tx("exportSheet.downloaded_2", { label: m.label, ext: m.ext })} · ${fileCheckLine(tx("exportCheck.file_label", { label: m.label }), fc)}`,
      );
      setJustDone(f);
      setTimeout(() => setJustDone((j) => (j === f ? null : j)), 1200);
      onClose();
    } catch (e) {
      setLog((l) => [...l, `Error: ${(e as Error).message}`]);
      haptic([20, 30, 20]);
    } finally {
      setDlBusy(null);
    }
  };

  /** The matches go into the DJ's database (`songs[id].spotify`) so a re-export never searches again. */
  const persistMatches = (ms: Match[], kinds: Map<string, string>) => {
    const songs = ms.filter((m) => kinds.get(m.id) !== "cortina");
    if (!songs.length) return;
    updateOverrides((o) => {
      const next = { ...(o.songs ?? {}) };
      for (const m of songs)
        next[m.id] = {
          ...(next[m.id] ?? {}),
          spotify: {
            uri: m.uri,
            url: m.url,
            durationMs: m.durationMs,
            album: m.album,
            matched: `${m.artist} – ${m.name}`,
          },
        };
      return { ...o, songs: next };
    });
  };
  const pauseMessage = (sec: number) => tx("exportSheet.spotify_is_pausing_searches_for_s", { sec });
  /**
   * Hosted: the unresolved recordings go to the server in batches of 10 (one search in flight at a time there);
   * a rate limit ends the matching cleanly and the playlist is made with what was found.
   */
  const matchHosted = async (items: MatchItem[], kinds: Map<string, string>, labels: Map<string, string>) => {
    const uris: string[] = [];
    const missing: string[] = [];
    const missingIds: string[] = [];
    let paused: number | undefined;
    let remaining: MatchItem[] = [];
    const bs = batches(items);
    let done = 0;
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i]!;
      setProgress(
        tx("exportSheet.matching_of", { p1: Math.min(done + b.length, items.length), length: items.length }),
      );
      const r = await hostedMatch(b);
      for (const m of r.matches) {
        uris.push(m.uri);
        found.current.set(m.id, m.uri);
      }
      persistMatches(r.matches, kinds);
      for (const id of r.missing) {
        missing.push(labels.get(id) ?? id);
        missingIds.push(id);
      }
      if (r.rateLimited) {
        paused = r.rateLimited;
        const seen = new Set([...r.matches.map((m) => m.id), ...r.missing]);
        remaining = [...b.filter((x) => !seen.has(x.id)), ...bs.slice(i + 1).flat()];
        break;
      }
      done += b.length;
    }
    setProgress(null);
    return { uris, missing, missingIds, paused, remaining };
  };
  /** BYO: the same scorer, searching from this browser with the DJ's own Client ID. */
  const matchByo = async (token: string, items: MatchItem[], labels: Map<string, string>) => {
    const uris: string[] = [];
    const missing: string[] = [];
    const missingIds: string[] = [];
    let paused: number | undefined;
    let remaining: MatchItem[] = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i]!;
      setProgress(tx("exportSheet.matching_of", { p1: i + 1, length: items.length }));
      try {
        const r = await resolveTrack(token, it);
        if (r) {
          uris.push(r.uri);
          found.current.set(it.id, r.uri);
        } else {
          missing.push(labels.get(it.id) ?? it.title);
          missingIds.push(it.id);
        }
      } catch (e) {
        if (e instanceof SpotifyRateLimit) {
          paused = e.retryAfter;
          remaining = items.slice(i);
          break;
        }
        throw e;
      }
    }
    setProgress(null);
    return { uris, missing, missingIds, paused, remaining };
  };
  /** round 19: the cortina pool with its checked Spotify ids (/api/meta), fetched once, for the stand-ins */
  const cuePool = useRef<StandInCue[] | null>(null);
  const loadCuePool = async (): Promise<StandInCue[]> => {
    if (cuePool.current) return cuePool.current;
    try {
      const j = (await (await fetch("/api/meta")).json()) as { cortinaList?: StandInCue[] };
      cuePool.current = j.cortinaList ?? [];
    } catch {
      cuePool.current = [];
    }
    return cuePool.current;
  };
  /**
   * Round 19: a cortina Spotify could not match never leaves a gap between two tandas — the nearest Spotify-ready cue
   * of its family stands in, in its own row; the result line says which. Returns the labels still not found.
   */
  const standIns = async (
    m: { missing: string[]; missingIds: string[] },
    kinds: Map<string, string>,
    labels: Map<string, string>,
  ) => {
    if (!playlist || !m.missingIds.some((id) => kinds.get(id) === "cortina"))
      return { missing: m.missing, note: "" };
    const r = standInCortinas(playlist, m.missingIds, found.current, await loadCuePool());
    const note = r.standIns.length
      ? ` ${tx("exportSheet.not_on_spotify", {
          p1:
            r.standIns.length === 1
              ? tx("exportSheet.a_cortina_was")
              : tx("exportSheet.cortinas_were", { length: r.standIns.length }),
          p2: r.standIns
            .slice(0, 2)
            .map((x) => tx("exportSheet.stands_in_for", { standIn: x.standIn, cue: x.cue }))
            .join("; "),
          p3: r.standIns.length > 2 ? "…" : "",
        })}`
      : "";
    return { missing: r.missing.map((id) => labels.get(id) ?? id), note };
  };
  const finishLog = (added: number, missing: string[], paused?: number, left = 0, note = "") => {
    setNotMatched(missing);
    setLog((l) => [
      ...l,
      `${tx("exportSheet.tracks_in_playlist", { added })}${missing.length ? ` ${tx("exportSheet.not_found_list", { n: missing.length, list: `${missing.slice(0, 3).join(", ")}${missing.length > 3 ? "…" : ""}` })}` : ""}${paused ? tx("exportSheet.spotify_paused_searches_for_s_still", { paused, left }) : "."}${note}`,
    ]);
  };

  /** the listener's country of the last Spotify export (the key its replacements are remembered under) */
  const rememberedMarket = () => {
    try {
      return localStorage.getItem("tdj-sp-market") || "from_token";
    } catch {
      return "from_token";
    }
  };
  const spotifyPlan = () =>
    spotifyPlanFor(includeCortinas ? playlist! : withoutCortinas(playlist!), overrides, { includeCortinas });
  /**
   * Writes the rows into Spotify — the hosted route or, BYO, straight from this browser — and reads the playlist
   * back with the DJ's own token: the answer is what Spotify holds (lib/spotifyWrite.ts), never what was sent.
   */
  const spotifyWrite = async (
    rows: SpotifyRow[],
    w: { playlistId?: string; mode: "replace" | "check"; details?: { name: string; description: string } },
    token = spotifyToken,
  ): Promise<SpotifyWriteResult & { details?: boolean }> => {
    const uris = rows.map((r) => r.uri);
    const items = rows.map((r) => r.item);
    if (hosted) {
      const r = await hostedCreatePlaylist({
        uris,
        items,
        includeCortinas,
        ...(w.playlistId
          ? {
              playlistId: w.playlistId,
              url: `https://open.spotify.com/playlist/${w.playlistId}`,
              replace: w.mode === "replace",
              check: w.mode === "check",
            }
          : {}),
        ...(w.details ?? {}),
      });
      if (!r.check) throw new Error(tx("exportCheck.stopped", { error: "–" }));
      return { id: r.id, url: r.url, check: r.check, market: r.market ?? "from_token", details: r.details };
    }
    const tok = token;
    if (!tok) throw new Error(tx("exportSheet.connect_spotify_and_create_playlist"));
    return byoWritePlaylist(
      tok.access,
      w.playlistId ? { playlistId: w.playlistId } : (w.details ?? { name: playlist!.name, description: "" }),
      uris,
      items,
      w.mode,
    );
  };
  /** Shows what Spotify holds and remembers each replacement for the listener's country (a later export reuses it). */
  const showSpotifyCheck = (r: SpotifyWriteResult, rows: SpotifyRow[]) => {
    const c = r.check;
    const now = rows.map((row, i) => ({ ...row, uri: c.uris[i] ?? row.uri }));
    if (c.replaced.length) {
      updateOverrides((o) => {
        const all = { ...(o.marketStreams ?? {}) };
        const mine = { ...(all[r.market] ?? {}) };
        for (const x of c.replaced) {
          const row = rows[x.at];
          if (row) mine[row.id] = { from: x.from, uri: x.to };
        }
        all[r.market] = mine;
        return { ...o, marketStreams: all };
      });
    }
    try {
      localStorage.setItem("tdj-sp-market", r.market);
    } catch {}
    setSpCheck({
      view: checkView(
        tx("exportSheet.spotify"),
        c,
        now,
        c.rows.map((x) => ({ title: x.name, artist: x.artist })),
      ),
      rows: now,
      id: r.id,
    });
    return c.ok;
  };
  /**
   * YouTube: the playlist read back with the DJ's Google account (every page), each video checked for their
   * country and replaced from the same search when it does not play, missing ones put in place (the route does
   * it, lib/youtubeVerify.ts); the sheet shows the same verified result as Spotify.
   */
  const checkYoutube = async (playlistId: string, want: YtWant[]) => {
    const region = (() => {
      try {
        return new Intl.Locale(navigator.language).maximize().region;
      } catch {
        return undefined;
      }
    })();
    const r = await directPost<{ check?: YoutubeCheck }>("/api/google/youtube", {
      verify: true,
      playlistId,
      expected: want.map(({ videoId, query }) => ({ videoId, query })),
      ...(region ? { region } : {}),
    });
    if (!r.check || !playlist) return;
    const rows = spotifyPlan().rows;
    const night = want.map(
      (w) => rows[w.row] ?? { kind: "track" as const, tanda: 0, title: w.query, artist: "" },
    );
    setYtCheck({
      view: checkView(
        tx("exportSheet.youtube"),
        r.check,
        night,
        r.check.rows.map((x) => ({ title: x.title, artist: x.channel })),
      ),
      playlistId,
      want: want.map((w, i) => ({ ...w, videoId: r.check!.videoIds[i] ?? w.videoId })),
    });
  };
  /** "Fix in Spotify": the night's rows written again in order, then read back. */
  const fixSpotify = async () => {
    if (!spCheck) return;
    setChecking(true);
    try {
      const r = await spotifyWrite(spCheck.rows, { playlistId: spCheck.id, mode: "replace" });
      if (showSpotifyCheck(r, spCheck.rows)) {
        setDone(true);
        haptic([10, 40, 10]);
      }
    } catch (e) {
      setLog((l) => [...l, `Error: ${(e as Error).message}`]);
    } finally {
      setChecking(false);
    }
  };
  /** "Check playlist": reads the linked playlist and compares it with the night, writing nothing. */
  const checkSpotify = async () => {
    if (!playlist || !targetId) return;
    setChecking(true);
    try {
      const plan = spotifyPlan();
      const rows = orderedRows(plan, found.current, overrides.marketStreams?.[rememberedMarket()]);
      showSpotifyCheck(await spotifyWrite(rows, { playlistId: targetId, mode: "check" }), rows);
    } catch (e) {
      setLog((l) => [...l, `Error: ${(e as Error).message}`]);
    } finally {
      setChecking(false);
    }
  };

  const toSpotify = async () => {
    if (!playlist) return;
    let tok = spotifyToken;
    if (hosted) {
      if (!hostedUser) return location.assign(hostedLoginUrl("/"));
    } else {
      // bring-your-own Client ID: only when the deployment has no hosted login (a hosted token never refreshes here)
      if (spotify === null || !settings.spotifyClientId) return;
      if (!tok) return beginAuth(settings.spotifyClientId);
      if (tok.expires < Date.now() + 60_000 && tok.refresh) {
        try {
          tok = await refresh(settings.spotifyClientId, tok.refresh);
          setSpotifyToken(tok);
        } catch {
          setSpotifyToken(null);
          return beginAuth(settings.spotifyClientId);
        }
      }
    }
    setBusy(true);
    setLog([]);
    setResult(null);
    setPending(null);
    setSpCheck(null);
    try {
      const plan = spotifyPlan();
      // labels and kinds by the row's own id (the id the matcher and the slots use), never a blank key
      const kinds = new Map(
        plan.rows.map((r) => [r.id, r.kind === "cortina" ? "cortina" : "track"] as const),
      );
      const labels = new Map(plan.rows.map((r) => [r.id, `${r.title} (${r.artist})`] as const));
      found.current = new Map();
      setMadeNew(!targetId);
      const m = hosted
        ? await matchHosted(plan.items, kinds, labels)
        : await matchByo(tok!.access, plan.items, labels);
      const si = await standIns(m, kinds, labels);
      // running order: matched rows go back into their own slot, so cortinas stay between the tandas
      const rows = orderedRows(plan, found.current, overrides.marketStreams?.[rememberedMarket()]);
      // the same title and description (with the set's current score) for a new playlist and an update
      const details = {
        name: tx("exportSheet.tdj", { name: playlist.name }),
        description: tx(
          includeCortinas ? "exportSheet.desc_with_cortinas" : "exportSheet.desc_without_cortinas",
          {
            n: playlist.tandas.length,
            score: playlist.score?.total ?? "–",
          },
        ),
      };
      const r = await spotifyWrite(
        rows,
        { playlistId: targetId ?? undefined, mode: "replace", details },
        tok,
      );
      rememberTarget(r.url);
      setResult({ label: tx("exportSheet.open_in_spotify"), url: r.url });
      if (targetId && r.details === false) toast(tx("exportSheet.tracks_updated_spotify_kept_the_old"));
      finishLog(r.check.inPlace, si.missing, m.paused, m.remaining.length, si.note);
      const ok = showSpotifyCheck(r, rows);
      // wave 4: the night's cover, after the verified write and never in its way (lib/cover/spotify.ts)
      coverAfterExport(
        {
          playlist,
          playlistId: r.id,
          enabled: settings.exportCover !== false,
          hosted,
          access: hosted ? spotify?.token?.access : tok?.access,
          scopes: hosted ? spotify?.scopes : tok?.scope,
        },
        (line) => setLog((l) => [...l, line]),
      );
      if (m.paused && m.remaining.length) {
        const pend = { playlistId: r.id, url: r.url, remaining: m.remaining };
        setPending(pend);
        toast(pauseMessage(m.paused), () => void tryAgain(pend), tx("exportSheet.try_again"));
        haptic([20, 30, 20]);
      } else if (ok) {
        setDone(true);
        check.current?.play();
        haptic([10, 40, 10]);
      } else haptic([20, 30, 20]);
    } catch (e) {
      setProgress(null);
      setLog((l) => [...l, `Error: ${(e as Error).message}`]);
      haptic([20, 30, 20]);
      if (!hosted && String(e).includes("401")) setSpotifyToken(null);
    } finally {
      setBusy(false);
    }
  };
  /** After a pause: match what is left and rewrite the playlist made before, every row in its own place. */
  const tryAgain = async (pend: { playlistId: string; url: string; remaining: MatchItem[] }) => {
    if (!playlist) return;
    setBusy(true);
    try {
      const plan = spotifyPlan();
      const kinds = new Map(
        plan.rows.map((r) => [r.id, r.kind === "cortina" ? "cortina" : "track"] as const),
      );
      const labels = new Map(plan.rows.map((r) => [r.id, `${r.title} (${r.artist})`] as const));
      let m: Awaited<ReturnType<typeof matchHosted>>;
      if (hosted) m = await matchHosted(pend.remaining, kinds, labels);
      else {
        const tok = spotifyToken;
        if (!tok) return;
        m = await matchByo(tok.access, pend.remaining, labels);
      }
      const si = await standIns(m, kinds, labels);
      let ok = true;
      if (m.uris.length || si.note) {
        // rewrite the whole playlist so the new matches land in their own rows, not at the end
        const rows = orderedRows(plan, found.current, overrides.marketStreams?.[rememberedMarket()]);
        ok = showSpotifyCheck(
          await spotifyWrite(rows, { playlistId: pend.playlistId, mode: "replace" }),
          rows,
        );
      }
      setLog((l) => [
        ...l,
        tx("exportSheet.added_more", {
          length: m.uris.length,
          p1: si.missing.length ? ` ${tx("exportSheet.not_found_3", { length: si.missing.length })}` : "",
          p2: m.paused
            ? tx("exportSheet.spotify_paused_again_for_s_still", {
                paused: m.paused,
                length: m.remaining.length,
              })
            : ".",
          note: si.note,
        }),
      ]);
      if (m.paused && m.remaining.length) {
        const next = { ...pend, remaining: m.remaining };
        setPending(next);
        toast(pauseMessage(m.paused), () => void tryAgain(next), tx("exportSheet.try_again"));
      } else {
        setPending(null);
        if (ok) {
          setDone(true);
          check.current?.play();
          haptic([10, 40, 10]);
        }
      }
    } catch (e) {
      setProgress(null);
      setLog((l) => [...l, `Error: ${(e as Error).message}`]);
      haptic([20, 30, 20]);
    } finally {
      setBusy(false);
    }
  };
  const toWebhook = async () => {
    if (!playlist || !webhookUrl) return;
    setHookBusy(true);
    try {
      const how = await sendToWebhook(webhookUrl, await exportText(hookFormat), hookFormat, playlist.name);
      haptic([10, 40, 10]);
      setLog((l) => [
        ...l,
        how === "ok"
          ? tx("exportSheet.webhook_accepted_the", { label: EXPORT_META[hookFormat].label })
          : tx("exportSheet.sent_the_to_the_webhook_no", { label: EXPORT_META[hookFormat].label }),
      ]);
      toast(
        how === "ok" ? tx("exportSheet.webhook_accepted_the_export") : tx("exportSheet.sent_to_the_webhook"),
      );
    } catch (e) {
      setLog((l) => [...l, `Error: ${(e as Error).message}`]);
      haptic([20, 30, 20]);
    } finally {
      setHookBusy(false);
    }
  };
  /** Through Pipedream: the chosen file to Dropbox / Google Drive, or a playlist on YouTube / Spotify. */
  const toCloud = async (a: { id: string; app: ConnectApp; label: string }) => {
    if (!playlist) return;
    setCloudBusy(a.id);
    try {
      const isFile = a.app === "dropbox" || a.app === "google_drive";
      let r: Awaited<ReturnType<typeof connectExport>>;
      if (isFile) {
        r = await connectExport({
          app: a.app,
          accountId: a.id,
          format: hookFormat,
          filename: `${playlist.name.replace(/[^a-z0-9-]+/gi, "_")}.${EXPORT_META[hookFormat].ext}`,
          text: await exportText(hookFormat),
        });
        setLog((l) => [
          ...l,
          tx("exportSheet.saved_to_2", {
            label: EXPORT_META[hookFormat].label,
            label1: a.label,
            p1: r.path ? ` (${r.path})` : "",
          }),
        ]);
      } else {
        r = await connectExport({ app: a.app, accountId: a.id, playlist, includeCortinas });
        const miss = Array.isArray(r.missing) ? r.missing.length : 0;
        setLog((l) => [
          ...l,
          tx("exportSheet.created_the_playlist_with_tracks", {
            label: a.label,
            added: r.added,
            p1: miss ? tx("exportSheet.not_found_2", { miss }) : "",
            p2: r.quota ? tx("exportSheet.youtube_s_daily_search_budget_ran") : "",
          }),
        ]);
      }
      if (typeof r.url === "string")
        setResult({ label: tx("exportSheet.open_in", { label: a.label }), url: r.url });
      haptic([10, 40, 10]);
      toast(
        isFile
          ? tx("exportSheet.saved_to", { label: a.label })
          : tx("exportSheet.playlist_created_2", { label: a.label }),
      );
    } catch (e) {
      setLog((l) => [...l, `Error: ${(e as Error).message}`]);
      haptic([20, 30, 20]);
    } finally {
      setCloudBusy(null);
    }
  };
  /** The export text of the chosen file format, with the DJ's folders and naming applied. */
  const exportText = async (format: ExportFormat) => {
    if (!playlist) throw new Error(tx("exportSheet.no_playlist"));
    const x = await fetch("/api/export", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        playlist,
        format,
        includeCortinas,
        cortinaStopSec: cortinaStop,
        folder: folderFor(format),
        naming: settings.fileNaming,
      }),
    });
    if (!x.ok) throw new Error(tx("exportSheet.export_failed", { status: x.status }));
    return x.text();
  };
  const here = () => `${location.pathname}${location.search}`;
  /** Direct: the chosen file to Dropbox or Google Drive, or a playlist on YouTube, with the sealed-cookie session. */
  const toDirect = async (target: "dropbox" | "google_drive" | "youtube") => {
    if (!playlist) return;
    const label =
      target === "dropbox"
        ? tx("exportSheet.dropbox")
        : target === "google_drive"
          ? tx("exportSheet.google_drive")
          : tx("exportSheet.youtube");
    if (target === "dropbox" && !dropbox?.user) return location.assign(dropboxLoginUrl(here()));
    if (target !== "dropbox" && !google?.user)
      return location.assign(googleLoginUrl(target === "youtube" ? "youtube" : "drive", here()));
    setCloudBusy(target);
    try {
      if (target === "youtube") {
        // like Spotify: batches of 10 searches per request, the first one creates the playlist; a quota stop
        // ends the loop and everything after it is reported as left out
        const queries = youtubeQueries(playlist, includeCortinas);
        const bs = youtubeBatches(queries);
        const common = {
          name: tx("exportSheet.tdj", { name: playlist.name }),
          includeCortinas,
          tandas: playlist.tandas.length,
        };
        let playlistId: string | null = null;
        const ytExpected: YtWant[] = [];
        let url = "";
        let added = 0;
        let missing = 0;
        let skipped = 0;
        let quota = false;
        let done = 0;
        for (const b of bs) {
          if (quota) {
            skipped += b.length;
            continue;
          }
          setYtProgress(
            tx("exportSheet.adding_of", {
              p1: Math.min(done + b.length, queries.length),
              length: queries.length,
            }),
          );
          const body: Record<string, unknown> = { ...common, queries: b };
          if (playlistId) body.playlistId = playlistId;
          const r: YoutubeResult = await directPost<YoutubeResult>("/api/google/youtube", body);
          playlistId = r.id;
          url = r.url;
          added += r.added;
          missing += r.missing.length;
          skipped += r.skipped?.length ?? 0;
          for (const v of r.videos ?? [])
            ytExpected.push({ videoId: v.videoId, query: b[v.at]!, row: done + v.at });
          if (r.quota) quota = true;
          done += b.length;
        }
        setYtProgress(null);
        // what YouTube holds, read back with the DJ's account and put right (unavailable videos replaced)
        if (playlistId && ytExpected.length) await checkYoutube(playlistId, ytExpected);
        setLog((l) => [
          ...l,
          tx("exportSheet.created_the_youtube_playlist_with_tracks", {
            added,
            p1: missing ? tx("exportSheet.not_found", { missing }) : "",
            p2: skipped ? tx("exportSheet.left_out_youtube_s_daily_search", { skipped }) : "",
          }),
        ]);
        if (url) setResult({ label: tx("exportSheet.open_in_youtube"), url });
        toast(
          skipped
            ? tx("exportSheet.youtube_playlist_created_part_left_out")
            : tx("exportSheet.youtube_playlist_created"),
        );
      } else {
        const filename = `${playlist.name.replace(/[^a-z0-9-]+/gi, "_")}.${EXPORT_META[hookFormat].ext}`;
        const text = await exportText(hookFormat);
        const r = await directPost<FileResult>(
          target === "dropbox" ? "/api/dropbox/upload" : "/api/google/drive",
          { format: hookFormat, filename, text, set: playlist.name },
        );
        // the file itself read back before it went up, and what the drive holds asked again after
        const fc = verifyFile(hookFormat, text, includeCortinas ? playlist : withoutCortinas(playlist), {
          includeCortinas,
          folder: folderFor(hookFormat),
        });
        setLog((l) => [
          ...l,
          tx("exportSheet.saved_to_2", {
            label: EXPORT_META[hookFormat].label,
            label1: label,
            p1: r.path ? ` (${r.path})` : "",
          }),
          fileCheckLine(tx("exportCheck.file_label", { label: EXPORT_META[hookFormat].label }), fc),
          uploadCheckLine(label, r.verified),
        ]);
        if (r.url) setResult({ label: tx("exportSheet.open_in", { label }), url: r.url });
        toast(tx("exportSheet.saved_to", { label }));
      }
      haptic([10, 40, 10]);
    } catch (e) {
      setYtProgress(null);
      setLog((l) => [...l, `Error: ${(e as Error).message}`]);
      haptic([20, 30, 20]);
    } finally {
      setCloudBusy(null);
    }
  };
  /** Downloads the title/artist/album CSV and opens the chosen service's import page in a new tab. */
  const toTransfer = () => {
    if (!playlist) return;
    const service = TRANSFER_SERVICES.find((t) => t.id === transfer) ?? TRANSFER_SERVICES[0]!;
    const rows = transferRows(playlist, includeCortinas).length;
    const csv = transferCsv(playlist, includeCortinas);
    downloadBlob(`${playlist.name.replace(/[^a-z0-9-]+/gi, "_")}-${service.id}.csv`, csv, "text/csv");
    window.open(service.importUrl, "_blank", "noreferrer");
    haptic(6);
    const fc = verifyFile("transfer", csv, includeCortinas ? playlist : withoutCortinas(playlist), {
      includeCortinas,
    });
    toast(
      `${tx("exportSheet.downloaded_rows_for", { rows, label: service.label })} · ${fileCheckLine(tx("exportCheck.file_label", { label: service.label }), fc)}`,
    );
  };
  const saveHook = () => {
    const v = hookDraft.trim();
    if (v && !/^https:\/\//i.test(v)) {
      toast(tx("exportSheet.the_webhook_must_be_an_https"));
      return;
    }
    updateOverrides((o) => ({ ...o, connectors: { ...(o.connectors ?? {}), webhookUrl: v || undefined } }));
    setHookOpen(false);
  };

  const spotifyButton = (
    <>
      <button
        type="button"
        onClick={pending ? () => void tryAgain(pending) : toSpotify}
        disabled={busy || done || (!hosted && !settings.spotifyClientId)}
        className="btn btn-primary w-full"
        aria-describedby={hosted || settings.spotifyClientId ? undefined : "spotify-why"}
        id="spotify-create"
      >
        {(done || busy) && (
          <span className="inline-grid h-6 w-6 place-items-center" aria-hidden>
            {done ? (
              <DotLottieReact
                src="/anim/success-check.json"
                autoplay={!reduced}
                loop={false}
                dotLottieRefCallback={(d) => {
                  check.current = d;
                  if (reduced) d?.setFrame(35);
                }}
                style={{ width: 24, height: 24 }}
              />
            ) : (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            )}
          </span>
        )}
        <span className="relative inline-grid">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={done ? "done" : "idle"}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: DUR.fast }}
              className="col-start-1 row-start-1"
            >
              {done
                ? madeNew
                  ? tx("exportSheet.playlist_created")
                  : tx("exportSheet.playlist_updated")
                : busy && progress
                  ? progress
                  : pending
                    ? tx("exportSheet.try_again_left", { length: pending.remaining.length })
                    : hosted
                      ? hostedUser
                        ? targetId
                          ? tx("exportSheet.update_playlist_in_spotify")
                          : tx("exportSheet.create_playlist_in_spotify")
                        : tx("exportSheet.log_in_with_spotify_and_create")
                      : spotifyToken
                        ? targetId
                          ? tx("exportSheet.update_playlist_in_spotify")
                          : tx("exportSheet.create_playlist_in_spotify")
                        : tx("exportSheet.connect_spotify_and_create_playlist")}
            </motion.span>
          </AnimatePresence>
        </span>
      </button>
      {!hosted && !settings.spotifyClientId && (
        <p id="spotify-why" className="section-foot mt-2 text-center">
          {tx("exportSheet.needs_a_spotify_client_id_add", { p1: " " })}
          <Link href="/settings" className="text-[var(--tint)]">
            {tx("exportSheet.settings")}
          </Link>
          .
        </p>
      )}
    </>
  );

  if (!playlist) return null;
  /**
   * The pinned footer is the best destination that works right now (round8-ux.md §1.9): Spotify once it is
   * logged in / connected, otherwise the M3U8 that VLC and the Booth play with no set-up; Spotify stays a row
   * until then, never a disabled primary.
   */
  const spotifyReady = hosted ? !!hostedUser : !!spotifyToken;
  const footer = spotifyReady ? (
    spotifyButton
  ) : (
    <button
      type="button"
      className="btn btn-primary min-h-[50px] w-full"
      onClick={() => dl("m3u8")}
      disabled={dlBusy !== null}
      data-testid="export-primary"
    >
      <FileDown size={18} aria-hidden /> {tx("exportSheet.save_for_vlc_and_the_booth")}
    </button>
  );
  const countLine = (
    <span id="export-count">
      <CountUp value={tracks} /> {tracks === 1 ? tx("exportSheet.song") : tx("exportSheet.songs")}
      {includeCortinas
        ? ` + ${cortinas} ${cortinas === 1 ? tx("exportSheet.cortina") : tx("exportSheet.cortinas")}`
        : ""}{" "}
      (
      <CountUp value={count} /> {count === 1 ? tx("exportSheet.file") : tx("exportSheet.files")})
      {includeCortinas ? "" : ` ${tx("exportSheet.cortinas_left_out_2", { cortinas })}`}.
    </span>
  );
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={tx("exportSheet.export")}
      describedBy="export-count"
      testId="export-sheet"
      detents={["large"]}
      footer={footer}
    >
      <ShareNightEntry playlist={playlist} />
      <Group
        footer={
          includeCortinas
            ? // 2026-11: files and the Booth start a cortina at its chorus; a Spotify playlist cannot carry a start
              settings.cortinaHookStart !== false
              ? tx("exportSheet.cortinas_stop_at_s_after_chorus", { cortinaStop })
              : tx("exportSheet.cortinas_stop_at_s_in_files", { cortinaStop })
            : tx("exportSheet.no_cortinas_in_the_files_or")
        }
      >
        <SwitchRow
          label={tx("exportSheet.include_cortinas")}
          checked={includeCortinas}
          onChange={setIncludeCortinas}
        />
        {includeCortinas && (
          <StepperRow
            label={tx("exportSheet.cortina_play_length")}
            sub={
              settings.cortinaStopSec === null
                ? tx("exportSheet.follows_the_composer")
                : tx("exportSheet.set_in_playback")
            }
            value={cortinaStop}
            unit=" s"
            min={CORTINA_STOP_RANGE.min}
            max={CORTINA_STOP_RANGE.max}
            step={CORTINA_STOP_RANGE.step}
            onChange={(v) => setSettings({ cortinaStopSec: v })}
          />
        )}
      </Group>
      <Group
        header={tx("exportSheet.send_to")}
        footer={
          accounts.length || googleOn || dropboxOn
            ? tx("exportSheet.spotify_creates_a_playlist_in_your_3", {
                p1: hasFileTarget ? tx("exportSheet.cloud_folders_receive_the_file_format") : "",
                p2:
                  googleOn || listAccounts.some((a) => a.app === "youtube_data_api")
                    ? tx("exportSheet.youtube_matching_shares_a_daily_budget")
                    : "",
              })
            : webhookUrl
              ? tx("exportSheet.the_chosen_format_is_posted_to")
              : hosted
                ? tx("exportSheet.spotify_creates_a_playlist_in_your_2")
                : tx("exportSheet.spotify_creates_a_playlist_in_your")
        }
      >
        <Row
          tile={
            <Tile color="#1db954">
              <Radio size={16} strokeWidth={2} />
            </Tile>
          }
          label={tx("exportSheet.spotify")}
          sub={!hosted && !settings.spotifyClientId ? tx("exportSheet.set_up_in_settings") : undefined}
          value={
            hosted
              ? hostedUser
                ? hostedUser.name
                : tx("exportSheet.log_in")
              : spotifyToken
                ? tx("exportSheet.connected")
                : settings.spotifyClientId
                  ? tx("exportSheet.connect")
                  : tx("exportSheet.set_up")
          }
          chevron
          onClick={!hosted && !settings.spotifyClientId ? () => location.assign("/settings") : toSpotify}
          disabled={busy || done}
          busy={busy}
          id="send-spotify"
        />
        <label htmlFor="spotify-target" className="cell flex-col items-stretch gap-1">
          <span className="text-footnote text-[var(--label-2)]">
            {targetId
              ? tx("exportSheet.updates_this_playlist_in_place_in")
              : tx("exportSheet.to_update_a_playlist_made_before")}
          </span>
          {/* wave 4: the system font at 15 pt, middle-truncated while it is not being edited (a monospace 17 pt
              address ran off the sheet's edge) */}
          <input
            id="spotify-target"
            className="field text-subhead min-h-[36px] truncate"
            inputMode="url"
            placeholder="https://open.spotify.com/playlist/…"
            value={targetFocused ? target : middleTruncate(target, 38)}
            onFocus={() => setTargetFocused(true)}
            onBlur={() => setTargetFocused(false)}
            onChange={(e) => setTarget(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        {targetId && spotifyReady && (
          <ActionRow
            label={checking && !spCheck ? tx("exportCheck.checking") : tx("exportCheck.check_playlist")}
            onClick={() => void checkSpotify()}
            busy={checking}
            disabled={busy}
            id="spotify-check"
          />
        )}
        <Row
          tile={
            <Tile color="#1db954">
              <ArrowRightLeft size={16} strokeWidth={2} />
            </Tile>
          }
          label={tx("exportSheet.spotify_via_a_transfer_service")}
          sub={tx("exportSheet.any_spotify_account_tunemymusic_or_soundiiz")}
          value={tx("exportSheet.csv")}
          chevron
          onClick={() => setTransferOpen(true)}
          id="send-transfer"
        />
        {!googleOn && google !== null && (
          <Row
            tile={
              <Tile color="#ff0000">
                <ListVideo size={16} strokeWidth={2} />
              </Tile>
            }
            label={tx("exportSheet.youtube")}
            sub={tx("exportSheet.connect_in_settings")}
            value={tx("exportSheet.off")}
            disabled
            className="text-[var(--label-2)]"
            id="send-youtube-off"
          />
        )}
        {googleOn && (
          <Row
            tile={
              <Tile color="#ff0000">
                <ListVideo size={16} strokeWidth={2} />
              </Tile>
            }
            label={tx("exportSheet.youtube")}
            sub={ytProgress ?? google?.user?.email ?? google?.user?.name}
            value={
              ytProgress
                ? ""
                : !google?.user
                  ? tx("exportSheet.connect")
                  : google.scopes?.youtube
                    ? tx("exportSheet.create_playlist")
                    : tx("exportSheet.allow")
            }
            chevron
            onClick={() => toDirect("youtube")}
            busy={cloudBusy === "youtube"}
            disabled={!!cloudBusy}
            id="send-youtube"
          />
        )}
        {listAccounts.map((a) => (
          <Row
            key={a.id}
            tile={
              <Tile color={a.app === "youtube_data_api" ? "#ff0000" : "#1db954"}>
                {a.app === "youtube_data_api" ? (
                  <ListVideo size={16} strokeWidth={2} />
                ) : (
                  <Radio size={16} strokeWidth={2} />
                )}
              </Tile>
            }
            label={tx("exportSheet.via_pipedream", { label: a.label })}
            sub={a.name}
            value={tx("exportSheet.create_playlist")}
            chevron
            onClick={() => toCloud(a)}
            busy={cloudBusy === a.id}
            disabled={!!cloudBusy}
            id={`send-pd-${a.app}`}
          />
        ))}
        {(hasFileTarget || webhookUrl) && (
          <PickerRow
            label={tx("exportSheet.file_format")}
            ariaLabel={tx("exportSheet.file_format")}
            value={hookFormat}
            items={FORMAT_ITEMS}
            onChange={(f) => f && setHookFormat(f)}
            tile={
              <Tile color="#ff9500">
                <FileDown size={16} strokeWidth={2} />
              </Tile>
            }
          />
        )}
        {!dropboxOn && dropbox !== null && (
          <Row
            tile={
              <Tile color="#0061ff">
                <Cloud size={16} strokeWidth={2} />
              </Tile>
            }
            label={tx("exportSheet.save_to_dropbox")}
            sub={tx("exportSheet.connect_in_settings")}
            value={tx("exportSheet.off")}
            disabled
            className="text-[var(--label-2)]"
            id="send-dropbox-off"
          />
        )}
        {dropboxOn && (
          <Row
            tile={
              <Tile color="#0061ff">
                <Cloud size={16} strokeWidth={2} />
              </Tile>
            }
            label={tx("exportSheet.save_to_dropbox")}
            sub={dropbox?.user?.email ?? dropbox?.user?.name}
            value={dropbox?.user ? `.${EXPORT_META[hookFormat].ext}` : tx("exportSheet.connect")}
            chevron
            onClick={() => toDirect("dropbox")}
            busy={cloudBusy === "dropbox"}
            disabled={!!cloudBusy}
            id="send-dropbox"
          />
        )}
        {!googleOn && google !== null && (
          <Row
            tile={
              <Tile color="#1fa463">
                <HardDrive size={16} strokeWidth={2} />
              </Tile>
            }
            label={tx("exportSheet.save_to_google_drive")}
            sub={tx("exportSheet.connect_in_settings")}
            value={tx("exportSheet.off")}
            disabled
            className="text-[var(--label-2)]"
            id="send-google_drive-off"
          />
        )}
        {googleOn && (
          <Row
            tile={
              <Tile color="#1fa463">
                <HardDrive size={16} strokeWidth={2} />
              </Tile>
            }
            label={tx("exportSheet.save_to_google_drive")}
            sub={google?.user?.email ?? google?.user?.name}
            value={
              !google?.user
                ? tx("exportSheet.connect")
                : google.scopes?.drive
                  ? `.${EXPORT_META[hookFormat].ext}`
                  : tx("exportSheet.allow")
            }
            chevron
            onClick={() => toDirect("google_drive")}
            busy={cloudBusy === "google_drive"}
            disabled={!!cloudBusy}
            id="send-google_drive"
          />
        )}
        {fileAccounts.map((a) => (
          <Row
            key={a.id}
            tile={
              <Tile color={a.app === "dropbox" ? "#0061ff" : "#1fa463"}>
                {a.app === "dropbox" ? (
                  <Cloud size={16} strokeWidth={2} />
                ) : (
                  <HardDrive size={16} strokeWidth={2} />
                )}
              </Tile>
            }
            label={tx("exportSheet.save_to_via_pipedream", { label: a.label })}
            sub={a.name}
            value={`.${EXPORT_META[hookFormat].ext}`}
            chevron
            onClick={() => toCloud(a)}
            busy={cloudBusy === a.id}
            disabled={!!cloudBusy}
            id={`send-pd-${a.app}`}
          />
        ))}
        {webhookUrl ? (
          <Row
            tile={
              <Tile color="#5856d6">
                <Webhook size={16} strokeWidth={2} />
              </Tile>
            }
            label={tx("exportSheet.send_to_webhook")}
            sub={webhookUrl.replace(/^https?:\/\//, "").slice(0, 48)}
            chevron
            onClick={toWebhook}
            busy={hookBusy}
            id="send-webhook"
          />
        ) : (
          <Row
            tile={
              <Tile color="#5856d6">
                <Webhook size={16} strokeWidth={2} />
              </Tile>
            }
            label={tx("exportSheet.webhook")}
            value={tx("exportSheet.set_up")}
            chevron
            onClick={() => {
              setHookDraft(webhookUrl);
              setHookOpen(true);
            }}
          />
        )}
      </Group>
      {GROUPS.map(([g, keys]) => (
        <Group
          key={g}
          header={g}
          footer={
            g === "DJ software" ? (
              <>
                {countLine}
                {noFolders && (
                  <>
                    {tx("exportSheet.your_dj_app_finds_the_songs", { p1: " ", p2: " " })}
                    <Link href="/settings" className="text-[var(--tint)]">
                      {tx("exportSheet.settings")}
                    </Link>
                    .
                  </>
                )}
              </>
            ) : undefined
          }
        >
          {keys.map((f) => (
            <Row
              key={f}
              tile={
                <span className="tile" style={{ background: TILE_COLOR[f] }} aria-hidden>
                  <FileDown size={16} strokeWidth={2} />
                </span>
              }
              label={EXPORT_META[f].label}
              sub={folderFor(f) ? tx("exportSheet.paths_under", { p1: folderFor(f) }) : undefined}
              value={`.${EXPORT_META[f].ext}`}
              chevron={justDone !== f}
              onClick={() => dl(f)}
              busy={dlBusy === f}
            >
              {justDone === f && (
                <motion.span
                  initial={reduced ? { opacity: 0 } : { scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={SPRING.snappy}
                  className="cell-chevron inline-flex text-[var(--system-green)]"
                  aria-label={tx("exportSheet.downloaded")}
                >
                  <Check size={16} strokeWidth={2.5} />
                </motion.span>
              )}
            </Row>
          ))}
        </Group>
      ))}
      <Sheet
        open={hookOpen}
        onClose={() => setHookOpen(false)}
        title={tx("exportSheet.webhook")}
        trailing={tx("exportSheet.save")}
        onTrailing={saveHook}
        detents={["medium"]}
      >
        <Group
          header={tx("exportSheet.webhook_url")}
          footer={tx("exportSheet.paste_the_address_of_a_pipedream")}
        >
          <label htmlFor="webhook-url" className="cell">
            <span className="sr-only">{tx("exportSheet.webhook_url")}</span>
            <input
              id="webhook-url"
              className="field text-subhead"
              data-autofocus
              inputMode="url"
              placeholder="https://eo…m.pipedream.net/…"
              value={hookDraft}
              onChange={(e) => setHookDraft(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
        </Group>
      </Sheet>
      <Sheet
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        title={tx("exportSheet.spotify_via_a_transfer_service")}
        trailing={tx("exportSheet.done")}
        detents={["large"]}
        testId="transfer-sheet"
      >
        <Group
          header={tx("exportSheet.service")}
          footer={tx("exportSheet.works_with_any_spotify_account_and")}
        >
          <SegmentedRow
            label={tx("exportSheet.transfer_with")}
            value={transfer}
            items={TRANSFER_SERVICES.map((t) => [t.id, t.label])}
            onChange={setTransfer}
          />
        </Group>
        <Group header={tx("exportSheet.three_steps")} id="transfer-steps">
          {(TRANSFER_SERVICES.find((t) => t.id === transfer) ?? TRANSFER_SERVICES[0]!).steps.map(
            (step, i) => (
              <div key={step} className="cell items-start">
                <span className="w-5 shrink-0 text-[var(--label-2)] tabular-nums">{i + 1}.</span>
                <span className="min-w-0 flex-1 whitespace-normal">{step}</span>
              </div>
            ),
          )}
        </Group>
        <Group
          footer={tx("exportSheet.a_csv_with_the_columns_title", {
            p1: playlist ? transferRows(playlist, includeCortinas).length : 0,
            p2: includeCortinas ? tx("exportSheet.cortinas_included") : tx("exportSheet.cortinas_left_out"),
          })}
        >
          <ActionRow
            label={tx("exportSheet.download_csv_and_open", {
              label: (TRANSFER_SERVICES.find((t) => t.id === transfer) ?? TRANSFER_SERVICES[0]!).label,
            })}
            onClick={toTransfer}
            id="transfer-download"
          />
        </Group>
      </Sheet>
      {result && (
        <Group>
          <ActionRow label={result.label} onClick={() => window.open(result.url, "_blank", "noreferrer")} />
        </Group>
      )}
      <div role="status" aria-live="polite">
        {spCheck && (
          <ExportCheck
            view={spCheck.view}
            onFix={() => void fixSpotify()}
            fixing={checking}
            id="spotify-verified"
          />
        )}
        {ytCheck && (
          <ExportCheck
            view={ytCheck.view}
            onFix={() => {
              setChecking(true);
              void checkYoutube(ytCheck.playlistId, ytCheck.want)
                .catch((e) => setLog((l) => [...l, `Error: ${(e as Error).message}`]))
                .finally(() => setChecking(false));
            }}
            fixing={checking}
            id="youtube-verified"
          />
        )}
        {log.length > 0 && (
          <Group header={tx("exportSheet.progress")}>
            <div className="cell text-footnote whitespace-pre-wrap text-[var(--label-2)]">
              {log.join("\n")}
            </div>
          </Group>
        )}
        {notMatched.length > 0 && (
          <Group
            header={tx("exportSheet.not_matched", { length: notMatched.length })}
            footer={tx("exportSheet.no_streaming_track_is_confidently_this")}
          >
            <ul data-testid="export-missing" className="cell text-footnote text-[var(--label-2)]">
              {notMatched.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </Group>
        )}
      </div>
    </Sheet>
  );
}
