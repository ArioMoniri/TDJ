"use client";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import { EXPORT_META, type ExportFormat } from "@tdj/core";
import { ArrowRightLeft, Check, Cloud, FileDown, HardDrive, ListVideo, Radio, Webhook } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { downloadBlob } from "@/lib/download";
import { withoutCortinas } from "@/lib/exportPaths";
import { haptic } from "@/lib/haptics";
import type { Match, MatchItem } from "@/lib/match";
import { DUR, SPRING } from "@/lib/motion";
import {
  addToPlaylist,
  beginAuth,
  type ConnectApp,
  connectExport,
  createPlaylist,
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
  useConnectors,
  type YoutubeResult,
} from "@/lib/spotify";
import { batches, spotifyPlanFor } from "@/lib/spotifyPlan";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { TRANSFER_SERVICES, type TransferService, transferCsv, transferRows } from "@/lib/transferCsv";
import { CORTINA_STOP_RANGE, cortinaStopSec, DJ_APPS, type DjApp, type Playlist } from "@/lib/types";
import { CountUp } from "./CountUp";
import { ActionRow, Group, PickerRow, Row, SegmentedRow, StepperRow, SwitchRow, Tile } from "./Form";
import { Sheet } from "./Sheet";

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
    if (!r.ok) throw new Error(`Webhook answered ${r.status}`);
    return "ok";
  } catch (e) {
    if (e instanceof Error && /answered \d+/.test(e.message)) throw e;
    await fetch(u.toString(), { ...init, mode: "no-cors", headers: { "content-type": "text/plain" } });
    return "sent";
  }
}

