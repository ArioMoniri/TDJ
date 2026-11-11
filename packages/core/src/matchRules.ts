import { normTitle } from "./energy";
import { albumSpan, dateMismatch, titleDate } from "./streams";

/**
 * Round 15 — the export match rules (docs/specs/round15-engine.md §7): a streaming candidate is the recording on the
 * night only when nothing proves otherwise. The same rules judge the committed Spotify cache (`auditSpotifyCache`),
 * the Deezer cache (round 16, `auditDeezerCache`), the catalogue at load, the web matcher
 * (`apps/web/src/lib/match.ts`), the DJ's remembered matches and the ids carried in a night's JSON.
 * "Not found" beats a wrong song: any rule broken rejects the candidate.
 *
 * Round 16 (docs/reviews/round16-discography.md M1–M8): the leader is matched by whole name (Donato Racciatti is not
 * Edgardo Donato), a generic "Orquesta…" credit is no evidence, the title must equal the row's (Recuerdo is not
 * Recuerdo malevo), the rhythm is compared when the provider names it, every index singer counts as another voice,
 * a singer's solo credit is not the orchestra's side, an album's whole year range is tested, known remake series are
 * rejected, and when the index knows a later take of the title (or a sung take of an instrumental row) the candidate
 * must show positive evidence that it is this side.
 */
export interface MatchRow {
  title: string;
  orchestra: string;
  singer?: string | null;
  /** false: an instrumental side (a credit naming a singer is another recording) */
  vocal?: boolean;
  year?: number | null;
  date?: string | null;
  durationSec?: number | null;
  /** an estimated length is never a reference */
  durationEstimated?: boolean;
  altTitles?: string[];
  /** round 16: tango, vals or milonga (compared when the provider names the rhythm) */
  rhythm?: string | null;
  /** round 16 (M2): later takes of the title by the same orchestra, or the singer's own later recording */
  laterTakes?: Array<{ year: number; singer?: string | null }>;
  /** round 16 (M5): years the orchestra recorded the title with a singer (an instrumental row) */
  vocalTwins?: number[];
}
export interface MatchCandidate {
  name: string;
  artists: string[];
  album?: string;
  durationMs?: number;
  /**
   * round 17: the provider credits only the main artist (Deezer's `artist`): the credit cannot name the singer, so the
   * singer rule does not judge it. Spotify credits list every artist and are judged.
   */
  mainArtistOnly?: boolean;
}
export interface MatchContext {
  /** every singer the index knows (full names): a credit naming one the row lacks is another voice (M6) */
  singers?: string[];
}

/** the orchestra leaders of the golden canon: a credit naming another one is another orchestra's recording */
const LEADERS = [
  "d'arienzo",
  "di sarli",
  "troilo",
  "pugliese",
  "biagi",
  "tanturi",
  "calo",
  "canaro",
  "d'agostino",
  "de angelis",
  "laurenz",
  "donato",
  "rodriguez",
  "fresedo",
  "demare",
  "lomuto",
  "gobbi",
  "de caro",
  "firpo",
  "malerba",
  "varela",
  "sassone",
  "maderna",
  "salgan",
  "piazzolla",
  "otv",
].map((x) => normTitle(x));
/** the singers of the golden canon a credit may name (full names, normalised) */
export const CANON_SINGERS = [
  "alberto echague",
  "hector maure",
  "roberto rufino",
  "alberto podesta",
  "jorge duran",
  "oscar seron",
  "mario pomar",
  "francisco fiorentino",
  "alberto marino",
  "floreal ruiz",
  "edmundo rivero",
  "roberto goyeneche",
  "jorge ortiz",
  "andres falgas",
  "teofilo ibanez",
  "alberto amor",
  "hugo duval",
  "alberto castillo",
  "enrique campos",
  "raul beron",
  "raul iriarte",
  "alberto moran",
  "roberto chanel",
  "angel vargas",
  "carlos dante",
  "julio martel",
  "juan carlos casas",
  "horacio lagos",
  "roberto maida",
  "ernesto fama",
  "francisco amor",
  "armando moreno",
  "chato flores",
  "carlos gardel",
  "julio sosa",
  "juan carlos godoy",
  "jorge maciel",
].map((x) => normTitle(x));
/**
 * round 16 (M6, G9): the later voices of the canon's remakes (1950s–70s). The index's own singers (`knownSingers`)
 * extend this list wherever the index is at hand (catalogue, audits, enrich); a row's `laterTakes` add theirs.
 */
