"use client";
import { EXPORT_META, EXPORTERS, type ExportFormat, toSpotifyPlan } from "@tdj/core";
import { Download, ExternalLink, LoaderCircle, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { downloadBlob } from "@/lib/download";
import { beginAuth, createPlaylist, refresh, resolveTrack } from "@/lib/spotify";
import { useStore } from "@/lib/store";

const GROUPS: Array<[string, ExportFormat[]]> = [
  ["DJ software", ["rekordbox", "traktor", "serato"]],
  ["Playlist files", ["m3u8", "xspf", "csv"]],
  ["Other", ["json", "setlist"]],
];

export function ExportSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { playlist, settings, spotifyToken, setSpotifyToken } = useStore();
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  // Dialog behaviour: initial focus, Escape, focus trap, scroll lock, focus restore.
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>("button:not([disabled]), a[href]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close.current();
      }
      if (e.key === "Tab" && panel.current) {
        const f = [
          ...panel.current.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], [tabindex='0']"),
        ];
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      prev?.focus();
    };
  }, [open]);

  if (!open || !playlist) return null;
  const dl = (f: ExportFormat) => {
    const m = EXPORT_META[f];
    downloadBlob(`${playlist.name.replace(/[^a-z0-9-]+/gi, "_")}.${m.ext}`, EXPORTERS[f](playlist), m.mime);
  };

  const toSpotify = async () => {
    if (!settings.spotifyClientId) return;
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
      const plan = toSpotifyPlan(playlist);
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
        `Tandas + cortinas composed by TDJ. Score ${playlist.score.total}/100. ${playlist.tandas.length} tandas.`,
        uris,
      );
      setResult(pl.external_urls.spotify);
      setLog((l) => [...l, `Created playlist with ${uris.length} tracks (${miss} unresolved).`]);
    } catch (e) {
      setLog((l) => [...l, `Error: ${(e as Error).message}`]);
      if (String(e).includes("401")) setSpotifyToken(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-black/40"
        onClick={onClose}
        aria-label="Close export sheet"
        tabIndex={-1}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-title"
        aria-describedby="export-desc"
        className="glass sheet relative flex max-h-[85dvh] w-full max-w-lg flex-col rounded-b-none p-5 pt-3 sm:rounded-b-[24px] sm:pt-5"
      >
        <div className="mx-auto mb-3 h-1.5 w-9 rounded-full bg-current opacity-25 sm:hidden" aria-hidden />
        <div className="flex items-center justify-between gap-3">
          <h2 id="export-title" className="text-lg font-semibold">
            Export this set
          </h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <p id="export-desc" className="text-muted mt-1 text-sm">
          Download a file for your DJ software, or create the playlist in Spotify.
        </p>
        <div className="mt-4 min-h-0 space-y-4 overflow-y-auto">
          {GROUPS.map(([g, keys]) => (
            <div key={g}>
              <div className="text-muted mb-1.5 text-xs font-medium uppercase tracking-wide">{g}</div>
              <div className="grid grid-cols-2 gap-2">
                {keys.map((f) => (
                  <button
                    type="button"
                    key={f}
                    onClick={() => dl(f)}
                    className="btn btn-ghost justify-start text-sm"
                  >
                    <Download size={15} className="shrink-0" />
                    <span className="truncate">{EXPORT_META[f].label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        {settings.spotifyClientId ? (
          <button type="button" onClick={toSpotify} disabled={busy} className="btn btn-primary mt-4 w-full">
            {busy ? <LoaderCircle size={16} className="animate-spin" /> : null}
            {spotifyToken ? "Create playlist in Spotify" : "Connect Spotify and create playlist"}
          </button>
        ) : (
          <div className="mt-4 text-center">
            <button type="button" disabled className="btn btn-primary w-full" aria-describedby="spotify-why">
              Create playlist in Spotify
            </button>
            <p id="spotify-why" className="text-muted mt-2 text-sm">
              Needs a Spotify Client ID. Add one in{" "}
              <Link href="/settings" className="underline">
                Settings
              </Link>
              .
            </p>
          </div>
        )}
        {result && (
          <a href={result} target="_blank" rel="noreferrer" className="btn btn-ghost mt-2 w-full">
            Open in Spotify <ExternalLink size={14} />
          </a>
        )}
        <div role="status" aria-live="polite">
          {log.length > 0 && (
            <div className="mt-3 max-h-40 overflow-auto rounded-xl bg-[rgb(var(--text)/.06)] p-3 text-xs leading-relaxed">
              {log.map((l, i) => (
                <div key={`${i}-${l}`}>{l}</div>
              ))}
            </div>
          )}
        </div>
        <div className="h-[env(safe-area-inset-bottom)] shrink-0 sm:hidden" />
      </div>
    </div>
  );
}
