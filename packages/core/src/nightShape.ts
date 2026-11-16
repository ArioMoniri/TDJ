import SHAPE from "../../../data/knowledge/night_shape.json";

/**
 * 2026-11 — the orchestra lists of the night's shape, one source (data/knowledge/night_shape.json): the big four's
 * short names, the closing Cumparsita's preferred orchestras, the última pool, and the Composer's "Opens with" and
 * "Última" choices. The web re-exports them (it used to keep its own copies in Composer.tsx, djMessage.ts and
 * buildGuide.ts). The rules that use them stay in compose.ts and coherence.ts.
 */
export const BIG_FOUR_SHORT: Readonly<Record<string, string>> = SHAPE.bigFour;
/** the closing La Cumparsita's preferred orchestras */
export const CUMPARSITA_PREF: readonly string[] = SHAPE.cumparsitaPreferred;
/** corpus rule 15: the última is Pugliese, D'Arienzo, D'Agostino–Vargas, Di Sarli, De Angelis instr., Troilo–Fiorentino … */
export const ULTIMA_POOL: readonly string[] = SHAPE.ultimaPool;
/** the orchestras whose instrumental tanda may be the última */
export const ULTIMA_INSTRUMENTAL_OK: ReadonlySet<string> = new Set(SHAPE.ultimaInstrumentalOk);
/** the Composer's "Opens with" choices (after "auto") */
export const OPENER_CHOICES: ReadonlyArray<{ id: string; label: string }> = SHAPE.openerChoices;
/**
 * the Composer's "Última" choices (after "auto"): `key` is `orchestra|singer` — `~` an instrumental tanda, `*` any
 * voice; `labelKey` names an i18n key where the label is words rather than a name
 */
export const ULTIMA_CHOICES: ReadonlyArray<{ key: string; label?: string; labelKey?: string }> =
  SHAPE.ultimaChoices;

const PARTICLES = ["di", "de", "del", "da", "la"];
/**
 * An orchestra's short name. "dj" (the default; the DJ's messages): "Juan D'Arienzo" → "D'Arienzo", "Carlos Di
 * Sarli" → "Di Sarli", "Orquesta Típica Víctor" → "Típica Víctor". "surname" (artwork initials, era labels): the
 * same without dropping a leading "Orquesta" or keeping "Típica" ("Orquesta Típica Víctor" → "Víctor").
 */
export function orchestraShortName(full: string, mode: "dj" | "surname" = "dj"): string {
  let s = full.replace(/\(.*?\)/g, "");
  if (mode === "dj") s = s.replace(/^Orquesta\s+/i, "");
  const w = s.trim().split(/\s+/).filter(Boolean);
  if (w.length < 2) return w[0] ?? full;
  const prev = w[w.length - 2]!.toLowerCase();
  const keep = mode === "dj" ? [...PARTICLES, "típica", "tipica"] : PARTICLES;
  return keep.includes(prev) ? `${w[w.length - 2]} ${w[w.length - 1]}` : w[w.length - 1]!;
}
