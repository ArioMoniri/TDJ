"use client";
import { type DotLottie, DotLottieReact } from "@lottiefiles/dotlottie-react";
import { EXPORT_META, type ExportFormat, toSpotifyPlan } from "@tdj/core";
import { Check, Download, ExternalLink, LoaderCircle, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { downloadBlob } from "@/lib/download";
import { withoutCortinas } from "@/lib/exportPaths";
import { haptic } from "@/lib/haptics";
import { useMediaQuery } from "@/lib/hooks";
import { DUR, EASE, SPRING, rise } from "@/lib/motion";
import { beginAuth, createPlaylist, refresh, resolveTrack } from "@/lib/spotify";
import { useStore } from "@/lib/store";
import { DJ_APPS, type DjApp } from "@/lib/types";
import { CountUp } from "./CountUp";
import { Switch } from "./ui";

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

export function ExportSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { playlist, settings, spotifyToken, setSpotifyToken } = useStore();
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [dlBusy, setDlBusy] = useState<ExportFormat | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [includeCortinas, setIncludeCortinas] = useState(true);
  const [justDone, setJustDone] = useState<ExportFormat | null>(null);
  const [done, setDone] = useState(false);
  const [errorKey, setErrorKey] = useState(0);
  const [settling, setSettling] = useState(false);
  const check = useRef<DotLottie | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const reduced = useReducedMotion();
  const isPhone = useMediaQuery("(max-width: 639px)");

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
  // a fresh open starts clean: no stale "Playlist created" state
  useEffect(() => {
    if (open) {
      setDone(false);
      setResult(null);
    }
  }, [open]);

  const tracks = playlist
    ? playlist.tandas.reduce((a, t) => a + t.songs.length, 0) + (playlist.closing ? 1 : 0)
    : 0;
  const cortinas = playlist ? playlist.tandas.filter((t) => t.cortina).length : 0;
  const count = tracks + (includeCortinas ? cortinas : 0);
  const folderFor = (f: ExportFormat) =>
    (APP_FOR[f] ?? []).map((a) => settings.djApps[a]?.folder?.trim()).find(Boolean) ?? "";

  // phone: sheet slides up on a spring; desktop: fade + 4 % scale. Reduced motion: cross-fade.
  const panelMotion = useMemo(() => {
    if (reduced)
      return {
        initial: { opacity: 0 },
        animate: { opacity: 1, transition: { duration: DUR.base } },
        exit: { opacity: 0, transition: { duration: DUR.fast } },
      };
    return isPhone
      ? {
          initial: { y: "100%" },
          animate: { y: 0, transition: SPRING.sheet },
          exit: { y: "100%", transition: { duration: DUR.base, ease: EASE.in } },
        }
      : {
          initial: { opacity: 0, scale: 0.96, y: 12 },
          animate: { opacity: 1, scale: 1, y: 0, transition: { duration: DUR.base, ease: EASE.out } },
          exit: { opacity: 0, scale: 0.98, transition: { duration: DUR.fast, ease: EASE.in } },
        };
  }, [isPhone, reduced]);
  // error nudge: a new array identity per error so a repeated identical error still nudges
  const nudge = useMemo(
    () => (errorKey && !reduced ? { x: [0, -4, 4, -2, 0] } : { x: 0 }),
    [errorKey, reduced],
  );

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
      setJustDone(f);
      setTimeout(() => setJustDone((cur) => (cur === f ? null : cur)), 1200);
    } catch (e) {
      setLog((l) => [...l, `Error: ${(e as Error).message}`]);
      setErrorKey((k) => k + 1);
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
      setErrorKey((k) => k + 1);
      haptic([20, 30, 20]);
      if (String(e).includes("401")) setSpotifyToken(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open && playlist && (
        <div
          key="export-sheet"
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6"
        >
          <motion.button
            type="button"
            className="absolute inset-0 cursor-default bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: DUR.base } }}
            exit={{ opacity: 0, transition: { duration: DUR.fast } }}
            onClick={onClose}
            aria-label="Close export sheet"
            tabIndex={-1}
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby="export-title"
            aria-describedby="export-desc"
            className={`glass relative flex max-h-[85dvh] w-full max-w-lg flex-col rounded-b-none p-5 pt-3 sm:rounded-b-[24px] sm:pt-5 ${settling ? "glass-settling" : ""}`}
            style={{ willChange: "transform" }}
            {...panelMotion}
            onAnimationStart={() => isPhone && setSettling(true)}
            onAnimationComplete={() => {
              setSettling(false);
              if (isPhone) haptic(6);
            }}
            drag={isPhone && !reduced ? "y" : false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            dragMomentum={false}
            dragTransition={SPRING.sheet}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 600) onClose();
            }}
          >
            <motion.div
              animate={nudge}
              transition={{ duration: 0.28, ease: EASE.inOut }}
              className="flex min-h-0 flex-col"
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
        <div className="mt-3 rounded-xl bg-[rgb(var(--text)/.05)] px-3">
          <Switch
            checked={includeCortinas}
            onChange={setIncludeCortinas}
            label="Include cortinas"
            hint={
              <>
                <CountUp value={count} /> {count === 1 ? "track" : "tracks"} will be exported
                {includeCortinas ? "" : ` (${cortinas} cortinas left out)`}
              </>
            }
          />
        </div>
        <div
          ref={list}
          className="mt-4 min-h-0 space-y-4 overflow-y-auto"
          data-no-drag
          onPointerDownCapture={(e) => {
            // a scrolled list must never turn a scroll into a dismiss
            if ((list.current?.scrollTop ?? 0) > 0) e.stopPropagation();
          }}
        >
          {GROUPS.map(([g, keys]) => (
            <div key={g}>
              <div className="text-muted mb-1.5 text-xs font-medium uppercase tracking-wide">{g}</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {keys.map((f) => (
                  <button
                    type="button"
                    key={f}
                    onClick={() => dl(f)}
                    disabled={dlBusy === f}
                    className="btn btn-ghost justify-start text-sm"
                    title={folderFor(f) ? `Paths under ${folderFor(f)}` : undefined}
                  >
                    {dlBusy === f ? (
                      <LoaderCircle size={15} className="shrink-0 animate-spin" />
                    ) : justDone === f ? (
                      <motion.span
                        initial={{ scale: reduced ? 1 : 0.6 }}
                        animate={{ scale: 1 }}
                        transition={SPRING.snappy}
                        className="inline-flex shrink-0"
                        aria-label="Exported"
                      >
                        <Check size={15} />
                      </motion.span>
                    ) : (
                      <Download size={15} className="shrink-0" />
                    )}
                    <span className="truncate">{EXPORT_META[f].label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          {DJ_APPS.every((a) => !settings.djApps[a.id]?.folder) && (
            <p className="text-muted text-xs">
              File paths use a TDJ/ placeholder. Set your music folder per DJ app in{" "}
              <Link href="/settings" className="underline">
                Settings
              </Link>{" "}
              to get real paths.
            </p>
          )}
        </div>
        {settings.spotifyClientId ? (
          <button
            type="button"
            onClick={toSpotify}
            disabled={busy || done}
            className="btn btn-primary mt-4 w-full"
          >
            {done || busy ? (
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
                  <LoaderCircle size={16} className="animate-spin" />
                )}
              </span>
            ) : null}
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
        <AnimatePresence>
          {result && (
            <motion.a
              key="open"
              variants={rise}
              initial="hidden"
              animate="show"
              exit="exit"
              transition={{ delay: reduced ? 0 : 0.7 }}
              href={result}
              target="_blank"
              rel="noreferrer"
              className="btn btn-ghost mt-2 w-full"
              ref={(el) => el?.focus()}
            >
              Open in Spotify <ExternalLink size={14} />
            </motion.a>
          )}
        </AnimatePresence>
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
            </motion.div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