export const LATER_SINGERS = [
  "mario bustos",
  "armando laborde",
  "lucho gatica",
  "raul del mar",
  "horacio palma",
  "jorge valdez",
  "osvaldo ramos",
  "carlos roldan",
  "oscar ferrari",
  "oscar serpa",
  "argentino ledesma",
  "rodolfo lesica",
  "jorge vidal",
  "nelly omar",
  "tita merello",
  "horacio roca",
  "alfredo dalton",
  "carlos casares",
  "juan carlos lamas",
  "hector ortiz",
].map((x) => normTitle(x));

/** words that make a credit an ensemble, not the leader's orchestra (Los Solistas de D'Arienzo, Quinteto Pirincho) */
const ENSEMBLE = /\b(solistas|quinteto|quintet|trio|sexteto|cuarteto|pirincho|los muchachos de)\b/;
/** words that carry no identity in a credit ("Orquesta Típica", "y su") */
const NOISE = new Set([
  "orquesta",
  "orchestra",
  "tipica",
  "tipico",
  "y",
  "su",
  "and",
  "his",
  "de",
  "del",
  "la",
  "el",
  "con",
  "canta",
  "cantan",
  "feat",
  "ft",
  "with",
  "estribillo",
  "the",
  "o",
  "t",
  "ot",
]);
/** decorations a title may carry beyond the work's name */
const DECOR = new Set([
  "remaster",
  "remastered",
  "remasterizado",
  "instrumental",
  "tango",
  "vals",
  "valse",
  "milonga",
  "version",
  "mono",
  "stereo",
  "original",
  "digital",
  "restaurado",
  "restauracion",
  "en",
  "vivo",
  "live",
  "con",
  "canta",
  "y",
  "su",
  "orquesta",
  "tipica",
  "feat",
  "ft",
  "de",
]);
/** M2: albums of a known remake series (RCA "For Export" stereo LPs, "Más grande que nunca", Goyeneche's "Polaco") */
export const REMAKE_ALBUM =
  /for export|m[aá]s grande que nunca|\best[eé]reo\b|\bstereo\b|te acord[aá]s.*polaco|\ben estereo/i;

/** normalised words, a lone particle joined to its name ("d arienzo" → "darienzo", "d agostino" → "dagostino") */
const words = (x: string) => {
  const w = normTitle(x).split(" ").filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < w.length; i++) {
    if (w[i] === "d" && w[i + 1]) {
      out.push(`d${w[i + 1]}`);
      i++;
    } else out.push(w[i]!);
  }
  return out;
};
const sur = (x: string) => words(x).filter((w) => w.length > 2);

/** a candidate title with its restoration / remaster / "(Tango)" decorations stripped */
export function bareTitle(name: string): string {
  return normTitle(
    name
      .replace(
        /\((?:[^()]*?(?:remaster|restaur|tango|vals|milonga|version|buenos aires|instrumental)[^()]*)\)/gi,
        "",
      )
      .replace(/\s+-\s+(?:.*(?:remaster|live|en vivo|version|versión|mono|stereo|restaur|\d{4}).*)$/i, "")
      // an unclosed decoration left by a dash inside it ("(Buenos Aires 4/11/1942 - Restauración 2025)")
      .replace(/\s*\([^)]*$/, ""),
  );
}
/**
 * The candidate names the same work (M4): equal titles or an alternative title; a longer candidate title only when
 * its extra words are decorations or the row's own names ("Malena - Francisco Fiorentino"), never another work
 * ("Recuerdo malevo" is not "Recuerdo", "Nada más" is not "Nada").
 */
