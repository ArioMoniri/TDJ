import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type ExportFormat, exportNight, flatten, nightFileText } from "@tdj/core";
import { describe, expect, it } from "vitest";
import { exportFile } from "./api/engine";
import { fileCheckLine } from "./exportCheckView";
import { withoutCortinas } from "./exportPaths";
import { parseExport, verifyFile } from "./fileVerify";
import { transferCsv } from "./transferCsv";
import type { Playlist } from "./types";

const night = (): Playlist => {
  const p = JSON.parse(
    readFileSync(join(__dirname, "../../public/featured/golden-double-peak.json"), "utf8"),
  ) as Playlist;
  // Turkish letters in a cortina, and the same cortina twice (a valid playlist row each time)
  const withCue = p.tandas.filter((t) => t.cortina);
  withCue[0]!.cortina = { ...withCue[0]!.cortina!, title: "Yaz Gazeteci Yaz", artist: "Selda Bağcan" };
  withCue[2]!.cortina = { ...withCue[0]!.cortina! };
  return p;
};
const FORMATS: ExportFormat[] = ["m3u8", "csv", "json", "rekordbox", "traktor", "xspf", "serato", "setlist"];

/** the file exactly as the Export sheet downloads it (POST /api/export) */
async function exported(p: Playlist, format: ExportFormat, includeCortinas: boolean, folder = "") {
  const r = await exportFile(
    new Request("http://x/api/export", {
      method: "POST",
      body: JSON.stringify({ playlist: p, format, includeCortinas, folder }),
    }),
    {} as never,
  );
  return r.text();
}

describe("file exports read back (every format)", () => {
  for (const format of FORMATS)
    for (const includeCortinas of [true, false])
      it(`${format}, cortinas ${includeCortinas ? "in" : "out"}: same rows, same order, names, UTF-8`, async () => {
        const p = night();
        const text = await exported(p, format, includeCortinas);
        const pl = includeCortinas ? p : withoutCortinas(p);
        const c = verifyFile(format, text, pl, { includeCortinas });
        expect(c.unreadable).toBeUndefined();
        expect(c.missing).toEqual([]);
        expect(c.extra).toEqual([]);
        expect(c.outOfOrder).toEqual([]);
        expect(c.blank).toEqual([]);
        expect(c.badEncoding).toBe(false);
        expect(c.allOk).toBe(true);
        const rows = flatten(pl, { includeCortinas });
        expect(c.actual).toBe(rows.length);
        const cues = rows.filter((r) => r.kind === "cortina").length;
        expect(includeCortinas ? cues > 0 : cues === 0).toBe(true);
        if (includeCortinas && format !== "json")
          expect(parseExport(format, text).filter((r) => r.title === "Yaz Gazeteci Yaz")).toHaveLength(
            rows.filter((r) => r.title === "Yaz Gazeteci Yaz").length,
          );
        if (includeCortinas)
          expect(rows.filter((r) => r.title === "Yaz Gazeteci Yaz").length).toBeGreaterThanOrEqual(2);
      });

  for (const format of ["m3u8", "rekordbox", "traktor", "xspf", "csv", "serato"] as const)
    it(`${format} with a music folder: every row has its path in the folder`, async () => {
      const p = night();
      // a file to find on disk, not a Spotify id (M3U8 and XSPF write a stored Spotify id instead of a path)
      p.tandas[0]!.songs[0] = { ...p.tandas[0]!.songs[0]!, spotify: null };
      const folder = "/Users/dj/Müzik/Tango Şarkıları";
      const text = await exported(p, format, true, folder);
      const c = verifyFile(format, text, p, { folder });
      expect(c.noPath).toEqual([]);
      expect(c.allOk).toBe(true);
      // a folder the file does not use is caught
      expect(verifyFile(format, text, p, { folder: "/Volumes/Other" }).noPath.length).toBeGreaterThan(0);
    });

  it(".tdjnight: the night's rows come back in order, cortinas included, Turkish letters intact", () => {
    const p = night();
    const text = nightFileText(exportNight(p));
    const c = verifyFile("tdjnight", text, p);
    expect(c.allOk).toBe(true);
    expect(c.actual).toBe(flatten(p, { includeCortinas: true }).length);
    expect(text).toContain("Selda Bağcan");
    expect(fileCheckLine("T-DJ night file", c)).toBe(`T-DJ night file: ${c.actual} tracks, order checked ✓`);
    const broken = verifyFile("tdjnight", text.replace(/"title": "Yaz Gazeteci Yaz"/, '"title": ""'), p);
    expect(fileCheckLine("T-DJ night file", broken)).toMatch(/Missing: Yaz Gazeteci Yaz/);
  });

  it("TuneMyMusic / Soundiiz CSV: one row per track in set order", () => {
    const p = night();
    for (const inc of [true, false]) {
      const c = verifyFile("transfer", transferCsv(p, inc), inc ? p : withoutCortinas(p), {
        includeCortinas: inc,
      });
      expect(c.allOk).toBe(true);
    }
  });

  it("catches a dropped row, a swapped pair, a blank artist and broken UTF-8", async () => {
    const p = night();
    const text = await exported(p, "m3u8", true);
    const lines = text.split("\n");
    // drop the 3rd track (its #EXTINF, #TDJ and location lines)
    const inf = lines.flatMap((l, i) => (l.startsWith("#EXTINF") ? [i] : []));
    const dropped = [...lines.slice(0, inf[2]), ...lines.slice(inf[3])].join("\n");
    const d = verifyFile("m3u8", dropped, p);
    expect(d.allOk).toBe(false);
    expect(d.missing.map((m) => m.at)).toEqual([2]);
    const csv = await exported(p, "serato", true);
    const [h, a, b, ...rest] = csv.split("\n");
    expect(verifyFile("serato", [h, b, a, ...rest].join("\n"), p).outOfOrder).toEqual([0, 1]);
    const blank = csv.replace(/^("[^"]*"),"[^"]*"/m, '$1,""');
    expect(verifyFile("serato", [h, ...blank.split("\n").slice(1)].join("\n"), p).blank.length).toBe(0);
    const noArtist = [h, a!.replace(/^("[^"]*"),"[^"]*"/, '$1,""'), b, ...rest].join("\n");
    expect(verifyFile("serato", noArtist, p).blank).toEqual([1]);
    expect(verifyFile("m3u8", `${text}\uD800`, p).badEncoding).toBe(true);
    expect(verifyFile("rekordbox", "<html/>", p).unreadable).toBeTruthy();
  });
});
