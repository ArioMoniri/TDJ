import { normTitle } from "./energy";
import { albumSpan, dateMismatch } from "./streams";

/**
 * Round 15 — the export match rules (docs/specs/round15-engine.md §7): a streaming candidate is the recording on the
 * night only when nothing proves otherwise. The same rules judge the committed Spotify cache (`auditSpotifyCache`),
 * the web matcher (`apps/web/src/lib/match.ts`), the DJ's remembered matches and the ids carried in a night's JSON.
 * "Not found" beats a wrong song: any rule broken rejects the candidate.
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
}
export interface MatchCandidate {
  name: string;
  artists: string[];
  album?: string;
  durationMs?: number;
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

const sur = (x: string) =>
  normTitle(x)
    .split(" ")
    .filter((w) => w.length > 2);
/** a candidate title with its restoration / remaster / "(Tango)" decorations stripped */
export function bareTitle(name: string): string {
  return normTitle(
    name
      .replace(/\s+-\s+(?:.*(?:remaster|live|en vivo|version|versión|mono|stereo|restaur|\d{4}).*)$/i, "")
      .replace(
        /\((?:[^()]*?(?:remaster|restaur|tango|vals|milonga|version|buenos aires|instrumental)[^()]*)\)/gi,
        "",
      ),
  );
}
/** the candidate names the same work: equal titles, one containing the other, or an alternative title */
export function sameWork(row: Pick<MatchRow, "title" | "altTitles">, name: string): boolean {
  const b = bareTitle(name);
  if (!b) return false;
  for (const t of [row.title, ...(row.altTitles ?? [])]) {
    const a = normTitle(t);
    if (!a) continue;
    if (a === b) return true;
    const [short, long] = a.length <= b.length ? [a, b] : [b, a];
    if (short.length >= 4 && ` ${long} `.includes(` ${short} `)) return true;
  }
  return false;
}

/** Why the candidate is not the row's recording, or null when nothing proves it is another one. */
export function matchProblem(
  row: MatchRow,
  c: MatchCandidate,
  refDurationSec?: number | null,
): string | null {
  if (!sameWork(row, c.name)) return `another title (${c.name})`;
  const credit = ` ${normTitle(`${c.artists.join(" ")}`)} `;
  const own = sur(row.orchestra).slice(-1)[0] ?? "";
  const ownLeader = LEADERS.find((l) => normTitle(row.orchestra).includes(l));
  const namesOwn = (own && credit.includes(` ${own} `)) || (ownLeader && credit.includes(ownLeader));
  const singerSur = sur(row.singer ?? "").slice(-1)[0];
  const namesSinger = !!singerSur && credit.includes(` ${singerSur} `);
  if (!namesOwn && !namesSinger && !/ (orquesta|orchestra|tipica) /.test(credit))
    return "the credit names neither the orchestra nor the singer";
  const other = LEADERS.find(
    (l) => l !== ownLeader && credit.includes(` ${l} `) && !normTitle(row.orchestra).includes(l),
  );
  if (other && !namesOwn) return `another orchestra (${other})`;
  // the singer: an instrumental side never matches a sung credit; a sung side never matches another voice
  const named = CANON_SINGERS.filter(
    (sg) => credit.includes(` ${sg} `) || ` ${normTitle(c.name)} `.includes(` ${sg} `),
  );
  const mine = normTitle(row.singer ?? "");
  const mineSur = sur(row.singer ?? "").slice(-1)[0];
  const isMine = (sg: string) =>
    !!mine && (mine.includes(sg) || sg.includes(mine) || (!!mineSur && sur(sg).at(-1) === mineSur));
  if (row.vocal === false || (!row.singer && row.vocal !== true)) {
    if (named.length) return `a sung credit (${named[0]}) on an instrumental side`;
    if (/ cant(a|an) /.test(credit)) return "a sung credit on an instrumental side";
  } else if (named.some((sg) => !isMine(sg)) && !named.some(isMine)) return `another singer (${named[0]})`;
  if (dateMismatch(row, c.name) || dateMismatch(row, c.album))
    return "a recording date that is not the row's";
  const ref = refDurationSec ?? (row.durationEstimated ? null : row.durationSec);
  if (ref && c.durationMs) {
    const d = c.durationMs / 1000 - ref;
    const hi = /restaur|remaster/i.test(`${c.name} ${c.album ?? ""}`) ? 16 : 8;
    if (d < -14 || d > hi)
      return `length ${Math.round(c.durationMs / 1000)} s for a ${Math.round(ref)} s side`;
  }
  const span = albumSpan(c.album);
  if (row.year && span && span[0] > row.year + 5) return `a later album (${c.album})`;
  return null;
}
