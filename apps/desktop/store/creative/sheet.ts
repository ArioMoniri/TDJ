/**
 * Store creative v2, step 4: one page to review everything before it goes up: every set as the panorama it is
 * (panels edge to edge), the header images with Apple's safe area drawn on them, the previews with their poster
 * frames and measured specs, and what goes up by hand. Paths are relative to the output folder.
 */
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { esc } from "./art";
import { type Probe, previewProblems, probe } from "./preview";
import {
  HEADERS,
  headerFile,
  LOCALES,
  type Locale,
  PANELS,
  PREVIEWS,
  plain,
  posterFile,
  previewFile,
  SET_IDS,
  SETS,
  shotFile,
} from "./spec";

export function sheet(out: string, locales: Locale[] = LOCALES): string {
  const parts: string[] = [];
  for (const locale of locales) {
    parts.push(`<h2>${locale}</h2>`);
    parts.push(
      `<table><tr><th>Panel</th><th>Headline</th><th>Characters</th></tr>${PANELS.map((p) => {
        const n = [...plain(p.headline[locale]).replace("\n", " ")].length;
        return `<tr><td>${p.id}</td><td>${esc(plain(p.headline[locale])).replace("\n", "<br>")}</td><td class="${n > 30 ? "bad" : ""}">${n} / 30</td></tr>`;
      }).join("")}</table>`,
    );
    for (const id of SET_IDS) {
      const set = SETS[id];
      const files = PANELS.map((p) => shotFile(id, locale, p.id));
      if (!files.some((f) => existsSync(join(out, f)))) continue;
      parts.push(
        `<h3>${set.label} · ${set.out.width}×${set.out.height} · <code>${set.dir}/</code>${set.deliver ? "" : " · <em>upload by hand</em>"}</h3><div class="pano">${files
          .map(
            (f) =>
              `<img src="${f}" loading="lazy" alt="${f}" style="aspect-ratio:${set.out.width}/${set.out.height}">`,
          )
          .join("")}</div>`,
      );
    }
    parts.push(`<h3>Product page: Header and Search Results (upload by hand)</h3><div class="heads">`);
    for (const h of HEADERS) {
      const f = headerFile(h, locale);
      if (!existsSync(join(out, f))) continue;
      const s = h.safe;
      parts.push(
        `<figure><div class="hd" style="aspect-ratio:${h.width}/${h.height}"><img src="${f}" alt=""><i style="left:${(s.x / h.width) * 100}%;top:${(s.y / h.height) * 100}%;width:${(s.width / h.width) * 100}%;height:${(s.height / h.height) * 100}%"></i></div><figcaption>${h.label} · ${h.width}×${h.height} · dashed: Apple's art safe area</figcaption></figure>`,
      );
    }
    parts.push(`</div><h3>App previews</h3><div class="pv">`);
    for (const p of PREVIEWS) {
      const f = previewFile(p, locale);
      if (!existsSync(join(out, f))) continue;
      let pr: Probe | null = null;
      try {
        pr = probe(join(out, f));
      } catch {}
      const problems = pr ? previewProblems(pr, p) : ["unreadable"];
      parts.push(
        `<figure><video src="${f}" poster="${posterFile(p, locale)}" controls muted playsinline preload="none" style="aspect-ratio:${p.width}/${p.height}"></video><figcaption>${p.label} · ${p.width}×${p.height}${pr ? ` · ${pr.duration.toFixed(1)} s · ${pr.fps} fps · ${pr.profile} ${pr.level / 10} · ${(pr.bitrate / 1e6).toFixed(1)} Mbps · ${pr.acodec} ${pr.channels} ch ${pr.sampleRate / 1000} kHz` : ""}<br><span class="${problems.length ? "bad" : "ok"}">${problems.length ? problems.join(", ") : "meets Apple's app preview specification"}</span></figcaption></figure>`,
      );
    }
    parts.push("</div>");
  }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>T-DJ store creative</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{color-scheme:light dark;--bg:#f5f3f7;--fg:#1c1724;--muted:#6e6779;--bad:#d1344d;--ok:#2f8f6b}
@media (prefers-color-scheme:dark){:root{--bg:#111015;--fg:#f3f0f7;--muted:#a39dae;--bad:#ff6b81;--ok:#5fd3a5}}
body{margin:0;padding:24px 16px;background:var(--bg);color:var(--fg);font:14px/1.45 -apple-system,system-ui,sans-serif}
h1{margin:0 0 4px}p,figcaption{color:var(--muted)}table{border-collapse:collapse;margin:8px 0 16px}td,th{border-bottom:1px solid #8884;padding:4px 10px;text-align:left}
.bad{color:var(--bad);font-weight:600}.ok{color:var(--ok)}
.pano{display:flex;overflow-x:auto;gap:0;border-radius:8px;margin-bottom:20px}.pano img{height:340px;width:auto;display:block;flex:none}
.heads{display:grid;gap:16px}.hd{position:relative;max-width:100%}.hd img{width:100%;display:block;border-radius:6px}.hd i{position:absolute;border:2px dashed #fff;outline:2px dashed #000;outline-offset:-4px}
.pv{display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start}.pv video{height:420px;max-width:100%;background:#000;border-radius:8px}figure{margin:0}
</style></head><body><h1>T-DJ store creative v2</h1>
<p>Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC by <code>pnpm store:creative</code>. Each row is one App Store set, panels edge to edge as they scroll on the product page.</p>
${parts.join("\n")}</body></html>`;
}

export function writeSheet(out: string, locales?: Locale[]): string {
  const file = join(out, "store-creative.html");
  writeFileSync(file, sheet(out, locales));
  return file;
}