export function sameWork(
  row: Pick<MatchRow, "title" | "altTitles" | "orchestra" | "singer">,
  name: string,
): boolean {
  const b = bareTitle(name);
  if (!b) return false;
  const own = new Set([...words(row.orchestra ?? ""), ...words(row.singer ?? "")]);
  for (const t of [row.title, ...(row.altTitles ?? [])]) {
    const a = normTitle(t);
    if (!a) continue;
    if (a === b) return true;
    if (` ${b} `.startsWith(` ${a} `) || ` ${b} `.includes(` ${a} `)) {
      const extra = ` ${b} `.replace(` ${a} `, " ").split(" ").filter(Boolean);
      if (extra.every((w) => DECOR.has(w) || own.has(w) || /^\d+$/.test(w))) return true;
    }
  }
  return false;
}
/** the rhythm a candidate names in its decorations ("(Vals)", "- Milonga"), or null */
export function namedRhythm(name: string, rowTitle = ""): string | null {
  const t = normTitle(rowTitle);
  const dec = [...name.matchAll(/\(([^()]*)\)|\s[-–]\s(.*)$/g)].map((m) =>
    (m[1] ?? m[2] ?? "").toLowerCase(),
  );
  for (const d of dec) {
    const k = /\b(vals|valse|waltz)\b/.test(d)
      ? "vals"
      : /\bmilonga\b/.test(d)
        ? "milonga"
        : /\btango\b/.test(d)
          ? "tango"
          : null;
    if (k && !` ${t} `.includes(` ${k} `)) return k;
  }
  return null;
}
/**
 * M3: does one artist string name the row's leader by whole name? The leader's surname must stand as a name of its
 * own: not a first name (Donato Racciatti), not under another first name (Rafael Canaro), not an ensemble's
 * (Los Solistas de D'Arienzo, Quinteto Pirincho). A row whose orchestra is itself an ensemble name ("Orquesta Típica
 * Víctor") needs that whole name.
 */
export function namesLeader(orchestra: string, artist: string): boolean {
  const ow = words(orchestra.replace(/\(.*?\)/g, " "));
  const core = ow.filter((w) => !NOISE.has(w));
  if (!core.length) return false;
  const a = ` ${words(artist).join(" ")} `;
  if (ENSEMBLE.test(a) && !ENSEMBLE.test(` ${ow.join(" ")} `)) return false;
  const ensembleRow = /^(orquesta|orchestra|quinteto|sexteto|cuarteto|trio)\b/.test(ow.join(" "));
  if (ensembleRow || core.length === 1) return a.includes(` ${core.join(" ")} `);
  // the surname (with its particle: "di sarli", "d arienzo", "de angelis") and the given name
  const given = core[0]!;
  const surname = core.slice(1).join(" ");
  const aw = words(artist);
  const sw = surname.split(" ");
  for (let i = 0; i + sw.length <= aw.length; i++) {
    if (aw.slice(i, i + sw.length).join(" ") !== surname) continue;
    const before = aw[i - 1];
    const after = aw[i + sw.length];
    // another first name before the surname (Rafael Canaro); the surname used as a first name (Donato Racciatti)
    if (before && before !== given && !NOISE.has(before)) continue;
    if (after && !NOISE.has(after) && !/^\d+$/.test(after)) continue;
    return true;
  }
  return false;
}
const later = (row: MatchRow) => row.laterTakes ?? [];

/**
 * Round 16 (M2, M5): the takes the index knows beside a row — later takes of the same title by the same orchestra
 * (five years on or more), the singer's own later recording under his own name, and (for an instrumental row) the
 * years the orchestra recorded the title with a singer. Keyed by row id.
 */
