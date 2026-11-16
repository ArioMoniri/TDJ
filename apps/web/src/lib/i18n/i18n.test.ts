import { afterEach, describe, expect, it } from "vitest";
import { en } from "./en";
import { ENGLISH_UI_WORDS } from "./englishWords";
import { fmtDate, fmtNumber, plural, resolveLocale, setLocale, t, upper } from "./index";
import { SAME_IN_TURKISH, tr } from "./tr";

/** the {placeholders} of a message, sorted */
const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1] as string).sort();

/**
 * A Turkish value may equal the English one only when nothing translatable is left: tango terms, orchestra and
 * brand names, units, placeholders, numbers and punctuation (docs/i18n-glossary.md).
 */
function onlyUntranslatable(s: string): boolean {
  let rest = s.replace(/\{\w+\}/g, " ");
  for (const term of [...SAME_IN_TURKISH].sort((a, b) => b.length - a.length))
    rest = rest.split(term).join(" ");
  return !/\p{L}{2,}/u.test(rest);
}

afterEach(() => setLocale("en"));

describe("dictionaries", () => {
  const enKeys = Object.keys(en);
  const trKeys = Object.keys(tr);

  it("every English key has a Turkish value", () => {
    const missing = enKeys.filter((k) => !(k in tr));
    expect(missing).toEqual([]);
  });

  it("Turkish has no key English does not", () => {
    const extra = trKeys.filter((k) => !(k in en));
    expect(extra).toEqual([]);
  });

  it("no Turkish value is the English one, except tango terms and names", () => {
    const same = enKeys.filter((k) => {
      const e = en[k as keyof typeof en] as string;
      const v = tr[k as keyof typeof en];
      return v === e && !onlyUntranslatable(e);
    });
    expect(same).toEqual([]);
  });

  it("every Turkish value keeps the English placeholders", () => {
    const bad = enKeys.filter((k) => {
      const v = tr[k as keyof typeof en];
      if (v === undefined) return false;
      // never a placeholder English does not fill; every named one kept. A positional {p1} may go: some hold an
      // English-only piece (a plural "s", an optional clause Turkish words another way). A plural form may drop
      // {count} ("bir şarkı").
      const e = holes(en[k as keyof typeof en] as string);
      const got = holes(v);
      const must = e.filter((h) => !/^p\d+$/.test(h) && !(k.endsWith(".one") && h === "count"));
      return got.some((h) => !e.includes(h)) || must.some((h) => !got.includes(h));
    });
    expect(bad).toEqual([]);
  });

  it("the untranslated whitelist names the brands and units that stay (BPM, DJ, Spotify)", () => {
    for (const w of ["BPM", "DJ", "Spotify", "LUFS"]) expect(SAME_IN_TURKISH).toContain(w);
  });

  it("no Turkish value carries an English UI word (QA 2026-11: Instrumental, Choose, steady, Booth…)", () => {
    // another app's own (English) menu path, quoted as it reads there
    const QUOTED = new Set(["types.preferences_advanced_database_imported_library_pick"]);
    const bad = trKeys.filter((k) => {
      if (QUOTED.has(k)) return false;
      const v = (tr[k as keyof typeof tr] ?? "").replace(/\{\w+\}/g, " ");
      return ENGLISH_UI_WORDS.test(v);
    });
    expect(bad.map((k) => `${k}: ${tr[k as keyof typeof tr]}`)).toEqual([]);
  });

  it("no value is empty", () => {
    expect(enKeys.filter((k) => !(en[k as keyof typeof en] as string).trim())).toEqual([]);
    expect(trKeys.filter((k) => !(tr[k as keyof typeof tr] ?? "").trim())).toEqual([]);
  });
});

describe("t()", () => {
  it("reads the chosen locale", () => {
    expect(t("navItems.compose")).toBe("Compose");
    setLocale("tr");
    expect(t("navItems.compose")).toBe("Gece oluştur");
  });

  it("fills placeholders", () => {
    setLocale("tr");
    expect(t("i18n.test.hello", { name: "Ana" })).toBe("Merhaba Ana");
    setLocale("en");
    expect(t("i18n.test.hello", { name: "Ana" })).toBe("Hello Ana");
  });

  it("falls back to English for a key Turkish lacks", () => {
    setLocale("tr");
    // a key added to en.ts but not yet translated
    expect(t("i18n.test.untranslated" as never)).toBe("i18n.test.untranslated");
  });

  it("uses Intl.PluralRules", () => {
    expect(plural("i18n.test.songs", 1)).toBe("1 song");
    expect(plural("i18n.test.songs", 3)).toBe("3 songs");
    setLocale("tr");
    expect(plural("i18n.test.songs", 1)).toBe("1 şarkı");
    expect(plural("i18n.test.songs", 3)).toBe("3 şarkı");
  });

  it("formats numbers and dates in the locale", () => {
    setLocale("tr");
    expect(fmtNumber(21000)).toBe("21.000");
    expect(fmtDate(new Date(2026, 10, 15), { day: "numeric", month: "long" })).toBe("15 Kasım");
    setLocale("en");
    expect(fmtNumber(21000)).toBe("21,000");
  });

  it("uppercases with Turkish dotted and dotless i", () => {
    setLocale("tr");
    expect(upper("tandalar ve milonga")).toBe("TANDALAR VE MİLONGA");
    expect(upper("ışık")).toBe("IŞIK");
    setLocale("en");
    expect(upper("milonga")).toBe("MILONGA");
  });
});

describe("resolveLocale", () => {
  it("an explicit choice wins", () => {
    expect(resolveLocale("tr", ["en-US"])).toBe("tr");
    expect(resolveLocale("en", ["tr-TR"])).toBe("en");
  });
  it("Auto follows the browser or system languages", () => {
    expect(resolveLocale("auto", ["tr-TR", "en-US"])).toBe("tr");
    expect(resolveLocale("auto", ["de-DE", "tr"])).toBe("tr");
    expect(resolveLocale("auto", ["en-GB", "tr-TR"])).toBe("en");
    expect(resolveLocale("auto", ["fr-FR"])).toBe("en");
    expect(resolveLocale("auto", [])).toBe("en");
    expect(resolveLocale(undefined, ["tr"])).toBe("tr");
  });
});
