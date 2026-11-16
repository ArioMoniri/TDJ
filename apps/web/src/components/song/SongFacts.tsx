"use client";
import { type Song, workCredit } from "@tdj/core";
import { ChevronRight, Dna } from "lucide-react";
import { t } from "@/lib/i18n";
import { fmtLen } from "@/lib/lengths";
import { useMarks } from "@/lib/songMarks";
import { Group } from "../Form";
import { Artwork } from "../ui/Artwork";
import { BpmKey, EnergyChip } from "../ui/BpmKey";
import { TandaTypeBadge } from "../ui/TandaTypeBadge";
import { DnaLink } from "./DnaLink";

/** "0:02.4", "1:42.0" — a mark's second, to a tenth */
export function markText(sec: number): string {
  const t10 = Math.max(0, Math.round(sec * 10));
  const m = Math.floor(t10 / 600);
  const s = (t10 % 600) / 10;
  return `${m}:${s < 10 ? "0" : ""}${s.toFixed(1)}`;
}

/** the length as the row prints it: "2:47", "≈ 2:50" when estimated, "–:–" unknown */
export const lengthText = (s: Pick<Song, "durationSec" | "durationEstimated">) =>
  s.durationSec ? `${s.durationEstimated ? "≈ " : ""}${fmtLen(s.durationSec)}` : fmtLen(null);

/**
 * 2026-11 — what a side is, at a glance (the song details everywhere): its length, Instrumental or its singer, the
 * rhythm badge, the recording date and album, BPM / key / energy, the work's credits (Música · Letra), where the
 * singer comes in and the first downbeat falls (measured or marked), and the way into its Song DNA page.
 */
export function SongFacts({ song, header = true }: { song: Song; header?: boolean }) {
  const marks = useMarks((s) => s.marks[song.id]);
  const credit = workCredit(song.title);
  const year =
    song.date && /^\d{4}-\d{2}-\d{2}$/.test(song.date) ? song.date : song.year ? String(song.year) : null;
  return (
    <>
      {header && (
        <div className="mt-2 flex items-start gap-3 px-4" data-testid="song-facts-head">
          <Artwork
            src={null}
            song={song}
            orchestra={song.orchestra}
            orchestraId={song.orchestraId}
            size="l"
          />
          <div className="min-w-0 flex-1">
            <p className="text-headline" lang="es">
              {song.title}
            </p>
            <p className="text-subhead text-[var(--label-2)]">
              <span lang="es">{song.orchestra}</span>
              {year ? ` · ${song.yearApprox ? "≈ " : ""}${song.year ?? year}` : ""}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <TandaTypeBadge rhythm={song.rhythm} vocal={song.vocal} singer={song.singer} />
            </div>
          </div>
        </div>
      )}
      <Group header={t("song.about")} data-testid="song-facts">
        <Fact label={t("song.length")} value={lengthText(song)} testId="song-length" />
        <Fact
          label={t("song.voice")}
          value={
            song.singer && song.singerId ? (
              <DnaLink to={{ kind: "singer", id: song.singerId }} className="text-[var(--tint)]">
                <span lang="es">{song.singer}</span>
              </DnaLink>
            ) : song.singer ? (
              <span lang="es">{song.singer}</span>
            ) : (
              t("song.instrumental")
            )
          }
          testId="song-voice"
        />
        <Fact
          label={t("song.orchestra")}
          value={
            <DnaLink to={{ kind: "orchestra", id: song.orchestraId }} className="text-[var(--tint)]">
              <span lang="es">{song.orchestra}</span>
            </DnaLink>
          }
        />
        {year && (
          <Fact
            label={t("song.recorded")}
            value={song.yearApprox ? t("song.approx", { year: song.year ?? year }) : year}
            testId="song-recorded"
          />
        )}
        {song.album && <Fact label={t("song.album")} value={<span lang="es">{song.album}</span>} />}
        <div className="cell" data-testid="song-tempo">
          <span className="min-w-0 flex-1">{t("song.tempo_key_energy")}</span>
          <span className="flex flex-wrap items-center justify-end gap-1.5">
            <BpmKey e={song} />
            <EnergyChip e={song} />
          </span>
        </div>
        <Fact
          label={t("song.credits")}
          testId="song-credits"
          value={
            credit ? (
              <span lang="es" className="text-right">
                {t("song.music_by", { names: credit.composers.join(", ") })}
                {credit.lyricists.length ? (
                  <>
                    <br />
                    {t("song.lyrics_by", { names: credit.lyricists.join(", ") })}
                  </>
                ) : (
                  <>
                    <br />
                    {t("song.instrumental_work")}
                  </>
                )}
                {credit.year ? (
                  <>
                    <br />
                    {t("song.written", { year: credit.year })}
                  </>
                ) : null}
              </span>
            ) : (
              <span className="text-[var(--label-2)]">{t("song.credits_unknown")}</span>
            )
          }
        />
        {song.vocal && (
          <Fact
            label={t("song.singer_in_label")}
            value={marks?.singerSec !== undefined ? markText(marks.singerSec) : t("song.not_marked")}
            testId="song-singer-in"
          />
        )}
        <Fact
          label={t("song.downbeat_label")}
          value={marks?.downbeatSec !== undefined ? markText(marks.downbeatSec) : t("song.not_marked")}
          testId="song-downbeat"
        />
      </Group>
      <Group>
        <DnaLink
          to={{ kind: "song", id: song.id }}
          className="cell cell-tap w-full text-left"
          testId="song-dna-link"
        >
          <Dna size={18} strokeWidth={2} className="text-[var(--tint)]" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="cell-label">{t("song.song_dna")}</span>
            <span className="text-footnote cell-sub text-[var(--label-2)]">{t("song.song_dna_sub")}</span>
          </span>
          <ChevronRight size={16} strokeWidth={2.5} className="cell-chevron" aria-hidden />
        </DnaLink>
      </Group>
    </>
  );
}

function Fact({ label, value, testId }: { label: string; value: React.ReactNode; testId?: string }) {
  return (
    <div className="cell" data-testid={testId}>
      <span className="min-w-0 flex-1">{label}</span>
      <span className="cell-value text-body max-w-[65%] text-right">{value}</span>
    </div>
  );
}
