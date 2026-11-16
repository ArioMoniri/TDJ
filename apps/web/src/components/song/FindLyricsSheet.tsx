"use client";
import type { Song } from "@tdj/core";
import { ExternalLink, Settings2 } from "lucide-react";
import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { lyricsSearchUrl, ownLyrics, pastedLyrics, setOwnLyrics } from "@/lib/lyrics";
import { findLyrics, type LyricsCandidate, type SourceState } from "@/lib/lyricsSources";
import { inBooth } from "@/lib/songOpen";
import { toast } from "@/lib/toast";
import { Group } from "../Form";
import { Sheet } from "../Sheet";
import { ExtLink } from "./ExtLink";

const SOURCE_NAME = { lrclib: "LRCLIB", musixmatch: "Musixmatch", genius: "Genius" } as const;

/**
 * 2026-11 — "Find lyrics…" for one side: the candidates of every enabled source (LRCLIB always; Musixmatch and
 * Genius once the DJ turned them on with their key in Settings → Connections → Lyrics), each with a preview — this
 * recording's or another recording of the work, synced or plain — to attach; Genius gives links only. "Paste lyrics"
 * takes the DJ's own text or LRC. What is attached stays on this device for this side and wins over LRCLIB.
 */
export function FindLyricsSheet({
  song,
  open,
  start = "find",
  onClose,
}: {
  song: Song;
  open: boolean;
  start?: "find" | "paste";
  onClose: () => void;
}) {
  const [res, setRes] = useState<{
    candidates: LyricsCandidate[];
    states: Record<string, SourceState>;
  } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [paste, setPaste] = useState("");
  const [mode, setMode] = useState<"find" | "paste">(start);
  useEffect(() => {
    if (open) setMode(start);
  }, [open, start]);
  const own = open ? ownLyrics(song.id) : null;
  useEffect(() => {
    if (!open) return;
    let live = true;
    setRes(null);
    setPreview(null);
    findLyrics(song)
      .then((r) => live && setRes(r))
      .catch(() => live && setRes({ candidates: [], states: { lrclib: "error" } }));
    return () => {
      live = false;
    };
  }, [open, song]);
  const attach = (c: LyricsCandidate) => {
    if (!c.lyrics) return;
    setOwnLyrics(song.id, { ...c.lyrics, fetchedAt: new Date().toISOString() });
    toast(t("song.lyrics_attached", { source: SOURCE_NAME[c.source] }));
    onClose();
  };
  const usePaste = () => {
    const l = pastedLyrics(paste);
    if (l.state === "none") return;
    setOwnLyrics(song.id, l);
    toast(t(l.state === "synced" ? "song.lyrics_pasted_synced" : "song.lyrics_pasted_plain"));
    setPaste("");
    onClose();
  };
  const stateText = (s: SourceState) =>
    s === "ok"
      ? t("song.lyrics_src_ok")
      : s === "none"
        ? t("song.lyrics_src_none")
        : s === "key"
          ? t("song.lyrics_src_key")
          : s === "off"
            ? t("song.lyrics_src_off")
            : t("song.lyrics_src_error");
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("song.find_lyrics_title", { title: song.title })}
      trailing={t("song.done")}
      detents={["large"]}
      testId="find-lyrics-sheet"
    >
      <div className="seg mt-2 mb-1 flex gap-1 px-1" role="tablist">
        {(["find", "paste"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            className={`btn-plain min-h-11 flex-1 rounded-lg ${mode === m ? "bg-[var(--fill-4)] font-semibold" : ""}`}
            onClick={() => setMode(m)}
            data-testid={`find-lyrics-tab-${m}`}
          >
            {m === "find" ? t("song.lyrics_tab_find") : t("song.lyrics_tab_paste")}
          </button>
        ))}
      </div>
      {mode === "find" ? (
        <>
          <Group
            header={t("song.lyrics_candidates")}
            footer={
              res ? (
                <span data-testid="find-lyrics-states">
                  {Object.entries(res.states)
                    .map(([k, v]) => `${SOURCE_NAME[k as keyof typeof SOURCE_NAME]}: ${stateText(v)}`)
                    .join(" · ")}
                </span>
              ) : undefined
            }
          >
            {!res ? (
              <div className="cell text-[var(--label-2)]">{t("song.lyrics_loading")}</div>
            ) : res.candidates.length === 0 ? (
              <div className="cell text-[var(--label-2)]" data-testid="find-lyrics-empty">
                {t("song.lyrics_no_candidates")}
              </div>
            ) : (
              res.candidates.map((c) => (
                <div key={c.key} className="cell block" data-testid="lyrics-candidate" data-source={c.source}>
                  <div className="flex items-start gap-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate" lang="es">
                        {c.title} · {c.artist}
                      </span>
                      <span className="text-footnote block text-[var(--label-2)]">
                        {SOURCE_NAME[c.source]} ·{" "}
                        {c.lyrics
                          ? `${c.lyrics.state === "synced" ? t("song.lyrics_kind_synced") : t("song.lyrics_kind_plain")} · ${c.fit === "side" ? t("song.lyrics_fit_side") : t("song.lyrics_fit_work")}${c.lyrics.partial ? ` · ${t("song.lyrics_partial")}` : ""}`
                          : t("song.lyrics_link_only")}
                        {c.durationSec
                          ? ` · ${Math.floor(c.durationSec / 60)}:${String(Math.round(c.durationSec % 60)).padStart(2, "0")}`
                          : ""}
                      </span>
                    </span>
                    {c.lyrics ? (
                      <>
                        <button
                          type="button"
                          className="btn-plain min-h-11 px-2"
                          aria-expanded={preview === c.key}
                          onClick={() => setPreview(preview === c.key ? null : c.key)}
                          data-testid="lyrics-candidate-preview"
                        >
                          {t("song.lyrics_preview")}
                        </button>
                        <button
                          type="button"
                          className="btn-plain min-h-11 px-2 font-semibold text-[var(--tint)]"
                          onClick={() => attach(c)}
                          data-testid="lyrics-candidate-use"
                        >
                          {t("song.lyrics_use")}
                        </button>
                      </>
                    ) : (
                      c.url && (
                        <ExtLink
                          href={c.url}
                          className="btn-plain inline-flex min-h-11 items-center gap-1 px-2 text-[var(--tint)]"
                        >
                          Genius <ExternalLink size={14} aria-hidden />
                        </ExtLink>
                      )
                    )}
                  </div>
                  {preview === c.key && c.lyrics && (
                    <div
                      className="mt-2 max-h-48 overflow-y-auto rounded-lg bg-[var(--fill-4)] p-2 text-footnote whitespace-pre-line"
                      lang="es"
                      data-testid="lyrics-candidate-text"
                    >
                      {c.lyrics.state === "synced"
                        ? c.lyrics.lines?.map((x) => x.text).join("\n")
                        : c.lyrics.plain}
                      {c.lyrics.copyright && (
                        <p className="mt-2 text-[var(--label-2)]">{c.lyrics.copyright}</p>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </Group>
          <Group footer={t("song.lyrics_sources_footer")}>
            {/* (the Booth's page leaving would end the night: Settings is reached from the Booth's own menu) */}
            {!inBooth() && (
              <a
                href="/settings#lyrics-sources"
                className="cell cell-tap w-full text-left text-[var(--tint)]"
                data-testid="find-lyrics-settings"
              >
                <Settings2 size={16} strokeWidth={2} aria-hidden />
                <span className="min-w-0 flex-1">{t("song.lyrics_more_sources")}</span>
              </a>
            )}
            <ExtLink
              href={lyricsSearchUrl(song)}
              className="cell cell-tap w-full text-left text-[var(--tint)]"
              testId="find-lyrics-web"
            >
              <ExternalLink size={16} strokeWidth={2} aria-hidden />
              <span className="min-w-0 flex-1">{t("song.search_lyrics")}</span>
            </ExtLink>
          </Group>
        </>
      ) : (
        <Group header={t("song.lyrics_paste_header")} footer={t("song.lyrics_paste_footer")}>
          <label className="cell block" htmlFor="lyrics-paste">
            <span className="sr-only">{t("song.lyrics_paste_header")}</span>
            <textarea
              id="lyrics-paste"
              className="min-h-48 w-full resize-y bg-transparent text-body outline-none"
              placeholder={t("song.lyrics_paste_placeholder")}
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              data-testid="lyrics-paste"
              lang="es"
            />
          </label>
          <button
            type="button"
            className="cell cell-tap w-full justify-center font-semibold text-[var(--tint)] disabled:text-[var(--label-3)]"
            disabled={!paste.trim()}
            onClick={usePaste}
            data-testid="lyrics-paste-save"
          >
            {t("song.lyrics_paste_save")}
          </button>
        </Group>
      )}
      {own && (
        <Group>
          <button
            type="button"
            className="cell cell-tap w-full justify-center text-[var(--destructive)]"
            onClick={() => {
              setOwnLyrics(song.id, null);
              toast(t("song.lyrics_forgotten"));
              onClose();
            }}
            data-testid="lyrics-forget"
          >
            {t("song.lyrics_forget")}
          </button>
        </Group>
      )}
    </Sheet>
  );
}
