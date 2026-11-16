import { BPM_RANGE, type DjSongData, normaliseBpm, type ScrapedRecord, type Song } from "@tdj/core";
import { lower, t } from "@/lib/i18n";

/**
 * Wave 2 — one BPM per song. A side can carry up to four tempos (the DJ's edit, the analysed 30 s preview, a data
 * source such as Deezer, the catalogue's estimate) and trackers disagree on the beat level: one counts a tango at
 * 165, another at 83. The row shows one number, picked by a fixed priority, in the catalogue's convention for the
 * rhythm (tango 96–150, vals 150–215, milonga 88–135: core `BPM_RANGE`); the Database lists every value with its
 * source and marks the one used.
 */
export type BpmSource = "dj" | "audio" | "source" | "index";
export const BPM_PRIORITY: BpmSource[] = ["dj", "audio", "source", "index"];
export const BPM_SOURCE_LABEL: Record<BpmSource, string> = {
  get dj() {
    return t("songData.your_edit");
  },
  get audio() {
    return t("songData.analysed_preview");
  },
  get source() {
    return t("songData.data_source");
  },
  get index() {
    return t("songData.catalogue_estimate");
  },
};
const PROVIDER: Record<string, string> = {
  deezer: "Deezer",
  musicbrainz: "MusicBrainz",
  discogs: "Discogs",
  spotify: "Spotify",
};

export interface BpmValue {
  source: BpmSource;
  /** "Deezer", "Analysed preview", "Your edit", "Catalogue estimate" */
  label: string;
  /** as the source gave it */
  raw: number;
  /** in the rhythm's range (the octave nearest it when no octave falls inside) */
  value: number;
}
export interface BpmChoice {
  /** the one number a row shows */
  value: number;
  used: BpmValue;
  /** every value, priority order; `agrees` once each is brought to the used value's beat level */
  all: Array<BpmValue & { used: boolean; agrees: boolean; halfDouble: boolean }>;
  /** the hover: where the number came from and how the others compare */
  note: string;
}

const RANGE_TEXT = (rhythm: string) => {
  const r = BPM_RANGE[rhythm as keyof typeof BPM_RANGE];
  return r ? `${r[0]}–${r[1]}` : "60–240";
};

/** a tempo in the rhythm's range (core `normaliseBpm`: the tanda's tempo reads the same one) */
export { normaliseBpm };

/** `b` at the beat level nearest `ref` (half, same or double) */
const toward = (b: number, ref: number) =>
  [b / 2, b, b * 2].reduce((a, x) => (Math.abs(Math.log2(x / ref)) < Math.abs(Math.log2(a / ref)) ? x : a));
/** within 6 % counts as the same tempo (the round-21 tango band is 10 %) */
const AGREE = 0.06;

/** every tempo a side has, priority order (the DJ's, the analysed preview, a data source, the catalogue) */
export function bpmValues(
  s: Pick<Song, "rhythm" | "bpm" | "tempo" | "audio" | "deezer">,
  scraped?: ScrapedRecord | null,
  dj?: DjSongData | null,
): BpmValue[] {
  const rhythm = s.rhythm ?? "tango";
  const out: BpmValue[] = [];
  const add = (source: BpmSource, label: string, raw: number | null | undefined) => {
    if (!raw || !Number.isFinite(raw) || raw <= 0) return;
    if (out.some((x) => x.source === source && Math.round(x.raw) === Math.round(raw))) return;
    out.push({ source, label, raw, value: normaliseBpm(raw, rhythm) });
  };
  add("dj", BPM_SOURCE_LABEL.dj, dj?.bpm ?? (s.tempo?.source === "dj" ? s.tempo.bpm : undefined));
  add(
    "audio",
    BPM_SOURCE_LABEL.audio,
    s.audio?.bpm ?? (s.tempo?.source === "audio" ? s.tempo.bpm : undefined),
  );
  if (scraped?.bpm)
    add("source", PROVIDER[scraped.fields?.bpm ?? ""] ?? t("songData.your_data_source"), scraped.bpm);
  add("source", "Deezer", s.deezer?.bpm ?? (s.tempo?.source === "deezer" ? s.tempo.bpm : undefined));
  add("index", BPM_SOURCE_LABEL.index, s.bpm ?? (s.tempo?.source === "index" ? s.tempo.bpm : undefined));
  return out.sort((a, b) => BPM_PRIORITY.indexOf(a.source) - BPM_PRIORITY.indexOf(b.source));
}

/** the one BPM a side shows: DJ edit > analysed preview > source > estimate, in the rhythm's convention */
export function bpmChoice(
  s: Pick<Song, "rhythm" | "bpm" | "tempo" | "audio" | "deezer">,
  scraped?: ScrapedRecord | null,
  dj?: DjSongData | null,
): BpmChoice | null {
  const vs = bpmValues(s, scraped, dj);
  const used = vs[0];
  if (!used) return null;
  const rhythm = s.rhythm ?? "tango";
  const all = vs.map((v, k) => {
    // compared as given, each brought to the used value's beat level first
    const at = toward(v.raw, used.raw);
    const agrees = Math.abs(at - used.raw) / used.raw <= AGREE;
    return { ...v, used: k === 0, agrees, halfDouble: agrees && Math.abs(at - v.raw) > 1 };
  });
  const others = all.slice(1).map((v) =>
    v.agrees
      ? v.halfDouble
        ? t(v.raw > used.raw ? "songData.says_double" : "songData.says_half", {
            label: v.label,
            bpm: Math.round(v.raw),
          })
        : t("songData.agrees", { label: v.label, p1: Math.round(v.raw) })
      : t("songData.says_at_this_beat_level", {
          label: v.label,
          p1: Math.round(v.raw),
          p2: Math.round(toward(v.raw, used.value)),
        }),
  );
  const note = [
    t("songData.bpm_from", { bpm: Math.round(used.value), source: lower(used.label) }),
    Math.round(used.value) !== Math.round(used.raw)
      ? t("songData.given_as", { raw: Math.round(used.raw), rhythm, range: RANGE_TEXT(rhythm) })
      : null,
    others.length ? `. ${others.join("; ")}.` : ".",
    ` ${t("songData.order")}`,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(" .", ".");
  return { value: Math.round(used.value), used, all, note };
}
