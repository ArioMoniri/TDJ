/**
 * QA fix (2026-11), the pasted-list import: "Biagi - Por un Beso" and a nonsense row both became "Cortina · not a
 * tango orchestra"; "Pugliese - La Yumba" matched the 1989 take ("Likely 80%") over 1946; D'Arienzo's "La
 * Cumparsita" had no year; a one-side tanda said "1 songs".
 */
import { beforeAll, describe, expect, it } from "vitest";
import { buildImportedNight, DEFAULT_OPTIONS, importPlaylist, parseTextList } from "../src/index";
import { type Loaded, loadCatalog } from "../src/load";

let cat: Loaded;
let deps: { songs: Loaded["catalog"]["songs"]; cortinas: Loaded["cortinas"] };
beforeAll(() => {
  cat = loadCatalog();
  deps = { songs: cat.catalog.songs, cortinas: cat.cortinas };
}, 600000);

const one = (line: string) => importPlaylist(parseTextList(line), deps)[0]!;

describe("pasted lines: orchestras by surname, nonsense is not a cortina", () => {
  it("“Biagi - Por un Beso” is a side by Rodolfo Biagi (not in the catalogue: Not found), never a cortina", () => {
    const e = one("Biagi - Por un Beso\nDi Sarli - Bahía Blanca");
    expect(e.role).toBe("side");
    expect(e.cortina).toBeUndefined();
    expect(e.song?.orchestra).toBe("Rodolfo Biagi");
    expect(e.song?.title).toBe("Por un Beso");
    expect(e.match).toBeNull();
  });

  it("a nonsense row stays in the list as a side the catalogue does not hold (Not found)", () => {
    const e = importPlaylist(parseTextList("Xyzzy Qwerty - Blorf Gnarp\nDi Sarli - Bahía Blanca"), deps);
    expect(e[0]!.role).toBe("side");
    expect(e[0]!.match).toBeNull();
    expect(e[0]!.why).toBeUndefined();
  });

  it("a line marked “Cortina:” is still a cortina", () => {
    const e = importPlaylist(
      parseTextList("Di Sarli - Bahía Blanca\nCortina: Yesterday – The Beatles"),
      deps,
    );
    expect(e[1]!.role).toBe("cortina");
  });
});

describe("no year given: the canonical take, never a late one above an earlier one", () => {
  it("“Pugliese - La Yumba” is the golden-age take (1946), not 1989", () => {
    const e = one("Pugliese - La Yumba");
    expect(e.song?.orchestra).toBe("Osvaldo Pugliese");
    expect(e.song?.year).toBe(1946);
  });

  it("“D'Arienzo - La Cumparsita” is a dated golden-age take, not the undated row", () => {
    const e = one("D'Arienzo - La Cumparsita");
    expect(e.song?.orchestra).toBe("Juan D'Arienzo");
    expect(e.song?.year).not.toBeNull();
    expect(e.song!.year!).toBeGreaterThanOrEqual(1935);
    expect(e.song!.year!).toBeLessThanOrEqual(1955);
  });

  it("a stated year still wins (“La Yumba (1989)” is the 1989 take)", () => {
    expect(one("Pugliese - La Yumba (1989)").song?.year).toBe(1989);
  });

  it("the same line gives the same take every run", () => {
    const a = one("Pugliese - La Yumba").song?.id;
    for (let i = 0; i < 3; i++) expect(one("Pugliese - La Yumba").song?.id).toBe(a);
  });
});

describe("one side in a tanda is said in the singular", () => {
  it("“Only 1 song in this tanda”, never “1 songs”", () => {
    const entries = importPlaylist(
      parseTextList(
        "Di Sarli - Bahía Blanca\nDi Sarli - Organito de la tarde\n\nCortina: Yesterday – The Beatles\nTroilo - Toda mi vida",
      ),
      deps,
    );
    const r = buildImportedNight(entries, {
      name: "x",
      options: DEFAULT_OPTIONS,
      source: { service: "text" as never, at: "2026-11-16T20:00:00.000Z" },
    });
    const size = r.warnings.filter((w) => w.rule === "size");
    expect(size.some((w) => w.message?.key === "import.warn_size_one")).toBe(true);
    expect(size.every((w) => !/^1 songs/.test(w.text))).toBe(true);
  });
});
