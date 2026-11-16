"use client";
import { MicVocal } from "lucide-react";
import { t } from "@/lib/i18n";
import { useLyricsSources } from "@/lib/lyricsSources";
import { Group, SwitchRow, Tile } from "../Form";

/**
 * 2026-11 — Settings → Connections → Lyrics: where song details look for lyrics. LRCLIB is always on (open, keyless);
 * Musixmatch (its official API, your key: its free tier gives part of the text) and Genius (credits and a link,
 * never the words) are opt-in with your own key, kept in this browser only and sent with each search alone.
 */
export function LyricsConnections() {
  const mx = useLyricsSources((s) => s.musixmatch);
  const gn = useLyricsSources((s) => s.genius);
  const set = useLyricsSources((s) => s.set);
  const tile = (
    <Tile color="#ff2d55">
      <MicVocal size={16} strokeWidth={2} />
    </Tile>
  );
  return (
    <section id="lyrics-sources" data-testid="lyrics-sources">
      <Group header={t("song.lyrics_sources_header")} footer={t("song.lyrics_sources_settings_footer")}>
        <SwitchRow
          label="LRCLIB"
          sub={t("song.lyrics_src_lrclib_sub")}
          checked
          onChange={() => {}}
          disabled
          tile={tile}
        />
        <SwitchRow
          label="Musixmatch"
          sub={t("song.lyrics_src_musixmatch_sub")}
          checked={mx.on}
          onChange={(on) => set({ musixmatch: { ...mx, on } })}
          tile={tile}
        />
        {mx.on && (
          <label className="cell" htmlFor="lyrics-key-musixmatch">
            <span className="min-w-0 flex-[0_1_45%]">{t("song.lyrics_key", { source: "Musixmatch" })}</span>
            <input
              id="lyrics-key-musixmatch"
              type="password"
              autoComplete="off"
              spellCheck={false}
              className="min-h-11 min-w-0 flex-1 bg-transparent text-right outline-none"
              value={mx.key}
              placeholder={t("song.lyrics_key_placeholder")}
              onChange={(e) => set({ musixmatch: { ...mx, key: e.target.value.trim() } })}
              data-testid="lyrics-key-musixmatch"
            />
          </label>
        )}
        <SwitchRow
          label="Genius"
          sub={t("song.lyrics_src_genius_sub")}
          checked={gn.on}
          onChange={(on) => set({ genius: { ...gn, on } })}
          tile={tile}
        />
        {gn.on && (
          <label className="cell" htmlFor="lyrics-key-genius">
            <span className="min-w-0 flex-[0_1_45%]">{t("song.lyrics_key", { source: "Genius" })}</span>
            <input
              id="lyrics-key-genius"
              type="password"
              autoComplete="off"
              spellCheck={false}
              className="min-h-11 min-w-0 flex-1 bg-transparent text-right outline-none"
              value={gn.key}
              placeholder={t("song.lyrics_key_placeholder")}
              onChange={(e) => set({ genius: { ...gn, key: e.target.value.trim() } })}
              data-testid="lyrics-key-genius"
            />
          </label>
        )}
      </Group>
    </section>
  );
}
