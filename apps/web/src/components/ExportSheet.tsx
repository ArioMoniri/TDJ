"use client";
import { EXPORT_META, EXPORTERS, type ExportFormat, toSpotifyPlan } from "@tdj/core";
import { Download, ExternalLink, Loader2, X } from "lucide-react";
import { useState } from "react";
import { downloadBlob } from "@/lib/download";
import { beginAuth, createPlaylist, refresh, resolveTrack } from "@/lib/spotify";
import { useStore } from "@/lib/store";

export function ExportSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { playlist, settings, spotifyToken, setSpotifyToken } = useStore();
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  if (!open || !playlist) return null;
  const dl = (f: ExportFormat) => {
    const m = EXPORT_META[f];
    downloadBlob(`${playlist.name.replace(/[^a-z0-9-]+/gi, "_")}.${m.ext}`, EXPORTERS[f](playlist), m.mime);
  };

  const toSpotify = async () => {
    if (!settings.spotifyClientId) {
      setLog(["Add your Spotify Client ID in Settings → Spotify first."]);
      return;
    }
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
          setLog((l) => [...l.slice(-8), `✓ ${u.track.title} → ${r.artist} – ${r.name}`]);
        } else {
          miss++;
          setLog((l) => [...l.slice(-8), `✗ not found: ${u.query}`]);
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
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal
    >
      <div
        className="glass glass-strong safe-b w-full max-w-lg rounded-b-none p-5 sm:rounded-b-[24px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Export set</h2>
          <button type="button" className="chip !min-h-9" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <p className="text-muted mt-1 text-sm">
          Raw files for any DJ app, or push straight to your Spotify account.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {(Object.keys(EXPORT_META) as ExportFormat[]).map((f) => (
            <button
              type="button"
              key={f}
              onClick={() => dl(f)}
              className="btn btn-ghost justify-start text-sm"
            >
              <Download size={15} /> {EXPORT_META[f].label}
            </button>
          ))}
        </div>
        <button type="button" onClick={toSpotify} disabled={busy} className="btn btn-primary mt-4 w-full">
          {busy ? <Loader2 size={16} className="animate-spin" /> : null}{" "}
          {spotifyToken ? "Create playlist in my Spotify" : "Connect Spotify & create playlist"}
        </button>
        {result && (
          <a href={result} target="_blank" rel="noreferrer" className="btn btn-ghost mt-2 w-full">
            Open in Spotify <ExternalLink size={14} />
          </a>
        )}
        {log.length > 0 && (
          <pre className="mt-3 max-h-40 overflow-auto rounded-xl bg-black/10 p-3 text-[11px] leading-relaxed dark:bg-white/5">
            {log.join("\n")}
          </pre>
        )}
      </div>
    </div>
  );
}
