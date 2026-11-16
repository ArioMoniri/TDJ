import { describe, expect, it } from "vitest";
import {
  type FindSide,
  fold,
  isPseudoOrchestra,
  leaderFull,
  leaderQuery,
  queryLadder,
  rankFound,
  scoreFound,
  titleForms,
} from "./findMatch";

const maure: FindSide = {
  title: "Sólo Se Quiere una Vez",
  orchestra: "Guitarras (solo singer)",
  singer: "Héctor Mauré",
  vocal: true,
  year: 1946,
  date: "1946/48",
};
const troilo: FindSide = {
  title: "Sólo Se Quiere una Vez",
  orchestra: "Aníbal Troilo",
  singer: "Floreal Ruíz",
  vocal: true,
  year: 1946,
  durationSec: 178,
};
const instrumental: FindSide = {
  title: "La Cumparsita",
  orchestra: "Juan D'Arienzo",
  vocal: false,
  year: 1951,
  durationSec: 182,
};

describe("query text", () => {
  it("folds accents, quotes and punctuation, keeps the words", () => {
    expect(fold('Llámale "h"')).toBe("Llamale h");
    expect(fold('¿Qué "sapa" Señor!')).toBe("Que sapa Senor");
    expect(fold("Pensalo Bien (Primera Ilusión)")).toBe("Pensalo Bien Primera Ilusion");
  });
  it("knows a catalogue label that is no orchestra (the singer's own side)", () => {
    expect(isPseudoOrchestra("Guitarras (solo singer)")).toBe(true);
    expect(isPseudoOrchestra("Orquesta (unspecified)")).toBe(true);
    expect(isPseudoOrchestra("G.barbieri-J.m.aguilar")).toBe(true);
    expect(isPseudoOrchestra("Aníbal Troilo")).toBe(false);
    expect(leaderQuery("Guitarras (solo singer)")).toBeNull();
  });
  it("takes the leader's surname (with its particle) and full name without the catalogue's tags", () => {
    expect(leaderQuery("Carlos Di Sarli(sex.)")).toBe("Di Sarli");
    expect(leaderQuery("Juan D'Arienzo")).toBe("D'Arienzo");
    expect(leaderQuery("Pedro Láurenz(5to.)")).toBe("Laurenz");
    expect(leaderFull("Orq.típica Coca Cola")).toBe("Coca Cola");
    expect(leaderFull("Aníbal Troilo")).toBe("Anibal Troilo");
    expect(leaderQuery("Orquesta Típica Víctor")).toBe("Victor");
  });
  it("tries the title without its gloss, the gloss and the index's alias titles", () => {
    expect(titleForms({ title: "Pensalo Bien (Primera Ilusión)" })).toEqual([
      "Pensalo Bien",
      "Pensalo Bien Primera Ilusion",
      "Primera Ilusion",
    ]);
    expect(titleForms({ title: "Shusheta", altTitles: ["El Aristócrata"] })).toEqual([
      "Shusheta",
      "El Aristocrata",
    ]);
  });
});

describe("the query ladder", () => {
  it("never searches the catalogue's 'Guitarras (solo singer)' label: the singer instead", () => {
    for (const svc of ["deezer", "spotify", "musicbrainz"] as const) {
      const qs = queryLadder(svc, maure).map((r) => r.q);
      expect(qs.join(" | ")).not.toMatch(/guitarras|solo singer/i);
      expect(qs[0]).toMatch(/Hector Maure/);
    }
    expect(queryLadder("deezer", maure).map((r) => r.why)).toEqual(["title_singer", "title"]);
  });
  it("climbs from title + singer to title + leader, title + orchestra + singer, the title alone, alias titles", () => {
    const l = queryLadder("deezer", { ...troilo, altTitles: ["Se Quiere Una Vez"] });
    expect(l.map((r) => r.why)).toEqual([
      "title_singer",
      "title_leader",
      "title_orchestra_singer",
      "title",
      "alias",
    ]);
    expect(l[1]!.q).toBe("Solo Se Quiere una Vez Troilo");
    expect(l[2]!.q).toBe("Solo Se Quiere una Vez Anibal Troilo Floreal Ruiz");
  });
  it("an instrumental side is never searched with a singer", () => {
    const l = queryLadder("spotify", instrumental);
    expect(l.map((r) => r.why)).toEqual(["title_leader", "title"]);
    expect(l[0]!.q).toBe(`track:"La Cumparsita" artist:"D'Arienzo"`);
  });
  it("MusicBrainz: Lucene-escaped phrases, the title alone bounded by the length (±15 s) or the year window", () => {
    const l = queryLadder("musicbrainz", { ...troilo, title: 'Llámale "h"' });
    expect(l[0]!.q).toBe('recording:"Llamale h" AND artist:"Floreal Ruiz"');
    const alone = l.find((r) => r.why === "title")!;
    expect(alone.q).toBe('recording:"Llamale h" AND dur:[163000 TO 193000]');
    const noLen = queryLadder("musicbrainz", maure).find((r) => r.why === "title")!;
    expect(noLen.q).toBe('recording:"Solo Se Quiere una Vez" AND firstreleasedate:[1943 TO 1949]');
    expect(queryLadder("musicbrainz", troilo).length).toBeLessThanOrEqual(3);
  });
});

