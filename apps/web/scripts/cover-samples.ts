/**
 * Wave 4 — sample covers of the featured night, rendered with resvg as the server does:
 *   pnpm --filter @tdj/web exec tsx scripts/cover-samples.ts <out-dir>
 * Writes light, dark and Turkish 640 × 640 covers, the 56 px thumbnails (at 1× and 2×), the 1200 × 630 OG image
 * and the SVG sources.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import { brandCoverSvg, type CoverOptions, nightCoverSvg } from "../src/lib/cover";
import { randomNight } from "../src/lib/cover/testNights";

const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] ?? join(here, "../.covers");
mkdirSync(out, { recursive: true });
const night = JSON.parse(readFileSync(join(here, "../public/featured/golden-double-peak.json"), "utf8"));

const png = (svg: string, width?: number) =>
  new Resvg(svg, width ? { fitTo: { mode: "width", value: width } } : {}).render().asPng();

const samples: Array<[string, CoverOptions, number?]> = [
  ["cover-light", { size: 640, theme: "light", locale: "en" }],
  ["cover-dark", { size: 640, theme: "dark", locale: "en" }],
  ["cover-tr", { size: 640, theme: "light", locale: "tr" }],
  ["cover-tr-dark", { size: 640, theme: "dark", locale: "tr" }],
  ["thumb-56-light", { size: 56, theme: "light" }],
  ["thumb-56-dark", { size: 56, theme: "dark" }],
  ["thumb-56-light@2x", { size: 56, theme: "light" }, 112],
  ["thumb-56-dark@2x", { size: 56, theme: "dark" }, 112],
  ["og-1200x630", { size: "og", theme: "light", locale: "en" }],
];
for (const [name, o, w] of samples) {
  const svg = nightCoverSvg(night, o);
  writeFileSync(join(out, `${name}.svg`), svg);
  writeFileSync(join(out, `${name}.png`), png(svg, w));
}
// a Turkish-named night with an odd title, to see the outlines and the wrap
const tr = { ...night, name: "Çarşamba gecesi İstanbul'da ağır milonga & şarkılar · 4 h" };
writeFileSync(join(out, "cover-tr-title.png"), png(nightCoverSvg(tr, { size: 640, locale: "tr" })));
// one generation, one cover: 16 different nights side by side at the History thumbnail size (56 px, shown at 2×),
// light on the left two columns' rows and dark below, to judge "different at a glance" by eye
const cell = 112;
const gap = 16;
const sheet = (theme: "light" | "dark", from: number) => {
  let body = "";
  for (let i = 0; i < 16; i++) {
    const svg = nightCoverSvg(randomNight(from + i), { size: 56, theme })
      .replace(
        /^<svg /,
        `<svg x="${gap + (i % 4) * (cell + gap)}" y="${gap + Math.floor(i / 4) * (cell + gap)}" `,
      )
      .replace(/ width="56" height="56"/, ` width="${cell}" height="${cell}"`);
    body += svg;
  }
  const side = gap + 4 * (cell + gap);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${side}" height="${side}"><rect width="${side}" height="${side}" fill="${theme === "light" ? "#F2EFE9" : "#0B0A10"}"/>${body}</svg>`;
};
writeFileSync(join(out, "contact-sheet.png"), png(sheet("light", 101)));
writeFileSync(join(out, "contact-sheet-dark.png"), png(sheet("dark", 101)));
// the generic link preview the app serves for fragment-only /night links and every fallback
writeFileSync(join(out, "og-brand.png"), png(brandCoverSvg()));
writeFileSync(join(here, "../public/og-night.png"), png(brandCoverSvg()));
console.log(`covers in ${out}`);