export function takesIndex(
  rows: Array<{
    id: string;
    title: string;
    orchestra: string;
    orchestraId: string;
    singer?: string | null;
    vocal?: boolean;
    year?: number | null;
    rhythm?: string | null;
  }>,
): Map<string, { laterTakes?: Array<{ year: number; singer?: string | null }>; vocalTwins?: number[] }> {
  const byWork = new Map<string, typeof rows>();
  const byArtistTitle = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!r.year) continue;
    const k = `${r.orchestraId}|${normTitle(r.title)}`;
    byWork.set(k, [...(byWork.get(k) ?? []), r]);
    const ak = `${normTitle(r.orchestra)}|${normTitle(r.title)}`;
    byArtistTitle.set(ak, [...(byArtistTitle.get(ak) ?? []), r]);
  }
  const out = new Map<
    string,
    { laterTakes?: Array<{ year: number; singer?: string | null }>; vocalTwins?: number[] }
  >();
  for (const r of rows) {
    if (!r.year) continue;
    const same = byWork.get(`${r.orchestraId}|${normTitle(r.title)}`) ?? [];
    const lt = same
      .filter((x) => x.id !== r.id && x.year! >= r.year! + 5)
      .map((x) => ({ year: x.year!, singer: x.vocal ? (x.singer ?? null) : null }));
    // the singer's own later recording ("Alberto Castillo" for Tanturi / Castillo)
    if (r.vocal && r.singer)
      for (const x of byArtistTitle.get(`${normTitle(r.singer)}|${normTitle(r.title)}`) ?? [])
        if (x.id !== r.id && x.year! > r.year!) lt.push({ year: x.year!, singer: r.singer });
    const twins = r.vocal ? [] : same.filter((x) => x.id !== r.id && x.vocal).map((x) => x.year!);
    const uniq = [...new Map(lt.map((t) => [`${t.year}|${t.singer ?? ""}`, t])).values()].sort(
      (a, b) => a.year - b.year,
    );
    if (uniq.length || twins.length)
      out.set(r.id, {
        ...(uniq.length ? { laterTakes: uniq } : {}),
        ...(twins.length ? { vocalTwins: [...new Set(twins)].sort() } : {}),
      });
  }
  return out;
}

