// temporary renderer (deleted after the brand pass)
// node _render_tmp.mjs svg <in.svg> <out.png> <size> [bg]      -> transparent/colour PNG, SVG scaled to <size> wide
// node _render_tmp.mjs html <in.html> <out.png> [width] [height]
// node _render_tmp.mjs sheet <out.png> <json-spec>  -> a comparison sheet of several svgs at several sizes
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const [, , mode, ...a] = process.argv;
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
if (mode === "svg") {
  const [inp, out, size = "512", bg = "transparent"] = a;
  const p = await b.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const svg = readFileSync(inp, "utf8").replace(/<\?xml[^>]*>/, "");
  await p.setContent(
    `<html><body style="margin:0;background:${bg}"><div id="w" style="display:inline-block;line-height:0">${svg}</div></body></html>`,
  );
  await p
    .locator("svg")
    .first()
    .evaluate((e, w) => {
      e.setAttribute("width", w);
      e.removeAttribute("height");
    }, size);
  await p.locator("#w").screenshot({ path: out, omitBackground: bg === "transparent" });
} else if (mode === "html") {
  const [inp, out, w = "1600", h = "900"] = a;
  const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
  await p.goto("file://" + inp, { waitUntil: "load" });
  await p.waitForTimeout(300);
  await p.screenshot({ path: out, fullPage: true });
} else if (mode === "sheet") {
  const [out, specPath] = a;
  const spec = JSON.parse(readFileSync(specPath, "utf8"));
  const cells = spec.files
    .map((f) => {
      const svg = readFileSync(f, "utf8").replace(/<\?xml[^>]*>/, "");
      const sizes = spec.sizes || [256, 64, 32, 16];
      const row = sizes
        .map(
          (s) =>
            `<div style="display:inline-block;vertical-align:bottom;margin:0 18px 0 0;line-height:0">${svg.replace(/<svg /, `<svg width="${s}" `)}</div>`,
        )
        .join("");
      const mirror = `<div style="display:inline-block;transform:scaleX(-1);line-height:0;margin-right:18px">${svg.replace(/<svg /, `<svg width="96" `)}</div>`;
      const rot = `<div style="display:inline-block;transform:rotate(180deg);line-height:0">${svg.replace(/<svg /, `<svg width="96" `)}</div>`;
      return `<div style="margin:0 0 28px"><div style="font:12px/1.4 sans-serif;color:#888;margin-bottom:8px">${f.split("/").pop()}</div>${row}${mirror}${rot}</div>`;
    })
    .join("");
  const p = await b.newPage({ viewport: { width: spec.width || 1400, height: 600 }, deviceScaleFactor: 1 });
  await p.setContent(
    `<html><body style="margin:24px;background:${spec.bg || "#fff"}">${cells}</body></html>`,
  );
  await p.screenshot({ path: out, fullPage: true });
}
await b.close();
console.log("ok", a[1] || a[0]);