const GROUPS: Array<[string, ExportFormat[]]> = [
  ["DJ software", ["rekordbox", "traktor", "serato"]],
  ["Playlist files", ["m3u8", "xspf", "csv"]],
  ["Other", ["json", "setlist"]],
];
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
  const webhookUrl = overrides.connectors?.webhookUrl ?? "";
  const [hookFormat, setHookFormat] = useState<ExportFormat>("m3u8");
  const [hookBusy, setHookBusy] = useState(false);
  const [hookOpen, setHookOpen] = useState(false);
  const [hookDraft, setHookDraft] = useState("");
  /** "Spotify via a transfer service": the CSV any Spotify account can import through TuneMyMusic or Soundiiz */
  const [transferOpen, setTransferOpen] = useState(false);
  const [transfer, setTransfer] = useState<TransferService["id"]>("tunemymusic");
  const [log, setLog] = useState<string[]>([]);
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
  const check = useRef<{ play: () => void } | null>(null);
  const reduced = useReducedMotion();

  // a fresh open starts clean: no stale "Playlist created" state
  useEffect(() => {
    if (open) {
      setDone(false);
      setResult(null);
      setLog([]);
      setPending(null);
      setProgress(null);
    }
  }, [open]);

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
      if (!r.ok) throw new Error(`Export failed (${r.status})`);
      downloadBlob(`${playlist.name.replace(/[^a-z0-9-]+/gi, "_")}.${m.ext}`, await r.text(), m.mime);
      haptic(6);
      toast(`Downloaded ${m.label} (.${m.ext})`);
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
          spotify: { uri: m.uri, url: m.url, durationMs: m.durationMs, album: m.album },
        };
      return { ...o, songs: next };
    });
  };
  const pauseMessage = (sec: number) =>
    `Spotify is pausing searches for ${sec} s; the playlist will contain the tracks found so far, try again in a minute to add the rest`;
  /**
   * Hosted: the unresolved recordings go to the server in batches of 10 (one search in flight at a time there);
   * a rate limit ends the matching cleanly and the playlist is made with what was found.
   */
  const matchHosted = async (items: MatchItem[], kinds: Map<string, string>, labels: Map<string, string>) => {
    const uris: string[] = [];
    const missing: string[] = [];
    let paused: number | undefined;
    let remaining: MatchItem[] = [];
    const bs = batches(items);
    let done = 0;
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i]!;
      setProgress(`Matching ${Math.min(done + b.length, items.length)} of ${items.length}…`);
      const r = await hostedMatch(b);
      for (const m of r.matches) uris.push(m.uri);
      persistMatches(r.matches, kinds);
      for (const id of r.missing) missing.push(labels.get(id) ?? id);
      if (r.rateLimited) {
        paused = r.rateLimited;
        const seen = new Set([...r.matches.map((m) => m.id), ...r.missing]);
        remaining = [...b.filter((x) => !seen.has(x.id)), ...bs.slice(i + 1).flat()];
        break;
      }
      done += b.length;
    }
    setProgress(null);
    return { uris, missing, paused, remaining };
  };
  /** BYO: the same scorer, searching from this browser with the DJ's own Client ID. */
  const matchByo = async (token: string, items: MatchItem[], labels: Map<string, string>) => {
    const uris: string[] = [];
    const missing: string[] = [];
    let paused: number | undefined;
    let remaining: MatchItem[] = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i]!;
      setProgress(`Matching ${i + 1} of ${items.length}…`);
      try {
        const r = await resolveTrack(token, it);
        if (r) uris.push(r.uri);
        else missing.push(labels.get(it.id) ?? it.title);
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
    return { uris, missing, paused, remaining };
  };
  const finishLog = (added: number, missing: string[], paused?: number, left = 0) =>
    setLog((l) => [
      ...l,
      `${added} tracks in the playlist${missing.length ? ` (${missing.length} not found: ${missing.slice(0, 3).join(", ")}${missing.length > 3 ? "…" : ""})` : ""}${paused ? `. Spotify paused searches for ${paused} s: ${left} still to match.` : "."}`,
    ]);

  const toSpotify = async () => {
    if (!playlist) return;
    if (hosted) {
      if (!hostedUser) return location.assign(hostedLoginUrl("/"));
      setBusy(true);
      setLog([]);
      setResult(null);
      setPending(null);
      try {
        const plan = spotifyPlanFor(includeCortinas ? playlist : withoutCortinas(playlist), overrides, {
          includeCortinas,
        });
        const kinds = new Map(plan.tracks.map((t) => [t.id ?? "", t.kind] as const));
        const labels = new Map(plan.tracks.map((t) => [t.id ?? "", `${t.title} (${t.artist})`] as const));
        const m = await matchHosted(plan.items, kinds, labels);
        const r = await hostedCreatePlaylist({
          uris: [...plan.uris, ...m.uris],
          includeCortinas,
          name: `TDJ · ${playlist.name}`,
          description: `${playlist.tandas.length} tandas composed with TDJ, cortinas ${includeCortinas ? "included" : "excluded"}. Score ${playlist.score?.total ?? "–"}/100.`,
        });
        setResult({ label: "Open in Spotify", url: r.url });
        finishLog(r.added, m.missing, m.paused, m.remaining.length);
        if (m.paused && m.remaining.length) {
          const pend = { playlistId: r.id, url: r.url, remaining: m.remaining };
          setPending(pend);
          toast(pauseMessage(m.paused), () => void tryAgain(pend), "Try again");
          haptic([20, 30, 20]);
        } else {
          setDone(true);
          check.current?.play();
          haptic([10, 40, 10]);
        }
      } catch (e) {
        setProgress(null);
        setLog((l) => [...l, `Error: ${(e as Error).message}`]);
        haptic([20, 30, 20]);
      } finally {
        setBusy(false);
      }
      return;
    }
    // bring-your-own Client ID: only when the deployment has no hosted login (a hosted token never refreshes here)
    if (spotify === null || !settings.spotifyClientId) return;
    let tok = spotifyToken;
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
    setBusy(true);
    setLog([]);
    setResult(null);
    setPending(null);
    try {
      const plan = spotifyPlanFor(includeCortinas ? playlist : withoutCortinas(playlist), overrides, {
        includeCortinas,
      });
      const labels = new Map(plan.tracks.map((t) => [t.id ?? "", `${t.title} (${t.artist})`] as const));
      const m = await matchByo(tok.access, plan.items, labels);
      const uris = [...plan.uris, ...m.uris];
      const pl = await createPlaylist(
        tok.access,
        `TDJ · ${playlist.name}`,
        `${playlist.tandas.length} tandas composed with TDJ, cortinas ${includeCortinas ? "included" : "excluded"}. Score ${playlist.score.total}/100.`,
        uris,
      );
      setResult({ label: "Open in Spotify", url: pl.external_urls.spotify });
      finishLog(uris.length, m.missing, m.paused, m.remaining.length);
      if (m.paused && m.remaining.length) {
        const pend = { playlistId: pl.id, url: pl.external_urls.spotify, remaining: m.remaining };
        setPending(pend);
        toast(pauseMessage(m.paused), () => void tryAgain(pend), "Try again");
      } else {
        setDone(true);
        check.current?.play();
        haptic([10, 40, 10]);
      }
    } catch (e) {
      setProgress(null);
      setLog((l) => [...l, `Error: ${(e as Error).message}`]);
      haptic([20, 30, 20]);
      if (String(e).includes("401")) setSpotifyToken(null);
    } finally {
      setBusy(false);
    }
  };
  /** After a pause: match what is left and append it to the playlist made before. */
  const tryAgain = async (pend: { playlistId: string; url: string; remaining: MatchItem[] }) => {
    if (!playlist) return;
    setBusy(true);
    try {
      const plan = spotifyPlanFor(includeCortinas ? playlist : withoutCortinas(playlist), overrides, {
        includeCortinas,
      });
      const kinds = new Map(plan.tracks.map((t) => [t.id ?? "", t.kind] as const));
      const labels = new Map(plan.tracks.map((t) => [t.id ?? "", `${t.title} (${t.artist})`] as const));
      let m: Awaited<ReturnType<typeof matchHosted>>;
      if (hosted) m = await matchHosted(pend.remaining, kinds, labels);
      else {
        const tok = spotifyToken;
        if (!tok) return;
        m = await matchByo(tok.access, pend.remaining, labels);
      }
      if (m.uris.length) {
        if (hosted)
          await hostedCreatePlaylist({
            uris: m.uris,
            playlistId: pend.playlistId,
            url: pend.url,
            includeCortinas,
          });
        else if (spotifyToken) await addToPlaylist(spotifyToken.access, pend.playlistId, m.uris);
      }
      setLog((l) => [
        ...l,
        `Added ${m.uris.length} more${m.missing.length ? ` (${m.missing.length} not found)` : ""}${m.paused ? `. Spotify paused again for ${m.paused} s: ${m.remaining.length} still to match.` : "."}`,
      ]);
      if (m.paused && m.remaining.length) {
        const next = { ...pend, remaining: m.remaining };
        setPending(next);
        toast(pauseMessage(m.paused), () => void tryAgain(next), "Try again");
      } else {
        setPending(null);
        setDone(true);
        check.current?.play();
        haptic([10, 40, 10]);
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
          ? `Webhook accepted the ${EXPORT_META[hookFormat].label}.`
          : `Sent the ${EXPORT_META[hookFormat].label} to the webhook (no CORS reply, so no confirmation).`,
      ]);
      toast(how === "ok" ? "Webhook accepted the export" : "Sent to the webhook");
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
          `Saved ${EXPORT_META[hookFormat].label} to ${a.label}${r.path ? ` (${r.path})` : ""}.`,
        ]);
      } else {
        r = await connectExport({ app: a.app, accountId: a.id, playlist, includeCortinas });
        const miss = Array.isArray(r.missing) ? r.missing.length : 0;
        setLog((l) => [
          ...l,
          `Created the ${a.label} playlist with ${r.added} tracks${miss ? `, ${miss} not found` : ""}${r.quota ? " (YouTube's daily search budget ran out; the rest fills in another day)" : ""}.`,
        ]);
      }
      if (typeof r.url === "string") setResult({ label: `Open in ${a.label}`, url: r.url });
      haptic([10, 40, 10]);
      toast(isFile ? `Saved to ${a.label}` : `${a.label} playlist created`);
    } catch (e) {
      setLog((l) => [...l, `Error: ${(e as Error).message}`]);
      haptic([20, 30, 20]);
    } finally {
      setCloudBusy(null);
    }
  };
  /** The export text of the chosen file format, with the DJ's folders and naming applied. */
  const exportText = async (format: ExportFormat) => {
    if (!playlist) throw new Error("No playlist");
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
    if (!x.ok) throw new Error(`Export failed (${x.status})`);
    return x.text();
  };
  const here = () => `${location.pathname}${location.search}`;
  /** Direct: the chosen file to Dropbox or Google Drive, or a playlist on YouTube, with the sealed-cookie session. */
  const toDirect = async (target: "dropbox" | "google_drive" | "youtube") => {
    if (!playlist) return;
    const label = target === "dropbox" ? "Dropbox" : target === "google_drive" ? "Google Drive" : "YouTube";
    if (target === "dropbox" && !dropbox?.user) return location.assign(dropboxLoginUrl(here()));
    if (target !== "dropbox" && !google?.user)
      return location.assign(googleLoginUrl(target === "youtube" ? "youtube" : "drive", here()));
    setCloudBusy(target);
    try {
      if (target === "youtube") {
        const r = await directPost<YoutubeResult>("/api/google/youtube", { playlist, includeCortinas });
        const miss = r.missing.length;
        const skipped = r.skipped?.length ?? 0;
        setLog((l) => [
          ...l,
          `Created the YouTube playlist with ${r.added} tracks${miss ? `, ${miss} not found` : ""}${skipped ? `, ${skipped} left out (YouTube's daily search budget ran out; try the rest another day)` : ""}.`,
        ]);
        setResult({ label: "Open in YouTube", url: r.url });
        toast(skipped ? "YouTube playlist created, part left out" : "YouTube playlist created");
      } else {
        const filename = `${playlist.name.replace(/[^a-z0-9-]+/gi, "_")}.${EXPORT_META[hookFormat].ext}`;
        const text = await exportText(hookFormat);
        const r = await directPost<FileResult>(
          target === "dropbox" ? "/api/dropbox/upload" : "/api/google/drive",
          { format: hookFormat, filename, text, set: playlist.name },
        );
        setLog((l) => [
          ...l,
          `Saved ${EXPORT_META[hookFormat].label} to ${label}${r.path ? ` (${r.path})` : ""}.`,
        ]);
        if (r.url) setResult({ label: `Open in ${label}`, url: r.url });
        toast(`Saved to ${label}`);
      }
      haptic([10, 40, 10]);
    } catch (e) {
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
    downloadBlob(
      `${playlist.name.replace(/[^a-z0-9-]+/gi, "_")}-${service.id}.csv`,
      transferCsv(playlist, includeCortinas),
      "text/csv",
    );
    window.open(service.importUrl, "_blank", "noreferrer");
    haptic(6);
    toast(`Downloaded ${rows} rows for ${service.label}`);
  };
  const saveHook = () => {
    const v = hookDraft.trim();
    if (v && !/^https:\/\//i.test(v)) {
      toast("The webhook must be an https:// URL");
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
                ? "Playlist created"
                : busy && progress
                  ? progress
                  : pending
                    ? `Try again · ${pending.remaining.length} left`
                    : hosted
                      ? hostedUser
                        ? "Create playlist in Spotify"
                        : "Log in with Spotify and create playlist"
                      : spotifyToken
                        ? "Create playlist in Spotify"
                        : "Connect Spotify and create playlist"}
            </motion.span>
          </AnimatePresence>
        </span>
      </button>
      {!hosted && !settings.spotifyClientId && (
        <p id="spotify-why" className="section-foot mt-2 text-center">
          Needs a Spotify Client ID. Add one in{" "}
          <Link href="/settings" className="text-[var(--tint)]">
            Settings
          </Link>
          .
        </p>
      )}
    </>
  );

  if (!playlist) return null;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Export"
      describedBy="export-count"
      testId="export-sheet"
      detents={["large"]}
      footer={spotifyButton}
    >
      <Group
        footer={
          <span id="export-count">
            <CountUp value={tracks} /> {tracks === 1 ? "song" : "songs"}
            {includeCortinas ? ` + ${cortinas} ${cortinas === 1 ? "cortina" : "cortinas"}` : ""} (
            <CountUp value={count} /> {count === 1 ? "file" : "files"})
            {includeCortinas ? "" : ` · ${cortinas} cortinas left out`}.
            {includeCortinas
              ? ` Cortinas stop at ${cortinaStop} s in TDJ's player, in VLC (M3U8, XSPF) and as a Rekordbox hot cue. Spotify playlists cannot trim tracks, so cortinas there play in full: switch Include cortinas off to skip them in Spotify.`
              : " No cortinas in the files or in Spotify."}
          </span>
        }
      >
        <SwitchRow label="Include cortinas" checked={includeCortinas} onChange={setIncludeCortinas} />
        {includeCortinas && (
          <StepperRow
            label="Cortina play length"
            sub={settings.cortinaStopSec === null ? "Follows the composer" : "Set in Playback"}
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
        header="Send to"
        footer={
          accounts.length || googleOn || dropboxOn
            ? `Spotify creates a playlist in your account. ${hasFileTarget ? "Cloud folders receive the file format chosen above. " : ""}${googleOn || listAccounts.some((a) => a.app === "youtube_data_api") ? "YouTube matching shares a daily budget with every TDJ user, so some recordings may be left out. " : ""}Connections are managed in Settings.`
            : webhookUrl
              ? "The chosen format is POSTed to your webhook: Pipedream, Make, Zapier or n8n can file it, mail it or push it to a DJ app. The URL lives in this browser only."
              : hosted
                ? "Spotify creates a playlist in your account; log in once in Settings or right here. Connect YouTube, Dropbox or Google Drive in Settings to send sets there too."
                : "Spotify creates a playlist in your account. A webhook sends the file to your own automation (Pipedream, Make, Zapier, n8n)."
        }
      >
        <Row
          tile={
            <Tile color="#1db954">
              <Radio size={16} strokeWidth={2} />
            </Tile>
          }
          label="Spotify"
          value={
            hosted
              ? hostedUser
                ? hostedUser.name
                : "Log in"
              : spotifyToken
                ? "Connected"
                : settings.spotifyClientId
                  ? "Connect"
                  : "Needs a Client ID"
          }
          chevron
          onClick={toSpotify}
          disabled={busy || done || (!hosted && !settings.spotifyClientId)}
          busy={busy}
          id="send-spotify"
        />
        <Row
          tile={
            <Tile color="#1db954">
              <ArrowRightLeft size={16} strokeWidth={2} />
            </Tile>
          }
          label="Spotify via a transfer service"
          sub="Any Spotify account · TuneMyMusic or Soundiiz"
          value="CSV"
          chevron
          onClick={() => setTransferOpen(true)}
          id="send-transfer"
        />
        {googleOn && (
          <Row
            tile={
              <Tile color="#ff0000">
                <ListVideo size={16} strokeWidth={2} />
              </Tile>
            }
            label="YouTube"
            sub={google?.user?.email ?? google?.user?.name}
            value={!google?.user ? "Connect" : google.scopes?.youtube ? "Create playlist" : "Allow"}
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
            label={`${a.label} via Pipedream`}
            sub={a.name}
            value="Create playlist"
            chevron
            onClick={() => toCloud(a)}
            busy={cloudBusy === a.id}
            disabled={!!cloudBusy}
            id={`send-pd-${a.app}`}
          />
        ))}
        {(hasFileTarget || webhookUrl) && (
          <PickerRow
            label="File format"
            ariaLabel="File format"
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
        {dropboxOn && (
          <Row
            tile={
              <Tile color="#0061ff">
                <Cloud size={16} strokeWidth={2} />
              </Tile>
            }
            label="Save to Dropbox"
            sub={dropbox?.user?.email ?? dropbox?.user?.name}
            value={dropbox?.user ? `.${EXPORT_META[hookFormat].ext}` : "Connect"}
            chevron
            onClick={() => toDirect("dropbox")}
            busy={cloudBusy === "dropbox"}
            disabled={!!cloudBusy}
            id="send-dropbox"
          />
        )}
        {googleOn && (
          <Row
            tile={
              <Tile color="#1fa463">
                <HardDrive size={16} strokeWidth={2} />
              </Tile>
            }
            label="Save to Google Drive"
            sub={google?.user?.email ?? google?.user?.name}
            value={
              !google?.user ? "Connect" : google.scopes?.drive ? `.${EXPORT_META[hookFormat].ext}` : "Allow"
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
            label={`Save to ${a.label} via Pipedream`}
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
            label="Send to webhook"
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
            label="Webhook"
            value="Set up"
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
            g === "DJ software" && noFolders ? (
              <>
                Paths use a TDJ/ placeholder. Set each app's music folder in{" "}
                <Link href="/settings" className="text-[var(--tint)]">
                  Settings
                </Link>
                .
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
              sub={folderFor(f) ? `Paths under ${folderFor(f)}` : undefined}
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
                  aria-label="Downloaded"
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
        title="Webhook"
        trailing="Save"
        onTrailing={saveHook}
        detents={["medium"]}
      >
        <Group
          header="Webhook URL"
          footer="Paste the HTTPS URL of a Pipedream, Make, Zapier or n8n webhook. TDJ POSTs the file as the request body with X-TDJ-Format and X-TDJ-Set headers plus ?format=&filename=. Stored in this browser only, never on the server."
        >
          <label htmlFor="webhook-url" className="cell">
            <span className="sr-only">Webhook URL</span>
            <input
              id="webhook-url"
              className="field font-mono"
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
        title="Spotify via a transfer service"
        trailing="Done"
        detents={["large"]}
        testId="transfer-sheet"
      >
        <Group
          header="Service"
          footer="Works with any Spotify account and needs nothing from the organiser: the service matches each row in your own Spotify login. Both offer a free tier for a playlist this size."
        >
          <SegmentedRow
            label="Transfer with"
            value={transfer}
            items={TRANSFER_SERVICES.map((t) => [t.id, t.label])}
            onChange={setTransfer}
          />
        </Group>
        <Group header="Three steps" id="transfer-steps">
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
          footer={`A CSV with the columns title, artist and album: ${playlist ? transferRows(playlist, includeCortinas).length : 0} rows in set order${includeCortinas ? ", cortinas included" : ", cortinas left out"}.`}
        >
          <ActionRow
            label={`Download CSV and open ${(TRANSFER_SERVICES.find((t) => t.id === transfer) ?? TRANSFER_SERVICES[0]!).label}`}
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
        {log.length > 0 && (
          <Group header="Progress">
            <div className="cell text-footnote whitespace-pre-wrap text-[var(--label-2)]">
              {log.join("\n")}
            </div>
          </Group>
        )}
      </div>
    </Sheet>
  );
}