/** Why the candidate is not the row's recording, or null when nothing proves it is another one. */
export function matchProblem(
  row: MatchRow,
  c: MatchCandidate,
  refDurationSec?: number | null,
  ctx: MatchContext = {},
): string | null {
  if (!sameWork(row, c.name)) return `another title (${c.name})`;
  const nr = namedRhythm(c.name, row.title);
  if (nr && row.rhythm && ["tango", "vals", "milonga"].includes(row.rhythm) && nr !== row.rhythm)
    return `a ${nr}, not a ${row.rhythm}`;
  const credit = ` ${normTitle(`${c.artists.join(" ")}`)} `;
  const ownArtist = c.artists.some((a) => namesLeader(row.orchestra, a));
  const ownAlbum = !!c.album && namesLeader(row.orchestra, c.album);
  const singerSur = sur(row.singer ?? "").slice(-1)[0];
  const namesSinger = !!singerSur && credit.includes(` ${singerSur} `);
  if (ENSEMBLE.test(credit) && !ENSEMBLE.test(` ${normTitle(row.orchestra)} `))
    return `another ensemble (${c.artists.join(", ")})`;
  // (a row with no real orchestra — "Guitarras (solo singer)", "Orquesta (unspecified)" — is the singer's own side)
  const pseudo =
    !words(row.orchestra.replace(/\(.*?\)/g, " ")).some((w) => !NOISE.has(w)) ||
    /solo singer|unspecified|^guitarras?\b/i.test(row.orchestra);
  if (!ownArtist && !ownAlbum && !(pseudo && namesSinger))
    return namesSinger
      ? `a solo recording by the singer (${c.artists.join(", ")})`
      : "the credit names neither the orchestra nor the singer";
  const ownLeader = LEADERS.find((l) => normTitle(row.orchestra).includes(l));
  const other = LEADERS.find(
    (l) => l !== ownLeader && credit.includes(` ${l} `) && !normTitle(row.orchestra).includes(l),
  );
  if (other && !ownArtist) return `another orchestra (${other})`;
  // the singer: an instrumental side never matches a sung credit; a sung side never matches another voice
  const pool = new Set([
    ...CANON_SINGERS,
    ...LATER_SINGERS,
    ...(ctx.singers ?? []).map((s) => normTitle(s)).filter((s) => s.split(" ").length >= 2),
    ...(row.laterTakes ?? []).map((t) => normTitle(t.singer ?? "")).filter((s) => s.split(" ").length >= 2),
  ]);
  const hay = ` ${normTitle(c.name)} `;
  const named = [...pool].filter((sg) => credit.includes(` ${sg} `) || hay.includes(` ${sg} `));
  const mine = normTitle(row.singer ?? "");
  const mineSur = sur(row.singer ?? "").slice(-1)[0];
  const isMine = (sg: string) =>
    !!mine && (mine.includes(sg) || sg.includes(mine) || (!!mineSur && sur(sg).at(-1) === mineSur));
  const instrumental = row.vocal === false || (!row.singer && row.vocal !== true);
  if (instrumental) {
    if (named.length) return `a sung credit (${named[0]}) on an instrumental side`;
    if (/ cant(a|an) /.test(credit)) return "a sung credit on an instrumental side";
  } else if (named.some((sg) => !isMine(sg)) && !named.some(isMine)) return `another singer (${named[0]})`;
  if (dateMismatch(row, c.name) || dateMismatch(row, c.album))
    return "a recording date that is not the row's";
  if (REMAKE_ALBUM.test(c.album ?? "") || REMAKE_ALBUM.test(c.name))
    return `a remake series (${c.album ?? c.name})`;
  const ref = refDurationSec ?? (row.durationEstimated ? null : row.durationSec);
  const restored = /restaur|remaster/i.test(`${c.name} ${c.album ?? ""}`);
  if (ref && c.durationMs) {
    const d = c.durationMs / 1000 - ref;
    const hi = restored ? 16 : 8;
    if (d < -14 || d > hi)
      return `length ${Math.round(c.durationMs / 1000)} s for a ${Math.round(ref)} s side`;
  }
  // the album's whole year range (G3): a range that starts after the side, or ends before it, is another recording
  const span = albumSpan(c.album);
  if (row.year && span && span[0] > row.year + 2) return `a later album (${c.album})`;
  if (row.year && span && span[1] < row.year - 1) return `an earlier album (${c.album})`;
  // positive evidence (M2, M5): the index knows a later take of this title, or a sung take of this instrumental
  const lt = later(row);
  const twins = instrumental ? (row.vocalTwins ?? []) : [];
  if (lt.length || twins.length) {
    const dated = (() => {
      const td = titleDate(c.name) ?? titleDate(c.album);
      return td !== null && !!row.date && /^\d{4}-\d{2}-\d{2}$/.test(row.date) && !dateMismatch(row, c.name);
    })();
    const lengthOk =
      !!ref &&
      !!c.durationMs &&
      c.durationMs / 1000 - ref >= -6 &&
      c.durationMs / 1000 - ref <= (restored ? 16 : 6);
    const otherYears = [...lt.map((t) => t.year), ...twins];
    const spanOk =
      !!row.year &&
      !!span &&
      span[0] <= row.year + 1 &&
      span[1] >= row.year - 1 &&
      otherYears.every((y) => y < span[0] || y > span[1]);
    const firstVersion =
      /\b(1[aª]|primera|first)\s+versi[oó]n\b/i.test(`${c.name} ${c.album ?? ""}`) &&
      otherYears.every((y) => !row.year || y > row.year);
    if (lt.length) {
      // the row's singer named, and every later take another voice (or none)
      const voice = !instrumental && namesSinger && lt.every((t) => sur(t.singer ?? "").at(-1) !== singerSur);
      if (!(dated || lengthOk || spanOk || firstVersion || voice))
        return `the index knows a later take (${lt.map((t) => `${t.year}${t.singer ? ` ${t.singer}` : ""}`).join(", ")}); nothing shows this is the ${row.year ?? ""} side`;
    }
    if (twins.length) {
      const instr = /instrumental/i.test(`${c.name} ${c.album ?? ""}`);
      if (!(instr || dated || lengthOk || spanOk))
        return `a sung take of the title exists (${twins.join(", ")}); nothing shows this is the instrumental`;
    }
  }
  // round 17 (discography §1, §4): a vocal side's credit names its singer — in the artists, the track title or the
  // album (the album artist) — or the take is unproven (Tanturi's "Así se baila el tango" credited to the orchestra
  // alone); a provider that credits only the main artist cannot show it and is not judged on it. (The last check, so a
  // more specific reason — a remake, a later take — is named first.)
  if (
    !instrumental &&
    singerSur &&
    !c.mainArtistOnly &&
    !namesSinger &&
    !hay.includes(` ${singerSur} `) &&
    !` ${normTitle(c.album ?? "")} `.includes(` ${singerSur} `)
  )
    return `a vocal side whose credit does not name the singer (${c.artists.join(", ")})`;
  return null;
}

