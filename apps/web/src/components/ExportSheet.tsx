"use client";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import { EXPORT_META, type ExportFormat, toSpotifyPlan } from "@tdj/core";
import { FileDown } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { downloadBlob } from "@/lib/download";
import { withoutCortinas } from "@/lib/exportPaths";
import { haptic } from "@/lib/haptics";
import { DUR } from "@/lib/motion";
import { beginAuth, createPlaylist, refresh, resolveTrack } from "@/lib/spotify";
import { useStore } from "@/lib/store";
import { DJ_APPS, type DjApp } from "@/lib/types";
import { CountUp } from "./CountUp";
import { ActionRow, Group, Row, SwitchRow } from "./Form";
import { Sheet } from "./Sheet";

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
  json: "#8e8e93",
  setlist: "#8e8e93",
};

export function ExportSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { playlist, settings, spotifyToken, setSpotifyToken } = useStore();
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [dlBusy, setDlBusy] = useState<ExportFormat | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [includeCortinas, setIncludeCortinas] = useState(true);
  const [done, setDone] = useState(false);
  const check = useRef<{ play: () => void } | null>(null);
  const reduced = useReducedMotion();

  // a fresh open starts clean: no stale "Playlist created" state
  useEffect(() => {
    if (open) {
      setDone(false);
      setResult(null);
      setLog([]);
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
          folder: folderFor(f),
          naming: settings.fileNaming,
        }),
      });
      if (!r.ok) throw new Error(`Export failed (${r.status})`);
      downloadBlob(`${playlist.name.replace(/[^a-z0-9-]+/gi, "_")}.${m.ext}`, await r.text(), m.mime);
      haptic(6);
    } catch (e) {
      setLog((l) => [...l, `Error: ${(e as Error).message}`]);
      haptic([20, 30, 20]);
    } finally {
      setDlBusy(null);
    }
  };

  const toSpotify = async () => {
    if (!settings.spotifyClientId || !playlist) return;
    let tok = spotifyToken;
    if (!tok) return beginAuth(settings.spotifyClientId);
    if (tok.expires < Date.now() + 60_000 && tok.refresh) {
      tok = await refresh(settings.spotifyClientId, tok.refresh);
      setSpotifyToken(tok);
    }
    setBusy(true);
    setLog([]);
    setResult(null);
    try {
      const plan = toSpotifyPlan(includeCortinas ? playlist : withoutCortinas(playlist));
      const uris: string[] = [...plan.uris];
      let miss = 0;
      for (const u of plan.unresolved) {
        const r = await resolveTrack(tok.access, u.query, u.track.year);
        if (r) {
          uris.push(r.uri);
          setLog((l) => [...l.slice(-8), `Found ${u.track.title} → ${r.artist} – ${r.name}`]);
        } else {
          miss++;
          setLog((l) => [...l.slice(-8), `Not found: ${u.query}`]);
        }
      }
      const pl = await createPlaylist(
        tok.access,
        `TDJ · ${playlist.name}`,
        `${playlist.tandas.length} tandas composed with TDJ, cortinas ${includeCortinas ? "included" : "excluded"}. Score ${playlist.score.total}/100.`,
        uris,
      );
      setResult(pl.external_urls.spotify);
      setDone(true);
      check.current?.play();
      haptic([10, 40, 10]);
      setLog((l) => [...l, `Created playlist with ${uris.length} tracks (${miss} unresolved).`]);
    } catch (e) {
      setLog((l) => [...l, `Error: ${(e as Error).message}`]);
      haptic([20, 30, 20]);
      if (String(e).includes("401")) setSpotifyToken(null);
    } finally {
      setBusy(false);
    }
  };

  if (!playlist) return null;
  return (
    <Sheet open={open} onClose={onClose} title="Export" describedBy="export-count" testId="export-sheet">
      <Group
        footer={
          <span id="export-count">
            <CountUp value={count} /> {count === 1 ? "track" : "tracks"} will be exported
            {includeCortinas ? "" : ` (${cortinas} cortinas left out)`}.
          </span>
        }
      >
        <SwitchRow label="Include cortinas" checked={includeCortinas} onChange={setIncludeCortinas} />
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
              chevron
              onClick={() => dl(f)}
              busy={dlBusy === f}
            />
          ))}
        </Group>
      ))}
      <div className="px-0 pt-6">
        <button
          type="button"
          onClick={toSpotify}
          disabled={busy || done || !settings.spotifyClientId}
          className="btn btn-primary w-full"
          aria-describedby={settings.spotifyClientId ? undefined : "spotify-why"}
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
                  : spotifyToken
                    ? "Create playlist in Spotify"
                    : "Connect Spotify and create playlist"}
              </motion.span>
            </AnimatePresence>
          </span>
        </button>
        {!settings.spotifyClientId && (
          <p id="spotify-why" className="section-foot mt-2 text-center">
            Needs a Spotify Client ID. Add one in{" "}
            <Link href="/settings" className="text-[var(--tint)]">
              Settings
            </Link>
            .
          </p>
        )}
      </div>
      {result && (
        <Group>
          <ActionRow label="Open in Spotify" onClick={() => window.open(result, "_blank", "noreferrer")} />
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
