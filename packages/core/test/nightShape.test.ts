/**
 * 2026-11 — the orchestra lists of the night's shape moved to data (data/knowledge/night_shape.json, nightShape.ts):
 * the Composer's "Opens with" and "Última" choices, the closing Cumparsita's preferred orchestras, the última pool
 * and the big four's short names, and one short-name function for the three copies the web kept. Nothing they do
 * changes: the lists are the ones the code held (snapshot), and the short names are the old functions' over every
 * orchestra of the catalogue.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  BIG_FOUR,
  BIG_FOUR_SHORT,
  CUMPARSITA_PREF,
  OPENER_CHOICES,
  orchestraShortName,
  ULTIMA_CHOICES,
  ULTIMA_INSTRUMENTAL_OK,
  ULTIMA_POOL,
} from "../src/index";
import { loadCatalog } from "../src/load";

/** the web's djMessage.shortName before 2026-11 */
function oldShortName(full: string): string {
  const w = full
    .replace(/\(.*?\)/g, "")
    .replace(/^Orquesta\s+/i, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (w.length < 2) return w[0] ?? full;
  const prev = w[w.length - 2]!.toLowerCase();
  if (["di", "de", "del", "da", "la", "típica", "tipica"].includes(prev))
    return `${w[w.length - 2]} ${w[w.length - 1]}`;
  return w[w.length - 1]!;
}
/** the web's booth/songInfo.surnameOf before 2026-11 */
function oldSurnameOf(orchestra: string): string {
  const w = orchestra
    .replace(/\(.*?\)/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (w.length < 2) return w[0] ?? orchestra;
  const prev = w[w.length - 2]!.toLowerCase();
  return ["di", "de", "del", "da", "la"].includes(prev)
    ? `${w[w.length - 2]} ${w[w.length - 1]}`
    : w[w.length - 1]!;
}

describe("the night's shape lists are data, unchanged", () => {
  let names: string[];
  beforeAll(() => {
    const deps = loadCatalog();
    names = [
      ...new Set([
        ...deps.catalog.songs.map((s) => s.orchestra),
        ...deps.catalog.songs.map((s) => s.singer ?? "").filter(Boolean),
      ]),
    ];
  }, 600000);

  it("the lists the code held", () => {
    expect(CUMPARSITA_PREF).toEqual([
      "juan-d-arienzo",
      "osvaldo-pugliese",
      "carlos-di-sarli",
      "anibal-troilo",
      "rodolfo-biagi",
      "francisco-canaro",
      "alfredo-de-angelis",
    ]);
    expect(ULTIMA_POOL).toEqual([
      "osvaldo-pugliese",
      "juan-d-arienzo",
      "angel-d-agostino",
      "carlos-di-sarli",
      "alfredo-de-angelis",
      "anibal-troilo",
      "ricardo-tanturi",
      "rodolfo-biagi",
      "miguel-calo",
      "enrique-rodriguez",
    ]);
    expect([...ULTIMA_INSTRUMENTAL_OK]).toEqual([
      "osvaldo-pugliese",
      "juan-d-arienzo",
      "carlos-di-sarli",
      "alfredo-de-angelis",
      "anibal-troilo",
    ]);
    expect(OPENER_CHOICES.map((c) => [c.id, c.label])).toEqual([
      ["carlos-di-sarli", "Di Sarli"],
      ["francisco-canaro", "Canaro"],
      ["angel-d-agostino", "D'Agostino"],
      ["osvaldo-fresedo", "Fresedo"],
      ["juan-d-arienzo", "D'Arienzo"],
      ["anibal-troilo", "Troilo"],
      ["enrique-rodriguez", "Rodríguez"],
    ]);
    expect(ULTIMA_CHOICES.map((c) => [c.key, c.label ?? c.labelKey])).toEqual([
      ["ricardo-tanturi|Alberto Castillo", "Tanturi / Castillo"],
      ["anibal-troilo|Francisco Fiorentino", "Troilo / Fiorentino"],
      ["rodolfo-biagi|Jorge Ortíz", "Biagi / Ortiz"],
      ["carlos-di-sarli|Roberto Rufino", "Di Sarli / Rufino"],
      ["angel-d-agostino|Angel Vargas", "D'Agostino / Vargas"],
      ["juan-d-arienzo|~", "composer.d_arienzo_instrumental"],
      ["osvaldo-pugliese|*", "Pugliese"],
    ]);
  });
  it("the big four's short names: one per orchestra of the rule", () => {
    expect(Object.keys(BIG_FOUR_SHORT).sort()).toEqual([...BIG_FOUR].sort());
    expect(BIG_FOUR_SHORT).toEqual({
      "carlos-di-sarli": "Di Sarli",
      "juan-d-arienzo": "D'Arienzo",
      "anibal-troilo": "Troilo",
      "osvaldo-pugliese": "Pugliese",
    });
  });
  it("the choices name orchestras of the catalogue", () => {
    const deps = loadCatalog();
    for (const id of [
      ...OPENER_CHOICES.map((c) => c.id),
      ...ULTIMA_CHOICES.map((c) => c.key.split("|")[0]!),
      ...CUMPARSITA_PREF,
      ...ULTIMA_POOL,
    ])
      expect(deps.catalog.byOrchestra.get(id)?.length ?? 0, id).toBeGreaterThan(0);
  });
  it("one short-name function, the old answers for every orchestra and singer name", () => {
    expect(names.length).toBeGreaterThan(300);
    const extra = [
      "Orquesta Típica Víctor",
      "Orquesta Victor",
      "Juan D'Arienzo",
      "Carlos Di Sarli",
      "X",
      "",
      " Y (z)",
    ];
    for (const n of [...names, ...extra]) {
      expect(orchestraShortName(n), n).toBe(oldShortName(n));
      expect(orchestraShortName(n, "surname"), n).toBe(oldSurnameOf(n));
    }
    expect(orchestraShortName("Orquesta Típica Víctor")).toBe("Típica Víctor");
    expect(orchestraShortName("Orquesta Típica Víctor", "surname")).toBe("Víctor");
  });
});