/**
 * Round 16 (M7): a cortina candidate is the cue's record — the same title, the artist by whole name, never a duet,
 * live, remix, karaoke, cover or re-recording album, never an album dated before the song.
 */
// round 17 (discography §3): Unicode-aware (`u`: no ASCII-only \b after "ı") and suffix-tolerant for the Turkish
// stems (Konseri, Konserler, Canlı Kayıt, Akustikler, Versiyonu, Sahne Performansı)
export const CORTINA_BAD_ALBUM =
  /(?:^|[^\p{L}])(live|canl[ıi]\p{L}*|konser\p{L}*|concert|d[uü]et\p{L}*|remix|karaoke|cover|akusti[kc]\p{L}*|acoustic|unplugged|yeniden (?:yetmi|kayıt)\p{L}*|tribute|enstr[uü]mantal|instrumental version|versiyon\p{L}*|sahne performans\p{L}*|re-?recorded|sped up|slowed)(?![\p{L}])/iu;
const cueYears = (album: string | undefined) => {
  const ys = [...(album ?? "").matchAll(/\b(19\d\d|20[0-2]\d)\b/g)].map((m) => Number(m[1]));
  return ys.length ? ([Math.min(...ys), Math.max(...ys)] as [number, number]) : null;
};
export function cortinaMatchProblem(
  cue: { title: string; artist: string; year?: number | null; tags?: string[] },
  c: MatchCandidate,
): string | null {
  const a = normTitle(cue.title);
  const b = bareTitle(c.name);
  const flat = (x: string) => x.replace(/ /g, "");
  if (a !== b && flat(a) !== flat(b)) {
    const extra = ` ${b} `.replace(` ${a} `, " ").split(" ").filter(Boolean);
    if (!` ${b} `.includes(` ${a} `) || !extra.every((w) => DECOR.has(w) || /^\d+$/.test(w)))
      return `another title (${c.name})`;
  }
  // the cue's first credited artist by whole name (or its surname: "Giorgos" / "George" Dalaras)
  const main = normTitle(
    cue.artist.split(/\s*(?:,|&|\bfeat\.?|\bft\.?|\bx\b|\band\b|\bve\b)\s*/i)[0] ?? cue.artist,
  );
  const credit = ` ${normTitle(c.artists.join(" "))} `;
  const last = main.split(" ").at(-1) ?? "";
  if (!main || (!credit.includes(` ${main} `) && !(last.length >= 5 && credit.includes(` ${last} `))))
    return `another artist (${c.artists.join(", ")})`;
  if (!cue.tags?.includes("audio:original") && CORTINA_BAD_ALBUM.test(`${c.name} ${c.album ?? ""}`))
    return `not the original record (${c.album ?? c.name})`;
  // round 17 (discography §1, §3): a second credited performer marks a duet unless the cue's artist names them too
  // (Fikret Kızılok, Sibel Sezal on Yana Yana is "Fikret Kızılok & Sibel Sezal")
  // round 19: any credited performer the cue does not name, first-credited or not ("Duke Ellington, Count Basie" on
  // The Count Meets The Duke is not Count Basie's Jumpin' at the Woodside)
  const cueArtist = ` ${normTitle(cue.artist)} `;
  const other = c.artists.find((x) => {
    const n = normTitle(x);
    // (the cue's own band under a longer credit — "Woody Herman & His Orchestra" — is the cue's artist)
    if (` ${n} `.includes(` ${main} `)) return false;
    return !!n && !cueArtist.includes(` ${n} `) && !cueArtist.includes(` ${n.split(" ").at(-1)} `);
  });
  if (other) return `a duet with ${other} (the cue credits ${cue.artist})`;
  const span = cueYears(c.album);
  if (cue.year && span && span[1] < cue.year - 1) return `an album before the song (${c.album})`;
  return null;
}