describe("scoring candidates", () => {
  it("the singer's own credit is the side for a singer-with-guitars row, with the reasons", () => {
    const s = scoreFound(maure, {
      title: "Solo se quiere una vez",
      artists: ["Héctor Mauré"],
      album: "Héctor Mauré - Tomas de radio",
      year: 1947,
      mainArtistOnly: true,
    });
    expect(s.refused).toBeUndefined();
    expect(s.score).toBeGreaterThanOrEqual(0.8);
    expect(s.why.map((w) => w.k)).toEqual(expect.arrayContaining(["title", "singer", "year"]));
  });
  it("refuses a tribute album, a modern cover, another singer and another work (core match rules)", () => {
    const base = { title: "Sólo se quiere una vez", durationMs: 180_000 };
    expect(
      scoreFound(troilo, { ...base, artists: ["Sexteto Milonguero"], album: "Homenaje a Aníbal Troilo" })
        .refused,
    ).toBeTruthy();
    expect(
      scoreFound(troilo, {
        ...base,
        artists: ["Orquesta Típica Misteriosa Buenos Aires"],
        album: "Tango hoy",
      }).refused,
    ).toBeTruthy();
    expect(
      scoreFound(troilo, { ...base, artists: ["Aníbal Troilo", "Roberto Goyeneche"], album: "Troilo" })
        .refused,
    ).toMatch(/singer/);
    expect(
      scoreFound(troilo, { ...base, title: "Sólo se quiere una vez de mi vida", artists: ["Aníbal Troilo"] })
        .refused,
    ).toMatch(/title/);
  });
  it("a matching length and year lift a candidate; a far length lowers it", () => {
    const own = {
      title: "Sólo se quiere una vez",
      artists: ["Aníbal Troilo", "Floreal Ruíz"],
      album: "Troilo 1946",
    };
    const near = scoreFound(troilo, { ...own, durationMs: 180_000 });
    const far = scoreFound(troilo, { ...own, durationMs: 240_000 });
    expect(near.score).toBeGreaterThan(far.score);
    expect(near.why.some((w) => w.k === "length")).toBe(true);
  });
  it("ranks the side's own recording first, drops the refused ones and names them", () => {
    const r = rankFound(troilo, [
      {
        key: "cover",
        title: "Solo Se Quiere Una Vez",
        artists: ["Sexteto Milonguero"],
        album: "Homenaje a Troilo",
        durationMs: 182_000,
      },
      {
        key: "own",
        title: "Solo Se Quiere Una Vez",
        artists: ["Aníbal Troilo", "Floreal Ruiz"],
        album: "Aníbal Troilo 1946",
        durationMs: 177_000,
      },
    ]);
    expect(r.ranked.map((x) => x.item.key)).toEqual(["own"]);
    expect(r.refused).toBe(1);
  });
});

describe("guitarists' labels", () => {
  it("Gardel with his guitarists (G.barbieri-J.m.aguilar) is found under Gardel's own name", () => {
    const side: FindSide = {
      title: "Malevaje",
      orchestra: "G.barbieri-J.m.aguilar",
      singer: "Carlos Gardel",
      vocal: true,
      year: 1929,
    };
    expect(queryLadder("deezer", side)[0]!.q).toBe("Malevaje Carlos Gardel");
    const s = scoreFound(side, {
      title: "Malevaje",
      artists: ["Carlos Gardel"],
      album: "Carlos Gardel - Sus grabaciones",
      mainArtistOnly: true,
    });
    expect(s.refused).toBeUndefined();
    expect(s.score).toBeGreaterThanOrEqual(0.6);
  });
});
