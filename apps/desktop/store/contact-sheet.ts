/**
 * Step 3: one HTML page for designers and the DJ to review before anything is uploaded: every screenshot per
 * platform and locale, and every metadata text with its character count against App Store Connect's limit.
 * Output: store/out/contact-sheet.html (images referenced relative to apps/desktop/, keep the folder layout).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { LOCALES, outPath, PLATFORMS, SCENES, SIZES } from "./scenes";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const OUT = `${ROOT}store/out/`;
const META = `${ROOT}fastlane/metadata/`;
const LIMITS: Array<[string, number, "chars" | "bytes"]> = [
  ["name.txt", 30, "chars"],
  ["subtitle.txt", 30, "chars"],
  ["keywords.txt", 100, "bytes"],
  ["promotional_text.txt", 170, "chars"],
  ["description.txt", 4000, "chars"],
  ["release_notes.txt", 4000, "chars"],
];
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

export function sheet(): string {
  const parts: string[] = [];
  for (const locale of LOCALES) {
    parts.push(`<h2>${locale}</h2><table><tr><th>Field</th><th>Text</th><th>Length</th></tr>`);
    for (const [file, max, unit] of LIMITS) {
      const p = `${META}${locale}/${file}`;
      const text = existsSync(p) ? readFileSync(p, "utf8").trim() : "";
      const n = unit === "bytes" ? Buffer.byteLength(text) : [...text].length;
      parts.push(
        `<tr><td>${file.replace(".txt", "")}</td><td><pre>${esc(text)}</pre></td><td class="${n > max ? "bad" : ""}">${n} / ${max} ${unit}</td></tr>`,
      );
    }
    parts.push("</table>");
    for (const platform of PLATFORMS) {
      const { out } = SIZES[platform];
      parts.push(
        `<h3>${platform === "mac" ? "Mac" : "iPad 13-inch"} · ${out.width}×${out.height}</h3><div class="grid">`,
      );
      for (const scene of SCENES) {
        const rel = `../../fastlane/${outPath(platform, locale, scene.id)}`;
        parts.push(
          `<figure><img src="${rel}" loading="lazy" alt="${esc(scene.caption[locale])}"><figcaption>${scene.id} · ${esc(scene.caption[locale])}</figcaption></figure>`,
        );
      }
      parts.push("</div>");
    }
  }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>TDJ App Store contact sheet</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  :root{color-scheme:light dark;--bg:#f5f3f7;--fg:#1c1724;--muted:#6e6779;--bad:#d1344d}
  @media (prefers-color-scheme:dark){:root{--bg:#111015;--fg:#f3f0f7;--muted:#a39dae;--bad:#ff6b81}}
  body{margin:0;padding:24px 16px;background:var(--bg);color:var(--fg);font:14px/1.45 -apple-system,system-ui,sans-serif}
  h1{margin:0 0 4px}p{color:var(--muted)}table{border-collapse:collapse;width:100%;margin:8px 0 24px}
  td,th{border-bottom:1px solid #8884;padding:6px 8px;text-align:left;vertical-align:top}pre{white-space:pre-wrap;margin:0;font:inherit}
  .bad{color:var(--bad);font-weight:600}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}
  figure{margin:0}img{width:100%;height:auto;border-radius:8px;display:block}figcaption{color:var(--muted);font-size:12px;margin-top:4px}
</style></head><body><h1>TDJ — App Store contact sheet</h1>
<p>Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC. Red counts are over Apple's limit. Approve the pull request to upload.</p>
${parts.join("\n")}</body></html>`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}contact-sheet.html`, sheet());
  console.log(`${OUT}contact-sheet.html`);
}