/** a cached Spotify entry and a Deezer resolve as match candidates */
type SpotifyEntry =
  | { uri?: string; durationMs?: number; album?: string; matched?: string }
  | null
  | undefined;
type DeezerEntry =
  | { id?: string; title?: string; artist?: string; album?: string; durationMs?: number }
  | null
  | undefined;
export const spotifyCandidate = (v: NonNullable<SpotifyEntry>, title: string): MatchCandidate => {
  const [artist = "", ...rest] = (v.matched ?? "").split(" – ");
  return {
    name: rest.join(" – ") || title,
    artists: artist ? artist.split(/,\s*/) : [],
    album: v.album,
    durationMs: v.durationMs,
  };
};
export const deezerCandidate = (v: NonNullable<DeezerEntry>, title: string): MatchCandidate => ({
  name: v.title ?? title,
  artists: v.artist ? [v.artist] : [],
  album: v.album,
  durationMs: v.durationMs,
  mainArtistOnly: true,
});
const restoredLen = (v: { title?: string; album?: string }) =>
  /restaur/i.test(`${v.title ?? ""} ${v.album ?? ""}`);

/**
 * Round 16 (M1): both providers judged by the same rules. The Deezer match is judged first, without a reference; a
 * Deezer length is the Spotify reference only when the Deezer match passes (and is no restoration); a match that
 * needs positive evidence may take the other provider's passing length as its evidence.
 */
export function judgeStreams(
  row: MatchRow,
  sp: SpotifyEntry,
  dz: DeezerEntry,
  ctx: MatchContext = {},
): { spotify: string | null; deezer: string | null } {
  const dzC = dz && (dz.id || dz.title) ? deezerCandidate(dz, row.title) : null;
  const spC = sp?.uri ? spotifyCandidate(sp, row.title) : null;
  let dzWhy = dzC ? matchProblem(row, dzC, null, ctx) : null;
  const dzRef = dzC && !dzWhy && dz?.durationMs && !restoredLen(dz) ? dz.durationMs / 1000 : null;
  const spWhy = spC ? matchProblem(row, spC, dzRef, ctx) : null;
  if (dzC && dzWhy && spC && !spWhy && sp?.durationMs) {
    const again = matchProblem(row, dzC, sp.durationMs / 1000, ctx);
    if (!again) dzWhy = null;
  }
  return { spotify: spC ? spWhy : null, deezer: dzC ? dzWhy : null };
}

/** M1: every cached Spotify and Deezer id judged against its index row (the audits and `pnpm quality` run this) */
export function auditStreamMatches(
  songs: Array<MatchRow & { id: string; orchestraId: string; altIds?: string[] }>,
  spotify: Record<string, SpotifyEntry>,
  resolved: Record<string, DeezerEntry>,
  singers: string[] = [],
): {
  checked: { spotify: number; deezer: number };
  spotify: Array<{ row: string; id: string; why: string }>;
  deezer: Array<{ row: string; id: string; why: string }>;
} {
  const byId = new Map<string, (typeof songs)[number]>();
  for (const s of songs) {
    byId.set(s.id, s);
    for (const a of s.altIds ?? []) if (!byId.has(a)) byId.set(a, s);
  }
  const takes = takesIndex(songs);
  const out = {
    checked: { spotify: 0, deezer: 0 },
    spotify: [] as Array<{ row: string; id: string; why: string }>,
    deezer: [] as Array<{ row: string; id: string; why: string }>,
  };
  const keys = new Set([...Object.keys(spotify), ...Object.keys(resolved)]);
  for (const k of keys) {
    const r0 = byId.get(k);
    if (!r0) continue;
    const row = { ...r0, ...(takes.get(r0.id) ?? {}) };
    const j = judgeStreams(row, spotify[k], resolved[k], { singers });
    if (spotify[k]?.uri) {
      out.checked.spotify++;
      if (j.spotify) out.spotify.push({ row: k, id: spotify[k]!.uri!, why: j.spotify });
    }
    if (resolved[k]?.id) {
      out.checked.deezer++;
      if (j.deezer) out.deezer.push({ row: k, id: String(resolved[k]!.id), why: j.deezer });
    }
  }
  return out;
}
